import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { activeAt, datasetToGeoJSON, getActiveData, localized, parseDataset, searchDataset, summarizeChanges, validateDataset, type Dataset } from '../packages/core/src';

const raw = readFileSync(new URL('../public/islamic-history.json', import.meta.url), 'utf8');
const seed = (): Dataset => JSON.parse(raw);

describe('historical dataset validation', () => {
  it('validates the multilingual demonstration source and its public copy', () => {
    expect(parseDataset(raw)).toMatchObject({ valid: true, errors: [] });
    expect(readFileSync(new URL('../islamic-history.json', import.meta.url), 'utf8')).toBe(raw);
    expect(seed().metadata.status).toBe('demo');
  });

  it('reports malformed JSON and missing collections without throwing', () => {
    expect(parseDataset('{ invalid').valid).toBe(false);
    expect(validateDataset(null).errors[0].path).toBe('$');
    expect(validateDataset({ metadata: {} }).errors.some(error => error.path === 'states')).toBe(true);
  });

  it('rejects IDs reused across collections and duplicate references', () => {
    const data = seed();
    data.cities[0].id = data.states[0].id;
    data.events[0].sources.push(data.events[0].sources[0]);
    const result = validateDataset(data);
    expect(result.valid).toBe(false);
    expect(result.errors.some(error => error.path === 'cities[0].id' && error.message.includes('Duplicate ID'))).toBe(true);
    expect(result.errors.some(error => error.path === 'events[0].sources[1]' && error.message.includes('Duplicate'))).toBe(true);
  });

  it('checks foreign keys for capitals, events, people and sources', () => {
    const data = seed();
    data.states[0].capitals[0].city = 'missing-city';
    data.events[0].relatedPeople = ['missing-person'];
    data.events[0].location = {cityId:'missing-city',type:'actual'};
    data.routes[0].sources = ['missing-source'];
    const result = validateDataset(data);
    expect(result.valid).toBe(false);
    for (const path of ['states[0].capitals[0].city', 'events[0].relatedPeople[0]', 'events[0].location.cityId', 'routes[0].sources[0]']) {
      expect(result.errors.some(error => error.path === path)).toBe(true);
    }
  });

  it('rejects reversed ranges, fractional dates and impossible metadata dates', () => {
    const data = seed();
    data.events[0].endYear = data.events[0].startYear - 1;
    data.people[0].birthYear = 766.5;
    data.metadata.lastUpdated = '2026-02-30';
    const result = validateDataset(data);
    expect(result.valid).toBe(false);
    expect(result.errors.map(error => error.path)).toEqual(expect.arrayContaining(['events[0].endYear', 'people[0].birthYear', 'metadata.lastUpdated']));
  });

  it('rejects geographic bounds, open rings and collapsed polygons', () => {
    const data = seed();
    data.cities[0].latitude = 91;
    data.events[0].location = {type:'approximate',coordinates:[-181,30]};
    data.states[0].territories.features[0].geometry = { type: 'Polygon', coordinates: [[[1, 1], [2, 1], [2, 2], [1, 2]]] };
    data.states[1].territories.features[0].geometry = { type: 'Polygon', coordinates: [[[1, 1], [2, 2], [3, 3], [1, 1]]] };
    const result = validateDataset(data);
    expect(result.valid).toBe(false);
    expect(result.errors.some(error => error.message.includes('closed'))).toBe(true);
    expect(result.errors.some(error => error.message.includes('non-zero'))).toBe(true);
    expect(result.errors.some(error => error.path === 'cities[0].latitude')).toBe(true);
  });

  it('rejects a self-intersecting polygon even when its signed area is nonzero', () => {
    const data = seed();
    data.states[0].territories.features[0].geometry = { type: 'Polygon', coordinates: [[[0, 0], [4, 4], [0, 3], [3, 0], [0, 0]]] };
    expect(validateDataset(data).errors.some(error => error.message.includes('intersect itself'))).toBe(true);
  });

  it('requires at least two distinct route positions and valid MultiPolygon rings', () => {
    const data = seed();
    data.routes[0].geometry.coordinates = [[10, 20], [10, 20]];
    data.states[0].territories.features[0].geometry = { type: 'MultiPolygon', coordinates: [[[[0, 0], [1, 0], [1, 1], [0, 0]]], []] };
    const result = validateDataset(data);
    expect(result.valid).toBe(false);
    expect(result.errors.some(error => error.message.includes('distinct positions'))).toBe(true);
    expect(result.errors.some(error => error.path.endsWith('coordinates[1]'))).toBe(true);
  });

  it('rejects overlapping and out-of-lifetime territory time slices', () => {
    const data = seed();
    const state = data.states.find(item => item.id === 'abbasid-caliphate')!;
    state.territories.features[1].properties.startYear = state.territories.features[0].properties.endYear;
    state.territories.features[2].properties.endYear = state.endYear + 1;
    const result = validateDataset(data);
    expect(result.errors.some(error => error.message.includes('must not overlap'))).toBe(true);
    expect(result.errors.some(error => error.message.includes('within the state'))).toBe(true);
  });

  it.each(['javascript:alert(1)', 'data:text/html,hello', '/relative', 'https://user:secret@example.org'])('rejects unsafe source URL %s', url => {
    const data = seed();
    data.sources[0].url = url;
    expect(validateDataset(data).errors.some(error => error.path === 'sources[0].url')).toBe(true);
  });

  it('requires translated strings and explicit demo provenance', () => {
    const data = JSON.parse(raw);
    data.cities[0].name.ar = '';
    delete data.metadata.status;
    const result = validateDataset(data);
    expect(result.valid).toBe(false);
    expect(result.errors.map(error => error.path)).toEqual(expect.arrayContaining(['metadata.status', 'cities[0].name.ar']));
  });
});

