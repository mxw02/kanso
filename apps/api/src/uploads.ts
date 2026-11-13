import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';

const MAX_UPLOAD_BYTES = 10 * 1024 * 1024; // 10 MB

const MIME_BY_EXT: Record<string, string> = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.svg': 'image/svg+xml',
  '.pdf': 'application/pdf',
  '.txt': 'text/plain; charset=utf-8',
  '.md': 'text/markdown; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.csv': 'text/csv; charset=utf-8',
  '.zip': 'application/zip',
};

const INLINE_EXTS = new Set(['.png', '.jpg', '.jpeg', '.gif', '.webp', '.pdf', '.txt']);

function getUploadDir(): string {
  const dir = process.env.UPLOAD_DIR || path.resolve(process.cwd(), 'uploads');
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

function sanitizeFilename(rawName: string): string {
  const base = path.basename(rawName || 'upload.bin');
  const cleaned = base.replace(/[^a-zA-Z0-9._-]/g, '_');
  return cleaned || 'upload.bin';
}

export function registerUploadRoutes(app: FastifyInstance) {
  app.post('/api/uploads', async (request: FastifyRequest<{
    Body: {
      filename: string;
      mimeType?: string;
      dataBase64: string;
    };
  }>, reply: FastifyReply) => {
    const { filename, mimeType, dataBase64 } = request.body || {};
    if (!filename || !dataBase64) {
      return reply.status(400).send({ error: 'Dateiname und Dateiinhalt sind erforderlich.' });
    }

    const base64Clean = dataBase64.includes(';base64,')
      ? dataBase64.split(';base64,')[1]
      : dataBase64;

    const buffer = Buffer.from(base64Clean, 'base64');
    if (buffer.length === 0) {
      return reply.status(400).send({ error: 'Leere Datei kann nicht hochgeladen werden.' });
    }
    if (buffer.length > MAX_UPLOAD_BYTES) {
      return reply.status(413).send({ error: 'Datei überschreitet das Limit von 10 MB.' });
    }

    const safeName = sanitizeFilename(filename);
    const id = crypto.randomUUID();
    const storedName = `${id}-${safeName}`;
    const uploadDir = getUploadDir();
    const targetPath = path.join(uploadDir, storedName);

    fs.writeFileSync(targetPath, buffer);

    const ext = path.extname(safeName).toLowerCase();
    const resolvedMime = mimeType || MIME_BY_EXT[ext] || 'application/octet-stream';
    const isImage = resolvedMime.startsWith('image/') && ext !== '.svg';

    return reply.status(201).send({
      id,
      filename: safeName,
      mimeType: resolvedMime,
      size: buffer.length,
      url: `/api/uploads/${encodeURIComponent(storedName)}`,
      isImage,
    });
  });

  app.get('/api/uploads/:filename', async (request: FastifyRequest<{
    Params: { filename: string };
  }>, reply: FastifyReply) => {
    const safeName = path.basename(decodeURIComponent(request.params.filename || ''));
    if (!safeName) {
      return reply.status(400).send({ error: 'Ungültiger Dateiname.' });
    }

    const uploadDir = getUploadDir();
    const filePath = path.join(uploadDir, safeName);
    if (!fs.existsSync(filePath)) {
      return reply.status(404).send({ error: 'Datei nicht gefunden.' });
    }

    const ext = path.extname(safeName).toLowerCase();
    const contentType = MIME_BY_EXT[ext] || 'application/octet-stream';
    const disposition = INLINE_EXTS.has(ext) ? 'inline' : 'attachment';

    reply.header('Content-Type', contentType);
    reply.header('Content-Disposition', `${disposition}; filename="${safeName}"`);
    reply.header('Cache-Control', 'public, max-age=31536000, immutable');
    reply.header('X-Content-Type-Options', 'nosniff');

    return reply.send(fs.createReadStream(filePath));
  });
}
