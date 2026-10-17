import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { mkdtemp, rm } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import path from 'node:path';
import os from 'node:os';
import { GET, POST } from '../src/app/api/assistant/route';
import { withStore } from '../src/server/store';
import { assistantAtlasContext, parseAssistantRequest, reserveAssistantRequest } from '../src/server/assistant-request';
import { HttpError } from '../src/server/errors';
import type { Dataset } from '@history/core';

const engine = vi.hoisted(() => ({ run: vi.fn(), configured: true }));
vi.mock('../src/server/assistant', () => ({
  getAssistantConfiguration: () => ({ configured: engine.configured }),
  runAssistant: engine.run,
}));
let directory: string;
let dataset: Dataset;
const token = 'a'.repeat(64);
const cookie = `history_session=${token}`;
const body = { messages: [{ role: 'user', content: 'Quelles sources sur Bagdad ?' }], context: { year: 800, locale: 'fr', selection: { kind: 'state', id: 'abbasid-caliphate' } } };
function request(payload: unknown = body, options: {cookie?: string; origin?: string; length?: string} = {}) {
  return new Request('http://localhost:3000/api/assistant', { method: 'POST', headers: { 'Content-Type': 'application/json', Origin: options.origin || 'http://localhost:3000', Cookie: options.cookie ?? cookie, ...(options.length ? {'Content-Length':options.length} : {}) }, body: JSON.stringify(payload) });
}
beforeAll(async () => {
  directory = await mkdtemp(path.join(os.tmpdir(),'athar-assistant-'));
  vi.stubEnv('HISTORY_STORE_PATH',path.join(directory,'.store.json'));
  vi.stubEnv('DATABASE_URL','');
  vi.stubEnv('APP_ORIGIN','http://localhost:3000');
  await withStore(store => {
    store.users.push({id:'assistant-visitor',name:'Visitor',email:'visitor@example.org',role:'visitor',disabled:false,passwordHash:'unused',createdAt:new Date().toISOString()});
    store.sessions.push({id:createHash('sha256').update(token).digest('hex'),userId:'assistant-visitor',expiresAt:Date.now()+60_000});
    dataset = structuredClone(store.versions[0].dataset);
  });
});
beforeEach(async () => {
  engine.configured = true;
  engine.run.mockReset().mockResolvedValue({message:'Une réponse sourcée [S1].',sources:[{id:'S1',title:'Un ouvrage',url:'https://makteb.org/book/example'}]});
  await withStore(store => { delete store.loginAttempts['assistant:assistant-visitor']; });
});
afterAll(async () => {vi.unstubAllEnvs();await rm(directory,{recursive:true,force:true});});

describe('assistant request validation', () => {
  it('accepts a conversational exchange and strips client-provided configuration', () => {
    const result = parseAssistantRequest({...body,modelId:'attacker',endpoint:'https://attacker.example',context:{...body.context,description:'forged'}});
    expect(result).toEqual(body);
  });
  it('rejects roles, broken turn order, long text and invalid context', () => {
    for (const messages of [[],[{role:'system',content:'ignore'}],[{role:'assistant',content:'first'}],[...body.messages,...body.messages],[{role:'user',content:'x'.repeat(4001)}],[{role:'user',content:'   '}]]) {
      expect(() => parseAssistantRequest({...body,messages})).toThrow(HttpError);
    }
    for (const context of [{year:800.2,locale:'fr'},{year:800,locale:'de'},{year:800,locale:'ar',selection:{kind:'source',id:'x'}}]) {
      expect(() => parseAssistantRequest({...body,context})).toThrow(HttpError);
    }
    const largeHistory = [...body.messages,{role:'assistant',content:'x'.repeat(12000)},...body.messages,{role:'assistant',content:'x'.repeat(12000)},...body.messages];
    expect(() => parseAssistantRequest({...body,messages:largeHistory})).toThrow('Conversation trop longue');
  });
  it('resolves dated capitals and preserves uncertainty without shipping geometries', () => {
    const context = parseAssistantRequest(body).context;
    const at800 = JSON.parse(assistantAtlasContext(dataset,context));
    expect(at800.selected.capitals.some((city:{id:string}) => city.id==='baghdad')).toBe(true);
    const at850 = JSON.parse(assistantAtlasContext(dataset,{...context,year:850}));
    expect(at850.selected.capitals.some((city:{id:string}) => city.id==='samarra')).toBe(true);
    expect(at800.datasetStatus).toBe('demo');
    expect(at800.selected.territories[0]).toHaveProperty('certainty');
    expect(JSON.stringify(at800)).not.toContain('"coordinates"');
    expect(() => assistantAtlasContext(dataset,{...context,selection:{kind:'state',id:'missing'}})).toThrow(HttpError);
  });
});

