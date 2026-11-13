import crypto from 'crypto';
import { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import jwt from 'jsonwebtoken';
import {
  PrismaClient,
  ProjectMemberRole,
  UserRole,
  WorkspaceRole,
} from '@prisma/client';
import Redis from 'ioredis';
import { decryptSecret, encryptSecret } from './crypto';

const PROJECT_ROLE_RANK: Record<ProjectMemberRole, number> = {
  VIEWER: 1,
  EDITOR: 2,
  ADMIN: 3,
};

interface OidcSessionState {
  providerId: string;
  slug: string;
  codeVerifier: string;
  nonce: string;
  redirectUri: string;
  webBaseUrl: string;
  createdAt: number;
}

const memoryOidcStates = new Map<string, OidcSessionState>();

export interface AuthContextUser {
  id: string;
  email: string;
  name: string;
  role: UserRole;
  avatarUrl: string | null;
}

export async function getAuthUser(
  request: FastifyRequest,
  prisma: PrismaClient,
  jwtSecret: string
): Promise<AuthContextUser | null> {
  const authHeader = request.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return null;
  }
  const token = authHeader.slice(7).trim();
  if (!token) return null;

  try {
    const decoded = jwt.verify(token, jwtSecret) as { id?: string };
    if (!decoded?.id) return null;
    const user = await prisma.user.findUnique({
      where: { id: decoded.id },
      select: { id: true, email: true, name: true, role: true, avatarUrl: true },
    });
    return user;
  } catch {
    return null;
  }
}

export async function getSystemAuthSettings(prisma: PrismaClient) {
  return prisma.systemAuthSettings.upsert({
    where: { id: 'default' },
    update: {},
    create: {
      id: 'default',
      allowGitLogin: true,
      allowSelfServiceBoardCreation: true,
      enforceSso: false,
    },
  });
}

/**
 * Computes which project/board IDs a user can access.
 * Returns `null` when the user has unrestricted global ADMIN access.
 */
export async function getUserAccessibleProjectIds(
  prisma: PrismaClient,
  user: AuthContextUser | null
): Promise<string[] | null> {
  if (!user) return null; // Legacy/unauthenticated internal callers (e.g. MCP/health)
  if (user.role === UserRole.ADMIN) return null;

  const settings = await getSystemAuthSettings(prisma);
  const [allProjects, workspaceMemberships, projectMemberships] = await Promise.all([
    prisma.project.findMany({
      select: { id: true, workspaceId: true, parentId: true, _count: { select: { members: true } } },
    }),
    prisma.workspaceMember.findMany({
      where: { userId: user.id },
      select: { workspaceId: true, role: true },
    }),
    prisma.projectMember.findMany({
      where: { userId: user.id },
      select: { projectId: true, role: true },
    }),
  ]);

  const wsRoleMap = new Map(workspaceMemberships.map((m) => [m.workspaceId, m.role]));
  const projMemberSet = new Set(projectMemberships.map((m) => m.projectId));
  const projectMap = new Map(allProjects.map((p) => [p.id, p]));

  const hasInheritedProjectAccess = (projectId: string, visited = new Set<string>()): boolean => {
    if (visited.has(projectId)) return false;
    visited.add(projectId);
    if (projMemberSet.has(projectId)) return true;
    const proj = projectMap.get(projectId);
    if (proj?.parentId) return hasInheritedProjectAccess(proj.parentId, visited);
    return false;
  };

  const allowed: string[] = [];
  for (const proj of allProjects) {
    // Workspace owners/admins can access all boards in their workspace
    if (proj.workspaceId) {
      const wsRole = wsRoleMap.get(proj.workspaceId);
      if (wsRole === WorkspaceRole.OWNER || wsRole === WorkspaceRole.ADMIN) {
        allowed.push(proj.id);
        continue;
      }
    }

    // Explicit board/project membership (or inherited from parent project)
    if (hasInheritedProjectAccess(proj.id)) {
      allowed.push(proj.id);
      continue;
    }

    // Legacy open projects (no workspace & no explicit member restrictions & SSO not enforced)
    if (!proj.workspaceId && proj._count.members === 0 && !settings.enforceSso) {
      allowed.push(proj.id);
    }
  }

  return allowed;
}

