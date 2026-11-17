import fs from 'fs';
import os from 'os';
import path from 'path';
import { execFile } from 'child_process';
import { promisify } from 'util';
import { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { PrismaClient } from '@prisma/client';

const execFileAsync = promisify(execFile);

let isBackupRunning = false;

function getDefaultBackupDir(): string {
  return process.env.BACKUP_DIR || path.resolve(process.cwd(), 'backups');
}

function getUploadDir(): string {
  return process.env.UPLOAD_DIR || path.resolve(process.cwd(), 'uploads');
}

function sanitizePgUrl(rawUrl: string): string {
  try {
    const parsed = new URL(rawUrl);
    parsed.searchParams.delete('schema');
    return parsed.toString();
  } catch {
    return rawUrl.replace(/\?schema=[^&]+&?/, '?').replace(/\?$/, '');
  }
}

function formatTimestampForFile(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getUTCFullYear()}${pad(date.getUTCMonth() + 1)}${pad(date.getUTCDate())}-${pad(
    date.getUTCHours()
  )}${pad(date.getUTCMinutes())}${pad(date.getUTCSeconds())}`;
}

async function getOrCreateBackupSettings(prisma: PrismaClient) {
  const existing = await prisma.backupSettings.findUnique({ where: { id: 'default' } });
  if (existing) return existing;
  return prisma.backupSettings.create({
    data: {
      id: 'default',
      enabled: false,
      schedule: 'DAILY',
      runAtHour: 3,
      runAtWeekday: 0,
      retentionCount: 7,
      includeUploads: true,
      targetPath: getDefaultBackupDir(),
    },
  });
}

async function enforceRetention(prisma: PrismaClient, retentionCount: number) {
  const keep = Math.max(1, retentionCount);
  const runs = await prisma.backupRun.findMany({
    where: { status: 'SUCCESS' },
    orderBy: { createdAt: 'desc' },
  });

  const toDelete = runs.slice(keep);
  for (const run of toDelete) {
    try {
      if (run.filePath && fs.existsSync(run.filePath)) {
        fs.unlinkSync(run.filePath);
      }
    } catch {
      // Ignore file removal error during retention cleanup
    }
    await prisma.backupRun.delete({ where: { id: run.id } });
  }
}

export async function executeBackupRun(
  prisma: PrismaClient,
  trigger: 'MANUAL' | 'SCHEDULED'
) {
  if (isBackupRunning) {
    throw new Error('Es läuft bereits ein Backup-Vorgang.');
  }
  isBackupRunning = true;

  const settings = await getOrCreateBackupSettings(prisma);
  const backupDir = (settings.targetPath || getDefaultBackupDir()).trim() || getDefaultBackupDir();
  fs.mkdirSync(backupDir, { recursive: true });

  const now = new Date();
  const filename = `kanso-backup-${formatTimestampForFile(now)}.tar.gz`;
  const targetFilePath = path.join(backupDir, filename);

  const runRecord = await prisma.backupRun.create({
    data: {
      filename,
      filePath: targetFilePath,
      status: 'RUNNING',
      trigger,
      includeDb: true,
      includeUploads: settings.includeUploads,
    },
  });

  const stagingDir = fs.mkdtempSync(path.join(os.tmpdir(), 'kanso-backup-'));

  try {
    const dbUrl = process.env.DATABASE_URL;
    if (!dbUrl) {
      throw new Error('DATABASE_URL ist nicht konfiguriert.');
    }

    const pgDumpUrl = sanitizePgUrl(dbUrl);
    const sqlPath = path.join(stagingDir, 'database.sql');
    await execFileAsync('pg_dump', [
      pgDumpUrl,
      '--no-owner',
      '--no-acl',
      '--clean',
      '--if-exists',
      '-F',
      'p',
      '-f',
      sqlPath,
    ]);

    let uploadFilesCount = 0;
    if (settings.includeUploads) {
      const uploadDir = getUploadDir();
      if (fs.existsSync(uploadDir)) {
        const destUploads = path.join(stagingDir, 'uploads');
        fs.cpSync(uploadDir, destUploads, { recursive: true });
        uploadFilesCount = fs.readdirSync(destUploads).length;
      }
    }

    const manifest = {
      createdAt: now.toISOString(),
      trigger,
      includeDb: true,
      includeUploads: settings.includeUploads,
      uploadFilesCount,
      note: 'Bewahre ENCRYPTION_KEY und JWT_SECRET aus deiner .env getrennt und sicher auf, um verschlüsselte Integrationen wiederherstellen zu können.',
    };
    fs.writeFileSync(path.join(stagingDir, 'manifest.json'), JSON.stringify(manifest, null, 2), 'utf8');

    await execFileAsync('tar', ['-czf', targetFilePath, '-C', stagingDir, '.']);
    const stats = fs.statSync(targetFilePath);

    const completed = await prisma.backupRun.update({
      where: { id: runRecord.id },
      data: {
        status: 'SUCCESS',
        sizeBytes: stats.size,
        completedAt: new Date(),
      },
    });

    await prisma.backupSettings.update({
      where: { id: 'default' },
      data: { lastRunAt: new Date() },
    });

    await enforceRetention(prisma, settings.retentionCount);
    return completed;
  } catch (err: any) {
    try {
      if (fs.existsSync(targetFilePath)) fs.unlinkSync(targetFilePath);
    } catch {
      // ignore
    }
    const failed = await prisma.backupRun.update({
      where: { id: runRecord.id },
      data: {
        status: 'FAILED',
        errorMessage: err?.message || 'Unbekannter Backup-Fehler',
        completedAt: new Date(),
      },
    });
    return failed;
  } finally {
    try {
      fs.rmSync(stagingDir, { recursive: true, force: true });
    } catch {
      // ignore
    }
    isBackupRunning = false;
  }
}

function isSameUtcDate(a: Date, b: Date): boolean {
  return (
    a.getUTCFullYear() === b.getUTCFullYear() &&
    a.getUTCMonth() === b.getUTCMonth() &&
    a.getUTCDate() === b.getUTCDate()
  );
}

function shouldRunScheduledBackup(settings: {
  enabled: boolean;
  schedule: string;
  runAtHour: number;
  runAtWeekday: number;
  lastRunAt: Date | null;
}): boolean {
  if (!settings.enabled || settings.schedule === 'MANUAL') return false;
  const now = new Date();
  const last = settings.lastRunAt;

  if (settings.schedule === 'HOURLY') {
    if (!last) return true;
    return now.getTime() - last.getTime() >= 55 * 60 * 1000;
  }

  if (settings.schedule === 'DAILY') {
    if (now.getUTCHours() !== settings.runAtHour) return false;
    if (!last) return true;
    return !isSameUtcDate(last, now);
  }

  if (settings.schedule === 'WEEKLY') {
    if (now.getUTCDay() !== settings.runAtWeekday) return false;
    if (now.getUTCHours() !== settings.runAtHour) return false;
    if (!last) return true;
    return !isSameUtcDate(last, now);
  }

  return false;
}

export function registerBackupRoutes(app: FastifyInstance, prisma: PrismaClient) {
  app.get('/api/backups/settings', async () => {
    const settings = await getOrCreateBackupSettings(prisma);
    return {
      ...settings,
      defaultTargetPath: getDefaultBackupDir(),
    };
  });

  app.put('/api/backups/settings', async (request: FastifyRequest<{
    Body: {
      enabled?: boolean;
      schedule?: 'MANUAL' | 'HOURLY' | 'DAILY' | 'WEEKLY';
      runAtHour?: number;
      runAtWeekday?: number;
      retentionCount?: number;
      includeUploads?: boolean;
      targetPath?: string;
    };
  }>, reply: FastifyReply) => {
    const current = await getOrCreateBackupSettings(prisma);
    const body = request.body || {};

    const validSchedules = new Set(['MANUAL', 'HOURLY', 'DAILY', 'WEEKLY']);
    const schedule = body.schedule && validSchedules.has(body.schedule) ? body.schedule : current.schedule;
    const runAtHour =
      typeof body.runAtHour === 'number' && Number.isFinite(body.runAtHour)
        ? Math.min(23, Math.max(0, Math.floor(body.runAtHour)))
        : current.runAtHour;
    const runAtWeekday =
      typeof body.runAtWeekday === 'number' && Number.isFinite(body.runAtWeekday)
        ? Math.min(6, Math.max(0, Math.floor(body.runAtWeekday)))
        : current.runAtWeekday;
    const retentionCount =
      typeof body.retentionCount === 'number' && Number.isFinite(body.retentionCount)
        ? Math.min(365, Math.max(1, Math.floor(body.retentionCount)))
        : current.retentionCount;
    const targetPath =
      typeof body.targetPath === 'string' && body.targetPath.trim()
        ? body.targetPath.trim()
        : current.targetPath;

    try {
      fs.mkdirSync(targetPath, { recursive: true });
    } catch (err: any) {
      return reply.status(400).send({ error: `Zielverzeichnis konnte nicht erstellt werden: ${err.message}` });
    }

    const updated = await prisma.backupSettings.update({
      where: { id: 'default' },
      data: {
        enabled: typeof body.enabled === 'boolean' ? body.enabled : current.enabled,
        schedule,
        runAtHour,
        runAtWeekday,
        retentionCount,
        includeUploads: typeof body.includeUploads === 'boolean' ? body.includeUploads : current.includeUploads,
        targetPath,
      },
    });

    return {
      ...updated,
      defaultTargetPath: getDefaultBackupDir(),
    };
  });

  app.get('/api/backups', async () => {
    const runs = await prisma.backupRun.findMany({
      orderBy: { createdAt: 'desc' },
      take: 50,
    });
    return runs.map((r) => ({
      ...r,
      fileExists: Boolean(r.filePath && fs.existsSync(r.filePath)),
    }));
  });

  app.post('/api/backups/run', async (_request: FastifyRequest, reply: FastifyReply) => {
    try {
      const run = await executeBackupRun(prisma, 'MANUAL');
      if (run.status === 'FAILED') {
        return reply.status(500).send(run);
      }
      return reply.status(201).send({
        ...run,
        fileExists: Boolean(run.filePath && fs.existsSync(run.filePath)),
      });
    } catch (err: any) {
      return reply.status(409).send({ error: err.message || 'Backup konnte nicht gestartet werden.' });
    }
  });

  app.get('/api/backups/:id/download', async (request: FastifyRequest<{
    Params: { id: string };
  }>, reply: FastifyReply) => {
    const run = await prisma.backupRun.findUnique({ where: { id: request.params.id } });
    if (!run || !run.filePath || !fs.existsSync(run.filePath)) {
      return reply.status(404).send({ error: 'Backup-Datei nicht gefunden.' });
    }
    reply.header('Content-Type', 'application/gzip');
    reply.header('Content-Disposition', `attachment; filename="${run.filename}"`);
    return reply.send(fs.createReadStream(run.filePath));
  });

  app.delete('/api/backups/:id', async (request: FastifyRequest<{
    Params: { id: string };
  }>, reply: FastifyReply) => {
    const run = await prisma.backupRun.findUnique({ where: { id: request.params.id } });
    if (!run) {
      return reply.status(404).send({ error: 'Backup-Eintrag nicht gefunden.' });
    }
    try {
      if (run.filePath && fs.existsSync(run.filePath)) {
        fs.unlinkSync(run.filePath);
      }
    } catch {
      // ignore
    }
    await prisma.backupRun.delete({ where: { id: run.id } });
    return { success: true };
  });

  // Start lightweight 60s backup scheduler
  const timer = setInterval(async () => {
    if (isBackupRunning) return;
    try {
      const settings = await getOrCreateBackupSettings(prisma);
      if (shouldRunScheduledBackup(settings)) {
        await executeBackupRun(prisma, 'SCHEDULED');
      }
    } catch (err) {
      console.error('Scheduled backup check failed:', err);
    }
  }, 60 * 1000);
  timer.unref();
}
