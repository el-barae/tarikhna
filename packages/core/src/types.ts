export type Locale = 'fr' | 'en' | 'ar';
export type LocalizedText = string | Record<Locale, string>;
export type Certainty = 'high' | 'medium' | 'low' | 'symbolic';
export type DatePrecision = 'exact' | 'circa' | 'unknown';
export type ControlType = 'direct' | 'influence' | 'nominal';
export type Position = [number, number];
export type PointGeometry = { type: 'Point'; coordinates: Position };
export type LineStringGeometry = { type: 'LineString'; coordinates: Position[] };
export type PolygonGeometry = { type: 'Polygon'; coordinates: Position[][] };
export type MultiPolygonGeometry = { type: 'MultiPolygon'; coordinates: Position[][][] };
export type Geometry = PointGeometry | LineStringGeometry | PolygonGeometry | MultiPolygonGeometry;
export type AreaGeometry = PolygonGeometry | MultiPolygonGeometry;
export interface Citation { id: string; locator?: string }
export type SourceReference = string | Citation;
export interface DateDetails { startPrecision?: DatePrecision; endPrecision?: DatePrecision; startHijri?: number; endHijri?: number }
export interface Metadata {
  schemaVersion: 2;
  title: string;
  version: string;
  lastUpdated: string;
  language: Locale;
  status: 'demo' | 'reviewed';
  description?: LocalizedText;
  license?: string;
  figurePolicy?: { foundingFigures: 'no-images'; honorifics: 'optional' | 'always' };
}
export interface Period extends DateDetails { id: string; name: LocalizedText; startYear: number; endYear: number; description: LocalizedText; color: string }
export interface Capital { city: string; from: number; to: number; precision: DatePrecision; role: 'capital' | 'residence'; sources: SourceReference[] }
export type PolityType = 'caliphate' | 'emirate' | 'sultanate' | 'empire' | 'state' | 'confederation';
export interface PolityPeriod { polityType: PolityType; from: number; to: number }
export interface TerritoryProperties extends DateDetails {
  stateId: string; startYear: number; endYear: number; certainty: Certainty; control: ControlType;
  sources: SourceReference[]; suzerainId?: string; landClipped?: boolean;
}
export interface Territory { type: 'Feature'; id: string; geometry: AreaGeometry; properties: TerritoryProperties }
export interface TerritoryCollection { type: 'FeatureCollection'; features: Territory[] }
export interface StateDetails { from: number; to: number; name: LocalizedText; description: LocalizedText; color: string; dynasty: string | null }
export interface HistoricalState extends DateDetails {
  details?: StateDetails[];
  id: string; name: LocalizedText; polityType: PolityType; dynasty: string | null;
  polityPeriods?: PolityPeriod[]; startYear: number; endYear: number; capitals: Capital[];
  color: string; territories: TerritoryCollection; description: LocalizedText; sources: SourceReference[];
}
export type CityImportance = 'capital' | 'political' | 'scientific' | 'religious' | 'commercial' | 'military' | 'cultural';
export interface DatedName { name: LocalizedText; from: number; to: number | null; precision: DatePrecision }
export interface HistoricalCity {
  id: string; name: LocalizedText; names: DatedName[]; aliases: string[];
  latitude: number; longitude: number; activeFrom: number; activeUntil: number | null;
  foundedYear: number | null; foundedPrecision: DatePrecision; importance: CityImportance;
  description: LocalizedText; sources: SourceReference[];
}
export type EventType = 'battle' | 'city-foundation' | 'political-change' | 'dynasty-change' | 'treaty' | 'migration' | 'scientific' | 'religious' | 'economic' | 'cultural' | 'birth' | 'death' | 'conquest' | 'revolt';
export type EventLocation = { type: 'actual' | 'approximate' | 'symbolic' } & ({ cityId: string; coordinates?: never } | { coordinates: Position; cityId?: never });
export interface HistoricalEvent extends DateDetails {
  id: string; title: LocalizedText; startYear: number; endYear: number; location: EventLocation;
  type: EventType; description: LocalizedText; relatedStates: string[]; relatedPeople: string[]; sources: SourceReference[];
}
export interface HistoricalPerson {
  id: string; name: LocalizedText; birthYear: number; deathYear: number | null;
  birthPrecision: DatePrecision; deathPrecision: DatePrecision; birthPlace: string; deathPlace: string | null; birthPlaceType?: 'actual' | 'approximate' | 'symbolic';
  roles: string[]; description: LocalizedText; relatedStates: string[]; sources: SourceReference[];
  foundingFigure?: boolean; honorific?: LocalizedText;
}
export interface HistoricalRoute extends DateDetails {
  id: string; name: LocalizedText; startYear: number; endYear: number; geometry: LineStringGeometry;
  cityIds: string[]; description: LocalizedText; sources: SourceReference[]; certainty: Certainty;
}
export interface HistoricalSource {
  id: string; title: string; author: string; publicationYear: number | null;
  type: 'primary' | 'academic' | 'encyclopedia' | 'book' | 'article' | 'archive' | 'other';
  url: string; permanentUrl: string | null; accessedDate: string | null; license: string;
  verification: 'consulted' | 'bibliography' | 'unverified'; notes: LocalizedText;
}
export interface Dataset {
  metadata: Metadata; periods: Period[]; states: HistoricalState[]; cities: HistoricalCity[];
  events: HistoricalEvent[]; people: HistoricalPerson[]; routes: HistoricalRoute[]; sources: HistoricalSource[];
}
export interface ValidationError { path: string; message: string }
export interface ValidationResult { valid: boolean; errors: ValidationError[]; data?: Dataset; warnings?: ValidationError[] }
export type EntityKind = 'state' | 'city' | 'event' | 'person' | 'route';
export interface SearchResult { kind: EntityKind; id: string; label: string; year: number; description: string }
export interface GeoJSONFeature { type: 'Feature'; id: string; geometry: Geometry; properties: Record<string, unknown> }
export interface DatasetGeoJSON { type: 'FeatureCollection'; features: GeoJSONFeature[]; dataset: Dataset }
export interface ChangeCounts { added: number; removed: number; modified: number; unchanged: number }
export type CollectionName = 'periods' | 'states' | 'cities' | 'events' | 'people' | 'routes' | 'sources';
export interface ChangeSummary extends ChangeCounts { byCollection: Record<CollectionName, ChangeCounts>; metadataChanged: boolean }