export async function canUserAccessProject(
  prisma: PrismaClient,
  user: AuthContextUser | null,
  projectId: string,
  minRole: ProjectMemberRole = ProjectMemberRole.VIEWER
): Promise<boolean> {
  if (!user) return true;
  if (user.role === UserRole.ADMIN) return true;

  const project = await prisma.project.findUnique({
    where: { id: projectId },
    select: {
      id: true,
      workspaceId: true,
      parentId: true,
      _count: { select: { members: true } },
    },
  });
  if (!project) return false;

  if (project.workspaceId) {
    const wsMember = await prisma.workspaceMember.findUnique({
      where: { workspaceId_userId: { workspaceId: project.workspaceId, userId: user.id } },
    });
    if (wsMember && (wsMember.role === WorkspaceRole.OWNER || wsMember.role === WorkspaceRole.ADMIN)) {
      return true;
    }
  }

  // Check direct or parent project membership
  let currentId: string | null = project.id;
  const visited = new Set<string>();
  while (currentId && !visited.has(currentId)) {
    visited.add(currentId);
    const pm = await prisma.projectMember.findUnique({
      where: { projectId_userId: { projectId: currentId, userId: user.id } },
    });
    if (pm) {
      return PROJECT_ROLE_RANK[pm.role] >= PROJECT_ROLE_RANK[minRole];
    }
    const parent: { parentId: string | null } | null = await prisma.project.findUnique({
      where: { id: currentId },
      select: { parentId: true },
    });
    currentId = parent?.parentId || null;
  }

  const settings = await getSystemAuthSettings(prisma);
  if (!project.workspaceId && project._count.members === 0 && !settings.enforceSso) {
    return user.role !== UserRole.VIEWER || minRole === ProjectMemberRole.VIEWER;
  }

  return false;
}

