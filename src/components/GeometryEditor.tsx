"use client";

import { useEffect, useRef, useState } from "react";

type Position = number[];
type Polygon = { type: "Polygon"; coordinates: Position[][] };

type LandFeature = { geometry: { type: "Polygon"; coordinates: Position[][] } | { type: "MultiPolygon"; coordinates: Position[][][] } };
let landPaths: Promise<string[]> | undefined;
function loadLand() {
  landPaths ??= fetch("/geography/land.geojson").then(response => {
    if (!response.ok) throw new Error("Basemap unavailable");
    return response.json() as Promise<{ features: LandFeature[] }>;
  }).then(data => data.features.flatMap(feature => {
    const polygons = feature.geometry.type === "Polygon" ? [feature.geometry.coordinates] : feature.geometry.coordinates;
    return polygons.map(polygon => polygon.map(ring => ring.map(([lon, lat], index) => `${index ? "L" : "M"}${((lon + 180) * 2).toFixed(2)},${((90 - lat) * 2).toFixed(2)}`).join(" ") + " Z").join(" "));
  })).catch(() => []);
  return landPaths;
}

/** Edits the exterior ring; interior rings remain intact. Coordinates use WGS84. */
export default function GeometryEditor({ geometry, onChange, locale = "fr" }: { geometry: Polygon; onChange: (geometry: Polygon) => void; locale?: "fr" | "en" | "ar" }) {
  const svg = useRef<SVGSVGElement>(null);
  const [land, setLand] = useState<string[]>([]);
  useEffect(() => { let mounted = true; loadLand().then(paths => { if (mounted) setLand(paths); }); return () => { mounted = false; }; }, []);
  const [selected, setSelected] = useState<number | null>(null);
  const [drawing, setDrawing] = useState(false);
  const [dragging, setDragging] = useState<number | null>(null);
  const ring = geometry.coordinates[0] || [];
  const closed = ring.length > 1 && ring[0][0] === ring[ring.length - 1][0] && ring[0][1] === ring[ring.length - 1][1];
  const points = closed ? ring.slice(0, -1) : ring;
  const words = locale === "fr" ? { title: "Territoire · coordonnées WGS84", hint: "Activez le dessin pour ajouter des sommets. Déplacez les points ou ajustez leurs coordonnées.", draw: "Ajouter des sommets", done: "Terminer le dessin", remove: "Supprimer le sommet", lon: "Longitude", lat: "Latitude", empty: "Cliquez sur la grille pour tracer le territoire", count: "sommets" } : locale === "ar" ? { title: "الإقليم · إحداثيات WGS84", hint: "فعّل الرسم لإضافة نقاط. اسحب النقاط أو عدّل إحداثياتها.", draw: "إضافة نقاط", done: "إنهاء الرسم", remove: "حذف النقطة", lon: "خط الطول", lat: "خط العرض", empty: "انقر على الشبكة لرسم الإقليم", count: "نقاط" } : { title: "Territory · WGS84 coordinates", hint: "Enable drawing to add vertices. Drag points or adjust their coordinates.", draw: "Add vertices", done: "Finish drawing", remove: "Remove vertex", lon: "Longitude", lat: "Latitude", empty: "Click the grid to draw a territory", count: "vertices" };
  const toScreen = ([lon, lat]: Position) => [(lon + 180) * 2, (90 - lat) * 2];
  const coordinateAt = (event: React.PointerEvent<SVGSVGElement>) => {
    const bounds = svg.current!.getBoundingClientRect();
    return [Number(Math.max(-180, Math.min(180, (event.clientX - bounds.left) / bounds.width * 360 - 180)).toFixed(3)), Number(Math.max(-90, Math.min(90, 90 - (event.clientY - bounds.top) / bounds.height * 180)).toFixed(3))];
  };
  function update(next: Position[]) { onChange({ type: "Polygon", coordinates: [next.length ? [...next, [...next[0]]] : [], ...geometry.coordinates.slice(1)] }); }
  function editCoordinate(index: number, value: number) {
    if (selected === null || !Number.isFinite(value)) return;
    const next = points.map(point => [...point]);
    next[selected][index] = value;
    update(next);
  }
  return <section className="geometry-editor">
    <div className="geometry-heading"><strong>{words.title}</strong><span>{points.length} {words.count}</span></div>
    <p>{words.hint}</p>
    <svg ref={svg} viewBox="0 0 720 360" preserveAspectRatio="none" role="img" aria-label={words.title} onPointerMove={event => { if (dragging !== null) { const next = points.map(point => [...point]); next[dragging] = coordinateAt(event); update(next); } }} onPointerUp={() => setDragging(null)} onPointerCancel={() => setDragging(null)} onPointerDown={event => { if (drawing && event.target === event.currentTarget) { update([...points, coordinateAt(event)]); setSelected(points.length); } }}>
      <defs><pattern id="coordinate-grid" width="60" height="60" patternUnits="userSpaceOnUse"><path className="geometry-grid" d="M 60 0 L 0 0 0 60" fill="none" stroke="#658b862e" strokeWidth="1" /></pattern></defs>
      <g className="geometry-land" fill="#d8e0cc" stroke="#c4d0b6" strokeWidth="0.5" fillRule="evenodd" pointerEvents="none">{land.map((path, index) => <path d={path} key={index} />)}</g>
      <rect width="720" height="360" fill="url(#coordinate-grid)" pointerEvents="none" />
      <path d="M0 180H720M360 0V360" stroke="#66887f77" strokeDasharray="4 5" pointerEvents="none" />
      <g className="geometry-coordinates" fill="#658179" fontSize="11" pointerEvents="none"><text x="7" y="174">0°</text><text x="362" y="354">0°</text><text x="5" y="15">90° N</text><text x="5" y="354">90° S</text><text x="678" y="354">180° E</text></g>
      {points.length > 1 && <path className="geometry-territory" fillRule="evenodd" d={geometry.coordinates.map(ring=>ring.map((point,index)=>`${index?"L":"M"}${toScreen(point).join(",")}`).join(" ")+" Z").join(" ")} fill="#2c6a5740" stroke="#245b49" strokeWidth="2" pointerEvents="none" />}
      {points.map((point, index) => { const [cx, cy] = toScreen(point); return <circle className="geometry-vertex" key={index} cx={cx} cy={cy} r={selected === index ? 6 : 4} fill={selected === index ? "#b39355" : "#fdfbf6"} stroke="#245b49" strokeWidth="2" style={{ cursor: "grab" }} onPointerDown={event => { event.stopPropagation(); setSelected(index); setDragging(index); svg.current?.setPointerCapture(event.pointerId); }} />; })}
      {!points.length && <text x="360" y="170" textAnchor="middle" fill="#607870" fontSize="14" pointerEvents="none">{words.empty}</text>}
    </svg>
    <div className="geometry-attribution">Natural Earth · WGS84</div>
    <div className="geometry-actions">{points.length > 0 && <label>{words.count}<select aria-label={words.count} value={selected === null ? "" : selected} onChange={event => setSelected(event.target.value === "" ? null : Number(event.target.value))}><option value="">—</option>{points.map((_, index) => <option key={index} value={index}>{index + 1}</option>)}</select></label>}<button type="button" className={drawing ? "studio-primary" : "studio-secondary"} onClick={() => setDrawing(!drawing)}>{drawing ? words.done : words.draw}</button>
      {selected !== null && points[selected] && <><label>{words.lon}<input type="number" min={-180} max={180} step="0.001" value={points[selected][0]} onChange={event => editCoordinate(0, Number(event.target.value))} /></label><label>{words.lat}<input type="number" min={-90} max={90} step="0.001" value={points[selected][1]} onChange={event => editCoordinate(1, Number(event.target.value))} /></label><button type="button" className="studio-text-button" disabled={points.length <= 3} onClick={() => { update(points.filter((_, index) => index !== selected)); setSelected(null); }}>{words.remove}</button></>}
    </div>
  </section>;
}
