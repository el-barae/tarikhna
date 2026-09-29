'use client';

import {useCallback, useEffect, useMemo, useRef, useState, type ReactNode} from 'react';
import dynamic from 'next/dynamic';
import {ArrowDownToLine, ArrowLeft, ArrowRight, ArrowUpRight, BookOpen, Building2, Check, ChevronDown, ChevronLeft, ChevronRight, Compass, Crown, ExternalLink, Flag, Globe2, Info, Layers3, Library, LogOut, Map, Maximize2, Menu, Minus, Moon, Sun, Pencil, Navigation, Pause, Play, Plus, RotateCcw, Route, Search, Settings2, Share2, Shield, SlidersHorizontal, Sparkles, Swords, UserRound, UsersRound, X} from 'lucide-react';
import {getActiveData, stateAt, capitalsAt, cityNameAt, eventPosition, polityAt, relatedEvents, sourceId, localized, searchDataset, validateDataset, type Dataset, type EntityKind, type Locale, type SearchResult} from '@history/core';
import {dictionaries} from '@/lib/i18n';
import {useTheme} from './ThemeProvider';
import type {ThemePreference} from '@/lib/theme';
import type {Filters,MapHandle,Selection} from './HistoricalMap';
import type {User} from './Studio';
import {stateEditCopy} from './state-edit-copy';
import './state-map-editor.css';

const HistoricalMap=dynamic(()=>import('./HistoricalMap'),{ssr:false});
const StateMapEditor=dynamic(()=>import('./StateMapEditor'),{ssr:false});
const Studio=dynamic(()=>import('./Studio').then(m=>m.default),{ssr:false});
const LoginDialog=dynamic(()=>import('./LoginDialog').then(m=>m.default),{ssr:false});
const initialFilters:Filters={states:true,dynasties:true,cities:true,events:true,battles:false,routes:false,people:false};
const layerIcons={states:Flag,dynasties:Crown,cities:Building2,events:Sparkles,battles:Swords,routes:Route,people:UsersRound};
const kindIcons={state:Flag,city:Building2,event:Sparkles,person:UserRound,route:Route};

function datasetYears(dataset:Dataset|null):{min:number;max:number}{
  if(!dataset)return {min:610,max:1924};
  let min=Infinity,max=-Infinity;
  const include=(start:number,end:number|null)=>{min=Math.min(min,start);max=Math.max(max,end??start);};
  dataset.periods.forEach(p=>include(p.startYear,p.endYear));
  dataset.states.forEach(s=>include(s.startYear,s.endYear));
  dataset.events.forEach(e=>include(e.startYear,e.endYear));
  dataset.routes.forEach(r=>include(r.startYear,r.endYear));
  dataset.cities.forEach(c=>include(c.activeFrom,c.activeUntil));
  dataset.people.forEach(p=>include(p.birthYear,p.deathYear));
  return Number.isFinite(min)&&Number.isFinite(max)?{min,max}:{min:610,max:1924};
}
function parsedYear(value:string):number|null{
  if(!/^-?\d{1,5}$/.test(value.trim()))return null;
  const year=Number(value);
  return Number.isInteger(year)&&year>=-10000&&year<=10000?year:null;
}

function Dialog({title,onClose,children,wide=false}:{title:string;onClose:()=>void;children:ReactNode;wide?:boolean}){
  const box=useRef<HTMLDivElement>(null);
  useEffect(()=>{const previous=document.activeElement as HTMLElement;box.current?.focus();
    const onKey=(e:KeyboardEvent)=>{if(e.key==='Escape')onClose();if(e.key==='Tab'){const nodes=box.current?.querySelectorAll<HTMLElement>('button,a[href],input,select,textarea,[tabindex="0"]');if(!nodes?.length)return;const first=nodes[0],last=nodes[nodes.length-1];if(e.shiftKey&&document.activeElement===first){e.preventDefault();last.focus();}else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first.focus();}}};document.addEventListener('keydown',onKey);return()=>{document.removeEventListener('keydown',onKey);previous?.focus();};},[onClose]);
  return <div className="dialog-backdrop" onClick={e=>{if(e.target===e.currentTarget)onClose();}}><div ref={box} tabIndex={-1} className={`dialog ${wide?'dialog-wide':''}`} role="dialog" aria-modal="true" aria-label={title}><div className="dialog-header"><h2>{title}</h2><button className="icon-button" onClick={onClose} aria-label="Close / Fermer / إغلاق"><X size={20}/></button></div>{children}</div></div>;
}

