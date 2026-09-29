'use client';
import {useEffect,useMemo,useRef,useState} from 'react';
import {Check,Minus,Pencil,Plus,Save,Undo2,X} from 'lucide-react';
import rewind from '@turf/rewind';
import {activeAt,editStateYear,localized,polityAt,stateAt,validateDataset,type AreaGeometry,type Dataset,type HistoricalState,type Locale,type LocalizedText,type Position,type StateYearEdit} from '@history/core';
import HistoricalMap,{type Filters,type MapHandle} from './HistoricalMap';
import type {MapEditing} from './MapGeometryEditing';
import {useDialogFocus} from './LoginDialog';
import {stateEditCopy} from './state-edit-copy';
import {dictionaries} from '@/lib/i18n';
import './state-map-editor.css';
const filters:Filters={states:true,dynasties:true,cities:false,events:false,battles:false,routes:false,people:false};
type Props={dataset:Dataset;baseVersionId:string;initialStateId?:string;initialYear:number;locale:Locale;onClose:()=>void;onReview:()=>void};
type Draft=Omit<StateYearEdit,'geometry'>&{geometry:AreaGeometry|null};
const clamp=(state:HistoricalState,year:number)=>Math.max(state.startYear,Math.min(state.endYear,year));
const translated=(value:LocalizedText,locale:Locale,text:string):LocalizedText=>({...typeof value==='string'?{fr:value,en:value,ar:value}:value,[locale]:text});

export default function StateMapEditor(props:Props){
 const first=props.dataset.states.find(s=>s.id===props.initialStateId)??props.dataset.states.find(s=>activeAt(s.startYear,s.endYear,props.initialYear))??props.dataset.states[0];
 const [target,setTarget]=useState({id:first?.id,year:first?clamp(first,props.initialYear):props.initialYear});
 const state=props.dataset.states.find(s=>s.id===target.id);
 if(!state)return null;
 return <StateYearEditor key={`${target.id}-${target.year}`} {...props} state={state} year={target.year} onTarget={(id,year)=>{const state=props.dataset.states.find(s=>s.id===id);if(state)setTarget({id,year:clamp(state,year)});}}/>;
}

