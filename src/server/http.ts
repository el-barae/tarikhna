import { HttpError } from './errors';

const MAX_BODY_BYTES = 10 * 1024 * 1024;
export function sameOrigin(request: Request): void {
  const origin = request.headers.get('origin');
  const url = new URL(request.url);
  // Next.js may build request.url from the bind address (0.0.0.0).
  // Host is the authority the browser actually addressed; forwarded headers
  // are deliberately ignored. APP_ORIGIN remains authoritative when set.
  const expected = process.env.APP_ORIGIN || `${url.protocol}//${request.headers.get('host') || url.host}`;
  if ((origin && origin !== expected) || request.headers.get('sec-fetch-site') === 'cross-site') {
    throw new HttpError(403, 'Cette requête doit provenir de l’application.');
  }
}
export async function readJson(request: Request): Promise<Record<string, unknown>> {
  sameOrigin(request);
  if (!request.headers.get('content-type')?.toLowerCase().startsWith('application/json')) {
    throw new HttpError(415, 'Le contenu doit être au format application/json.');
  }
  if (Number(request.headers.get('content-length')) > MAX_BODY_BYTES) throw new HttpError(413, 'Fichier trop volumineux (10 Mo maximum).');
  const reader = request.body?.getReader();
  if (!reader) throw new HttpError(400, 'Le corps JSON est requis.');
  let bytes = 0;
  const chunks: Uint8Array[] = [];
  try {
    while (true) {
      const result = await reader.read();
      if (result.done) break;
      bytes += result.value.byteLength;
      if (bytes > MAX_BODY_BYTES) { await reader.cancel(); throw new HttpError(413, 'Fichier trop volumineux (10 Mo maximum).'); }
      chunks.push(result.value);
    }
    const parsed: unknown = JSON.parse(Buffer.concat(chunks).toString('utf8'));
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('object expected');
    return parsed as Record<string, unknown>;
  } catch (error) {
    if (error instanceof HttpError) throw error;
    throw new HttpError(400, 'JSON invalide : un objet est attendu.');
  }
}
export function json(value: unknown, status = 200, headers: Record<string, string> = {}): Response {
  return Response.json(value, { status, headers: { 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', ...headers } });
}
export async function handle(callback: () => Promise<Response>): Promise<Response> {
  try { return await callback(); }
  catch (error) {
    if (error instanceof HttpError) return json({ error: error.message, ...(error.details ? { details: error.details } : {}) }, error.status);
    console.error('[api]', error instanceof Error ? error.message : 'Unknown error');
    return json({ error: 'Une erreur interne est survenue. Veuillez réessayer.' }, 500);
  }
}