describe('time, search and export', () => {
  it('uses inclusive boundaries and supports an unknown end date', () => {
    expect(activeAt(750, 1258, 750)).toBe(true);
    expect(activeAt(750, 1258, 1258)).toBe(true);
    expect(activeAt(750, 1258, 1259)).toBe(false);
    expect(activeAt(762, null, 2026)).toBe(true);
    expect(activeAt(762, null, 750)).toBe(false);
    expect(activeAt(750, 1258, 800.5)).toBe(false);
  });

  it('filters every dated entity and chooses the current territory without mutating the source', () => {
    const data = seed();
    const active = getActiveData(data, 800);
    expect(active.states.map(item => item.id)).toEqual(['abbasid-caliphate', 'cordoba-umayyads', 'idrisid-dynasty', 'aghlabid-dynasty']);
    expect(active.cities.some(item => item.id === 'cairo')).toBe(false);
    expect(active.cities.some(item => item.id === 'baghdad')).toBe(true);
    expect(active.events.map(item => item.id)).toEqual(['event-harun', 'event-aghlabids', 'event-translations']);
    expect(active.people.map(item => item.id)).toEqual(['harun-al-rashid', 'al-mamun', 'al-khwarizmi']);
    expect(active.states[0].territories.features).toHaveLength(1);
    expect(data.states.find(item => item.id === 'abbasid-caliphate')!.territories.features).toHaveLength(3);
    expect(getActiveData(data, 950).states.find(item => item.id === 'abbasid-caliphate')!.territories.features[0].properties.startYear).toBe(946);
  });

  it('searches every locale, accents, Arabic diacritics, people and dates', () => {
    const data = seed();
    expect(searchDataset(data, 'Cordoba', 'fr').some(item => item.kind === 'city' && item.label === 'Cordoue')).toBe(true);
    expect(searchDataset(data, 'بَغْداد', 'ar').some(item => item.id === 'baghdad')).toBe(true);
    expect(searchDataset(data, 'Ibn Khaldun', 'fr').some(item => item.kind === 'person')).toBe(true);
    expect(searchDataset(data, '762', 'fr').some(item => item.id === 'event-baghdad')).toBe(true);
    expect(searchDataset(data, '  ', 'en')).toEqual([]);
    expect(localized(data.states[0].name, 'ar')).toBe('مجتمع المدينة');
  });

  it('exports valid feature geometries with a lossless full dataset foreign member', () => {
    const data = seed();
    const exported = datasetToGeoJSON(data, 800);
    expect(exported.type).toBe('FeatureCollection');
    expect(exported.features.filter(item => item.properties.kind === 'state')).toHaveLength(4);
    expect(exported.features.find(item => item.id === 'baghdad')!.geometry).toEqual({ type: 'Point', coordinates: [44.3661, 33.3152] });
    expect(exported.dataset).toEqual(data);
    expect(validateDataset(JSON.parse(JSON.stringify(exported)).dataset).valid).toBe(true);
    expect(datasetToGeoJSON(data).features.length).toBeGreaterThan(exported.features.length);
    expect(() => datasetToGeoJSON(data, NaN)).toThrow(RangeError);
    expect(() => datasetToGeoJSON(data, 800.5)).toThrow(RangeError);
  });

  it('summarizes added, removed and changed records independently of object key order', () => {
    const before = seed();
    const after = seed();
    after.cities[0].description = 'Changed';
    after.events.pop();
    after.routes.push({ ...after.routes[0], id: 'new-route' });
    after.metadata.version = '1.0.1';
    after.states[0] = Object.fromEntries(Object.entries(after.states[0]).reverse()) as Dataset['states'][number];
    const summary = summarizeChanges(before, after);
    expect(summary).toMatchObject({ added: 1, removed: 1, modified: 1, metadataChanged: true });
    expect(summary.byCollection.states.modified).toBe(0);
    expect(summary.byCollection.cities.modified).toBe(1);
    expect(summarizeChanges(before, seed())).toMatchObject({ added: 0, removed: 0, modified: 0, metadataChanged: false });
  });
});
