import {readFileSync} from 'node:fs';
import {describe,expect,it} from 'vitest';
import inside from '@turf/boolean-point-in-polygon';
import {capitalsAt,cityNameAt,eventPosition,formatDataset,getActiveData,localized,polityAt,relatedEvents,validateDataset,type Dataset} from '../packages/core/src';
const load=():Dataset=>JSON.parse(readFileSync(new URL('../public/islamic-history.json',import.meta.url),'utf8'));
const legacy=JSON.parse(readFileSync(new URL('./fixtures/legacy-v1.json',import.meta.url),'utf8'));
describe('v2 historical invariants',()=>{
 it('reads v1 snapshots without modifying their bytes and produces editable v2 data',()=>{
  const before=JSON.stringify(legacy),result=validateDataset(legacy);
  expect(result.valid).toBe(true);expect(result.warnings?.length).toBe(1);expect(result.data?.metadata.schemaVersion).toBe(2);
  expect(JSON.stringify(legacy)).toBe(before);expect(validateDataset(result.data).errors).toEqual([]);
 });
 it('resolves early capitals and the Samarra residence at temporal boundaries',()=>{
  const d=load(),a=d.states.find(s=>s.id==='abbasid-caliphate')!;
  expect(capitalsAt(a,750).map(c=>c.city)).toEqual(['kufa']);expect(capitalsAt(a,762).map(c=>c.city)).toEqual(['baghdad']);
  expect(capitalsAt(a,836).map(c=>c.city)).toEqual(['samarra']);expect(capitalsAt(a,892).map(c=>c.city)).toEqual(['baghdad']);
  const f=d.states.find(s=>s.id==='fatimid-caliphate')!;expect(capitalsAt(f,969).map(c=>c.city)).toEqual(['mansuriyya']);expect(capitalsAt(f,973).map(c=>c.city)).toEqual(['cairo']);
 });
 it('rejects a capital and a route before their cities exist',()=>{
  const d=load();d.states.find(s=>s.id==='abbasid-caliphate')!.capitals[0].city='baghdad';d.routes[0].startYear=750;
  const paths=validateDataset(d).errors.map(e=>e.path);expect(paths.some(p=>p.includes('capitals[0].city'))).toBe(true);expect(paths).toContain('routes[0].cityIds[0]');
 });
 it('changes city names and the Córdoba polity at the right year',()=>{
  const d=load(),medina=d.cities.find(c=>c.id==='medina')!,cordoba=d.states.find(s=>s.id==='cordoba-umayyads')!;
  expect(localized(cityNameAt(medina,621))).toBe('Yathrib');expect(localized(cityNameAt(medina,622))).toBe('Médine');
  expect(polityAt(cordoba,928)).toBe('emirate');expect(polityAt(cordoba,929)).toBe('caliphate');
 });
 it('keeps the 1924 caliphate events without an Ottoman territorial state in 1923',()=>{
  const d=load();expect(getActiveData(d,1922).states.some(s=>s.id==='ottoman-empire')).toBe(true);expect(getActiveData(d,1923).states.some(s=>s.id==='ottoman-empire')).toBe(false);
  expect(getActiveData(d,1923).events.some(e=>e.id==='event-caliphate-ceremonial')).toBe(true);
  expect(d.events.find(e=>e.id==='event-caliphate-end')!.location).toEqual({type:'actual',cityId:'ankara'});
 });
 it('derives event relationships and locations from their single source of truth',()=>{
  const d=load(),event=d.events.find(e=>e.id==='event-baghdad')!;const c=d.cities.find(c=>c.id==='baghdad')!;
  c.longitude=44.5;expect(eventPosition(d,event)).toEqual([44.5,c.latitude]);expect(relatedEvents(d,'city',c.id).map(e=>e.id)).toContain(event.id);
  expect(relatedEvents(d,'person','saladin').map(e=>e.id)).toContain('event-hattin');expect(c).not.toHaveProperty('events');expect(d.people[0]).not.toHaveProperty('events');
 });
 it('rejects ambiguous duplicated fields and malformed location objects',()=>{
  const d=load();Object.assign(d.events[0].location,{coordinates:[35,30]});Object.assign(d.states[0],{capital:'medina'});Object.assign(d.cities[0],{events:[]});
  const errors=validateDataset(d).errors;expect(errors.some(e=>e.path==='events[0].location')).toBe(true);expect(errors.some(e=>e.path==='states[0].capital')).toBe(true);expect(errors.some(e=>e.path==='cities[0].events')).toBe(true);
 });
 it('rejects overlapping city names, wrong state IDs and unsafe source permalinks',()=>{
  const d=load(),m=d.cities.find(c=>c.id==='medina')!;m.names[1].from=621;d.states[0].territories.features[0].properties.stateId='abbasid-caliphate';d.sources[0].permanentUrl='javascript:alert(1)';
  const errors=validateDataset(d).errors;expect(errors.some(e=>e.path.includes('.names['))).toBe(true);expect(errors.some(e=>e.path.endsWith('.stateId'))).toBe(true);expect(errors.some(e=>e.path==='sources[0].permanentUrl')).toBe(true);
 });
 it('contains the named regional cities in the corrected snapshots',()=>{
  const d=load();for(const [stateId,cityId,year] of [['umayyad-caliphate','kairouan',670],['umayyad-caliphate','samarkand',740],['abbasid-caliphate','bukhara',800],['abbasid-caliphate','samarkand',800]] as const){
   const c=d.cities.find(c=>c.id===cityId)!;const s=getActiveData(d,year).states.find(s=>s.id===stateId)!;expect(s.territories.features.some(f=>inside([c.longitude,c.latitude],f)),`${stateId}/${cityId}/${year}`).toBe(true);
  }
 });
 it('excludes Iberia before the Almoravid intervention and Ifriqiya before the Almohad expansion',()=>{
  const d=load(),a=getActiveData(d,1040).states.find(s=>s.id==='almoravid-dynasty')!,b=getActiveData(d,1150).states.find(s=>s.id==='almohad-dynasty')!;
  expect(a.territories.features.some(f=>inside([-4.78,37.89],f))).toBe(false);expect(b.territories.features.some(f=>inside([10.096,35.678],f))).toBe(false);
 });
 it('normalizes rings to RFC 7946 and clips the Red Sea from Ayyubid sketches',()=>{
  const d=load();for(const s of d.states)for(const f of s.territories.features){expect(f.properties.landClipped).toBe(true);const polygons=f.geometry.type==='Polygon'?[f.geometry.coordinates]:f.geometry.coordinates;for(const p of polygons)p.forEach((ring,index)=>{const area=ring.slice(1).reduce((a,q,i)=>a+ring[i][0]*q[1]-q[0]*ring[i][1],0);expect(index===0?area>0:area<0).toBe(true);});}
  expect(d.states.find(s=>s.id==='ayyubid-sultanate')!.territories.features.some(f=>inside([36.5,24],f))).toBe(false);
 });
 it('preserves citations, literals and numeric coordinates during formatting',()=>{
  const d=load();d.sources[0].notes='Literal [\\n 1,\\n 2\\n]';const output=formatDataset(d);expect(JSON.parse(output)).toEqual(d);expect(output).toContain('[44.3661, 33.3152]');
 });
 it('uses distinct state colors and separates nominal allegiance from local control',()=>{
  const d=load();expect(new Set(d.states.map(s=>s.color)).size).toBe(d.states.length);const t=d.states.find(s=>s.id==='aghlabid-dynasty')!.territories.features[0].properties;
  expect(t.control).toBe('direct');expect(t.suzerainId).toBe('abbasid-caliphate');
 });
 it('requires access dates for consulted sources and disallows founding figure portraits',()=>{
  const d=load();d.sources[0].verification='consulted';d.sources[0].accessedDate=null;Object.assign(d.people[0],{foundingFigure:true,imageUrl:'https://example.org/portrait.png'});
  const errors=validateDataset(d).errors;expect(errors.some(e=>e.path==='sources[0].accessedDate')).toBe(true);expect(errors.some(e=>e.path==='people[0]')).toBe(true);
 });
});
