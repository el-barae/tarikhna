import type { ChangeCounts, ChangeSummary, CollectionName, Dataset, DatasetGeoJSON, EntityKind, GeoJSONFeature, Locale, LocalizedText, SearchResult, HistoricalCity, HistoricalState, HistoricalEvent, SourceReference } from './types';

export function localized(value: LocalizedText | undefined | null, locale: Locale = 'fr'): string {
  if (!value) return '';
  return typeof value === 'string' ? value : value[locale] || value.fr || value.en || value.ar || '';
}

/** Historical intervals are inclusive; null means no known end. */
export function activeAt(start: number, end: number | null, year: number): boolean {
  return Number.isInteger(year) && start <= year && (end === null || year <= end);
}

export function getActiveData(dataset: Dataset, year: number): Dataset {
  return {
    ...dataset,
    periods: dataset.periods.filter(item => activeAt(item.startYear, item.endYear, year)),
    states: dataset.states.filter(item => activeAt(item.startYear, item.endYear, year)).map(item => ({ ...stateAt(item,year), territories: { type: 'FeatureCollection', features: item.territories.features.filter(territory => activeAt(territory.properties.startYear, territory.properties.endYear, year)) } })),
    cities: dataset.cities.filter(item => activeAt(item.activeFrom, item.activeUntil, year)),
    events: dataset.events.filter(item => activeAt(item.startYear, item.endYear, year)),
    people: dataset.people.filter(item => activeAt(item.birthYear, item.deathYear, year)),
    routes: dataset.routes.filter(item => activeAt(item.startYear, item.endYear, year)),
  };
}

function normalized(value: string): string {
  return value.toLocaleLowerCase().normalize('NFD').replace(/[\u0300-\u036f\u064B-\u065F\u0670]/g, '').replace(/[أإآ]/g, 'ا').trim();
}

export function searchDataset(dataset: Dataset, query: string, locale: Locale = 'fr', selectedYear?: number): SearchResult[] {
  const needle = normalized(query);
  if (!needle) return [];
  const results: Array<SearchResult & { score: number }> = [];
  const add = (kind: EntityKind, id: string, name: LocalizedText, description: LocalizedText, year: number, end: number | null, aliases: string[] = []) => {
    const label = localized(name, locale);
    const labels = typeof name === 'string' ? name : Object.values(name).join(' ');
    const body = typeof description === 'string' ? description : Object.values(description).join(' ');
    const numeric = /^-?\d{1,5}$/.test(needle) ? Number(needle) : null;
    const haystack = normalized([id, labels, body, ...aliases].join(' '));
    const tokens = needle.split(/\s+/);
    if ((numeric !== null && activeAt(year, end, numeric)) || tokens.every(token => haystack.includes(token))) {
      const nameNormalized = normalized(label);
      const score = nameNormalized === needle ? 0 : nameNormalized.startsWith(needle) ? 1 : nameNormalized.includes(needle) ? 2 : 3;
      results.push({ kind, id, label, year, description: localized(description, locale), score });
    }
  };
  dataset.states.forEach(item => {const resolved=selectedYear===undefined?item:stateAt(item,selectedYear);add('state', item.id, resolved.name, resolved.description, item.startYear, item.endYear, item.capitals.map(capital => capital.city));});
  dataset.cities.forEach(item => add('city', item.id, selectedYear === undefined ? item.name : cityNameAt(item,selectedYear), item.description, item.activeFrom, item.activeUntil,  [...item.aliases, ...item.names.flatMap(n => typeof n.name === 'string' ? [n.name] : Object.values(n.name))]));
  dataset.events.forEach(item => add('event', item.id, item.title, item.description, item.startYear, item.endYear, [...item.relatedStates, ...item.relatedPeople]));
  dataset.people.forEach(item => add('person', item.id, item.name, item.description, item.birthYear, item.deathYear, [item.birthPlace]));
  dataset.routes.forEach(item => add('route', item.id, item.name, item.description, item.startYear, item.endYear));
  return results.sort((a, b) => a.score - b.score || a.year - b.year).map(({ score: _score, ...result }) => result);
}

