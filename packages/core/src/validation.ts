import { validateLegacyDataset } from './legacy-validation';
import { migrateLegacyDataset } from './migration';
import type { Dataset, ValidationError, ValidationResult } from './types';

type Obj = Record<string, unknown>;
const collections = ['periods', 'states', 'cities', 'events', 'people', 'routes', 'sources'] as const;
const isObject = (value: unknown): value is Obj => !!value && typeof value === 'object' && !Array.isArray(value);
const validYear = (value: unknown): value is number => Number.isInteger(value) && typeof value === 'number' && value >= -10000 && value <= 10000;

/** Validate untrusted data before it reaches application state or persistence. */
export function validateDataset(input: unknown): ValidationResult {
  if (isObject(input) && isObject(input.metadata) && input.metadata.schemaVersion === undefined) {
    const legacy = validateLegacyDataset(input);
    if (!legacy.data) return { valid: false, errors: legacy.errors };
    return { valid: true, errors: [], data: migrateLegacyDataset(legacy.data), warnings: [{ path: 'metadata.schemaVersion', message: 'Legacy v1 converted for reading. Historical assertions and sources still require review.' }] };
  }
  const errors: ValidationError[] = [];
  const error = (path: string, message: string) => { if (errors.length < 250) errors.push({ path, message }); };
  if (!isObject(input)) return { valid: false, errors: [{ path: '$', message: 'Expected a JSON object.' }] };

  const string = (value: unknown, path: string) => {
    if (typeof value !== 'string' || !value.trim()) error(path, 'A non-empty string is required.');
  };
  const text = (value: unknown, path: string) => {
    if (typeof value === 'string') { string(value, path); return; }
    if (!isObject(value)) { error(path, 'Expected text or translations { fr, en, ar }.'); return; }
    for (const locale of ['fr', 'en', 'ar']) string(value[locale], `${path}.${locale}`);
  };
  const year = (value: unknown, path: string) => { if (!validYear(value)) error(path, 'Expected an integer year between -10000 and 10000.'); };
  const range = (value: Obj, path: string, start = 'startYear', end = 'endYear', nullable = false) => {
    year(value[start], `${path}.${start}`);
    if (!(nullable && value[end] === null)) year(value[end], `${path}.${end}`);
    if (validYear(value[start]) && validYear(value[end]) && value[start] > value[end]) {
      error(`${path}.${end}`, `${start} must be less than or equal to ${end}.`);
    }
  };
  const choice = (value: unknown, options: string[], path: string) => {
    if (typeof value !== 'string' || !options.includes(value)) error(path, `Expected one of: ${options.join(', ')}.`);
  };
  const strings = (value: unknown, path: string, allowEmpty = true) => {
    if (!Array.isArray(value)) { error(path, 'Expected an array of strings.'); return; }
    if (!allowEmpty && value.length === 0) error(path, 'At least one value is required.');
    const seen = new Set<string>();
    value.forEach((item, index) => {
      string(item, `${path}[${index}]`);
      if (typeof item === 'string') {
        if (seen.has(item)) error(`${path}[${index}]`, `Duplicate value: ${item}.`);
        seen.add(item);
      }
    });
  };
  const coordinate = (value: unknown, path: string, limit: number) => {
    if (typeof value !== 'number' || !Number.isFinite(value) || Math.abs(value) > limit) error(path, `Expected a finite coordinate between -${limit} and ${limit}.`);
  };
  const position = (value: unknown, path: string): value is [number, number] => {
    if (!Array.isArray(value) || value.length !== 2) { error(path, 'Expected [longitude, latitude].'); return false; }
    const count = errors.length;
    coordinate(value[0], `${path}[0]`, 180);
    coordinate(value[1], `${path}[1]`, 90);
    return errors.length === count;
  };
  const samePosition = (a: number[], b: number[]) => a[0] === b[0] && a[1] === b[1];
  const segmentsIntersect = (a: number[], b: number[], c: number[], d: number[]) => {
    const epsilon = 1e-10;
    if (Math.max(a[0], b[0]) + epsilon < Math.min(c[0], d[0]) || Math.max(c[0], d[0]) + epsilon < Math.min(a[0], b[0]) || Math.max(a[1], b[1]) + epsilon < Math.min(c[1], d[1]) || Math.max(c[1], d[1]) + epsilon < Math.min(a[1], b[1])) return false;
    const cross = (p: number[], q: number[], r: number[]) => (q[0] - p[0]) * (r[1] - p[1]) - (q[1] - p[1]) * (r[0] - p[0]);
    const first = cross(a, b, c), second = cross(a, b, d), third = cross(c, d, a), fourth = cross(c, d, b);
    return ((first >= -epsilon && second <= epsilon) || (first <= epsilon && second >= -epsilon)) && ((third >= -epsilon && fourth <= epsilon) || (third <= epsilon && fourth >= -epsilon));
  };
  const ring = (value: unknown, path: string) => {
    if (!Array.isArray(value) || value.length < 4) { error(path, 'A polygon ring needs at least four positions, including its closing position.'); return; }
    const positionsValid = value.map((point, index) => position(point, `${path}[${index}]`)).every(Boolean);
    if (!positionsValid) return;
    const points = value as [number, number][];
    if (!samePosition(points[0], points[points.length - 1])) error(path, 'A polygon ring must be closed: its first and last positions must match.');
    if (new Set(points.map(p => `${p[0]},${p[1]}`)).size < 3) error(path, 'A polygon ring needs at least three distinct vertices.');
    const area = points.slice(1).reduce((sum, point, index) => sum + points[index][0] * point[1] - point[0] * points[index][1], 0);
    if (Math.abs(area) < 1e-10) error(path, 'A polygon ring must enclose a non-zero area.');
    const edgeCount = points.length - 1;
    for (let first = 0; first < edgeCount; first++) {
      if (samePosition(points[first], points[first + 1])) { error(`${path}[${first + 1}]`, 'Consecutive ring vertices must be distinct.'); return; }
      for (let second = first + 2; second < edgeCount; second++) {
        if (first === 0 && second === edgeCount - 1) continue;
        if (segmentsIntersect(points[first], points[first + 1], points[second], points[second + 1])) {
          error(path, 'A polygon ring must not intersect itself.');
          return;
        }
      }
    }
  };
  const polygon = (value: unknown, path: string) => {
    if (!Array.isArray(value) || value.length === 0) { error(path, 'A polygon needs at least one ring.'); return; }
    value.forEach((item, index) => ring(item, `${path}[${index}]`));
  };
  const geometry = (value: unknown, path: string, allowed: string[]) => {
    if (!isObject(value)) { error(path, 'Expected a GeoJSON geometry object.'); return; }
    choice(value.type, allowed, `${path}.type`);
    if (value.type === 'Point') position(value.coordinates, `${path}.coordinates`);
    if (value.type === 'LineString') {
      if (!Array.isArray(value.coordinates) || value.coordinates.length < 2) { error(`${path}.coordinates`, 'A LineString needs at least two positions.'); return; }
      value.coordinates.forEach((point, index) => position(point, `${path}.coordinates[${index}]`));
      if (new Set(value.coordinates.map(point => JSON.stringify(point))).size < 2) error(`${path}.coordinates`, 'A LineString needs at least two distinct positions.');
    }
    if (value.type === 'Polygon') polygon(value.coordinates, `${path}.coordinates`);
    if (value.type === 'MultiPolygon') {
      if (!Array.isArray(value.coordinates) || value.coordinates.length === 0) { error(`${path}.coordinates`, 'A MultiPolygon needs at least one polygon.'); return; }
      value.coordinates.forEach((item, index) => polygon(item, `${path}.coordinates[${index}]`));
    }
  };
  const color = (value: unknown, path: string) => {
    if (typeof value !== 'string' || !/^#[\da-f]{6}$/i.test(value)) error(path, 'Expected a six-digit hexadecimal color, e.g. #236553.');
  };
  const ids = new Map<string, string>();
  const entries: Record<string, Obj[]> = {};
  for (const collection of collections) {
    const rows = input[collection];
    if (!Array.isArray(rows)) { error(collection, 'Expected an array.'); entries[collection] = []; continue; }
    entries[collection] = [];
    rows.forEach((item, index) => {
      const path = `${collection}[${index}]`;
      if (!isObject(item)) { error(path, 'Expected an object.'); return; }
      entries[collection].push(item);
      string(item.id, `${path}.id`);
      if (typeof item.id === 'string') {
        if (!/^[a-zA-Z0-9][a-zA-Z0-9_-]{0,127}$/.test(item.id)) error(`${path}.id`, 'Use 1–128 letters, digits, underscores or hyphens for IDs.');
        if (ids.has(item.id)) error(`${path}.id`, `Duplicate ID '${item.id}' (already used at ${ids.get(item.id)}).`);
        else ids.set(item.id, path);
      }
    });
  }
  const collectionIds = Object.fromEntries(collections.map(collection => [collection, new Set(entries[collection].map(item => item.id))]));
  const reference = (value: unknown, collection: string, path: string) => {
    string(value, path);
    if (typeof value === 'string' && !collectionIds[collection].has(value)) error(path, `Unknown ${collection} reference '${value}'.`);
  };
  const references = (value: unknown, collection: string, path: string) => {
    strings(value, path);
    if (Array.isArray(value)) value.forEach((id, index) => reference(id, collection, `${path}[${index}]`));
  };
  const metadata = input.metadata;
  if (!isObject(metadata)) error('metadata', 'Expected dataset metadata.');
  else {
    string(metadata.title, 'metadata.title');
    string(metadata.version, 'metadata.version');
    choice(metadata.language, ['fr', 'en', 'ar'], 'metadata.language');
    if (metadata.schemaVersion !== 2) error('metadata.schemaVersion', 'Expected schema version 2.');
    choice(metadata.status, ['demo', 'reviewed'], 'metadata.status');
    if ('demo' in metadata) error('metadata.demo', 'Use metadata.status.');
    if (typeof metadata.lastUpdated !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(metadata.lastUpdated) || Number.isNaN(Date.parse(metadata.lastUpdated)) || new Date(metadata.lastUpdated).toISOString().slice(0, 10) !== metadata.lastUpdated) error('metadata.lastUpdated', 'Expected a valid date in YYYY-MM-DD format.');
    if (metadata.description !== undefined) text(metadata.description, 'metadata.description');
    if (metadata.license !== undefined) string(metadata.license, 'metadata.license');
    if (metadata.figurePolicy !== undefined) { if (!isObject(metadata.figurePolicy)) error('metadata.figurePolicy','Expected a figure policy.'); else { choice(metadata.figurePolicy.foundingFigures,['no-images'],'metadata.figurePolicy.foundingFigures'); choice(metadata.figurePolicy.honorifics,['optional','always'],'metadata.figurePolicy.honorifics'); } }
  }
  const each = (collection: string, check: (item: Obj, path: string) => void) => {
    const rows = input[collection];
    if (Array.isArray(rows)) rows.forEach((item, index) => { if (isObject(item)) check(item, `${collection}[${index}]`); });
  };
  each('periods', (item, path) => {
    text(item.name, `${path}.name`); text(item.description, `${path}.description`);
    range(item, path); color(item.color, `${path}.color`);
  });
  const precision = (item: Obj, path: string) => {
    for (const key of ['startPrecision', 'endPrecision', 'birthPrecision', 'deathPrecision']) if (item[key] !== undefined) choice(item[key], ['exact', 'circa', 'unknown'], `${path}.${key}`);
    for (const key of ['startHijri', 'endHijri']) if (item[key] !== undefined) year(item[key], `${path}.${key}`);
  };
  const obsolete = (item: Obj, keys: string[], path: string) => keys.forEach(key => { if (key in item) error(`${path}.${key}`, 'Obsolete v1 field: remove the duplicated or undated value.'); });
  const citations = (value: unknown, path: string) => {
    if (!Array.isArray(value)) { error(path, 'Expected source references.'); return; }
    const seen = new Set<string>();
    value.forEach((ref, index) => {
      const key=typeof ref==='string'?ref:isObject(ref)?`${ref.id}:${ref.locator??''}`:'';
      if(seen.has(key)) error(`${path}[${index}]`,'Duplicate source reference.'); seen.add(key);
      if (typeof ref === 'string') reference(ref, 'sources', `${path}[${index}]`);
      else if (isObject(ref)) { reference(ref.id, 'sources', `${path}[${index}].id`); if (ref.locator !== undefined) string(ref.locator, `${path}[${index}].locator`); }
      else error(`${path}[${index}]`, 'Expected a source ID or { id, locator }.');
    });
  };
  const cityAt = (id: unknown, from: unknown, to: unknown, path: string) => {
    reference(id, 'cities', path);
    const city = entries.cities.find(c => c.id === id);
    if (!city || !validYear(from)) return;
    if (validYear(city.foundedYear) && from < city.foundedYear) error(path, 'The city is used before its documented foundation.');
    if (validYear(city.activeFrom) && from < city.activeFrom) error(path, 'The city is outside its coverage interval.');
    if (validYear(city.activeUntil) && validYear(to) && to > city.activeUntil) error(path, 'The city is used after its coverage interval.');
  };
  const noOverlap = (ranges: { start: number; end: number; path: string }[]) => {
    ranges.sort((a,b) => a.start-b.start);
    let end = -Infinity;
    for (const current of ranges) { if (current.start <= end) error(current.path, 'Dated intervals must not overlap.'); end = Math.max(end, current.end); }
  };
  const polityTypes = ['caliphate', 'emirate', 'sultanate', 'empire', 'state', 'confederation'];
  each('states', (item, path) => {
    text(item.name, `${path}.name`); text(item.description, `${path}.description`);
    range(item, path); color(item.color, `${path}.color`); precision(item, path);
    obsolete(item, ['type', 'capital'], path);
    choice(item.polityType, polityTypes, `${path}.polityType`);
    if (item.dynasty !== null) string(item.dynasty, `${path}.dynasty`);
    citations(item.sources, `${path}.sources`);
    const withinState = (from: unknown, to: unknown, location: string) => {
      if (validYear(from) && validYear(to) && ((validYear(item.startYear) && from < item.startYear) || (validYear(item.endYear) && to > item.endYear))) error(location, 'Dates must fall within the state’s dates.');
    };
    if (!Array.isArray(item.capitals)) error(`${path}.capitals`, 'Expected dated capitals.');
    else item.capitals.forEach((capital, index) => {
      const cp = `${path}.capitals[${index}]`;
      if (!isObject(capital)) { error(cp, 'Expected a dated capital.'); return; }
      range(capital, cp, 'from', 'to'); withinState(capital.from, capital.to, cp);
      cityAt(capital.city, capital.from, capital.to, `${cp}.city`);
      choice(capital.precision, ['exact', 'circa', 'unknown'], `${cp}.precision`);
      choice(capital.role, ['capital', 'residence'], `${cp}.role`); citations(capital.sources, `${cp}.sources`);
    });
    if (item.polityPeriods !== undefined) {
      if (!Array.isArray(item.polityPeriods)) error(`${path}.polityPeriods`, 'Expected dated polity types.');
      else { const ranges: {start:number;end:number;path:string}[] = [];
        item.polityPeriods.forEach((period,index) => { const pp = `${path}.polityPeriods[${index}]`; if (!isObject(period)) { error(pp,'Expected a period.'); return; }
          range(period,pp,'from','to'); withinState(period.from,period.to,pp); choice(period.polityType,polityTypes,`${pp}.polityType`);
          if (validYear(period.from) && validYear(period.to)) ranges.push({start:period.from,end:period.to,path:pp}); });
        noOverlap(ranges);
      }
    }
    if (item.details !== undefined) {
      if (!Array.isArray(item.details)) error(`${path}.details`, 'Expected dated state details.');
      else { const ranges: {start:number;end:number;path:string}[]=[];
        item.details.forEach((detail,index)=>{const dp=`${path}.details[${index}]`;if(!isObject(detail)){error(dp,'Expected dated state details.');return;}
          range(detail,dp,'from','to');withinState(detail.from,detail.to,dp);text(detail.name,`${dp}.name`);text(detail.description,`${dp}.description`);color(detail.color,`${dp}.color`);
          if(detail.dynasty!==null)string(detail.dynasty,`${dp}.dynasty`);
          if(validYear(detail.from)&&validYear(detail.to))ranges.push({start:detail.from,end:detail.to,path:dp});
        });noOverlap(ranges);
      }
    }
    const territories = item.territories;
    if (!isObject(territories) || territories.type !== 'FeatureCollection' || !Array.isArray(territories.features)) { error(`${path}.territories`, 'Expected a GeoJSON FeatureCollection.'); return; }
    const ranges: {start:number;end:number;path:string}[] = [];
    territories.features.forEach((feature, index) => {
      const location = `${path}.territories.features[${index}]`;
      if (!isObject(feature) || feature.type !== 'Feature' || !isObject(feature.properties)) { error(location, 'Expected a GeoJSON Feature with properties.'); return; }
      string(feature.id, `${location}.id`);
      if (typeof feature.id === 'string') { if (ids.has(feature.id)) error(`${location}.id`, 'Duplicate feature ID.'); ids.set(feature.id,location); }
      const t = feature.properties; range(t, `${location}.properties`); precision(t, `${location}.properties`);
      if (t.stateId !== item.id) error(`${location}.properties.stateId`, 'The stateId must match the enclosing state.');
      choice(t.certainty, ['high', 'medium', 'low', 'symbolic'], `${location}.properties.certainty`);
      choice(t.control, ['direct', 'influence', 'nominal'], `${location}.properties.control`);
      citations(t.sources, `${location}.properties.sources`);
      if (t.suzerainId !== undefined) { reference(t.suzerainId,'states',`${location}.properties.suzerainId`); if (t.suzerainId === item.id) error(location,'A state cannot be its own suzerain.'); }
      if (t.landClipped !== undefined && typeof t.landClipped !== 'boolean') error(`${location}.properties.landClipped`,'Expected a boolean.');
      geometry(feature.geometry, `${location}.geometry`, ['Polygon', 'MultiPolygon']);
      withinState(t.startYear,t.endYear,location);
      if (validYear(t.startYear) && validYear(t.endYear)) ranges.push({start:t.startYear,end:t.endYear,path:location});
    });
    noOverlap(ranges);
  });
  each('cities', (item, path) => {
    text(item.name, `${path}.name`); text(item.description, `${path}.description`);
    obsolete(item, ['historicalNames', 'events'], path);
    strings(item.aliases, `${path}.aliases`);
    if (item.foundedYear !== null) year(item.foundedYear, `${path}.foundedYear`);
    choice(item.foundedPrecision, ['exact','circa','unknown'], `${path}.foundedPrecision`);
    if (validYear(item.foundedYear) && validYear(item.activeFrom) && item.activeFrom < item.foundedYear) error(`${path}.activeFrom`, 'Coverage begins before the city foundation.');
    if (!Array.isArray(item.names)) error(`${path}.names`, 'Expected dated names.');
    else { const ranges: {start:number;end:number;path:string}[] = [];
      item.names.forEach((name,index) => { const np = `${path}.names[${index}]`; if (!isObject(name)) { error(np,'Expected a dated name.'); return; }
        text(name.name,`${np}.name`); range(name,np,'from','to',true); choice(name.precision,['exact','circa','unknown'],`${np}.precision`);
        if (validYear(name.from) && (validYear(name.to) || name.to === null)) ranges.push({start:name.from,end:name.to === null ? 10000 : name.to as number,path:np}); });
      noOverlap(ranges);
    }
    coordinate(item.latitude, `${path}.latitude`, 90); coordinate(item.longitude, `${path}.longitude`, 180);
    range(item, path, 'activeFrom', 'activeUntil', true);
    choice(item.importance, ['capital', 'political', 'scientific', 'religious', 'commercial', 'military', 'cultural'], `${path}.importance`);
    citations(item.sources, `${path}.sources`);
  });
  each('events', (item, path) => {
    text(item.title, `${path}.title`); text(item.description, `${path}.description`); range(item, path);
    choice(item.type, ['battle', 'city-foundation', 'political-change', 'dynasty-change', 'treaty', 'migration', 'scientific', 'religious', 'economic', 'cultural', 'birth', 'death', 'conquest', 'revolt'], `${path}.type`);
    precision(item, path);
    if (!isObject(item.location)) error(`${path}.location`, 'Expected a city reference or coordinates with a location type.');
    else {
      choice(item.location.type, ['actual','approximate','symbolic'], `${path}.location.type`);
      obsolete(item.location, ['latitude','longitude'], `${path}.location`);
      if ('cityId' in item.location && 'coordinates' in item.location) error(`${path}.location`, 'Use either cityId or coordinates, never both.');
      if ('cityId' in item.location) cityAt(item.location.cityId,item.startYear,item.endYear,`${path}.location.cityId`);
      else position(item.location.coordinates, `${path}.location.coordinates`);
    }
    references(item.relatedStates, 'states', `${path}.relatedStates`); references(item.relatedPeople, 'people', `${path}.relatedPeople`); citations(item.sources, `${path}.sources`);
  });
  each('people', (item, path) => {
    text(item.name, `${path}.name`); text(item.description, `${path}.description`); range(item, path, 'birthYear', 'deathYear', true);
    cityAt(item.birthPlace,item.birthYear,item.birthYear,`${path}.birthPlace`);
    if (item.deathPlace !== null) cityAt(item.deathPlace,item.deathYear,item.deathYear,`${path}.deathPlace`);
    choice(item.birthPrecision, ['exact','circa','unknown'], `${path}.birthPrecision`); choice(item.deathPrecision, ['exact','circa','unknown'], `${path}.deathPrecision`);
    obsolete(item, ['events'], path);
    if (item.birthPlaceType !== undefined) choice(item.birthPlaceType,['actual','approximate','symbolic'],`${path}.birthPlaceType`);
    if (item.foundingFigure !== undefined && typeof item.foundingFigure !== 'boolean') error(`${path}.foundingFigure`,'Expected a boolean.');
    if (item.honorific !== undefined) text(item.honorific,`${path}.honorific`);
    if (item.foundingFigure === true && ('image' in item || 'imageUrl' in item || 'portrait' in item)) error(path,'Founding figures use text and honorifics without portraits.'); strings(item.roles, `${path}.roles`, false);
    references(item.relatedStates, 'states', `${path}.relatedStates`); citations(item.sources, `${path}.sources`);
  });
  each('routes', (item, path) => {
    text(item.name, `${path}.name`); text(item.description, `${path}.description`); range(item, path);
    geometry(item.geometry, `${path}.geometry`, ['LineString']);
    choice(item.certainty, ['high', 'medium', 'low', 'symbolic'], `${path}.certainty`);
    precision(item,path); references(item.cityIds,'cities',`${path}.cityIds`);
    if (Array.isArray(item.cityIds)) item.cityIds.forEach((id,index) => cityAt(id,item.startYear,item.endYear,`${path}.cityIds[${index}]`));
    citations(item.sources, `${path}.sources`);
  });
  each('sources', (item, path) => {
    string(item.title, `${path}.title`); string(item.author, `${path}.author`); text(item.notes, `${path}.notes`);
    if (item.publicationYear !== null) year(item.publicationYear, `${path}.publicationYear`);
    choice(item.type, ['primary', 'academic', 'encyclopedia', 'book', 'article', 'archive', 'other'], `${path}.type`);
    string(item.license, `${path}.license`); choice(item.verification,['consulted','bibliography','unverified'],`${path}.verification`);
    if (item.accessedDate !== null && (typeof item.accessedDate !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(item.accessedDate) || Number.isNaN(Date.parse(item.accessedDate)) || new Date(item.accessedDate).toISOString().slice(0,10) !== item.accessedDate)) error(`${path}.accessedDate`, 'Expected a valid ISO date or null for an unconsulted source.');
    if (item.verification === 'consulted' && item.accessedDate === null) error(`${path}.accessedDate`, 'Consulted sources need an access date.');
    if (item.permanentUrl !== null) { try { const url = new URL(String(item.permanentUrl)); if (!['http:','https:'].includes(url.protocol) || url.username || url.password) throw new Error(); } catch { error(`${path}.permanentUrl`,'Expected an HTTP(S) permalink or null.'); } }
    try {
      if (typeof item.url !== 'string' || !item.url.trim()) throw new Error();
      const url = new URL(item.url);
      if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password || !url.hostname) throw new Error();
    } catch { error(`${path}.url`, 'Expected an absolute HTTP(S) URL without embedded credentials.'); }
  });
  return errors.length ? { valid: false, errors } : { valid: true, errors: [], data: input as unknown as Dataset };
}

export function parseDataset(text: string): ValidationResult {
  try { return validateDataset(JSON.parse(text)); }
  catch (error) { return { valid: false, errors: [{ path: '$', message: `Invalid JSON: ${error instanceof Error ? error.message : 'unable to parse input'}` }] }; }
}

/** Read a legacy or current snapshot without mutating the stored version. */
export function readDataset(input: unknown): Dataset {
  const result = validateDataset(input);
  if (!result.data) throw new Error(`Invalid historical dataset: ${result.errors[0]?.path}: ${result.errors[0]?.message}`);
  return result.data;
}
