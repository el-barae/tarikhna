"use client";

import { useMemo, useRef } from "react";
import { useTheme } from "./ThemeProvider";
import { formatDataset } from "@history/core";
import CodeMirror, { type ReactCodeMirrorRef } from "@uiw/react-codemirror";
import { json, jsonParseLinter } from "@codemirror/lang-json";
import { linter, lintGutter } from "@codemirror/lint";
import { autocompletion, type CompletionContext } from "@codemirror/autocomplete";
import { openSearchPanel } from "@codemirror/search";
import { redo, undo } from "@codemirror/commands";

const fields = ["metadata", "periods", "states", "cities", "events", "people", "routes", "sources", "id", "name", "title", "version", "lastUpdated", "language", "schemaVersion", "status", "description", "startYear", "endYear", "capitals", "city", "from", "to", "precision", "role", "polityType", "polityPeriods", "details", "dynasty", "color", "territories", "geometry", "type", "features", "properties", "stateId", "cityId", "cityIds", "coordinates", "control", "suzerainId", "landClipped", "startPrecision", "endPrecision", "startHijri", "endHijri", "certainty", "names", "aliases", "foundedYear", "foundedPrecision", "latitude", "longitude", "activeFrom", "activeUntil", "importance", "location", "relatedStates", "relatedPeople", "birthYear", "deathYear", "birthPlace", "deathPlace", "birthPrecision", "deathPrecision", "birthPlaceType", "foundingFigure", "honorific", "roles", "author", "publicationYear", "url", "permanentUrl", "accessedDate", "license", "verification", "locator", "notes", "fr", "en", "ar"];

function completeFields(context: CompletionContext) {
  const token = context.matchBefore(/[\w-]*/);
  if (!token || (!context.explicit && token.from === token.to)) return null;
  return { from: token.from, options: fields.map(label => ({ label, type: "property" })) };
}

export default function JsonEditor({ value, onChange, locale = "fr" }: { value: string; onChange: (value: string) => void; locale?: "fr" | "en" | "ar" }) {
  const { theme } = useTheme();
  const editor = useRef<ReactCodeMirrorRef>(null);
  const extensions = useMemo(() => [json(), linter(jsonParseLinter()), lintGutter(), autocompletion({ override: [completeFields] })], []);
  const labels = locale === "fr" ? ["Formater", "Annuler", "Rétablir", "Rechercher", "Éditeur JSON"] : locale === "ar" ? ["تنسيق", "تراجع", "إعادة", "بحث", "محرر JSON"] : ["Format", "Undo", "Redo", "Search", "JSON editor"];
  return <div className="json-editor" dir="ltr">
    <div className="json-toolbar">
      <span className="file-chip">{ "{ }" } islamic-history.json</span>
      <div>
        <button type="button" onClick={() => { try { onChange(formatDataset(JSON.parse(value))); } catch { editor.current?.view?.focus(); } }}>{labels[0]}</button>
        <button type="button" onClick={() => { if (editor.current?.view) undo(editor.current.view); }}>{labels[1]}</button>
        <button type="button" onClick={() => { if (editor.current?.view) redo(editor.current.view); }}>{labels[2]}</button>
        <button type="button" onClick={() => { if (editor.current?.view) openSearchPanel(editor.current.view); }}>{labels[3]}</button>
      </div>
    </div>
    <CodeMirror theme={theme} ref={editor} value={value} extensions={extensions} onChange={onChange} height="min(56vh, 640px)" aria-label={labels[4]} basicSetup={{ lineNumbers: true, foldGutter: true, highlightActiveLine: true, bracketMatching: true, closeBrackets: true, searchKeymap: true }} />
    <div className="json-editor-hint">JSON · UTF-8 · GeoJSON · Ctrl / ⌘ + F</div>
  </div>;
}