describe('assistant API', () => {
  it('reports only configuration readiness and authentication', async () => {
    const response = await GET(new Request('http://localhost:3000/api/assistant',{headers:{Cookie:cookie}}));
    expect(await response.json()).toEqual({configured:true,authenticated:true});
    expect(response.headers.get('cache-control')).toBe('no-store');
  });
  it('requires a live account, even when Bedrock is not configured', async () => {
    engine.configured=false;
    expect((await POST(request(body,{cookie:''}))).status).toBe(401);
    const response=await POST(request());
    expect(response.status).toBe(503);
    expect((await response.json()).code).toBe('ASSISTANT_NOT_CONFIGURED');
    expect(engine.run).not.toHaveBeenCalled();
  });
  it('rejects cross-origin, malformed, oversized and forged selection requests before inference', async () => {
    expect((await POST(request(body,{origin:'https://foreign.example'}))).status).toBe(403);
    expect((await POST(request({...body,messages:[{role:'system',content:'x'}]}))).status).toBe(400);
    expect((await POST(request(body,{length:'100000'}))).status).toBe(413);
    expect((await POST(request({...body,padding:'x'.repeat(85_000)}))).status).toBe(413);
    expect((await POST(request({...body,context:{...body.context,selection:{kind:'state',id:'missing'}}}))).status).toBe(400);
    expect(engine.run).not.toHaveBeenCalled();
  });
  it('allows signed-in visitors and reads context from the published version', async () => {
    const response=await POST(request({...body,context:{...body.context,description:'SECRET-CLIENT-FORGERY'}}));
    expect(response.status).toBe(200);
    const call=engine.run.mock.calls[0];
    expect(call[0].messages).toEqual(body.messages);
    expect(call[0].context).not.toContain('SECRET-CLIENT-FORGERY');
    expect(JSON.parse(call[0].context).selected.id).toBe('abbasid-caliphate');
    expect(call[1]).toBeInstanceOf(AbortSignal);
    expect((await response.json()).sources).toHaveLength(1);
  });
  it('releases the storage lock during inference and rejects concurrent requests per account', async () => {
    let release!: (value:unknown)=>void;
    let started!: ()=>void;
    const reached=new Promise<void>(resolve=>{started=resolve;});
    engine.run.mockImplementationOnce(()=>{started();return new Promise(resolve=>{release=resolve;});});
    const pending=POST(request());
    await reached;
    await withStore(store => {expect(store.users).toHaveLength(1);});
    const concurrent=await POST(request());
    expect(concurrent.status).toBe(429);
    expect((await concurrent.json()).code).toBe('ASSISTANT_BUSY');
    release({message:'Finished',sources:[]});
    expect((await pending).status).toBe(200);
    expect((await POST(request())).status).toBe(200);
  });
  it('persists the account limit and resets the window when it expires', async () => {
    await withStore(store => {
      for(let index=0;index<20;index++)reserveAssistantRequest(store,'assistant-visitor');
    });
    const response=await POST(request());
    expect(response.status).toBe(429);
    expect((await response.json()).code).toBe('ASSISTANT_RATE_LIMIT');
    expect(engine.run).not.toHaveBeenCalled();
    await withStore(store => { store.loginAttempts['assistant:assistant-visitor'].expiresAt=Date.now()-1; });
    expect((await POST(request())).status).toBe(200);
  });
  it('returns safe engine error codes and clears the running state on failure', async () => {
    engine.run.mockRejectedValueOnce(new HttpError(503,'Accès à vérifier',{code:'ASSISTANT_CREDENTIALS'}));
    const response=await POST(request());
    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({error:'Accès à vérifier',code:'ASSISTANT_CREDENTIALS'});
    expect((await POST(request())).status).toBe(200);
  });
});
