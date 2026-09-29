'use client';

import {forwardRef, useEffect, useImperativeHandle, useRef, useState} from 'react';
import * as maplibregl from 'maplibre-gl';
import type {GeoJSONSource, Map as MapInstance} from 'maplibre-gl';
import type {FeatureCollection, Feature, Geometry} from 'geojson';
import {getActiveData, capitalsAt, cityNameAt, eventPosition, polityAt, localized, type Dataset, type EntityKind, type Locale} from '@history/core';
import {dictionaries} from '@/lib/i18n';
import {useTheme} from './ThemeProvider';
import {mapPalettes} from '@/lib/theme';
import MapGeometryEditing, {type MapEditing} from './MapGeometryEditing';

export type Filters = {states:boolean; dynasties:boolean; cities:boolean; events:boolean; battles:boolean; routes:boolean; people:boolean};
export type Selection = {kind:EntityKind; id:string};
export type MapHandle = {zoom:(direction:number)=>void; reset:()=>void; flyTo:(coordinates:[number,number])=>void};
type Props = {dataset:Dataset; year:number; locale:Locale; filters:Filters; borders:boolean; onSelect:(selection:Selection)=>void; editing?:MapEditing};
const empty:FeatureCollection = {type:'FeatureCollection',features:[]};
const isState = (type:string)=>['caliphate','state','empire'].includes(type);