function StateYearEditor({dataset,baseVersionId,state,year,locale,onClose,onReview,onTarget}:Props&{state:HistoricalState;year:number;onTarget:(id:string,year:number)=>void}){
 const t=stateEditCopy[locale],labels=dictionaries[locale];
 const original=useMemo(()=>{const resolved=stateAt(state,year),territory=state.territories.features.find(f=>activeAt(f.properties.startYear,f.properties.endYear,year));return {
  name:resolved.name,description:resolved.description,color:resolved.color,dynasty:resolved.dynasty,polityType:polityAt(state,year),geometry:territory?.geometry??null,certainty:territory?.properties.certainty??'symbolic',control:territory?.properties.control??'influence',
 } satisfies Draft;},[state,year]);
 const [draft,setDraft]=useState<Draft>(()=>structuredClone(original));
 const [contentLocale,setContentLocale]=useState(locale);
 const [yearInput,setYearInput]=useState(String(year));
 const [drawing,setDrawing]=useState<'replace'|'add'|null>(null);
 const [points,setPoints]=useState<Position[]>([]);
 const [history,setHistory]=useState<(AreaGeometry|null)[]>([]);
 const [busy,setBusy]=useState(false),[message,setMessage]=useState(''),[saved,setSaved]=useState(false),[confirmClose,setConfirmClose]=useState(false);
 const [savedDraft,setSavedDraft]=useState(JSON.stringify(original));
 const dirty=JSON.stringify(draft)!==savedDraft||drawing!==null;
 const close=()=>{if(busy)return;if(drawing){setDrawing(null);setPoints([]);return;}if(dirty)setConfirmClose(true);else onClose();};
 const box=useDialogFocus(close),map=useRef<MapHandle>(null);
 useEffect(()=>{const warn=(e:BeforeUnloadEvent)=>{if(dirty)e.preventDefault();};window.addEventListener('beforeunload',warn);return()=>window.removeEventListener('beforeunload',warn);},[dirty]);
 useEffect(()=>{if(confirmClose)box.current?.querySelector<HTMLElement>('[role="alertdialog"] button')?.focus();},[confirmClose,box]);
 const update=<K extends keyof Draft>(key:K,value:Draft[K])=>{setDraft(d=>({...d,[key]:value}));setMessage('');};
 const changeGeometry=(geometry:AreaGeometry)=>{setHistory(h=>[...h,draft.geometry]);update('geometry',geometry);};
 const candidate=useMemo(()=>draft.geometry?editStateYear(dataset,state.id,year,draft as StateYearEdit):null,[dataset,state.id,year,draft]);
 const validation=useMemo(()=>candidate?validateDataset(candidate):null,[candidate]);
 const geometryInvalid=validation?.errors.some(e=>e.path.includes('.geometry'))??false;
 const finish=()=>{
  if(points.length<3)return;
  const polygon:AreaGeometry={type:'Polygon',coordinates:[[...points,[...points[0]]]]};
  const geometry:AreaGeometry=drawing==='add'&&draft.geometry?{type:'MultiPolygon',coordinates:[...(draft.geometry.type==='Polygon'?[draft.geometry.coordinates]:draft.geometry.coordinates),polygon.coordinates]}:polygon;
  const check=validateDataset(editStateYear(dataset,state.id,year,{...draft,geometry}));
  if(check.errors.some(e=>e.path.includes('.geometry'))){setMessage(t.invalid);return;}
  changeGeometry(rewind(geometry,{reverse:false}) as AreaGeometry);setDrawing(null);setPoints([]);setMessage('');
 };
 const editing:MapEditing={stateId:state.id,initialGeometry:original.geometry??undefined,geometry:drawing==='replace'?null:draft.geometry,drawing:!!drawing,points,onPoint:point=>{if(busy)return;setPoints(p=>[...p,point]);setMessage('');},onFinish:finish,onGeometry:geometry=>{if(!busy)changeGeometry(geometry);}};
 async function save(){
  if(!candidate||!draft.geometry){setMessage(t.missing);return;}
  if(!validation?.valid){setMessage(geometryInvalid?t.invalid:validation?.errors.map(e=>`${e.path}: ${e.message}`).join('\n')??t.error);return;}
  setBusy(true);setMessage('');
  try{
   const normalized={...draft,geometry:rewind(draft.geometry,{reverse:false}) as AreaGeometry};
   const dataset=editStateYear(candidate,state.id,year,normalized);
   const response=await fetch('/api/versions',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({dataset,baseVersionId,summary:`${localized(draft.name,locale)} — ${year} : modification sur la carte`})});
   const body=await response.json();if(!response.ok)throw new Error(body.error||t.error);
   setDraft(normalized);setSavedDraft(JSON.stringify(normalized));setSaved(true);setHistory([]);
  }catch(cause){setMessage(cause instanceof Error?cause.message:t.error);}finally{setBusy(false);}
 }
 const startDrawing=(mode:'replace'|'add')=>{setDrawing(mode);setPoints([]);setMessage('');};
 return <div ref={box} className="state-map-editor" role="dialog" aria-modal="true" aria-label={t.title} dir={locale==='ar'?'rtl':'ltr'}>
  <header className="state-edit-header"><div><Pencil size={19}/><strong>{t.mode}</strong><span>{year}</span></div><button className="icon-button" onClick={close} disabled={busy} aria-label={t.close}><X size={22}/></button></header>
  <div className="state-edit-layout">
   <aside className="state-edit-panel" aria-label={t.fields}>
    <div className="state-edit-target"><label>{t.state}<select value={state.id} disabled={dirty||busy} onChange={e=>onTarget(e.target.value,year)}>{dataset.states.map(s=><option key={s.id} value={s.id}>{localized(stateAt(s,year).name,locale)}</option>)}</select></label><label>{t.year}<input type="number" min={state.startYear} max={state.endYear} value={yearInput} disabled={dirty||busy} onChange={e=>setYearInput(e.target.value)} onBlur={()=>{const value=Number(yearInput);if(yearInput&&Number.isInteger(value)){setYearInput(String(clamp(state,value)));onTarget(state.id,value);}else setYearInput(String(year));}} onKeyDown={e=>{if(e.key==='Enter')e.currentTarget.blur();}}/></label></div>
    <p className="state-edit-scope">{year} · {t.scope}</p>
    <fieldset disabled={busy||!!drawing} className="state-edit-fields">
     <label>{t.language}<select value={contentLocale} onChange={e=>setContentLocale(e.target.value as Locale)}><option value="fr">Français</option><option value="en">English</option><option value="ar">العربية</option></select></label>
     <label>{t.name}<input value={localized(draft.name,contentLocale)} onChange={e=>update('name',translated(draft.name,contentLocale,e.target.value))}/></label>
     <label>{t.description}<textarea rows={4} value={localized(draft.description,contentLocale)} onChange={e=>update('description',translated(draft.description,contentLocale,e.target.value))}/></label>
     <div className="state-edit-pair"><label>{t.polity}<select value={draft.polityType} onChange={e=>update('polityType',e.target.value as Draft['polityType'])}>{Object.entries(labels.polityTypes).map(([value,label])=><option key={value} value={value}>{label}</option>)}</select></label><label>{t.color}<input type="color" value={draft.color} onChange={e=>update('color',e.target.value)}/></label></div>
     <label>{t.dynasty}<input value={draft.dynasty??''} onChange={e=>update('dynasty',e.target.value||null)}/></label>
     <div className="state-edit-pair"><label>{t.certainty}<select value={draft.certainty} onChange={e=>update('certainty',e.target.value as Draft['certainty'])}>{Object.entries(labels.certaintyLabels).map(([value,label])=><option key={value} value={value}>{label}</option>)}</select></label><label>{t.control}<select value={draft.control} onChange={e=>update('control',e.target.value as Draft['control'])}>{Object.entries(labels.controlLabels).map(([value,label])=><option key={value} value={value}>{label}</option>)}</select></label></div>
    </fieldset>
    {dirty&&<small>{t.locked}</small>}
    {!drawing&&<button className="state-edit-reset" disabled={busy||(!dirty&&!history.length)} onClick={()=>{setDraft(structuredClone(original));setHistory([]);setMessage('');setSavedDraft(JSON.stringify(original));setSaved(false);}}>{t.reset}</button>}
   </aside>
   <section className={`state-edit-map ${drawing?'is-drawing':''}`} aria-label={t.map}>
    <HistoricalMap ref={map} dataset={dataset} year={year} locale={locale} filters={filters} borders={false} onSelect={()=>{}} editing={editing}/>
    <div className="drawing-toolbar">{drawing?<><button disabled={points.length<3} onClick={finish}><Check size={17}/>{t.finish}</button><button disabled={!points.length} onClick={()=>setPoints(p=>p.slice(0,-1))}><Undo2 size={17}/>{t.undo}</button><button onClick={()=>{setDrawing(null);setPoints([]);setMessage('');}}><X size={17}/>{t.cancelDraw}</button></>:<><button disabled={busy} onClick={()=>startDrawing('replace')}><Pencil size={17}/>{t.draw}</button><button disabled={busy} onClick={()=>startDrawing('add')}><Plus size={17}/>{t.add}</button><button disabled={busy||!history.length} onClick={()=>{setDraft(d=>({...d,geometry:history.at(-1)??null}));setHistory(h=>h.slice(0,-1));setMessage('');}}><Undo2 size={17}/>{t.undoShape}</button></>}</div>
    <div className="drawing-help" role="status">{drawing?`${t.drawHint} (${points.length} ${t.points})`:t.editHint}</div>
    <div className="drawing-zoom"><button onClick={()=>map.current?.zoom(1)} aria-label={t.zoomIn}><Plus size={20}/></button><button onClick={()=>map.current?.zoom(-1)} aria-label={t.zoomOut}><Minus size={20}/></button></div>
   </section>
  </div>
  <footer className="state-edit-footer"><div>{message?<p role="alert">{message}</p>:saved&&!dirty?<p role="status">{t.saved}</p>:<span>{dirty?t.notSaved:t.scope}</span>}{geometryInvalid&&!message&&<p role="alert">{t.invalid}</p>}</div><div>{saved&&<button disabled={dirty||busy} onClick={onReview}>{t.review}</button>}<button className="state-edit-save" disabled={busy||!!drawing||!dirty||!draft.geometry} onClick={()=>void save()}><Save size={17}/>{busy?t.saving:t.save}</button></div></footer>
  {confirmClose&&<div className="state-edit-confirm"><section role="alertdialog" aria-label={t.unsaved} aria-modal="true"><p>{t.unsaved}</p><button onClick={()=>setConfirmClose(false)}>{t.stay}</button><button onClick={onClose}>{t.discard}</button></section></div>}
 </div>;
}
