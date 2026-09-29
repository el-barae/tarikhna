import {afterEach,describe,expect,it,vi} from 'vitest';
import {sameOrigin} from '../src/server/http';
function req(origin:string,host='localhost:3000',extra:Record<string,string>={}){
 return new Request('http://0.0.0.0:3000/api/auth/login',{headers:{Origin:origin,Host:host,'Sec-Fetch-Site':'same-origin',...extra}});
}
afterEach(()=>vi.unstubAllEnvs());
describe('request origin verification',()=>{
 it.each(['localhost:3000','127.0.0.1:3000','192.168.1.10:3000','[::1]:3000'])('accepts the addressed host %s despite an internal wildcard URL',host=>{
  vi.stubEnv('APP_ORIGIN','');expect(()=>sameOrigin(req(`http://${host}`,host))).not.toThrow();
 });
 it.each(['https://attacker.example','http://localhost:3001','https://localhost:3000','null','http://0.0.0.0:3000'])('rejects a different origin %s',origin=>{
  vi.stubEnv('APP_ORIGIN','');expect(()=>sameOrigin(req(origin))).toThrow('Cette requête doit provenir de l’application.');
 });
 it('keeps the configured public origin authoritative behind a proxy',()=>{
  vi.stubEnv('APP_ORIGIN','https://atlas.example.org');
  expect(()=>sameOrigin(req('https://atlas.example.org','internal:3000'))).not.toThrow();
  expect(()=>sameOrigin(req('http://localhost:3000'))).toThrow();
 });
 it('does not authorize a forged forwarded host or cross-site browser request',()=>{
  vi.stubEnv('APP_ORIGIN','');
  expect(()=>sameOrigin(req('https://attacker.example','localhost:3000',{'X-Forwarded-Host':'attacker.example','X-Forwarded-Proto':'https'}))).toThrow();
  expect(()=>sameOrigin(req('http://localhost:3000','localhost:3000',{'Sec-Fetch-Site':'cross-site'}))).toThrow();
 });
 it('falls back to the request URL when there is no Host header',()=>{
  vi.stubEnv('APP_ORIGIN','');expect(()=>sameOrigin(new Request('http://localhost:3000/api/auth/login',{headers:{Origin:'http://localhost:3000'}}))).not.toThrow();
 });
});
