export type Locale = 'fr' | 'en' | 'ar';
export type LocalizedText = string | Record<Locale, string>;
export type Certainty = 'high' | 'medium' | 'low' | 'unknown';
export type Position = [number, number];
export type PointGeometry = { type: 'Point'; coordinates: Position };
export type LineStringGeometry = { type: 'LineString'; coordinates: Position[] };
export type PolygonGeometry = { type: 'Polygon'; coordinates: Position[][] };
export type MultiPolygonGeometry = { type: 'MultiPolygon'; coordinates: Position[][][] };
export type Geometry = PointGeometry | LineStringGeometry | PolygonGeometry | MultiPolygonGeometry;
export type AreaGeometry = PolygonGeometry | MultiPolygonGeometry;

export interface Metadata {
  title: string;
  version: string;
  lastUpdated: string;
  language: Locale;
  demo: boolean;
  description?: LocalizedText;
  license?: string;
}
export interface Period {
  id: string;
  name: LocalizedText;
  startYear: number;
  endYear: number;
  description: LocalizedText;
  color: string;
}
export interface Territory {
  startYear: number;
  endYear: number;
  geometry: AreaGeometry;
  certainty: Certainty;
}
export interface HistoricalState {
  id: string;
  name: LocalizedText;
  type: 'caliphate' | 'dynasty' | 'emirate' | 'sultanate' | 'empire' | 'state';
  startYear: number;
  endYear: number;
  capital: string;
  color: string;
  territories: Territory[];
  description: LocalizedText;
  sources: string[];
}
export type CityImportance = 'capital' | 'political' | 'scientific' | 'religious' | 'commercial' | 'military' | 'cultural';
export interface HistoricalCity {
  id: string;
  name: LocalizedText;
  historicalNames: string[];
  latitude: number;
  longitude: number;
  activeFrom: number;
  activeUntil: number | null;
  importance: CityImportance;
  description: LocalizedText;
  events: string[];
  sources: string[];
}
export type EventType = 'battle' | 'city-foundation' | 'political-change' | 'dynasty-change' | 'treaty' | 'migration' | 'scientific' | 'religious' | 'economic' | 'cultural' | 'birth' | 'death' | 'conquest' | 'revolt';
export interface HistoricalEvent {
  id: string;
  title: LocalizedText;
  startYear: number;
  endYear: number;
  location: { latitude: number; longitude: number };
  type: EventType;
  description: LocalizedText;
  relatedStates: string[];
  relatedPeople: string[];
  sources: string[];
}
export interface HistoricalPerson {
  id: string;
  name: LocalizedText;
  birthYear: number;
  deathYear: number | null;
  birthPlace: string;
  roles: string[];
  description: LocalizedText;
  events: string[];
  relatedStates: string[];
  sources: string[];
}
export interface HistoricalRoute {
  id: string;
  name: LocalizedText;
  startYear: number;
  endYear: number;
  geometry: LineStringGeometry;
  description: LocalizedText;
  sources: string[];
  certainty: Certainty;
}
export interface HistoricalSource {
  id: string;
  title: string;
  author: string;
  publicationYear: number | null;
  type: 'primary' | 'academic' | 'encyclopedia' | 'book' | 'article' | 'archive' | 'other';
  url: string;
  notes: LocalizedText;
}
export interface Dataset {
  metadata: Metadata;
  periods: Period[];
  states: HistoricalState[];
  cities: HistoricalCity[];
  events: HistoricalEvent[];
  people: HistoricalPerson[];
  routes: HistoricalRoute[];
  sources: HistoricalSource[];
}
export interface ValidationError { path: string; message: string }
export interface ValidationResult { valid: boolean; errors: ValidationError[]; data?: Dataset }
export type EntityKind = 'state' | 'city' | 'event' | 'person' | 'route';
export interface SearchResult { kind: EntityKind; id: string; label: string; year: number; description: string }
export interface GeoJSONFeature { type: 'Feature'; id: string; geometry: Geometry; properties: Record<string, unknown> }
export interface DatasetGeoJSON { type: 'FeatureCollection'; features: GeoJSONFeature[]; dataset: Dataset }
export interface ChangeCounts { added: number; removed: number; modified: number; unchanged: number }
export type CollectionName = 'periods' | 'states' | 'cities' | 'events' | 'people' | 'routes' | 'sources';
export interface ChangeSummary extends ChangeCounts { byCollection: Record<CollectionName, ChangeCounts>; metadataChanged: boolean }
