import crypto from 'crypto';
import { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { PrismaClient } from '@prisma/client';

function hashMcpToken(raw: string): string {
  return crypto.createHash('sha256').update(raw, 'utf8').digest('hex');
}

export function registerMcpTokenRoutes(app: FastifyInstance, prisma: PrismaClient) {
  // List MCP tokens (never exposes tokenHash or plaintext)
  app.get('/api/mcp/tokens', async () => {
    const tokens = await prisma.mcpToken.findMany({
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        name: true,
        prefix: true,
        createdById: true,
        lastUsedAt: true,
        expiresAt: true,
        revokedAt: true,
        createdAt: true,
      },
    });
    return tokens;
  });

  // Create a new MCP Bearer Token (returns plaintext token once)
  app.post('/api/mcp/tokens', async (request: FastifyRequest<{
    Body: { name?: string; expiresInDays?: number | null; createdById?: string };
  }>, reply: FastifyReply) => {
    const name = request.body?.name?.trim();
    if (!name) {
      return reply.status(400).send({ error: 'Token-Name ist erforderlich.' });
    }

    const rawToken = `kanso_mcp_${crypto.randomBytes(24).toString('hex')}`;
    const tokenHash = hashMcpToken(rawToken);
    const prefix = `${rawToken.slice(0, 18)}...`;

    let expiresAt: Date | null = null;
    const days = Number(request.body?.expiresInDays);
    if (Number.isFinite(days) && days > 0) {
      expiresAt = new Date(Date.now() + days * 24 * 60 * 60 * 1000);
    }

    const created = await prisma.mcpToken.create({
      data: {
        name,
        tokenHash,
        prefix,
        createdById: request.body?.createdById || null,
        expiresAt,
      },
      select: {
        id: true,
        name: true,
        prefix: true,
        createdById: true,
        lastUsedAt: true,
        expiresAt: true,
        revokedAt: true,
        createdAt: true,
      },
    });

    return reply.status(201).send({
      ...created,
      token: rawToken,
    });
  });

  // Revoke (or permanently remove if already revoked) an MCP token
  app.delete('/api/mcp/tokens/:id', async (request: FastifyRequest<{
    Params: { id: string };
  }>, reply: FastifyReply) => {
    const existing = await prisma.mcpToken.findUnique({ where: { id: request.params.id } });
    if (!existing) {
      return reply.status(404).send({ error: 'MCP Token nicht gefunden.' });
    }

    if (existing.revokedAt) {
      await prisma.mcpToken.delete({ where: { id: existing.id } });
      return { success: true, deleted: true };
    }

    const revoked = await prisma.mcpToken.update({
      where: { id: existing.id },
      data: { revokedAt: new Date() },
      select: {
        id: true,
        name: true,
        prefix: true,
        lastUsedAt: true,
        expiresAt: true,
        revokedAt: true,
        createdAt: true,
      },
    });
    return { success: true, token: revoked };
  });

  // Verify an incoming MCP Bearer Token (used by kanso-mcp-server)
  app.post('/api/mcp/verify-token', async (request: FastifyRequest<{
    Body: { token?: string };
  }>, reply: FastifyReply) => {
    const now = new Date();
    const activeCount = await prisma.mcpToken.count({
      where: {
        revokedAt: null,
        OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
      },
    });

    const authHeader = request.headers.authorization || '';
    const headerMatch = authHeader.match(/^Bearer\s+(.+)$/i);
    const rawToken = (request.body?.token || (headerMatch ? headerMatch[1] : '')).trim();

    if (!rawToken) {
      if (activeCount === 0) {
        return { valid: true, authRequired: false };
      }
      return reply.status(401).send({ valid: false, authRequired: true });
    }

    const tokenHash = hashMcpToken(rawToken);
    const match = await prisma.mcpToken.findFirst({
      where: {
        tokenHash,
        revokedAt: null,
        OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
      },
    });

    if (!match) {
      return reply.status(401).send({ valid: false, authRequired: activeCount > 0 });
    }

    await prisma.mcpToken.update({
      where: { id: match.id },
      data: { lastUsedAt: now },
    });

    return {
      valid: true,
      authRequired: true,
      id: match.id,
      name: match.name,
    };
  });
}
