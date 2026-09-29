import { datasetToGeoJSON, readDataset, formatDataset } from '@history/core';
import { requireUser } from '@/server/auth';
import { HttpError } from '@/server/errors';
import { handle } from '@/server/http';
import { withStore } from '@/server/store';
import { publishedVersion } from '@/server/workflow';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export async function GET(request: Request) {
  return handle(() => withStore((store) => {
    requireUser(store, request);
    const url = new URL(request.url);
    const format = url.searchParams.get('format') || 'json';
    if (format !== 'json' && format !== 'geojson') throw new HttpError(400, 'Format inconnu. Utilisez json ou geojson.');
    const rawYear = url.searchParams.get('year');
    const year = rawYear === null ? undefined : Number(rawYear);
    if (rawYear !== null && (!rawYear.trim() || !Number.isInteger(year))) throw new HttpError(400, 'L’année doit être un nombre entier.');
    const dataset = readDataset(publishedVersion(store).dataset);
    let output: unknown = dataset;
    if (format === 'geojson') {
      try { output = datasetToGeoJSON(dataset, year); }
      catch (error) { if (error instanceof RangeError) throw new HttpError(400, 'Année en dehors des limites autorisées.'); throw error; }
    }
    return new Response(formatDataset(output), { headers: {
      'Content-Type': format === 'geojson' ? 'application/geo+json; charset=utf-8' : 'application/json; charset=utf-8',
      'Content-Disposition': `attachment; filename="islamic-history.${format === 'geojson' ? 'geojson' : 'json'}"`,
      'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff',
    } });
  }));
}
