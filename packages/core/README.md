# Shared historical domain

This package has no React, browser, database or Node dependencies. The web app,
API and Expo app use the same TypeScript contracts and validation.

## Public API

- `validateDataset(unknown)` and `parseDataset(string)` return `{ valid, errors, data?, warnings? }`.
  Each error includes an actionable JSON field path. Persist only the returned
  `data` after `valid === true`.
- `getActiveData(dataset, year)` returns a view containing active entities and
  territory snapshots. It does not mutate the source. Historical references
  can point outside this view, so resolve details against the complete dataset.
- `activeAt(start, end, year)` uses inclusive boundaries. `null` means no known end.
- `localized(text, locale)` selects French, English or Arabic, with fallbacks.
- `searchDataset(dataset, query, locale)` searches names, descriptions, aliases,
  dates and selected relations across languages, ignoring accents and Arabic
  diacritics. It returns IDs for retrieving details from the complete dataset.
- `datasetToGeoJSON(dataset, year?)` emits Point, LineString, Polygon and
  MultiPolygon features. The top-level foreign member `dataset` preserves every
  original record, source, relation and time slice for lossless exchange.
- `summarizeChanges(before, after)` counts additions, removals and modifications
  by collection, plus metadata changes. Object key order does not affect diffs.

## Data conventions

All IDs are globally unique and references use IDs. Coordinates are WGS84,
`[longitude, latitude]`. Polygon rings must close, enclose an area, and avoid
self-intersections. Territory snapshots for a state use non-overlapping,
inclusive integer years; use a MultiPolygon for disconnected contemporaneous
territories. Unknown source publication dates and open city/person lifetimes
use `null`. Source links allow only absolute HTTP(S) URLs without credentials.

The checked-in JSON is explicitly **DEMO DATA**. Its simplified geography,
visibility dates and visual event anchors are educational examples, not
historically verified borders. Source links are starting points for research,
not citations substantiating the polygons. `metadata.description` documents
these limitations in all three languages. Validation checks data integrity;
historical review remains a separate editorial responsibility.

## Version 2

`readDataset` converts legacy v1 snapshots without rewriting them. `capitalsAt`, `cityNameAt`, `polityAt`, `eventPosition` and `relatedEvents` resolve dated values and references. `sourceId` supports string IDs and precise citations. `formatDataset` keeps coordinate pairs on one line. See [DATA-V2](../../docs/DATA-V2.md) for the schema and migration.
