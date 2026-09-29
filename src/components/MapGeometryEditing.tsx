'use client';
import {useEffect, useRef} from 'react';
import {Marker, type GeoJSONSource, type Map as MapInstance, type MapMouseEvent} from 'maplibre-gl';
import type {FeatureCollection, Feature} from 'geojson';
import type {AreaGeometry, Locale, Position} from '@history/core';

export interface MapEditing {
  stateId:string;
  geometry:AreaGeometry|null;
  initialGeometry?:AreaGeometry;
  drawing:boolean;
  points:Position[];
  onPoint:(point:Position)=>void;
  onFinish:()=>void;
  onGeometry:(geometry:AreaGeometry)=>void;
}
const round=(n:number)=>Math.round(n*100000)/100000;
const coordinate=(point:{lng:number;lat:number}):Position=>[round(Math.max(-180,Math.min(180,point.lng))),round(Math.max(-85,Math.min(85,point.lat)))];

/** All geometry is stored in geographic coordinates, independent of map zoom. */
export default function MapGeometryEditing({map,edit,locale}:{map:MapInstance;edit:MapEditing;locale:Locale}) {
  const latest=useRef(edit);latest.current=edit;
  const restoreFocus=useRef<string|null>(null);
  const vertex=locale==='fr'?'Sommet':locale==='ar'?'رأس':'Vertex';
  const insert=locale==='fr'?'Ajouter un sommet':locale==='ar'?'إضافة رأس':'Add vertex';
  useEffect(()=>{
    map.addSource('edit-geometry',{type:'geojson',data:{type:'FeatureCollection',features:[]}});
    map.addLayer({id:'edit-fill',type:'fill',source:'edit-geometry',filter:['==',['geometry-type'],'Polygon'],paint:{'fill-color':'#d99c31','fill-opacity':0.22}});
    map.addLayer({id:'edit-line',type:'line',source:'edit-geometry',paint:{'line-color':'#efa72b','line-width':3}});
    const add=(event:MapMouseEvent)=>{if(latest.current.drawing)latest.current.onPoint(coordinate(event.lngLat));};
    map.on('click',add);const doubleClick=map.doubleClickZoom.isEnabled();map.doubleClickZoom.disable();
    return()=>{map.off('click',add);if(doubleClick)map.doubleClickZoom.enable();for(const id of ['edit-line','edit-fill'])if(map.getLayer(id))map.removeLayer(id);if(map.getSource('edit-geometry'))map.removeSource('edit-geometry');};
  },[map]);
  useEffect(()=>{
    const features:Feature[]=[];
    if(edit.geometry)features.push({type:'Feature',geometry:edit.geometry,properties:{}});
    if(edit.points.length>=2)features.push({type:'Feature',properties:{},geometry:edit.points.length>=3?{type:'Polygon',coordinates:[[...edit.points,edit.points[0]]]}:{type:'LineString',coordinates:edit.points}});
    (map.getSource('edit-geometry') as GeoJSONSource)?.setData({type:'FeatureCollection',features} as FeatureCollection);
    map.getCanvas().style.cursor=edit.drawing?'crosshair':'';
    const markers:Marker[]=[];
    const button=(label:string,point:Position,className:string,click:()=>void)=>{
      const el=document.createElement('button');el.type='button';el.className=className;el.setAttribute('aria-label',label);el.title=label;
      el.addEventListener('click',event=>{event.stopPropagation();click();});
      const marker=new Marker({element:el}).setLngLat(point).addTo(map);markers.push(marker);return {el,marker};
    };
    if(edit.drawing)edit.points.forEach((p,index)=>button(`${vertex} ${index+1}`,p,'draw-vertex draw-pending',()=>{if(index===0&&edit.points.length>=3)latest.current.onFinish();}));
    else if(edit.geometry){
      const polygons=edit.geometry.type==='Polygon'?[edit.geometry.coordinates]:edit.geometry.coordinates;
      const change=(polygon:number,ring:number,index:number,point:Position|null,add=false)=>{
        const geometry=structuredClone(latest.current.geometry);if(!geometry)return;
        const rings=geometry.type==='Polygon'?[geometry.coordinates]:geometry.coordinates;
        const coordinates=rings[polygon][ring].slice(0,-1);
        if(add&&point)coordinates.splice(index+1,0,point);
        else if(point)coordinates[index]=point;
        else {if(coordinates.length<=3)return;coordinates.splice(index,1);}
        rings[polygon][ring]=[...coordinates,[...coordinates[0]]];latest.current.onGeometry(geometry);
      };
      polygons.forEach((rings,p)=>rings.forEach((ring,r)=>ring.slice(0,-1).forEach((position,index)=>{
        const {el,marker}=button(`${vertex} ${p+1}.${r+1}.${index+1}`,position,'draw-vertex',()=>{});
        marker.setDraggable(true);marker.on('dragend',()=>change(p,r,index,coordinate(marker.getLngLat())));
        el.addEventListener('keydown',event=>{
          if(['Delete','Backspace'].includes(event.key)){restoreFocus.current=el.getAttribute('aria-label');event.preventDefault();event.stopPropagation();change(p,r,index,null);}
          const offset=event.shiftKey?1:0.1;
          const directions:Record<string,Position>={ArrowLeft:[-offset,0],ArrowRight:[offset,0],ArrowUp:[0,offset],ArrowDown:[0,-offset]};
          const delta=directions[event.key];if(delta){restoreFocus.current=el.getAttribute('aria-label');event.preventDefault();event.stopPropagation();change(p,r,index,coordinate({lng:position[0]+delta[0],lat:position[1]+delta[1]}));}
        });
        const after=ring[index+1],midpoint:Position=[(position[0]+after[0])/2,(position[1]+after[1])/2];
        button(`${insert} ${p+1}.${r+1}.${index+1}`,midpoint,'draw-midpoint',()=>change(p,r,index,midpoint,true));
      })));
    }
    if(restoreFocus.current){markers.find(marker=>marker.getElement().getAttribute('aria-label')===restoreFocus.current)?.getElement().focus();restoreFocus.current=null;}
    return()=>markers.forEach(marker=>marker.remove());
  },[map,edit,vertex,insert]);
  return null;
}
