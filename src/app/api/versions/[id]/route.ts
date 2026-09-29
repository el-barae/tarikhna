import { readDataset } from '@history/core';
import { requireUser } from '@/server/auth';
import { handle, json } from '@/server/http';
import { withStore } from '@/server/store';
import { findVersion } from '@/server/workflow';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    const { id } = await context.params;
    return withStore((store) => {
      requireUser(store, request);
      const version = findVersion(store,id);
      return json({ version: {...version,dataset:readDataset(version.dataset)} });
    });
  });
}