function toBase64Url(buf: Buffer): string {
  return buf.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

async function oidcFetch(url: string, init?: RequestInit): Promise<globalThis.Response> {
  try {
    return await fetch(url, init);
  } catch (err) {
    // When running inside Docker, localhost:8080 refers to the container itself;
    // transparently retry against keycloak / host.docker.internal while preserving issuer checks.
    if (/^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?\//i.test(url)) {
      const candidates = [
        url.replace(/^(https?:\/\/)(localhost|127\.0\.0\.1)/i, '$1keycloak'),
        url.replace(/^(https?:\/\/)(localhost|127\.0\.0\.1)/i, '$1host.docker.internal'),
      ];
      for (const candidate of candidates) {
        try {
          return await fetch(candidate, init);
        } catch {
          // try next candidate
        }
      }
    }
    throw err;
  }
}

async function fetchOidcDiscovery(issuerUrl: string) {
  const cleanIssuer = issuerUrl.trim().replace(/\/$/, '');
  const discoveryUrl = `${cleanIssuer}/.well-known/openid-configuration`;
  const res = await oidcFetch(discoveryUrl, { headers: { Accept: 'application/json' } });
  if (!res.ok) {
    throw new Error(`OIDC Discovery fehlgeschlagen (${res.status} bei ${discoveryUrl})`);
  }
  const doc = (await res.json()) as {
    issuer: string;
    authorization_endpoint: string;
    token_endpoint: string;
    userinfo_endpoint?: string;
    jwks_uri?: string;
  };
  if (!doc.authorization_endpoint || !doc.token_endpoint || !doc.issuer) {
    throw new Error('Ungültiges OIDC Discovery-Dokument (Endpoints fehlen)');
  }
  return doc;
}

async function verifyOidcIdToken(
  idToken: string,
  discovery: { issuer: string; jwks_uri?: string },
  clientId: string,
  expectedNonce: string
): Promise<Record<string, any>> {
  const decodedComplete = jwt.decode(idToken, { complete: true }) as {
    header?: { kid?: string; alg?: string };
    payload?: Record<string, any>;
  } | null;

  if (!decodedComplete?.payload) {
    throw new Error('Ungültiges ID-Token-Format');
  }

  if (discovery.jwks_uri && decodedComplete.header?.alg !== 'none') {
    const jwksRes = await oidcFetch(discovery.jwks_uri);
    if (!jwksRes.ok) {
      throw new Error(`JWKS Abruf fehlgeschlagen (${jwksRes.status})`);
    }
    const jwks = (await jwksRes.json()) as { keys?: Array<Record<string, any>> };
    const keys = jwks.keys || [];
    const kid = decodedComplete.header?.kid;
    const matchingKey =
      (kid ? keys.find((k) => k.kid === kid) : undefined) ||
      keys.find((k) => k.use === 'sig' || !k.use);

    if (!matchingKey) {
      throw new Error('Kein passender JWKS Signing-Key gefunden');
    }

    const publicKey = crypto.createPublicKey({ key: matchingKey as any, format: 'jwk' });
    const verified = jwt.verify(idToken, publicKey, {
      issuer: discovery.issuer,
      audience: clientId,
    }) as Record<string, any>;

    if (expectedNonce && verified.nonce && verified.nonce !== expectedNonce) {
      throw new Error('OIDC Nonce stimmt nicht überein');
    }
    return verified;
  }

  // Fallback check if no jwks_uri
  const payload = decodedComplete.payload;
  if (payload.iss !== discovery.issuer) throw new Error('OIDC Issuer stimmt nicht überein');
  if (expectedNonce && payload.nonce && payload.nonce !== expectedNonce) {
    throw new Error('OIDC Nonce stimmt nicht überein');
  }
  return payload;
}

async function saveOidcState(redisPub: Redis | null, state: string, data: OidcSessionState) {
  memoryOidcStates.set(state, data);
  if (redisPub && redisPub.status === 'ready') {
    await redisPub.setex(`kanso:oidc:state:${state}`, 600, JSON.stringify(data)).catch(() => {});
  }
}

async function consumeOidcState(redisPub: Redis | null, state: string): Promise<OidcSessionState | null> {
  const mem = memoryOidcStates.get(state);
  if (mem) {
    memoryOidcStates.delete(state);
    return mem;
  }
  if (redisPub && redisPub.status === 'ready') {
    try {
      const raw = await redisPub.get(`kanso:oidc:state:${state}`);
      if (raw) {
        await redisPub.del(`kanso:oidc:state:${state}`);
        return JSON.parse(raw) as OidcSessionState;
      }
    } catch {
      return null;
    }
  }
  return null;
}

export function registerOidcAndRbacRoutes(params: {
  app: FastifyInstance;
  prisma: PrismaClient;
  redisPub: Redis | null;
  jwtSecret: string;
  getRequestOrigins: (request: FastifyRequest) => { apiBaseUrl: string; webBaseUrl: string };
  broadcastEvent: (type: string, payload: unknown) => void;
}) {
  const { app, prisma, redisPub, jwtSecret, getRequestOrigins, broadcastEvent } = params;

  const requireAdmin = async (request: FastifyRequest, reply: FastifyReply): Promise<AuthContextUser | null> => {
    const user = await getAuthUser(request, prisma, jwtSecret);
    if (!user) {
      reply.status(401).send({ error: 'Authentifizierung erforderlich.' });
      return null;
    }
    if (user.role !== UserRole.ADMIN) {
      reply.status(403).send({ error: 'Nur Administratoren dürfen diese Einstellung ändern.' });
      return null;
    }
    return user;
  };

  // ==========================================
  // PUBLIC AUTH CONFIG & OIDC DISCOVERY
  // ==========================================
  app.get('/api/auth/public-config', async () => {
    const [settings, oidcProviders] = await Promise.all([
      getSystemAuthSettings(prisma),
      prisma.oidcProviderConfig.findMany({
        where: { enabled: true },
        select: {
          id: true,
          name: true,
          slug: true,
          verifiedDomains: true,
          workspaceId: true,
        },
        orderBy: { name: 'asc' },
      }),
    ]);

    return {
      allowGitLogin: settings.allowGitLogin,
      allowSelfServiceBoardCreation: settings.allowSelfServiceBoardCreation,
      enforceSso: settings.enforceSso,
      oidcProviders,
    };
  });

  app.post('/api/auth/oidc/discover', async (request: FastifyRequest<{ Body: { email: string } }>) => {
    const email = (request.body?.email || '').trim().toLowerCase();
    const domain = email.includes('@') ? email.split('@')[1] : email;
    if (!domain) return { matched: false };

    const providers = await prisma.oidcProviderConfig.findMany({
      where: { enabled: true },
      select: { id: true, name: true, slug: true, verifiedDomains: true },
    });

    const match = providers.find((p) =>
      p.verifiedDomains.some((d) => d.trim().toLowerCase() === domain)
    );

    if (!match) return { matched: false };
    return { matched: true, provider: { id: match.id, name: match.name, slug: match.slug } };
  });

  // ==========================================
  // OIDC AUTHORIZE & CALLBACK (PKCE + JWKS)
  // ==========================================
  app.get('/api/auth/oidc/authorize/:slug', async (
    request: FastifyRequest<{ Params: { slug: string } }>,
    reply: FastifyReply
  ) => {
    const { slug } = request.params;
    const { apiBaseUrl, webBaseUrl } = getRequestOrigins(request);
    const provider = await prisma.oidcProviderConfig.findUnique({ where: { slug } });

    if (!provider || !provider.enabled) {
      return reply.redirect(`${webBaseUrl}/?oauth_error=${encodeURIComponent('OIDC-Provider nicht gefunden oder deaktiviert')}`);
    }

    try {
      const discovery = await fetchOidcDiscovery(provider.issuerUrl);
      const state = toBase64Url(crypto.randomBytes(24));
      const nonce = toBase64Url(crypto.randomBytes(24));
      const codeVerifier = toBase64Url(crypto.randomBytes(32));
      const codeChallenge = toBase64Url(crypto.createHash('sha256').update(codeVerifier).digest());
      const redirectUri = `${apiBaseUrl}/api/auth/oidc/callback/${encodeURIComponent(slug)}`;

      await saveOidcState(redisPub, state, {
        providerId: provider.id,
        slug,
        codeVerifier,
        nonce,
        redirectUri,
        webBaseUrl,
        createdAt: Date.now(),
      });

      const authUrl = new URL(discovery.authorization_endpoint);
      authUrl.searchParams.set('response_type', 'code');
      authUrl.searchParams.set('client_id', provider.clientId);
      authUrl.searchParams.set('redirect_uri', redirectUri);
      authUrl.searchParams.set('scope', provider.scopes || 'openid profile email');
      authUrl.searchParams.set('state', state);
      authUrl.searchParams.set('nonce', nonce);
      authUrl.searchParams.set('code_challenge', codeChallenge);
      authUrl.searchParams.set('code_challenge_method', 'S256');

      return reply.redirect(authUrl.toString());
    } catch (err: any) {
      return reply.redirect(`${webBaseUrl}/?oauth_error=${encodeURIComponent(err.message || 'OIDC Authorize Fehler')}`);
    }
  });

  app.get('/api/auth/oidc/callback/:slug', async (
    request: FastifyRequest<{
      Params: { slug: string };
      Querystring: { code?: string; state?: string; error?: string; error_description?: string };
    }>,
    reply: FastifyReply
  ) => {
    const { slug } = request.params;
    const { code, state, error, error_description } = request.query;
    const { webBaseUrl: fallbackWeb } = getRequestOrigins(request);

    if (error) {
      return reply.redirect(`${fallbackWeb}/?oauth_error=${encodeURIComponent(error_description || error)}`);
    }
    if (!code || !state) {
      return reply.redirect(`${fallbackWeb}/?oauth_error=${encodeURIComponent('Ungültige OIDC-Callback-Parameter')}`);
    }

    const session = await consumeOidcState(redisPub, state);
    if (!session || session.slug !== slug) {
      return reply.redirect(`${fallbackWeb}/?oauth_error=${encodeURIComponent('OIDC State abgelaufen oder ungültig')}`);
    }
    const webBaseUrl = session.webBaseUrl || fallbackWeb;

    try {
      const provider = await prisma.oidcProviderConfig.findUnique({ where: { id: session.providerId } });
      if (!provider || !provider.enabled) {
        return reply.redirect(`${webBaseUrl}/?oauth_error=${encodeURIComponent('OIDC-Provider deaktiviert')}`);
      }

      const discovery = await fetchOidcDiscovery(provider.issuerUrl);
      const clientSecret = decryptSecret(provider.clientSecretEnc);

      const tokenParams = new URLSearchParams({
        grant_type: 'authorization_code',
        code,
        redirect_uri: session.redirectUri,
        client_id: provider.clientId,
        code_verifier: session.codeVerifier,
      });
      if (clientSecret) {
        tokenParams.set('client_secret', clientSecret);
      }

      const tokenRes = await oidcFetch(discovery.token_endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' },
        body: tokenParams.toString(),
      });
      const tokenData = (await tokenRes.json()) as {
        id_token?: string;
        access_token?: string;
        error?: string;
        error_description?: string;
      };

      if (!tokenRes.ok || tokenData.error) {
        return reply.redirect(
          `${webBaseUrl}/?oauth_error=${encodeURIComponent(tokenData.error_description || tokenData.error || 'OIDC Token-Austausch fehlgeschlagen')}`
        );
      }

      let claims: Record<string, any> = {};
      if (tokenData.id_token) {
        claims = await verifyOidcIdToken(tokenData.id_token, discovery, provider.clientId, session.nonce);
      }

      if ((!claims.email || !claims.name) && tokenData.access_token && discovery.userinfo_endpoint) {
        const uiRes = await oidcFetch(discovery.userinfo_endpoint, {
          headers: { Authorization: `Bearer ${tokenData.access_token}`, Accept: 'application/json' },
        });
        if (uiRes.ok) {
          const uiData = (await uiRes.json()) as Record<string, any>;
          claims = { ...uiData, ...claims };
        }
      }

      const subject = String(claims.sub || '');
      const issuer = String(claims.iss || discovery.issuer);
      const email = String(claims.email || claims.preferred_username || `${subject}@${slug}.oidc`).toLowerCase();
      const name = String(claims.name || claims.preferred_username || email.split('@')[0]);
      const avatarUrl = typeof claims.picture === 'string' ? claims.picture : null;

      if (!subject) {
        return reply.redirect(`${webBaseUrl}/?oauth_error=${encodeURIComponent('OIDC Subject (sub) fehlt im Token')}`);
      }

      // Resolve User via (issuer, subject) identity first, then email
      let identity = await prisma.userIdentity.findUnique({
        where: { issuer_subject: { issuer, subject } },
        include: { user: true },
      });

      let user = identity?.user || null;
      if (!user) {
        user = await prisma.user.findUnique({ where: { email } });
      }

      if (!user) {
        if (!provider.jitProvisioning) {
          return reply.redirect(
            `${webBaseUrl}/?oauth_error=${encodeURIComponent('Kein Kanso-Konto vorhanden und JIT-Provisioning ist deaktiviert.')}`
          );
        }
        const totalUsers = await prisma.user.count();
        user = await prisma.user.create({
          data: {
            email,
            name,
            avatarUrl,
            role: totalUsers === 0 ? UserRole.ADMIN : UserRole.MEMBER,
          },
        });
      } else {
        user = await prisma.user.update({
          where: { id: user.id },
          data: {
            name: name || user.name,
            avatarUrl: avatarUrl || user.avatarUrl,
          },
        });
      }

      if (!identity) {
        await prisma.userIdentity.create({
          data: {
            userId: user.id,
            providerType: 'oidc',
            issuer,
            subject,
            email,
          },
        });
      }

      // Sync Workspace Membership + optional OIDC group role mapping
      if (provider.workspaceId) {
        let wsRole: WorkspaceRole = WorkspaceRole.MEMBER;
        if (provider.groupClaim && provider.groupRoleMapping && Array.isArray(claims[provider.groupClaim])) {
          const mapping = provider.groupRoleMapping as Record<string, WorkspaceRole>;
          for (const grp of claims[provider.groupClaim] as string[]) {
            if (mapping[grp]) {
              wsRole = mapping[grp];
              break;
            }
          }
        }
        await prisma.workspaceMember.upsert({
          where: { workspaceId_userId: { workspaceId: provider.workspaceId, userId: user.id } },
          update: {},
          create: {
            workspaceId: provider.workspaceId,
            userId: user.id,
            role: wsRole,
          },
        });
      }

      const kansoToken = jwt.sign(
        { id: user.id, email: user.email, role: user.role, name: user.name },
        jwtSecret,
        { expiresIn: '30d' }
      );

      const safeUser = {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
        avatarUrl: user.avatarUrl,
        gitProvider: user.gitProvider,
        gitUsername: user.gitUsername,
      };

      return reply.redirect(
        `${webBaseUrl}/?auth_token=${encodeURIComponent(kansoToken)}&auth_user=${encodeURIComponent(JSON.stringify(safeUser))}&oidc_connected=${encodeURIComponent(slug)}`
      );
    } catch (err: any) {
      return reply.redirect(`${webBaseUrl}/?oauth_error=${encodeURIComponent(err.message || 'OIDC-Anmeldung fehlgeschlagen')}`);
    }
  });

  // ==========================================
  // ADMIN: AUTH SETTINGS & OIDC PROVIDERS
  // ==========================================
  app.get('/api/admin/auth-settings', async (request, reply) => {
    const admin = await requireAdmin(request, reply);
    if (!admin) return;
    return getSystemAuthSettings(prisma);
  });

  app.put('/api/admin/auth-settings', async (
    request: FastifyRequest<{
      Body: {
        allowGitLogin?: boolean;
        allowSelfServiceBoardCreation?: boolean;
        enforceSso?: boolean;
        defaultWorkspaceId?: string | null;
      };
    }>,
    reply: FastifyReply
  ) => {
    const admin = await requireAdmin(request, reply);
    if (!admin) return;

    const { allowGitLogin, allowSelfServiceBoardCreation, enforceSso, defaultWorkspaceId } = request.body || {};
    const updated = await prisma.systemAuthSettings.upsert({
      where: { id: 'default' },
      update: {
        ...(allowGitLogin !== undefined ? { allowGitLogin } : {}),
        ...(allowSelfServiceBoardCreation !== undefined ? { allowSelfServiceBoardCreation } : {}),
        ...(enforceSso !== undefined ? { enforceSso } : {}),
        ...(defaultWorkspaceId !== undefined ? { defaultWorkspaceId } : {}),
      },
      create: {
        id: 'default',
        allowGitLogin: allowGitLogin ?? true,
        allowSelfServiceBoardCreation: allowSelfServiceBoardCreation ?? true,
        enforceSso: enforceSso ?? false,
        defaultWorkspaceId: defaultWorkspaceId ?? null,
      },
    });
    broadcastEvent('auth_settings_updated', updated);
    return updated;
  });

  app.get('/api/admin/oidc-providers', async (request, reply) => {
    const admin = await requireAdmin(request, reply);
    if (!admin) return;

    const { apiBaseUrl } = getRequestOrigins(request);
    const list = await prisma.oidcProviderConfig.findMany({
      include: { workspace: { select: { id: true, name: true, slug: true } } },
      orderBy: { createdAt: 'asc' },
    });

    return list.map((p) => ({
      id: p.id,
      workspaceId: p.workspaceId,
      workspace: p.workspace,
      name: p.name,
      slug: p.slug,
      issuerUrl: p.issuerUrl,
      clientId: p.clientId,
      hasClientSecret: Boolean(p.clientSecretEnc),
      scopes: p.scopes,
      verifiedDomains: p.verifiedDomains,
      jitProvisioning: p.jitProvisioning,
      groupClaim: p.groupClaim,
      groupRoleMapping: p.groupRoleMapping,
      enabled: p.enabled,
      callbackUrl: `${apiBaseUrl}/api/auth/oidc/callback/${encodeURIComponent(p.slug)}`,
      createdAt: p.createdAt,
    }));
  });

  app.post('/api/admin/oidc-providers', async (
    request: FastifyRequest<{
      Body: {
        name: string;
        slug?: string;
        issuerUrl: string;
        clientId: string;
        clientSecret?: string;
        scopes?: string;
        verifiedDomains?: string[];
        jitProvisioning?: boolean;
        workspaceId?: string | null;
        groupClaim?: string | null;
        groupRoleMapping?: Record<string, WorkspaceRole> | null;
        enabled?: boolean;
      };
    }>,
    reply: FastifyReply
  ) => {
    const admin = await requireAdmin(request, reply);
    if (!admin) return;

    const body = request.body;
    if (!body?.name || !body?.issuerUrl || !body?.clientId) {
      return reply.status(400).send({ error: 'Name, Issuer-URL und Client-ID sind erforderlich.' });
    }

    const cleanSlug = (body.slug || body.name)
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '');

    const created = await prisma.oidcProviderConfig.create({
      data: {
        name: body.name.trim(),
        slug: cleanSlug || `oidc-${Date.now()}`,
        issuerUrl: body.issuerUrl.trim().replace(/\/$/, ''),
        clientId: body.clientId.trim(),
        clientSecretEnc: body.clientSecret ? encryptSecret(body.clientSecret.trim()) : '',
        scopes: body.scopes?.trim() || 'openid profile email',
        verifiedDomains: (body.verifiedDomains || []).map((d) => d.trim().toLowerCase()).filter(Boolean),
        jitProvisioning: body.jitProvisioning ?? true,
        workspaceId: body.workspaceId || null,
        groupClaim: body.groupClaim || null,
        groupRoleMapping: body.groupRoleMapping || undefined,
        enabled: body.enabled ?? true,
      },
    });

    return reply.status(201).send({ ...created, clientSecretEnc: undefined, hasClientSecret: Boolean(created.clientSecretEnc) });
  });

  app.patch('/api/admin/oidc-providers/:id', async (
    request: FastifyRequest<{
      Params: { id: string };
      Body: Partial<{
        name: string;
        issuerUrl: string;
        clientId: string;
        clientSecret: string;
        scopes: string;
        verifiedDomains: string[];
        jitProvisioning: boolean;
        workspaceId: string | null;
        enabled: boolean;
      }>;
    }>,
    reply: FastifyReply
  ) => {
    const admin = await requireAdmin(request, reply);
    if (!admin) return;

    const b = request.body || {};
    const updateData: any = {};
    if (b.name !== undefined) updateData.name = b.name.trim();
    if (b.issuerUrl !== undefined) updateData.issuerUrl = b.issuerUrl.trim().replace(/\/$/, '');
    if (b.clientId !== undefined) updateData.clientId = b.clientId.trim();
    if (b.clientSecret !== undefined && b.clientSecret !== '') {
      updateData.clientSecretEnc = encryptSecret(b.clientSecret.trim());
    }
    if (b.scopes !== undefined) updateData.scopes = b.scopes.trim();
    if (b.verifiedDomains !== undefined) {
      updateData.verifiedDomains = b.verifiedDomains.map((d) => d.trim().toLowerCase()).filter(Boolean);
    }
    if (b.jitProvisioning !== undefined) updateData.jitProvisioning = b.jitProvisioning;
    if (b.workspaceId !== undefined) updateData.workspaceId = b.workspaceId;
    if (b.enabled !== undefined) updateData.enabled = b.enabled;

    const updated = await prisma.oidcProviderConfig.update({
      where: { id: request.params.id },
      data: updateData,
    });
    return { ...updated, clientSecretEnc: undefined, hasClientSecret: Boolean(updated.clientSecretEnc) };
  });

  app.delete('/api/admin/oidc-providers/:id', async (
    request: FastifyRequest<{ Params: { id: string } }>,
    reply: FastifyReply
  ) => {
    const admin = await requireAdmin(request, reply);
    if (!admin) return;

    await prisma.oidcProviderConfig.delete({ where: { id: request.params.id } });
    return { ok: true };
  });

  app.post('/api/admin/oidc-providers/:id/test', async (
    request: FastifyRequest<{ Params: { id: string } }>,
    reply: FastifyReply
  ) => {
    const admin = await requireAdmin(request, reply);
    if (!admin) return;

    const provider = await prisma.oidcProviderConfig.findUnique({ where: { id: request.params.id } });
    if (!provider) return reply.status(404).send({ error: 'Provider nicht gefunden' });

    try {
      const discovery = await fetchOidcDiscovery(provider.issuerUrl);
      return {
        ok: true,
        issuer: discovery.issuer,
        authorizationEndpoint: discovery.authorization_endpoint,
        tokenEndpoint: discovery.token_endpoint,
        jwksUri: discovery.jwks_uri,
      };
    } catch (err: any) {
      return reply.status(400).send({ ok: false, error: err.message || 'Discovery fehlgeschlagen' });
    }
  });

  // ==========================================
  // WORKSPACE & BOARD/PROJECT MEMBERSHIPS
  // ==========================================
  app.get('/api/workspaces/:id/members', async (
    request: FastifyRequest<{ Params: { id: string } }>
  ) => {
    return prisma.workspaceMember.findMany({
      where: { workspaceId: request.params.id },
      include: {
        user: { select: { id: true, name: true, email: true, avatarUrl: true, role: true } },
      },
      orderBy: { createdAt: 'asc' },
    });
  });

  app.post('/api/workspaces/:id/members', async (
    request: FastifyRequest<{
      Params: { id: string };
      Body: { userId: string; role?: WorkspaceRole };
    }>,
    reply: FastifyReply
  ) => {
    const caller = await getAuthUser(request, prisma, jwtSecret);
    if (caller && caller.role !== UserRole.ADMIN) {
      const wsMem = await prisma.workspaceMember.findUnique({
        where: { workspaceId_userId: { workspaceId: request.params.id, userId: caller.id } },
      });
      if (!wsMem || (wsMem.role !== WorkspaceRole.OWNER && wsMem.role !== WorkspaceRole.ADMIN)) {
        return reply.status(403).send({ error: 'Keine Berechtigung für Organisationsmitglieder.' });
      }
    }

    const { userId, role } = request.body;
    const member = await prisma.workspaceMember.upsert({
      where: { workspaceId_userId: { workspaceId: request.params.id, userId } },
      update: { role: role || WorkspaceRole.MEMBER },
      create: {
        workspaceId: request.params.id,
        userId,
        role: role || WorkspaceRole.MEMBER,
      },
      include: {
        user: { select: { id: true, name: true, email: true, avatarUrl: true, role: true } },
      },
    });
    return reply.status(201).send(member);
  });

  app.delete('/api/workspaces/:id/members/:userId', async (
    request: FastifyRequest<{ Params: { id: string; userId: string } }>,
    reply: FastifyReply
  ) => {
    const caller = await getAuthUser(request, prisma, jwtSecret);
    if (caller && caller.role !== UserRole.ADMIN) {
      const wsMem = await prisma.workspaceMember.findUnique({
        where: { workspaceId_userId: { workspaceId: request.params.id, userId: caller.id } },
      });
      if (!wsMem || (wsMem.role !== WorkspaceRole.OWNER && wsMem.role !== WorkspaceRole.ADMIN)) {
        return reply.status(403).send({ error: 'Keine Berechtigung.' });
      }
    }
    await prisma.workspaceMember.delete({
      where: { workspaceId_userId: { workspaceId: request.params.id, userId: request.params.userId } },
    });
    return { ok: true };
  });

  app.get('/api/projects/:id/members', async (
    request: FastifyRequest<{ Params: { id: string } }>
  ) => {
    return prisma.projectMember.findMany({
      where: { projectId: request.params.id },
      include: {
        user: { select: { id: true, name: true, email: true, avatarUrl: true, role: true } },
      },
      orderBy: { createdAt: 'asc' },
    });
  });

  app.post('/api/projects/:id/members', async (
    request: FastifyRequest<{
      Params: { id: string };
      Body: { userId: string; role?: ProjectMemberRole };
    }>,
    reply: FastifyReply
  ) => {
    const caller = await getAuthUser(request, prisma, jwtSecret);
    if (caller) {
      const ok = await canUserAccessProject(prisma, caller, request.params.id, ProjectMemberRole.ADMIN);
      if (!ok) {
        return reply.status(403).send({ error: 'Keine Admin-Berechtigung für dieses Board.' });
      }
    }

    const { userId, role } = request.body;
    const member = await prisma.projectMember.upsert({
      where: { projectId_userId: { projectId: request.params.id, userId } },
      update: { role: role || ProjectMemberRole.EDITOR },
      create: {
        projectId: request.params.id,
        userId,
        role: role || ProjectMemberRole.EDITOR,
      },
      include: {
        user: { select: { id: true, name: true, email: true, avatarUrl: true, role: true } },
      },
    });
    return reply.status(201).send(member);
  });

  app.delete('/api/projects/:id/members/:userId', async (
    request: FastifyRequest<{ Params: { id: string; userId: string } }>,
    reply: FastifyReply
  ) => {
    const caller = await getAuthUser(request, prisma, jwtSecret);
    if (caller) {
      const ok = await canUserAccessProject(prisma, caller, request.params.id, ProjectMemberRole.ADMIN);
      if (!ok) {
        return reply.status(403).send({ error: 'Keine Admin-Berechtigung für dieses Board.' });
      }
    }
    await prisma.projectMember.delete({
      where: { projectId_userId: { projectId: request.params.id, userId: request.params.userId } },
    });
    return { ok: true };
  });
}
