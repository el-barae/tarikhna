import {readFileSync} from 'node:fs';
import {describe,it,expect} from 'vitest';
import {editStateYear,getActiveData,localized,polityAt,stateAt,validateDataset,type Dataset,type StateYearEdit} from '../packages/core/src';
const seed:Dataset=JSON.parse(readFileSync(new URL('../public/islamic-history.json',import.meta.url),'utf8'));
const id='abbasid-caliphate';
const state=(dataset:Dataset,year:number)=>getActiveData(dataset,year).states.find(s=>s.id===id)!;
const change=(dataset=seed,year=800):StateYearEdit=>{const s=state(dataset,year),f=s.territories.features[0];return {name:{fr:'Nom corrigé',en:localized(s.name,'en'),ar:localized(s.name,'ar')},description:s.description,color:'#4168aa',dynasty:s.dynasty,polityType:polityAt(s,year),geometry:{type:'Polygon',coordinates:[[[40,30],[46,30],[46,35],[40,35],[40,30]]]},certainty:'symbolic',control:f.properties.control};};
describe('editing a state on the map for one year',()=>{
 it('splits one interval and preserves both neighbouring years and the source dataset',()=>{
  const before=JSON.stringify(seed),next=editStateYear(seed,id,800,change());
  expect(validateDataset(next).errors).toEqual([]);expect(JSON.stringify(seed)).toBe(before);
  for(const year of [799,801]){expect(state(next,year).territories.features[0].geometry).toEqual(state(seed,year).territories.features[0].geometry);expect(state(next,year).name).toEqual(state(seed,year).name);}
  const edited=state(next,800);expect(localized(edited.name)).toBe('Nom corrigé');expect(edited.territories.features[0].properties).toMatchObject({startYear:800,endYear:800,landClipped:false});
  expect(edited.territories.features[0].geometry).toEqual(change().geometry);
 });
 it('handles the first and last year of a slice, and repeated edits without overlapping dates or IDs',()=>{
  for(const year of [750,860,1258]){
   let next=editStateYear(seed,id,year,change(seed,year));next=editStateYear(next,id,year,{...change(next,year),geometry:{type:'Polygon',coordinates:[[[41,30],[46,30],[46,35],[41,35],[41,30]]]},polityType:'emirate'});
   expect(validateDataset(next).errors).toEqual([]);expect(polityAt(state(next,year),year)).toBe('emirate');
   const canonical=next.states.find(s=>s.id===id)!;expect(canonical.details?.filter(d=>d.from<=year&&year<=d.to)).toHaveLength(1);
  }
 });
 it('keeps holes and other parts of a multipolygon when editing a vertex',()=>{
  const edit=change();edit.geometry={type:'MultiPolygon',coordinates:[[[[40,30],[46,30],[46,35],[40,35],[40,30]],[[42,31],[42,32],[43,32],[43,31],[42,31]]],[[[50,30],[51,30],[51,31],[50,31],[50,30]]]]};
  const next=editStateYear(seed,id,800,edit);expect(validateDataset(next).valid).toBe(true);expect(state(next,800).territories.features[0].geometry).toEqual(edit.geometry);
 });
 it('supports a year with no geometry and does not fabricate neighbouring coverage',()=>{
  const dataset=structuredClone(seed);dataset.states.find(s=>s.id===id)!.territories.features=[];
  const next=editStateYear(dataset,id,800,change());expect(validateDataset(next).errors).toEqual([]);expect(state(next,799).territories.features).toEqual([]);expect(state(next,801).territories.features).toEqual([]);
 });
 it('rejects dates outside the state and validates crossed outlines and overlapping details',()=>{
  expect(()=>editStateYear(seed,id,749,change())).toThrow(RangeError);
  const edit=change();edit.geometry={type:'Polygon',coordinates:[[[40,30],[46,35],[46,30],[40,35],[40,30]]]};
  expect(validateDataset(editStateYear(seed,id,800,edit)).valid).toBe(false);
  const next=editStateYear(seed,id,800,change()),s=next.states.find(s=>s.id===id)!;s.details!.push({...s.details![0],to:801});
  expect(validateDataset(next).errors.some(e=>e.path.includes('.details'))).toBe(true);
 });
 it('splits existing dated descriptions and polity periods without replacing adjacent values',()=>{
  const dataset=structuredClone(seed),s=dataset.states.find(s=>s.id===id)!;
  s.details=[{from:780,to:820,name:'Nom de la période',description:s.description,color:s.color,dynasty:s.dynasty}];
  s.polityPeriods=[{from:780,to:820,polityType:'emirate'}];
  const next=editStateYear(dataset,id,800,{...change(dataset),polityType:'caliphate'});
  expect(validateDataset(next).errors).toEqual([]);
  for(const year of [799,801]){expect(localized(state(next,year).name)).toBe('Nom de la période');expect(polityAt(state(next,year),year)).toBe('emirate');}
  expect(polityAt(state(next,800),800)).toBe('caliphate');
 });
 it('does not change geometry or its provenance for a text-only correction',()=>{
  const edit=change(),s=state(seed,800);edit.geometry=s.territories.features[0].geometry;
  const next=editStateYear(seed,id,800,edit);expect(next.states.find(s=>s.id===id)!.territories).toEqual(seed.states.find(s=>s.id===id)!.territories);
  expect(localized(stateAt(next.states.find(s=>s.id===id)!,800).name)).toBe('Nom corrigé');
 });
});
