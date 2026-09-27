import { NextRequest, NextResponse } from 'next/server';
import { randomBytes } from 'crypto';
import { mkdir, writeFile } from 'fs/promises';
import path from 'path';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const MAX_BYTES = 25 * 1024 * 1024;

const ACCEPTED: Record<string, { kind: string; ext: string }> = {
  'image/jpeg': { kind: 'image', ext: 'jpg' },
  'image/png': { kind: 'image', ext: 'png' },
  'image/webp': { kind: 'image', ext: 'webp' },
  'image/gif': { kind: 'gif', ext: 'gif' },
  'video/mp4': { kind: 'video', ext: 'mp4' },
  'video/webm': { kind: 'video', ext: 'webm' },
  'video/quicktime': { kind: 'video', ext: 'mov' },
  'audio/mpeg': { kind: 'audio', ext: 'mp3' },
  'audio/mp3': { kind: 'audio', ext: 'mp3' },
  'audio/wav': { kind: 'audio', ext: 'wav' },
  'audio/x-wav': { kind: 'audio', ext: 'wav' },
  'audio/ogg': { kind: 'audio', ext: 'ogg' },
};

// Hors de `public/` : Next fige ses statiques au build (cf. server/media.js).
const UPLOAD_DIR = path.join(process.cwd(), '.data', 'uploads');

export async function POST(req: NextRequest) {
  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return NextResponse.json({ error: 'Requête illisible.' }, { status: 400 });
  }

  const file = form.get('file');
  if (!(file instanceof File)) {
    return NextResponse.json({ error: 'Aucun fichier reçu.' }, { status: 400 });
  }
  if (file.size === 0) {
    return NextResponse.json({ error: 'Fichier vide.' }, { status: 400 });
  }
  if (file.size > MAX_BYTES) {
    return NextResponse.json(
      { error: `Fichier trop lourd (max ${Math.round(MAX_BYTES / 1024 / 1024)} Mo).` },
      { status: 413 },
    );
  }

  const spec = ACCEPTED[file.type];
  if (!spec) {
    return NextResponse.json(
      { error: `Format non supporté (${file.type || 'inconnu'}). Accepté : JPG, PNG, WebP, GIF, MP4, WebM, MP3, WAV, OGG.` },
      { status: 415 },
    );
  }

  const name = `${Date.now().toString(36)}-${randomBytes(8).toString('hex')}.${spec.ext}`;
  const buffer = Buffer.from(await file.arrayBuffer());

  await mkdir(UPLOAD_DIR, { recursive: true });
  await writeFile(path.join(UPLOAD_DIR, name), buffer);

  return NextResponse.json({
    url: `/uploads/${name}`,
    kind: spec.kind,
    name: file.name.slice(0, 60),
    size: file.size,
  });
}
