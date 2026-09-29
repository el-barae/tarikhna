import type {AreaGeometry, Certainty, ControlType, Dataset, HistoricalState, StateDetails, Territory} from './types';
import {activeAt, polityAt, stateAt} from './dataset';

export interface StateYearEdit extends Omit<StateDetails, 'from' | 'to'> {
  polityType: HistoricalState['polityType'];
  geometry: AreaGeometry;
  certainty: Certainty;
  control: ControlType;
}

/** Remove only one inclusive year, retaining the data on both sides. */
function withoutYear<T extends {from:number;to:number}>(rows:T[],year:number):T[] {
  return rows.flatMap(row => !activeAt(row.from,row.to,year) ? [row] : [
    ...(row.from < year ? [{...row,to:year-1}] : []),
    ...(year < row.to ? [{...row,from:year+1}] : []),
  ]);
}

/** Immutable edit of one state for one year. Never extends the state's lifespan. */
export function editStateYear(dataset:Dataset,stateId:string,year:number,edit:StateYearEdit):Dataset {
  const original=dataset.states.find(state=>state.id===stateId);
  if(!original||!activeAt(original.startYear,original.endYear,year))throw new RangeError('Choose a year within the state’s dates.');
  const next=structuredClone(dataset),state=next.states.find(state=>state.id===stateId)!;
  const current=stateAt(original,year);
  const {geometry,certainty,control,polityType,...details}=structuredClone(edit);
  if(JSON.stringify(details)!==JSON.stringify({name:current.name,description:current.description,color:current.color,dynasty:current.dynasty})) {
    state.details=[...withoutYear(state.details??[],year),{...details,from:year,to:year}].sort((a,b)=>a.from-b.from);
  }
  if(polityType!==polityAt(original,year))state.polityPeriods=[...withoutYear(state.polityPeriods??[],year),{from:year,to:year,polityType}].sort((a,b)=>a.from-b.from);
  const old=original.territories.features.find(feature=>activeAt(feature.properties.startYear,feature.properties.endYear,year));
  const geometryChanged=!old||JSON.stringify(old.geometry)!==JSON.stringify(geometry);
  if(geometryChanged||old.properties.certainty!==certainty||old.properties.control!==control){
    const ids=new Set(next.states.flatMap(s=>[s.id,...s.territories.features.map(f=>f.id)]));
    for(const rows of [next.periods,next.cities,next.events,next.people,next.routes,next.sources])for(const row of rows)ids.add(row.id);
    const unique=(label:string)=>{let id=label,index=1;while(ids.has(id))id=`${label}-${index++}`;ids.add(id);return id;};
    const features:Territory[]=state.territories.features.flatMap(feature=>{
      const p=feature.properties;
      if(!activeAt(p.startYear,p.endYear,year))return [feature];
      return [
        ...(p.startYear<year?[{...feature,properties:{...p,endYear:year-1}}]:[]),
        ...(year<p.endYear?[{...feature,id:p.startYear<year?unique(`${feature.id}-after-${year}`):feature.id,properties:{...p,startYear:year+1}}]:[]),
      ];
    });
    features.push({type:'Feature',id:unique(`${stateId}-${year}`),geometry,properties:{
      ...(old?.properties??{stateId,sources:structuredClone(state.sources)}),startYear:year,endYear:year,certainty,control,
      ...(geometryChanged?{landClipped:false}:{}),
    }});
    state.territories.features=features.sort((a,b)=>a.properties.startYear-b.properties.startYear);
  }
  return next;
}
