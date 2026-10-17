import { activeAt, capitalsAt, cityNameAt, getActiveData, localized, polityAt, relatedEvents, sourceId, stateAt, type Dataset, type EntityKind, type Locale } from '@history/core';
import { HttpError } from './errors';
import type { Store } from './types';

export interface AssistantRequest {
  messages: Array<{ role: 'user' | 'assistant'; content: string }>;
  context: { year: number; locale: Locale; selection: { kind: EntityKind; id: string } | null };
}
const kinds = ['state', 'city', 'event', 'person', 'route'];
function object(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}
export function parseAssistantRequest(body: Record<string, unknown>): AssistantRequest {
  const { messages, context } = body;
  if (!Array.isArray(messages) || !messages.length || messages.length > 20 || messages.length % 2 !== 1) {
    throw new HttpError(400, 'La conversation doit se terminer par une question et contenir au maximum 20 messages.');
  }
  let length = 0;
  const parsed = messages.map((message, index) => {
    const role = index % 2 === 0 ? 'user' as const : 'assistant' as const;
    if (!object(message) || message.role !== role || typeof message.content !== 'string' || !message.content.trim() || message.content.length > (role === 'user' ? 4000 : 12000)) {
      throw new HttpError(400, 'Message invalide ou trop long.');
    }
    length += message.content.length;
    return { role, content: message.content.trim() };
  });
  if (length > 24000) throw new HttpError(400, 'Conversation trop longue. Commencez une nouvelle conversation.');
  if (!object(context) || !Number.isInteger(context.year) || (context.year as number) < -10000 || (context.year as number) > 10000 || !['fr', 'en', 'ar'].includes(String(context.locale))) {
    throw new HttpError(400, 'Le contexte doit préciser une année et une langue valides.');
  }
  let selection: AssistantRequest['context']['selection'] = null;
  if (context.selection !== undefined && context.selection !== null) {
    const selected = context.selection;
    if (!object(selected) || !kinds.includes(String(selected.kind)) || typeof selected.id !== 'string' || !selected.id || selected.id.length > 200) {
      throw new HttpError(400, 'Sélection invalide.');
    }
    selection = { kind: selected.kind as EntityKind, id: selected.id };
  }
  return { messages: parsed, context: { year: context.year as number, locale: context.locale as Locale, selection } };
}

/** Resolve published facts on the server; no client-supplied description or draft is trusted. */
export function assistantAtlasContext(dataset: Dataset, context: AssistantRequest['context']): string {
  const { year, locale, selection } = context;
  const name = (value: Parameters<typeof localized>[0]) => localized(value, locale).slice(0,400);
  const cityLabel = (id: string | null) => {
    const city = dataset.cities.find(item => item.id === id);
    return city ? { id: city.id, name: name(cityNameAt(city,year)) } : null;
  };
  const active = getActiveData(dataset,year);
  const collection = selection ? ({ state: dataset.states, city: dataset.cities, event: dataset.events, person: dataset.people, route: dataset.routes }[selection.kind]) : undefined;
  const entity = collection?.find(item => item.id === selection?.id);
  if (selection && !entity) throw new HttpError(400, 'Cette sélection n’existe plus dans l’atlas publié.');
  let selected: Record<string, unknown> | null = null;
  if (entity && selection) {
    selected = { kind: selection.kind, id: entity.id, description: localized(entity.description,locale).slice(0,3500) };
    if (selection.kind === 'state') {
      const state = stateAt(dataset.states.find(item => item.id === entity.id)!,year);
      Object.assign(selected, { name: name(state.name), description: localized(state.description,locale).slice(0,3500), startYear: state.startYear, endYear: state.endYear, active: activeAt(state.startYear,state.endYear,year), polityType: polityAt(state,year), dynasty: state.dynasty,
        capitals: capitalsAt(state,year).slice(0,10).map(capital => ({ ...cityLabel(capital.city), role: capital.role, precision: capital.precision, from: capital.from, to: capital.to })),
        territories: state.territories.features.filter(feature => activeAt(feature.properties.startYear,feature.properties.endYear,year)).slice(0,10).map(feature => ({ certainty: feature.properties.certainty, control: feature.properties.control, startYear: feature.properties.startYear, endYear: feature.properties.endYear })) });
    } else if (selection.kind === 'city') {
      const city = dataset.cities.find(item => item.id === entity.id)!;
      Object.assign(selected, { name: name(cityNameAt(city,year)), foundedYear: city.foundedYear, foundedPrecision: city.foundedPrecision, activeFrom: city.activeFrom, activeUntil: city.activeUntil, importance: city.importance });
    } else if (selection.kind === 'event') {
      const event = dataset.events.find(item => item.id === entity.id)!;
      Object.assign(selected, { name: name(event.title), startYear: event.startYear, endYear: event.endYear, location: event.location, startPrecision: event.startPrecision, relatedStates: event.relatedStates.slice(0,15) });
    } else if (selection.kind === 'person') {
      const person = dataset.people.find(item => item.id === entity.id)!;
      Object.assign(selected, { name: name(person.name), birthYear: person.birthYear, deathYear: person.deathYear, birthPlace: cityLabel(person.birthPlace), deathPlace: cityLabel(person.deathPlace), roles: person.roles.slice(0,10) });
    } else {
      const route = dataset.routes.find(item => item.id === entity.id)!;
      Object.assign(selected, { name: name(route.name), startYear: route.startYear, endYear: route.endYear, certainty: route.certainty, cities: route.cityIds.slice(0,20).map(cityLabel) });
    }
    selected.relatedEvents = relatedEvents(dataset,selection.kind,selection.id).slice(0,12).map(event => ({ name: name(event.title), startYear: event.startYear, endYear: event.endYear }));
    selected.bibliography = entity.sources.slice(0,8).map(reference => {
      const source = dataset.sources.find(item => item.id === sourceId(reference));
      return source ? { title: source.title.slice(0,300), author: source.author.slice(0,200), url: source.permanentUrl || source.url, verification: source.verification, locator: typeof reference === 'string' ? undefined : reference.locator?.slice(0,300) } : null;
    }).filter(Boolean);
  }
  return JSON.stringify({ locale, year, calendar: 'Gregorian; inclusive intervals', datasetStatus: dataset.metadata.status,
    datasetVersion: dataset.metadata.version, selected,
    periods: active.periods.slice(0,10).map(period => name(period.name)),
    activeStates: active.states.slice(0,40).map(state => ({ id: state.id, name: name(state.name), polityType: polityAt(state,year) })),
    eventsThisYear: active.events.slice(0,15).map(event => ({ name: name(event.title), startYear: event.startYear, endYear: event.endYear })),
    sourcePolicy: 'Atlas entries and bibliography are context, not proof that cited works were consulted. Only successful MCP retrievals can substantiate source citations. Geometries may be symbolic.' });
}

/** Uses the existing transactional store, so rate limits survive server restarts. */
export function reserveAssistantRequest(store: Store, userId: string, now = Date.now()): void {
  const key = `assistant:${userId}`;
  const previous = store.loginAttempts[key];
  const current = previous && previous.expiresAt > now ? previous : { count: 0, expiresAt: now + 15 * 60_000 };
  if (current.count >= 20) throw new HttpError(429, 'Limite de questions atteinte. Réessayez dans 15 minutes.', { code: 'ASSISTANT_RATE_LIMIT', retryAfter: Math.max(1,Math.ceil((current.expiresAt-now)/1000)) });
  store.loginAttempts[key] = { count: current.count + 1, expiresAt: current.expiresAt };
}