export default function Atlas(){
  const {theme,preference,setPreference}=useTheme();
  const [dataset,setDataset]=useState<Dataset|null>(null);
  const [baseVersionId,setBaseVersionId]=useState('');
  const [mapEditor,setMapEditor]=useState(false);
  const [editAfterLogin,setEditAfterLogin]=useState(false);
  const [studioHistory,setStudioHistory]=useState(false);
  const [error,setError]=useState('');
  const [locale,setLocale]=useState<Locale>('fr');
  const [requestedYear,setYear]=useState(800);
  const [yearEdit,setYearEdit]=useState({year:800,value:'800'});
  const [filters,setFilters]=useState<Filters>(initialFilters);
  const [periodId,setPeriodId]=useState('all');
  const [step,setStep]=useState(10);
  const [playing,setPlaying]=useState(false);
  const [selection,setSelection]=useState<Selection|null>(null);
  const [query,setQuery]=useState('');
  const [searchOpen,setSearchOpen]=useState(false);
  const [searchIndex,setSearchIndex]=useState(0);
  const [panel,setPanel]=useState<'about'|'library'|'settings'|'login'|'studio'|null>(null);
  const [sidebarOpen,setSidebarOpen]=useState(false);
  const [user,setUser]=useState<User|null>(null);
  const [borders,setBorders]=useState(false);
  const [toast,setToast]=useState('');
  const [libraryQuery,setLibraryQuery]=useState('');
  const [libraryKind,setLibraryKind]=useState<EntityKind|'all'>('all');
  const mapRef=useRef<MapHandle>(null);
  const searchRef=useRef<HTMLInputElement>(null);
  const t=dictionaries[locale];
  const reload=useCallback(async()=>{
    try{setError('');const r=await fetch('/api/dataset',{cache:'no-store'});if(!r.ok)throw new Error();const body=await r.json();const validation=validateDataset(body.dataset);if(!validation.valid)throw new Error();setDataset(validation.data!);setBaseVersionId(body.versionId);setSelection(null);setPeriodId('all');setPlaying(false);}catch{setError('dataset');}
  },[]);
  useEffect(()=>{void reload();fetch('/api/auth/me').then(r=>r.json()).then(b=>setUser(b.user)).catch(()=>{});const params=new URLSearchParams(window.location.search);const y=parsedYear(params.get('year')??'');if(y!==null)setYear(y);const l=params.get('lang')??localStorage.getItem('athar-locale');if(l==='fr'||l==='en'||l==='ar')setLocale(l);},[reload]);
  useEffect(()=>{document.documentElement.lang=locale;document.documentElement.dir=locale==='ar'?'rtl':'ltr';localStorage.setItem('athar-locale',locale);},[locale]);
  useEffect(()=>{const handle=(e:KeyboardEvent)=>{if((e.metaKey||e.ctrlKey)&&e.key==='k'){e.preventDefault();searchRef.current?.focus();setSearchOpen(true);}if(e.key==='Escape'){setSearchOpen(false);setSelection(null);setSidebarOpen(false);}};window.addEventListener('keydown',handle);return()=>window.removeEventListener('keydown',handle);},[]);
  useEffect(()=>{if(!toast)return;const timeout=setTimeout(()=>setToast(''),3000);return()=>clearTimeout(timeout);},[toast]);

  const extent=useMemo(()=>datasetYears(dataset),[dataset]);
  const chosenPeriod=dataset?.periods.find(p=>p.id===periodId);
  const min=chosenPeriod?.startYear??extent.min;
  const max=chosenPeriod?.endYear??extent.max;
  const year=Math.max(min,Math.min(max,requestedYear));
  const span=Math.max(1,max-min);
  const timelineTicks=useMemo(()=>min===max?[min]:Array.from({length:Math.min(8,max-min+1)},(_,i)=>Math.round(min+(max-min)*i/(Math.min(8,max-min+1)-1))),[min,max]);
  const active=useMemo(()=>dataset?getActiveData(dataset,year):null,[dataset,year]);
  const currentPeriod=chosenPeriod??dataset?.periods.find(p=>p.startYear<=year&&p.endYear>=year);
  // Associate a draft with its displayed year; an effect must not overwrite a new edit.
  const yearDraft=yearEdit.year===year?yearEdit.value:String(year);
  const setYearDraft=(value:string)=>setYearEdit({year,value});
  useEffect(()=>{
    if(!playing)return;
    if(year>=max||min===max){setPlaying(false);return;}
    const timer=setTimeout(()=>setYear(Math.min(max,year+step)),1000);
    return()=>clearTimeout(timer);
  },[playing,step,min,max,year]);
  const searchResults=useMemo(()=>dataset&&query.trim()?searchDataset(dataset,query,locale,year).slice(0,10):[],[dataset,query,locale,year]);
  const libraryResults=useMemo(()=>{
    if(!dataset)return [];
    const all:SearchResult[]=[...dataset.states.map(s=>({kind:'state' as const,id:s.id,label:localized(stateAt(s,year).name,locale),year:s.startYear,description:localized(stateAt(s,year).description,locale)})),...dataset.cities.map(s=>({kind:'city' as const,id:s.id,label:localized(cityNameAt(s,year),locale),year:s.activeFrom,description:localized(s.description,locale)})),...dataset.events.map(s=>({kind:'event' as const,id:s.id,label:localized(s.title,locale),year:s.startYear,description:localized(s.description,locale)})),...dataset.people.map(s=>({kind:'person' as const,id:s.id,label:localized(s.name,locale),year:s.birthYear,description:localized(s.description,locale)})),...dataset.routes.map(s=>({kind:'route' as const,id:s.id,label:localized(s.name,locale),year:s.startYear,description:localized(s.description,locale)}))];
    return (libraryQuery.trim()?searchDataset(dataset,libraryQuery,locale,year):all).filter(r=>libraryKind==='all'||r.kind===libraryKind);
  },[dataset,libraryQuery,libraryKind,locale,year]);

  const selectEntity=useCallback((selected:Selection,changeTime=false)=>{
    if(!dataset)return;
    setSelection(selected);setSidebarOpen(false);setSearchOpen(false);
    let coordinates:[number,number]|undefined;let date:number|undefined;
    if(selected.kind==='city'){const c=dataset.cities.find(c=>c.id===selected.id);if(c){coordinates=[c.longitude,c.latitude];date=c.activeFrom;setFilters(f=>({...f,cities:true}));}}
    if(selected.kind==='state'){const s=dataset.states.find(s=>s.id===selected.id);if(s){const c=dataset.cities.find(c=>c.id===capitalsAt(s,changeTime?s.startYear:year)[0]?.city);if(c)coordinates=[c.longitude,c.latitude];else {const geometry=s.territories.features[0]?.geometry;const ring=geometry?.type==='Polygon'?geometry.coordinates[0]:geometry?.coordinates[0][0];if(ring)coordinates=[ring.reduce((sum,p)=>sum+p[0],0)/ring.length,ring.reduce((sum,p)=>sum+p[1],0)/ring.length];}date=s.territories.features.reduce((first,t)=>Math.min(first,t.properties.startYear),s.endYear);setFilters(f=>({...f,[['state','caliphate','empire'].includes(polityAt(s,year))?'states':'dynasties']:true}));}}
    if(selected.kind==='event'){const e=dataset.events.find(e=>e.id===selected.id);if(e){coordinates=eventPosition(dataset,e);date=e.startYear;setFilters(f=>({...f,[e.type==='battle'?'battles':'events']:true}));}}
    if(selected.kind==='person'){const p=dataset.people.find(p=>p.id===selected.id);const c=dataset.cities.find(c=>c.id===p?.birthPlace);if(c)coordinates=[c.longitude,c.latitude];date=p?.birthYear;setFilters(f=>({...f,people:true}));}
    if(selected.kind==='route'){const r=dataset.routes.find(r=>r.id===selected.id);coordinates=r?.geometry.coordinates[0];date=r?.startYear;setFilters(f=>({...f,routes:true}));}
    if(changeTime&&date!==undefined){setPeriodId('all');setYear(date);setPlaying(false);}
    if(coordinates)mapRef.current?.flyTo(coordinates);
  },[dataset,year]);

  const selected=useMemo(()=>{
    if(!active||!selection)return null;
    if(selection.kind==='state')return active.states.find(x=>x.id===selection.id&&x.territories.features.length>0&&(['state','caliphate','empire'].includes(polityAt(x,year))?filters.states:filters.dynasties));
    if(selection.kind==='city')return filters.cities?active.cities.find(x=>x.id===selection.id):null;
    if(selection.kind==='event')return active.events.find(x=>x.id===selection.id&&(x.type==='battle'?filters.battles:filters.events));
    if(selection.kind==='person')return filters.people?active.people.find(x=>x.id===selection.id):null;
    return filters.routes?active.routes.find(x=>x.id===selection.id):null;
  },[active,selection,filters,year]);
  useEffect(()=>{if(selection&&!selected)setSelection(null);},[selection,selected]);

  const changeYear=(next:number)=>{if(!Number.isInteger(next))return;const bounded=Math.max(min,Math.min(max,next));setYear(bounded);setYearEdit({year:bounded,value:String(bounded)});setPlaying(false);};
  const commitYear=(value:string)=>{const next=parsedYear(value);if(next===null)setYearDraft(String(year));else changeYear(next);};
  const jumpToYear=(next:number)=>{setPeriodId('all');setYear(Math.max(extent.min,Math.min(extent.max,next)));setPlaying(false);setSearchOpen(false);};
  const choosePeriod=(id:string)=>{setPeriodId(id);setPlaying(false);const period=dataset?.periods.find(p=>p.id===id);setYear(period?.startYear??year);};
  const visibleStates=active?.states.filter(s=>s.territories.features.length>0&&(['state','caliphate','empire'].includes(polityAt(s,year))?filters.states:filters.dynasties))??[];
  const accessibleEditor=user&&user.role!=='visitor';
  const startEditing=()=>{if(!dataset?.states.length){setToast(t.noActive);return;}setPlaying(false);setSidebarOpen(false);if(accessibleEditor)setMapEditor(true);else if(user)setToast(stateEditCopy[locale].permission);else {setEditAfterLogin(true);setPanel('login');}};
  const share=async()=>{const url=new URL(window.location.href);url.searchParams.set('year',String(year));url.searchParams.set('lang',locale);try{await navigator.clipboard.writeText(url.toString());setToast(t.copied);}catch{setToast(url.toString());}};
  const closePanel=useCallback(()=>setPanel(null),[]);

  if(!dataset)return <main className="loading-screen"><div className="brand-mark"><Compass size={34}/></div><h1>athar<span>أثر</span></h1><p>{error?t.failed:t.loading}</p>{error?<button className="primary-button" onClick={reload}>{t.retry}</button>:<div className="loading-line"/>}</main>;

  return <><main inert={mapEditor||undefined} className="atlas-app" dir={locale==='ar'?'rtl':'ltr'}>
    <header className="topbar">
      <a href="/" className="brand" aria-label="Athar"><div className="brand-mark"><Compass size={28} strokeWidth={1.4}/></div><div className="brand-word">athar<span className="brand-arabic">أثر</span><small>ATLAS HISTORIQUE</small></div></a>
      <span className="brand-divider"/>
      <nav className="desktop-nav" aria-label="Navigation"><button className={!panel?'active':''} onClick={()=>setPanel(null)}><Map size={16}/>{t.explore}</button><button className={panel==='library'?'active':''} onClick={()=>setPanel('library')}><BookOpen size={16}/>{t.library}</button><button onClick={()=>setPanel('about')}>{t.about}</button></nav>
      <div className="global-search" onBlur={e=>{if(!e.currentTarget.contains(e.relatedTarget))setSearchOpen(false);}}><Search size={17}/><input ref={searchRef} value={query} onChange={e=>{setQuery(e.target.value);setSearchOpen(true);setSearchIndex(0);}} onFocus={()=>setSearchOpen(true)} placeholder={t.searchShort} aria-label={t.search} aria-expanded={searchOpen&&!!query} aria-controls="search-results" role="combobox" autoComplete="off" onKeyDown={e=>{if(e.key==='ArrowDown'){e.preventDefault();setSearchIndex(i=>Math.max(0,Math.min(i+1,searchResults.length-1)));}if(e.key==='ArrowUp'){e.preventDefault();setSearchIndex(i=>Math.max(i-1,0));}if(e.key==='Enter'){if(parsedYear(query)!==null){jumpToYear(parsedYear(query)!);}else if(searchResults[searchIndex])selectEntity(searchResults[searchIndex],true);}}}/><kbd>⌘ K</kbd>
        {searchOpen&&query&&<div className="search-results" id="search-results" role="listbox">{searchResults.length?searchResults.map((r,i)=>{const Icon=kindIcons[r.kind];return <button role="option" aria-selected={i===searchIndex} className={i===searchIndex?'focused':''} key={`${r.kind}-${r.id}`} onMouseDown={e=>e.preventDefault()} onClick={()=>selectEntity(r,true)}><span className="result-icon"><Icon size={16}/></span><span>{r.label}<small>{r.year} · {r.description.slice(0,70)}…</small></span><ArrowUpRight size={15}/></button>;}):<p>{t.noResult}{parsedYear(query)!==null&&<button onMouseDown={e=>e.preventDefault()} onClick={()=>jumpToYear(parsedYear(query)!)}>{t.atYear} {query} <ArrowRight size={15}/></button>}</p>}</div>}
      </div>
      <div className="header-actions"><div className="language-select"><Globe2 size={16}/><select aria-label="Langue / Language / اللغة" value={locale} onChange={e=>setLocale(e.target.value as Locale)}><option value="fr">FR</option><option value="en">EN</option><option value="ar">العربية</option></select><ChevronDown size={12}/></div><button className="icon-button theme-toggle" aria-label={theme==='dark'?t.switchLight:t.switchDark} title={theme==='dark'?t.switchLight:t.switchDark} onClick={()=>setPreference(theme==='dark'?'light':'dark')}>{theme==='dark'?<Sun size={18}/>:<Moon size={18}/>}</button><button className="icon-button settings-button" aria-label={t.settings} onClick={()=>setPanel('settings')}><Settings2 size={18}/></button><button className="account-button" onClick={()=>setPanel(accessibleEditor?'studio':'login')}><UserRound size={16}/><span>{accessibleEditor?t.studio:t.account}</span></button></div>
    </header>

    <section className="map-stage" aria-label={t.explore}>
      <HistoricalMap ref={mapRef} dataset={dataset} year={year} locale={locale} filters={filters} borders={borders} onSelect={s=>selectEntity(s)}/>
      <div className="map-vignette"/>
      <button className="mobile-explore" onClick={()=>setSidebarOpen(!sidebarOpen)}><SlidersHorizontal size={17}/>{t.explore}<ChevronDown size={15}/></button>
      <aside className={`explore-sidebar ${sidebarOpen?'is-open':''}`}>
        <div className="sidebar-intro"><span className="eyebrow"><span/>{t.chapter}</span><h1>{t.exploreTitle}</h1><p>{t.intro}</p></div>
        <div className="period-picker"><label htmlFor="period">{t.period}</label><div><span className="period-color" style={{background:currentPeriod?.color??'#356450'}}/><select id="period" value={chosenPeriod?.id??'all'} onChange={e=>choosePeriod(e.target.value)}><option value="all">{t.allPeriods}</option>{dataset.periods.map(p=><option key={p.id} value={p.id}>{localized(p.name,locale)}</option>)}</select><ChevronDown size={15}/></div></div>
        <div className="layer-panel"><div className="section-heading"><h2><Layers3 size={17}/>{t.layers}</h2><span>{Object.values(filters).filter(Boolean).length} / 7</span></div><div className="layer-list">{(Object.keys(filters) as (keyof Filters)[]).map(key=>{const Icon=layerIcons[key];return <label key={key} className={filters[key]?'layer active':'layer'}><span className={`layer-symbol layer-${key}`}><Icon size={17} strokeWidth={1.65}/></span><span>{t[key]}</span><input type="checkbox" checked={filters[key]} onChange={e=>setFilters(f=>({...f,[key]:e.target.checked}))}/><span className="custom-checkbox">{filters[key]&&<Check size={11} strokeWidth={3}/>}</span></label>;})}</div></div>
        <div className="map-summary"><span className="eyebrow">{t.onMap}</span><div><span><strong>{visibleStates.length.toString().padStart(2,'0')}</strong>{t.territory}</span><span><strong>{(filters.cities?active?.cities.length??0:0).toString().padStart(2,'0')}</strong>{t.city}</span><span><strong>{(active?.events.filter(e=>e.type==='battle'?filters.battles:filters.events).length??0).toString().padStart(2,'0')}</strong>{t.event}</span></div></div>
        <button className="source-link" onClick={()=>setPanel('library')}><BookOpen size={15}/>{t.source}<ArrowUpRight size={15}/></button>
        <button className="source-link" style={{marginTop:0,paddingTop:12}} onClick={()=>{setSidebarOpen(false);setPanel('settings');}}><Settings2 size={15}/>{t.settings}<ArrowUpRight size={15}/></button>
      </aside>
      <div className="map-topline"><span className="live-dot"/><span>{t.atYear} <strong>{year}</strong></span><span className="map-topline-divider"/><span>{currentPeriod?localized(currentPeriod.name,locale):t.allPeriods}</span></div>
      <div className="map-tools"><button aria-label={t.zoomIn} title={t.zoomIn} onClick={()=>mapRef.current?.zoom(1)}><Plus size={20}/></button><button aria-label={t.zoomOut} title={t.zoomOut} onClick={()=>mapRef.current?.zoom(-1)}><Minus size={20}/></button><span/><button aria-label={t.reset} title={t.reset} onClick={()=>{mapRef.current?.reset();setSelection(null);}}><Navigation size={18}/></button><button aria-label={t.fullscreen} title={t.fullscreen} onClick={()=>{if(document.fullscreenElement)void document.exitFullscreen();else void document.documentElement.requestFullscreen().catch(()=>{});}}><Maximize2 size={17}/></button></div>
      <div className="map-bottom"><div className="legend-card"><span className="legend-title">{t.legend}</span>{visibleStates.length?visibleStates.map(s=><button key={s.id} onClick={()=>selectEntity({kind:'state',id:s.id})}><span style={{background:s.color}}/>{localized(s.name,locale)}</button>):<span>{t.noActive}</span>}<small><i/>{t.low}</small></div><div className="compass-rose" aria-hidden="true"><span>N</span><Compass size={61} strokeWidth={0.65}/></div></div>
      {!selected&&<button className="edit-mode-button" onClick={startEditing}><Pencil size={16}/>{stateEditCopy[locale].mode}</button>}
      <div className="demo-map-tag"><Info size={12}/>{dataset.metadata.status==='demo'?t.demo:t.low}</div>

      {selected&&selection&&<aside className="detail-panel" aria-label={t.details}><div className="detail-top"><span className="eyebrow">{t.details}</span><button className="icon-button" onClick={()=>setSelection(null)} aria-label={t.close}><X size={19}/></button></div><div className="detail-ornament"><span/><Compass size={38} strokeWidth={0.9}/><span/></div>{selection.kind==='state'&&<button className="edit-mode-button state-detail-edit" onClick={startEditing}><Pencil size={16}/>{stateEditCopy[locale].mode}</button>}<h2>{localized('title' in selected?selected.title:'activeFrom' in selected?cityNameAt(selected,year):selected.name,locale)}</h2><div className="detail-meta"><span><small>{'activeFrom' in selected?t.coverage:t.dates}</small>{'startPrecision' in selected&&selected.startPrecision==='circa'?`${t.circa} `:''}{'birthPrecision' in selected&&selected.birthPrecision==='circa'?`${t.circa} `:''}{'startYear' in selected?`${selected.startYear} — ${selected.endYear}`:'activeFrom' in selected?`${selected.activeFrom} — ${selected.activeUntil??'…'}`:`${selected.birthYear} — ${selected.deathYear??'…'}`}</span>{'capitals' in selected&&<span><small>{t.capital}</small>{capitalsAt(selected,year).map(capital=>{const city=dataset.cities.find(c=>c.id===capital.city);return city?localized(cityNameAt(city,year),locale):capital.city;}).join(' · ')||'—'}</span>}</div>{'foundedYear' in selected&&selected.foundedYear!==null&&<div className="detail-note"><span>{t.founded} : {selected.foundedPrecision==='circa'?`${t.circa} `:''}{selected.foundedYear}</span></div>}{'territories' in selected&&selected.territories.features.map(feature=><div className="detail-note" key={feature.id}><span>{t.certaintyLabels[feature.properties.certainty]} · {t.controlLabels[feature.properties.control]}{feature.properties.suzerainId?` · ${localized(dataset.states.find(s=>s.id===feature.properties.suzerainId)?.name,locale)}`:''}</span></div>)}{'birthPlaceType' in selected&&selected.birthPlaceType&&<div className="detail-note"><span>{t.locationTypes[selected.birthPlaceType]}</span></div>}{'location' in selected&&<div className="detail-note"><Info size={16}/><span>{t.locationTypes[selected.location.type]}</span></div>}{'polityType' in selected&&<div className="detail-note"><span>{t.polityTypes[polityAt(selected,year)]}{selected.dynasty?` · ${selected.dynasty}`:''}</span></div>}{'honorific' in selected&&selected.honorific&&<p className="detail-note">{localized(selected.honorific,locale)}</p>}<h3>{t.description}</h3><p>{localized(selected.description,locale)}</p>{dataset.metadata.status==='demo'&&<div className="detail-note"><Info size={16}/><span>{t.demoNote}</span></div>}
        {(()=>{const related=relatedEvents(dataset,selection.kind,selected.id);return related.length>0&&<section className="related-section"><h3>{t.related}</h3>{related.map(e=><button key={e.id} onClick={()=>selectEntity({kind:'event',id:e.id},true)}><span className="event-year">{e.startYear}</span><span>{localized(e.title,locale)}</span><ChevronRight size={15}/></button>)}</section>;})()}
        <section className="detail-sources"><h3><BookOpen size={15}/>{t.source}</h3>{selected.sources.length?selected.sources.map((ref,index)=>{const id=sourceId(ref);const s=dataset.sources.find(s=>s.id===id);return s&&<a key={`${id}-${index}`} href={s.permanentUrl??s.url} target="_blank" rel="noopener noreferrer"><span>{s.title}<small>{s.author}{s.publicationYear?` · ${s.publicationYear}`:''}{typeof ref!=='string'&&ref.locator?` · ${ref.locator}`:''}{s.verification!=='consulted'?` · ${t.sourceToVerify}`:''}</small></span><ExternalLink size={14}/></a>;}):<p>{t.sourceEmpty}</p>}</section></aside>}
    </section>

    <footer className="timeline-panel"><div className="time-readout"><span className="eyebrow">{t.atYear}</span><div><input aria-label={t.year} type="number" min={min} max={max} step={1} value={yearDraft} onFocus={()=>setPlaying(false)} onChange={e=>setYearDraft(e.target.value)} onBlur={e=>commitYear(e.currentTarget.value)} onKeyDown={e=>{if(e.key==='Enter'){e.preventDefault();e.currentTarget.blur();}if(e.key==='Escape'){e.preventDefault();e.stopPropagation();setYearDraft(String(year));}}} style={String(year).length>4?{fontSize:30,width:'6ch',letterSpacing:'-1px'}:undefined}/><span>{year<0?(locale==='fr'?'AV. J.-C.':locale==='ar'?'قبل الميلاد':'BCE'):t.ad}</span></div><small>{year<622?'—':`≈ ${Math.round((year-622)*33/32)}`} <span>{t.ah}</span></small></div>
      <div className="timeline-main"><div className="timeline-heading"><div><h2>{t.timeline}</h2><span>{t.timelineHint}</span></div><div className="playback-controls"><label>{t.step}<select aria-label={t.step} value={step} onChange={e=>setStep(Number(e.target.value))}><option value={1}>{t.oneYear}</option><option value={10}>{t.years10}</option><option value={100}>{t.years100}</option></select></label><button className="icon-button" onClick={()=>changeYear(year-step)} aria-label={`− ${step} ${t.years}`} disabled={year<=min}><ChevronLeft size={19}/></button><button className="play-button" disabled={min===max} onClick={()=>{if(year>=max)setYear(min);setPlaying(!playing);}} aria-label={playing?t.pause:t.play}>{playing?<Pause size={15} fill="currentColor"/>:<Play size={15} fill="currentColor"/>}</button><button className="icon-button" onClick={()=>changeYear(year+step)} aria-label={`+ ${step} ${t.years}`} disabled={year>=max}><ChevronRight size={19}/></button></div></div>
        <div className="timeline-track"><div className="period-track" aria-hidden="true">{dataset.periods.filter(p=>p.endYear>=min&&p.startYear<=max).map(p=><span key={p.id} style={{left:`${Math.max(0,(p.startYear-min)/span)*100}%`,width:`${min===max?100:(Math.min(max,p.endYear)-Math.max(min,p.startYear))/span*100}%`,background:p.color}}/>)}</div><input aria-label={t.timeline} type="range" min={min} max={max} step={1} disabled={min===max} value={year} onChange={e=>changeYear(Number(e.target.value))}/><div className="timeline-year-flag" style={{left:`${min===max?50:Math.max(0,Math.min(100,(year-min)/span*100))}%`}}>{year}</div></div>
        <div className="timeline-ticks">{timelineTicks.map(tick=><button key={tick} onClick={()=>changeYear(tick)}>{tick}</button>)}</div>
        <div className="timeline-periods">{dataset.periods.map(p=><button className={year>=p.startYear&&year<=p.endYear?'current':''} key={p.id} onClick={()=>choosePeriod(p.id)}><span style={{background:p.color}}/>{localized(p.name,locale)}</button>)}</div>
      </div>
      <button className="timeline-share icon-button" aria-label={t.share} onClick={share}><Share2 size={17}/></button>
    </footer>
    <div className="bottom-bar"><span><span className="small-brand">athar</span>{t.tagline}</span><button onClick={()=>setPanel('about')}><span className="gold-dot"/>{dataset.metadata.status==='demo'?t.demo:t.low}<Info size={12}/></button><span>v{dataset.metadata.version} <span className="bottom-dot">·</span> {dataset.sources.length} {t.sourceCount}</span></div>

    {panel==='about'&&<Dialog title={t.aboutTitle} onClose={closePanel}><div className="about-content"><div className="about-symbol"><Compass size={65} strokeWidth={0.8}/></div><p>{t.aboutBody}</p><h3>{t.methodTitle}</h3><p>{t.methodBody}</p><h3>{t.demoTitle}</h3><p>{t.demoNote}</p><a href="/islamic-history.json" target="_blank" rel="noreferrer" className="text-link"><ArrowDownToLine size={16}/>islamic-history.json<ArrowUpRight size={16}/></a><h3>{t.workingBibliography}</h3><ul>{dataset.sources.filter(source=>source.verification==='bibliography').map(source=><li key={source.id}><a href={source.permanentUrl??source.url} target="_blank" rel="noreferrer">{source.title}</a><small> · {t.sourceToVerify}</small></li>)}</ul><div className="about-attribution">Fond géographique : <a href="https://www.naturalearthdata.com/about/terms-of-use/" target="_blank" rel="noreferrer">Natural Earth · domaine public</a></div></div></Dialog>}
    {panel==='settings'&&<Dialog title={t.settings} onClose={closePanel}><div className="settings-content"><label><span className="theme-select-label">{t.appearance}</span><select aria-label={t.appearance} value={preference} onChange={e=>setPreference(e.target.value as ThemePreference)}><option value="system">{t.themeSystem}</option><option value="light">{t.themeLight}</option><option value="dark">{t.themeDark}</option></select></label><label>{t.modernBorders}<input type="checkbox" checked={borders} onChange={e=>setBorders(e.target.checked)}/></label><label><Globe2 size={16}/>Langue / Language / اللغة<select value={locale} onChange={e=>setLocale(e.target.value as Locale)}><option value="fr">Français</option><option value="en">English</option><option value="ar">العربية</option></select></label><button className="text-link" onClick={()=>{setFilters(initialFilters);setPeriodId('all');setYear(Math.max(extent.min,Math.min(extent.max,800)));setSelection(null);setPlaying(false);mapRef.current?.reset();closePanel();}}><RotateCcw size={16}/>{t.reset}</button>{user&&<div className="settings-user"><UserRound size={20}/><div>{user.name}<small>{user.email} · {user.role}</small></div><button className="icon-button" aria-label={t.logout} onClick={async()=>{await fetch('/api/auth/logout',{method:'POST'});setUser(null);closePanel();}}><LogOut size={18}/></button></div>}</div></Dialog>}
    {panel==='library'&&<Dialog title={t.libraryTitle} onClose={closePanel} wide><div className="library-content"><p>{t.libraryIntro}</p><div className="library-search"><Search size={17}/><input aria-label={t.search} placeholder={t.search} value={libraryQuery} onChange={e=>setLibraryQuery(e.target.value)}/></div><div className="library-tabs">{(['all','state','city','event','person','route'] as const).map(k=><button key={k} className={libraryKind===k?'active':''} onClick={()=>setLibraryKind(k)}>{k==='all'?t.all:k==='state'?t.states:k==='city'?t.cities:k==='event'?t.events:k==='person'?t.people:t.routes}</button>)}</div><div className="library-results">{libraryResults.length?libraryResults.map(r=>{const Icon=kindIcons[r.kind];return <button key={`${r.kind}-${r.id}`} onClick={()=>{closePanel();selectEntity(r,true);}}><span className="library-icon"><Icon size={21}/></span><span><strong>{r.label}</strong><small>{r.description}</small></span><span className="library-year">{r.year}</span><ArrowUpRight size={17}/></button>;}):<p className="empty-state">{t.noResult}</p>}</div></div></Dialog>}
    {panel==='login'&&<LoginDialog locale={locale} onClose={()=>{setEditAfterLogin(false);closePanel();}} onLogin={u=>{setUser(u);if(editAfterLogin){setPanel(null);setEditAfterLogin(false);if(u.role!=='visitor')setMapEditor(true);else setToast(stateEditCopy[locale].permission);}else setPanel(u.role==='visitor'?null:'studio');}}/>}
    {panel==='studio'&&user&&<Studio initialPanel={studioHistory?'history':'visual'} dataset={dataset} user={user} locale={locale} onClose={()=>{setStudioHistory(false);closePanel();}} onPublished={()=>void reload()}/>}
    {toast&&<div className="toast" role="status"><Check size={16}/>{toast}</div>}
  </main>{mapEditor&&accessibleEditor&&<StateMapEditor dataset={dataset} baseVersionId={baseVersionId} initialStateId={selection?.kind==='state'?selection.id:undefined} initialYear={year} locale={locale} onClose={()=>setMapEditor(false)} onReview={()=>{setMapEditor(false);setStudioHistory(true);setPanel('studio');}}/>}</>;
}
