import intersect from '@turf/intersect';
import rewind from '@turf/rewind';
import type { Feature, FeatureCollection, MultiPolygon, Polygon } from 'geojson';
import type { Dataset, AreaGeometry } from '../packages/core/src/types';

/** Clip symbolic sketches to modern land. This does not validate historical sovereignty. */
export function clipTerritories(dataset:Dataset,land:FeatureCollection<Polygon|MultiPolygon>):Dataset {
 const result=structuredClone(dataset);
 const landFeature:Feature<MultiPolygon>={type:'Feature',properties:{},geometry:{type:'MultiPolygon',coordinates:land.features.flatMap(f=>f.geometry.type==='Polygon'?[f.geometry.coordinates]:f.geometry.coordinates)}};
 for(const state of result.states)for(const feature of state.territories.features){
  const clipped=intersect({type:'FeatureCollection',features:[feature,landFeature]});
  if(!clipped)throw new Error(`No land intersects ${feature.id}`);
  const normalized=rewind(clipped,{reverse:false}) as Feature<Polygon|MultiPolygon>;
  feature.geometry=normalized.geometry as AreaGeometry;
  feature.properties.landClipped=true;
 }
 return result;
}
