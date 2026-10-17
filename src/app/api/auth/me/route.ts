import { currentUser, isAuthDisabled } from '@/server/auth';
import { handle, json } from '@/server/http';
import { withStore } from '@/server/store';
import { publicUser } from '@/server/types';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export async function GET(request: Request) {
  return handle(() => withStore(async (store) => {
    const user = currentUser(store, request);
    return json({ user: user ? publicUser(user) : null, authDisabled: isAuthDisabled() });
  }));
}
