import { NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// eslint-disable-next-line @typescript-eslint/no-var-requires
const storage = require('@/server/storage') as typeof import('@/server/storage');

/** Sonde de santé + état du disque, utilisée par les hébergeurs. */
export async function GET() {
  const { bytes, files } = storage.usage();
  return NextResponse.json({
    ok: true,
    uptime: Math.round(process.uptime()),
    disk: {
      used: storage.fmt(bytes),
      quota: storage.fmt(storage.DISK_QUOTA_BYTES),
      files,
    },
    maxUploadMb: Math.round(storage.MAX_UPLOAD_BYTES / (1024 * 1024)),
  });
}
