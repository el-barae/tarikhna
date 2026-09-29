import { requireUser } from '@/server/auth';
import { handle, json, readJson } from '@/server/http';
import { withStore } from '@/server/store';
import { publicUser } from '@/server/types';
import { addUser, updateUser } from '@/server/users';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export async function GET(request: Request) {
  return handle(() => withStore((store) => {
    requireUser(store, request, 'administrator');
    return json({ users: store.users.map(publicUser) });
  }));
}
export async function POST(request: Request) {
  return handle(async () => {
    const body = await readJson(request);
    return withStore(async (store) => {
      requireUser(store, request, 'administrator');
      return json({ user: publicUser(await addUser(store, body)) }, 201);
    });
  });
}
export async function PATCH(request: Request) {
  return handle(async () => {
    const body = await readJson(request);
    return withStore((store) => {
      requireUser(store, request, 'administrator');
      return json({ user: publicUser(updateUser(store, body)) });
    });
  });
}
