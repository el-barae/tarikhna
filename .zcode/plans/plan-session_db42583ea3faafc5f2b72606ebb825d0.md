# Fix: make Makteb MCP egress configurable so Vercel production can bypass the Cloudflare IP block

**Root cause recap:** `api.makteb.org` sits behind Cloudflare, which blocks/challenges requests from Vercel's shared AWS datacenter IPs. Code and headers are identical to localhost (verified: the exact `initialize` payload returns 200 from a residential IP). The only code-level fix that works regardless of block variant (403 HTML challenge or shared-IP 429) is to make the *egress* configurable, so production can route Makteb calls through an intermediary with a clean IP.

## Code changes

### 1. `src/server/assistant/makteb.ts`
- **Endpoint override (`MAKTEB_MCP_URL`):** resolve the endpoint per call from this env var (must be a valid `https://` URL); fall back to the existing `MAKTEB_ENDPOINT` constant when unset or invalid. This lets production point at a Cloudflare Worker reverse-proxy with zero further code changes (just an env var, no redeploy of app logic to switch routes).
- **Outbound proxy support (`MAKTEB_PROXY_URL`):** when set, lazily create a module-level singleton undici `ProxyAgent` and perform the RPC POSTs via `undici.fetch` with that `dispatcher`; when unset, behavior is exactly today's global `fetch`. A dedicated variable (not `HTTPS_PROXY`) so Bedrock and other outbound calls are never routed through it.
  - Swap the client's default fetcher from global `fetch` to a module-level `maktebFetch()` wrapper preserving the existing `fetcher: typeof fetch` signature, headers (`User-Agent: Atharahom/1.0`), `cache: 'no-store'`, `redirect: 'error'`, and abort-signal semantics.
  - Update `src/server/assistant/index.ts:123` to stop passing global `fetch` explicitly so the proxy-aware default applies.
- **Bounded 429 retry:** on 429 with `retry-after ≤ 8s`, wait once (honoring the abort signal) and re-issue with a fresh JSON-RPC id; otherwise keep today's behavior (503 `ASSISTANT_MCP_RATE_LIMIT` with propagated `Retry-After`). One retry total, inside the existing 20s RPC timeout.
- All existing error semantics, secrets hygiene, and `[assistant:makteb]` diagnostics unchanged.

### 2. Dependencies & config
- Add `undici` to `package.json` (Node's bundled undici isn't reachable portably for `ProxyAgent`).
- Per AGENTS.md, first read the relevant guide in `node_modules/next/dist/docs/` for this Next version; add `serverExternalPackages: ['undici']` to `next.config.ts` only if the docs require it for server bundles.

### 3. Docs & env template
- `.env.example`: document `MAKTEB_MCP_URL` and `MAKTEB_PROXY_URL`.
- `docs/ASSISTANT.md`: short recipes for the two production routes:
  - **Free route:** a ~5-line Cloudflare Worker reverse-proxy (`fetch('https://api.makteb.org' + pathname, req)`) → set `MAKTEB_MCP_URL`. Caveat noted: test it — if Makteb's zone also challenges Cloudflare-egress requests, use the VPS route.
  - **Reliable route:** any small VPS HTTP proxy (e.g. tinyproxy/squid) → set `MAKTEB_PROXY_URL=http://user:pass@host:port`.

### 4. Tests (`tests/assistant-mcp.test.ts`, existing harness with injected fetcher stays intact)
- Endpoint override honored when `MAKTEB_MCP_URL` is set; safe fallback when unset/invalid.
- 429 with short `retry-after` → second attempt succeeds; 429 with long `retry-after` → single call, 503 + `retryAfter` as today.
- Existing 12 transport/argument tests remain green.

## After the code lands (your side, ~15 min)
1. Deploy the free Worker (or VPS proxy), set the corresponding env var in Vercel, redeploy.
2. Confirm in Vercel function logs that `[assistant:makteb]` lines show 200s instead of the failure line, and that sources ([S1], [S2]…) appear in assistant answers.

## Explicitly out of scope
- Client-side/browser MCP calls (would break the server-side citation-validation and prompt-injection trust model).
- TLS-fingerprint spoofing to evade bot protection.
- Shared tool-schema cache (Upstash/KV) — only worth revisiting if 429 rate-limiting persists after the egress fix.