const HistoricalMap = forwardRef<MapHandle,Props>(function HistoricalMap({dataset,year,locale,filters,borders,onSelect,editing},ref){
  const {theme}=useTheme();
  const container = useRef<HTMLDivElement>(null);
  const map = useRef<MapInstance|null>(null);
  const latest = useRef({dataset,year,locale,filters,onSelect,editing});
  latest.current={dataset,year,locale,filters,onSelect,editing};
  const [ready,setReady]=useState(false);
  const [failed,setFailed]=useState(false);
  const labels = useRef<maplibregl.Marker[]>([]);
  const cities = useRef<maplibregl.Marker[]>([]);

  useImperativeHandle(ref,()=>({
    zoom(direction){map.current?.zoomTo((map.current?.getZoom()??2.5)+direction,{duration:300});},
    reset(){map.current?.flyTo({center:[29,29],zoom:window.innerWidth>850?2.7:1.7,padding:{left:window.innerWidth>850?260:0,right:0,top:0,bottom:0},bearing:0,pitch:0,duration:800});},
    flyTo(coordinates){map.current?.flyTo({center:coordinates,zoom:4.5,duration:1000,padding:{left:window.innerWidth>850?290:0,right:0,top:0,bottom:0}});},
  }),[]);

  useEffect(()=>{
    if(!container.current)return;
    maplibregl.setWorkerUrl(`${window.location.origin}/vendor/maplibre/maplibre-gl-worker.mjs`);
    const palette=mapPalettes[document.documentElement.dataset.theme==='dark'?'dark':'light'];
    let instance:MapInstance;
    try{
      instance = new maplibregl.Map({container:container.current,center:[29,29],zoom:window.innerWidth>850?2.7:1.7,minZoom:1.3,maxZoom:9,attributionControl:false,
        style:{version:8,sources:{land:{type:'geojson',data:'/geography/land.geojson'},borders:{type:'geojson',data:'/geography/borders.geojson'}},layers:[
          {id:'water',type:'background',paint:{'background-color':palette.water}},
          {id:'land',type:'fill',source:'land',paint:{'fill-color':palette.land}},
          {id:'coast',type:'line',source:'land',paint:{'line-color':palette.coast,'line-width':0.8,'line-opacity':0.7}},
          {id:'modern-borders',type:'line',source:'borders',paint:{'line-color':palette.borders,'line-width':0.65,'line-opacity':0.8,'line-dasharray':[3,3]}},
        ]},renderWorldCopies:false,
      });
    }catch{setFailed(true);return;}
    map.current=instance;
    if(!latest.current.editing&&window.innerWidth>850)instance.setPadding({left:260,right:0,top:0,bottom:0});
    instance.on('error',()=>{if(!instance.isStyleLoaded())setFailed(true);});
    instance.on('load',()=>setFailed(false));
    instance.addControl(new maplibregl.AttributionControl({compact:true,customAttribution:'<a href="https://www.naturalearthdata.com/" target="_blank" rel="noreferrer">Natural Earth</a> · Athar'}),'bottom-right');
    instance.addControl(new maplibregl.ScaleControl({maxWidth:90,unit:'metric'}),'bottom-right');
    instance.on('load',()=>{
      instance.addSource('territories',{type:'geojson',data:empty});
      instance.addLayer({id:'territory-fill',type:'fill',source:'territories',paint:{'fill-color':['get','color'],'fill-opacity':0.25}});
      instance.addLayer({id:'territory-line',type:'line',source:'territories',filter:['==',['get','certainty'],'high'],paint:{'line-color':['get','color'],'line-width':1.6,'line-opacity':0.8}});
      instance.addLayer({id:'territory-uncertain',type:'line',source:'territories',filter:['!=',['get','certainty'],'high'],paint:{'line-color':['get','color'],'line-width':1.4,'line-dasharray':[4,3],'line-opacity':['case',['==',['get','certainty'],'medium'],0.65,0.45]}});
      instance.addSource('routes',{type:'geojson',data:empty});
      instance.addLayer({id:'route-lines',type:'line',source:'routes',paint:{'line-color':'#986c39','line-width':2,'line-dasharray':[2,3]}});
      instance.addSource('cities',{type:'geojson',data:empty,cluster:true,clusterRadius:23,clusterMinPoints:3,clusterMaxZoom:5});
      instance.addLayer({id:'city-clusters',type:'circle',source:'cities',filter:['has','point_count'],paint:{'circle-radius':['step',['get','point_count'],13,10,18,50,25],'circle-color':'#2b5a49','circle-stroke-width':3,'circle-stroke-color':'#f7f5ec','circle-opacity':0.9}});
      instance.addLayer({id:'city-points',type:'circle',source:'cities',filter:['!', ['has','point_count']],paint:{'circle-radius':5,'circle-color':'#39634e','circle-stroke-color':'#fffef6','circle-stroke-width':2}});
      instance.addSource('events',{type:'geojson',data:empty});
      instance.addLayer({id:'event-points',type:'circle',source:'events',paint:{'circle-radius':7,'circle-color':'#b77945','circle-stroke-color':'#fffef6','circle-stroke-width':2}});
      instance.addSource('people',{type:'geojson',data:empty});
      instance.addLayer({id:'person-points',type:'circle',source:'people',paint:{'circle-radius':7,'circle-color':'#77669c','circle-stroke-color':'#fffef6','circle-stroke-width':2}});
      const geometry=latest.current.editing?.initialGeometry;
      if(geometry){const points=geometry.type==='Polygon'?geometry.coordinates.flat():geometry.coordinates.flat(2);const bounds=new maplibregl.LngLatBounds();points.forEach(p=>bounds.extend(p));instance.fitBounds(bounds,{padding:60,maxZoom:5,duration:0});}
      setReady(true);
    });
    instance.on('click',async e=>{
      if(latest.current.editing)return;
      const layers=['person-points','event-points','city-clusters','city-points','route-lines','territory-fill'].filter(id=>instance.getLayer(id));
      if(!layers.length)return;
      const features=instance.queryRenderedFeatures(e.point,{layers});
      const f=features[0];if(!f)return;
      if(f.properties.cluster_id!==undefined){
        try{const zoom=await (instance.getSource('cities') as GeoJSONSource).getClusterExpansionZoom(f.properties.cluster_id);
        if(map.current===instance&&f.geometry.type==='Point')instance.easeTo({center:f.geometry.coordinates as [number,number],zoom});}catch{/* Source changed during a year or dataset update. */}
      }else if(f.properties.entityId)latest.current.onSelect({kind:f.properties.kind,id:f.properties.entityId});
    });
    instance.on('mousemove',e=>{
      if(latest.current.editing){instance.getCanvas().style.cursor=latest.current.editing.drawing?'crosshair':'';return;}
      const layers=['person-points','event-points','city-clusters','city-points','route-lines','territory-fill'].filter(id=>instance.getLayer(id));
      instance.getCanvas().style.cursor=layers.length&&instance.queryRenderedFeatures(e.point,{layers}).length?'pointer':'';
    });
    const resize = new ResizeObserver(()=>instance.resize());resize.observe(container.current);
    return()=>{resize.disconnect();labels.current.forEach(m=>m.remove());cities.current.forEach(m=>m.remove());instance.remove();map.current=null;};
  },[]);

  useEffect(()=>{
    const instance=map.current;if(!ready||!instance)return;
    const palette=mapPalettes[theme];
    instance.setPaintProperty('water','background-color',palette.water);
    instance.setPaintProperty('land','fill-color',palette.land);
    instance.setPaintProperty('coast','line-color',palette.coast);
    instance.setPaintProperty('modern-borders','line-color',palette.borders);
    instance.setPaintProperty('territory-fill','fill-opacity',theme==='dark'?0.42:0.25);
    instance.setPaintProperty('territory-uncertain','line-opacity',theme==='dark'?0.9:['case',['==',['get','certainty'],'medium'],0.65,0.45]);
    instance.setPaintProperty('route-lines','line-color',palette.route);
    for(const [id,color] of [['city-clusters',palette.cluster],['city-points',palette.point],['event-points',palette.event],['person-points',palette.person]]){
      instance.setPaintProperty(id,'circle-color',color);
      instance.setPaintProperty(id,'circle-stroke-color',palette.stroke);
    }
  },[theme,ready]);

  useEffect(()=>{
    const instance=map.current;if(!ready||!instance)return;
    instance.setLayoutProperty('modern-borders','visibility',borders?'visible':'none');
  },[ready,borders]);

  useEffect(()=>{
    const instance=map.current;if(!ready||!instance)return;
    cities.current.forEach(m=>m.remove());cities.current=[];
    const active=getActiveData(dataset,year);
    const visibleStates=active.states.filter(s=>isState(polityAt(s,year))?filters.states:filters.dynasties);
    const features:Feature[]=[];
    visibleStates.filter(s=>s.id!==editing?.stateId).forEach(s=>s.territories.features.forEach((t,i)=>features.push({type:'Feature',id:`${s.id}-${i}`,geometry:t.geometry as Geometry,properties:{entityId:s.id,kind:'state',color:s.color,certainty:t.properties.certainty,control:t.properties.control}})));
    (instance.getSource('territories') as GeoJSONSource).setData({type:'FeatureCollection',features});
    (instance.getSource('cities') as GeoJSONSource).setData({type:'FeatureCollection',features:filters.cities?active.cities.map(c=>({type:'Feature',geometry:{type:'Point',coordinates:[c.longitude,c.latitude]},properties:{entityId:c.id,kind:'city',name:localized(cityNameAt(c,year),locale),capital:active.states.some(s=>capitalsAt(s,year).some(capital=>capital.city===c.id))}})):[]});
    (instance.getSource('events') as GeoJSONSource).setData({type:'FeatureCollection',features:active.events.filter(e=>e.type==='battle'?filters.battles:filters.events).map(e=>({type:'Feature',geometry:{type:'Point',coordinates:eventPosition(dataset,e)},properties:{entityId:e.id,kind:'event',locationType:e.location.type}}))});
    (instance.getSource('routes') as GeoJSONSource).setData({type:'FeatureCollection',features:filters.routes?active.routes.map(r=>({type:'Feature',geometry:r.geometry,properties:{entityId:r.id,kind:'route'}})):[]});
    (instance.getSource('people') as GeoJSONSource).setData({type:'FeatureCollection',features:filters.people?active.people.flatMap(p=>{const c=dataset.cities.find(c=>c.id===p.birthPlace);return c?[{type:'Feature' as const,geometry:{type:'Point' as const,coordinates:[c.longitude,c.latitude]},properties:{entityId:p.id,kind:'person'}}]:[]}):[]});
    labels.current.forEach(m=>m.remove());labels.current=[];
    if(!editing)visibleStates.forEach(s=>{
      const t=s.territories.features[0];if(!t)return;
      const ring=t.geometry.type==='Polygon'?t.geometry.coordinates[0]:t.geometry.coordinates[0][0];
      const lng=ring.reduce((sum,p)=>sum+p[0],0)/ring.length;const lat=ring.reduce((sum,p)=>sum+p[1],0)/ring.length;
      const el=document.createElement('button');el.className='territory-label';el.style.setProperty('--territory-color',s.color);el.textContent=localized(s.name,locale);el.onclick=()=>latest.current.onSelect({kind:'state',id:s.id});
      labels.current.push(new maplibregl.Marker({element:el,anchor:'center'}).setLngLat([lng,lat]).addTo(instance));
    });
    const updateCityLabels=()=>{
      cities.current.forEach(m=>m.remove());cities.current=[];
      if(editing||!filters.cities||!instance.isSourceLoaded('cities'))return;
      const seen=new Set<string>();
      instance.querySourceFeatures('cities').slice(0,100).forEach(f=>{
        if(f.properties.cluster&&f.geometry.type==='Point'){
          const clusterId=`cluster-${f.properties.cluster_id}`;if(seen.has(clusterId))return;seen.add(clusterId);
          const cluster=document.createElement('button');cluster.className='cluster-label';cluster.textContent=String(f.properties.point_count);cluster.setAttribute('aria-label',`${f.properties.point_count} ${dictionaries[locale].city}`);
          const coordinates=f.geometry.coordinates as [number,number];
          cluster.onclick=async()=>{try{const zoom=await(instance.getSource('cities') as GeoJSONSource).getClusterExpansionZoom(f.properties.cluster_id);if(map.current===instance)instance.easeTo({center:coordinates,zoom});}catch{}};
          cities.current.push(new maplibregl.Marker({element:cluster}).setLngLat(coordinates).addTo(instance));return;
        }
        const id=f.properties.entityId;if(seen.has(id)||f.geometry.type!=='Point')return;seen.add(id);
        const el=document.createElement('button');el.className=`city-label ${f.properties.capital?'capital':''}`;
        const dot=document.createElement('span');dot.className='city-dot';const label=document.createElement('span');label.textContent=f.properties.name;el.append(dot,label);
        el.onclick=()=>latest.current.onSelect({kind:'city',id});
        cities.current.push(new maplibregl.Marker({element:el,anchor:'left',offset:[-5,0]}).setLngLat(f.geometry.coordinates as [number,number]).addTo(instance));
      });
    };
    instance.on('idle',updateCityLabels);
    return()=>{instance.off('idle',updateCityLabels);};
  },[dataset,year,locale,filters,ready,editing?.stateId]);

  return <><div className="map-canvas" ref={container} aria-label={`${dictionaries[locale].atYear} ${year}`} />{ready&&map.current&&editing&&<MapGeometryEditing map={map.current} edit={editing} locale={locale}/>} {failed&&<div className="map-error" role="status">{dictionaries[locale].mapUnavailable}</div>}</>;
});
export default HistoricalMap;