/** The foreign `dataset` member preserves relations, sources and all time slices. */
export function datasetToGeoJSON(dataset: Dataset, year?: number): DatasetGeoJSON {
  if (year !== undefined && (!Number.isInteger(year) || year < -10000 || year > 10000)) throw new RangeError('Year must be an integer between -10000 and 10000.');
  const active = year === undefined ? dataset : getActiveData(dataset, year);
  const features: GeoJSONFeature[] = [];
  active.states.forEach(state => state.territories.features.forEach(territory => features.push({ ...territory, properties: { ...territory.properties, kind: 'state', id: state.id, name: state.name, color: state.color, polityType: year === undefined ? state.polityType : polityAt(state,year) } })));
  active.cities.forEach(city => features.push({ type: 'Feature', id: city.id, geometry: { type: 'Point', coordinates: [city.longitude, city.latitude] }, properties: { ...city, name: year === undefined ? city.name : cityNameAt(city,year), kind: 'city' } }));
  active.events.forEach(event => features.push({ type: 'Feature', id: event.id, geometry: { type: 'Point', coordinates: eventPosition(dataset,event) }, properties: { ...event, kind: 'event' } }));
  active.routes.forEach(route => features.push({ type: 'Feature', id: route.id, geometry: route.geometry, properties: { ...route, kind: 'route' } }));
  active.people.forEach(person => {
    const city = dataset.cities.find(item => item.id === person.birthPlace);
    if (city) features.push({ type: 'Feature', id: person.id, geometry: { type: 'Point', coordinates: [city.longitude, city.latitude] }, properties: { ...person, kind: 'person', locationMeaning: 'birthplace' } });
  });
  return { type: 'FeatureCollection', features, dataset };
}

function stableStringify(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
  if (value && typeof value === 'object') return `{${Object.entries(value).sort(([a], [b]) => a.localeCompare(b)).map(([key, item]) => `${JSON.stringify(key)}:${stableStringify(item)}`).join(',')}}`;
  return JSON.stringify(value) ?? 'undefined';
}

export function summarizeChanges(before: Dataset, after: Dataset): ChangeSummary {
  const collections: CollectionName[] = ['periods', 'states', 'cities', 'events', 'people', 'routes', 'sources'];
  const byCollection = {} as Record<CollectionName, ChangeCounts>;
  const total: ChangeCounts = { added: 0, removed: 0, modified: 0, unchanged: 0 };
  for (const collection of collections) {
    const previous = new Map(before[collection].map(item => [item.id, stableStringify(item)]));
    const next = new Map(after[collection].map(item => [item.id, stableStringify(item)]));
    const counts: ChangeCounts = { added: 0, removed: 0, modified: 0, unchanged: 0 };
    for (const [id, value] of next) {
      if (!previous.has(id)) counts.added++;
      else if (previous.get(id) !== value) counts.modified++;
      else counts.unchanged++;
    }
    for (const id of previous.keys()) if (!next.has(id)) counts.removed++;
    byCollection[collection] = counts;
    for (const key of ['added', 'removed', 'modified', 'unchanged'] as const) total[key] += counts[key];
  }
  return { ...total, byCollection, metadataChanged: stableStringify(before.metadata) !== stableStringify(after.metadata) };
}

/** Names and seats are resolved at the selected year, never at the current date. */
export function cityNameAt(city: HistoricalCity, year: number): LocalizedText {
  return city.names.find(name => activeAt(name.from,name.to,year))?.name ?? city.name;
}
export function capitalsAt(state: HistoricalState, year: number) {
  return state.capitals.filter(capital => activeAt(capital.from,capital.to,year));
}
export function polityAt(state: HistoricalState, year: number) {
  return state.polityPeriods?.find(period => activeAt(period.from,period.to,year))?.polityType ?? state.polityType;
}
export function eventPosition(dataset: Dataset, event: HistoricalEvent): [number, number] {
  if (event.location.coordinates) return event.location.coordinates;
  const city = dataset.cities.find(city => city.id === event.location.cityId);
  if (!city) throw new Error(`Unknown event city: ${event.location.cityId}`);
  return [city.longitude,city.latitude];
}
export function relatedEvents(dataset: Dataset, kind: EntityKind, id: string) {
  return dataset.events.filter(event => kind === 'city' ? event.location.cityId === id : kind === 'person' ? event.relatedPeople.includes(id) : kind === 'state' ? event.relatedStates.includes(id) : false);
}
export function sourceId(ref: SourceReference) { return typeof ref === 'string' ? ref : ref.id; }
/** Keep coordinate pairs on one line without changing string values. */
export function formatDataset(value: unknown): string {
  return JSON.stringify(value,null,2).replace(/\[\n\s*(-?\d+(?:\.\d+)?(?:e[+-]?\d+)?),\n\s*(-?\d+(?:\.\d+)?(?:e[+-]?\d+)?)\n\s*\]/gi, '[$1, $2]') + '\n';
}

/** Resolve dated display data without changing the canonical state. */
export function stateAt(state: HistoricalState, year: number): HistoricalState {
  const details=state.details?.find(item=>activeAt(item.from,item.to,year));
  return details?{...state,name:details.name,description:details.description,color:details.color,dynasty:details.dynasty}:state;
}
