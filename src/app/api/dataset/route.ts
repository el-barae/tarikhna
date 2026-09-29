import { readDataset } from '@history/core';
import { handle, json } from '@/server/http';
import { withStore } from '@/server/store';
import { publishedVersion } from '@/server/workflow';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export async function GET() {
  return handle(() => withStore((store) => {
    const version = publishedVersion(store);
    return json({ dataset: readDataset(version.dataset), versionId: version.id });
  }));
}
