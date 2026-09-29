import type { Dataset, PolityType, SourceReference } from './types';
import type { Dataset as LegacyDataset } from './legacy-types';

/** Structural conversion only. Old snapshots remain intact; uncertain assertions stay uncertain. */
export function migrateLegacyDataset(legacy: LegacyDataset): Dataset {
  const old = structuredClone(legacy);
  const refs = (sources: string[]): SourceReference[] => sources.map(id => ({ id }));
  return {
    metadata: { schemaVersion: 2, title: old.metadata.title, version: old.metadata.version, lastUpdated: old.metadata.lastUpdated, language: old.metadata.language, status: old.metadata.demo ? 'demo' : 'reviewed', description: old.metadata.description, license: old.metadata.license },
    periods: old.periods,
    states: old.states.map(({ type, capital, territories, sources, ...state }) => ({ ...state,
      polityType: (type === 'dynasty' ? 'state' : type) as PolityType,
      dynasty: type === 'dynasty' ? state.id.replace(/-dynasty$/, '') : null,
      capitals: capital && (old.cities.find(c=>c.id===capital)?.activeFrom ?? state.startYear) <= state.endYear ? [{ city: capital, from: Math.max(state.startYear,old.cities.find(c=>c.id===capital)?.activeFrom ?? state.startYear), to: state.endYear, precision: 'unknown' as const, role: 'capital' as const, sources: refs(sources) }] : [],
      sources: refs(sources), territories: { type: 'FeatureCollection' as const, features: territories.map((t, index) => ({ type: 'Feature' as const, id: `${state.id}-territory-${index}`, geometry: t.geometry, properties: { stateId: state.id, startYear: t.startYear, endYear: t.endYear, certainty: old.metadata.demo ? 'symbolic' as const : t.certainty === 'unknown' ? 'low' as const : t.certainty, control: 'direct' as const, sources: refs(sources) } })) }
    })),
    cities: old.cities.map(({ historicalNames, events: _events, sources, ...city }) => ({ ...city, aliases: historicalNames, names: [], foundedYear: null, foundedPrecision: 'unknown' as const, sources: refs(sources) })),
    events: old.events.map(({ location, sources, ...event }) => {
      const city = old.cities.find(c => c.latitude === location.latitude && c.longitude === location.longitude);
      return { ...event, sources: refs(sources), location: city ? { cityId: city.id, type: 'symbolic' as const } : { coordinates: [location.longitude, location.latitude] as [number, number], type: 'symbolic' as const } };
    }),
    people: old.people.map(({ events: _events, sources, ...person }) => ({ ...person, deathPlace: null, birthPrecision: 'unknown' as const, deathPrecision: 'unknown' as const, sources: refs(sources) })),
    routes: old.routes.map(({ certainty, sources, ...route }) => ({ ...route, cityIds: [], certainty: old.metadata.demo ? 'symbolic' as const : certainty === 'unknown' ? 'low' as const : certainty, sources: refs(sources) })),
    sources: old.sources.map(source => ({ ...source, permanentUrl: null, accessedDate: null, license: 'unverified', verification: 'unverified' as const })),
  };
}
