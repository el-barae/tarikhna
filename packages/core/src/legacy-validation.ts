import type { Dataset, ValidationError, ValidationResult } from './legacy-types';

type Obj = Record<string, unknown>;
const collections = ['periods', 'states', 'cities', 'events', 'people', 'routes', 'sources'] as const;
const isObject = (value: unknown): value is Obj => !!value && typeof value === 'object' && !Array.isArray(value);
const validYear = (value: unknown): value is number => Number.isInteger(value) && typeof value === 'number' && value >= -10000 && value <= 10000;

/** Validate untrusted data before it reaches application state or persistence. */
export function validateLegacyDataset(input: unknown): ValidationResult {
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
    if (typeof metadata.demo !== 'boolean') error('metadata.demo', 'Specify whether this dataset is demonstration data (true or false).');
    if (typeof metadata.lastUpdated !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(metadata.lastUpdated) || Number.isNaN(Date.parse(metadata.lastUpdated)) || new Date(metadata.lastUpdated).toISOString().slice(0, 10) !== metadata.lastUpdated) error('metadata.lastUpdated', 'Expected a valid date in YYYY-MM-DD format.');
    if (metadata.description !== undefined) text(metadata.description, 'metadata.description');
    if (metadata.license !== undefined) string(metadata.license, 'metadata.license');
  }
  const each = (collection: string, check: (item: Obj, path: string) => void) => {
    const rows = input[collection];
    if (Array.isArray(rows)) rows.forEach((item, index) => { if (isObject(item)) check(item, `${collection}[${index}]`); });
  };
  each('periods', (item, path) => {
    text(item.name, `${path}.name`); text(item.description, `${path}.description`);
    range(item, path); color(item.color, `${path}.color`);
  });
  each('states', (item, path) => {
    text(item.name, `${path}.name`); text(item.description, `${path}.description`);
    range(item, path); color(item.color, `${path}.color`);
    choice(item.type, ['caliphate', 'dynasty', 'emirate', 'sultanate', 'empire', 'state'], `${path}.type`);
    reference(item.capital, 'cities', `${path}.capital`);
    references(item.sources, 'sources', `${path}.sources`);
    if (!Array.isArray(item.territories) || item.territories.length === 0) { error(`${path}.territories`, 'At least one dated territory is required.'); return; }
    const ranges: Array<{ start: number; end: number; index: number }> = [];
    item.territories.forEach((territory, index) => {
      const location = `${path}.territories[${index}]`;
      if (!isObject(territory)) { error(location, 'Expected a territory object.'); return; }
      range(territory, location);
      choice(territory.certainty, ['high', 'medium', 'low', 'unknown'], `${location}.certainty`);
      geometry(territory.geometry, `${location}.geometry`, ['Polygon', 'MultiPolygon']);
      if (validYear(territory.startYear) && validYear(territory.endYear)) {
        if ((validYear(item.startYear) && territory.startYear < item.startYear) || (validYear(item.endYear) && territory.endYear > item.endYear)) error(location, 'Territory dates must fall within the state’s dates.');
        ranges.push({ start: territory.startYear, end: territory.endYear, index });
      }
    });
    ranges.sort((a, b) => a.start - b.start);
    ranges.forEach((current, index) => {
      if (index > 0 && current.start <= ranges[index - 1].end) error(`${path}.territories[${current.index}]`, 'Territory periods must not overlap. Use MultiPolygon for disconnected areas in the same period.');
    });
  });
  each('cities', (item, path) => {
    text(item.name, `${path}.name`); text(item.description, `${path}.description`);
    strings(item.historicalNames, `${path}.historicalNames`);
    coordinate(item.latitude, `${path}.latitude`, 90); coordinate(item.longitude, `${path}.longitude`, 180);
    range(item, path, 'activeFrom', 'activeUntil', true);
    choice(item.importance, ['capital', 'political', 'scientific', 'religious', 'commercial', 'military', 'cultural'], `${path}.importance`);
    references(item.events, 'events', `${path}.events`); references(item.sources, 'sources', `${path}.sources`);
  });
  each('events', (item, path) => {
    text(item.title, `${path}.title`); text(item.description, `${path}.description`); range(item, path);
    choice(item.type, ['battle', 'city-foundation', 'political-change', 'dynasty-change', 'treaty', 'migration', 'scientific', 'religious', 'economic', 'cultural', 'birth', 'death', 'conquest', 'revolt'], `${path}.type`);
    if (!isObject(item.location)) error(`${path}.location`, 'Expected { latitude, longitude }.');
    else { coordinate(item.location.latitude, `${path}.location.latitude`, 90); coordinate(item.location.longitude, `${path}.location.longitude`, 180); }
    references(item.relatedStates, 'states', `${path}.relatedStates`); references(item.relatedPeople, 'people', `${path}.relatedPeople`); references(item.sources, 'sources', `${path}.sources`);
  });
  each('people', (item, path) => {
    text(item.name, `${path}.name`); text(item.description, `${path}.description`); range(item, path, 'birthYear', 'deathYear', true);
    reference(item.birthPlace, 'cities', `${path}.birthPlace`); strings(item.roles, `${path}.roles`, false);
    references(item.events, 'events', `${path}.events`); references(item.relatedStates, 'states', `${path}.relatedStates`); references(item.sources, 'sources', `${path}.sources`);
  });
  each('routes', (item, path) => {
    text(item.name, `${path}.name`); text(item.description, `${path}.description`); range(item, path);
    geometry(item.geometry, `${path}.geometry`, ['LineString']);
    choice(item.certainty, ['high', 'medium', 'low', 'unknown'], `${path}.certainty`);
    references(item.sources, 'sources', `${path}.sources`);
  });
  each('sources', (item, path) => {
    string(item.title, `${path}.title`); string(item.author, `${path}.author`); text(item.notes, `${path}.notes`);
    if (item.publicationYear !== null) year(item.publicationYear, `${path}.publicationYear`);
    choice(item.type, ['primary', 'academic', 'encyclopedia', 'book', 'article', 'archive', 'other'], `${path}.type`);
    try {
      if (typeof item.url !== 'string' || !item.url.trim()) throw new Error();
      const url = new URL(item.url);
      if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password || !url.hostname) throw new Error();
    } catch { error(`${path}.url`, 'Expected an absolute HTTP(S) URL without embedded credentials.'); }
  });
  return errors.length ? { valid: false, errors } : { valid: true, errors: [], data: input as unknown as Dataset };
}

export function parseLegacyDataset(text: string): ValidationResult {
  try { return validateLegacyDataset(JSON.parse(text)); }
  catch (error) { return { valid: false, errors: [{ path: '$', message: `Invalid JSON: ${error instanceof Error ? error.message : 'unable to parse input'}` }] }; }
}
