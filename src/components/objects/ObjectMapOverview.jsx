import React from "react";
import { Building2, LandPlot } from "lucide-react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { featureCollectionAreaSquareMeters, normalizeFeatureCollection } from "./objectMapGeometry";

const MAX_ROWS = 100;
const text = (value, maximum = 160) => typeof value === "string" ? value.replace(/[\u0000-\u001f\u007f]/g, " ").trim().slice(0, maximum) : "";
const identifier = value => text(typeof value === "number" && Number.isFinite(value) ? String(value) : value);
const features = value => normalizeFeatureCollection(value).features.slice(0, MAX_ROWS);
const featureId = feature => identifier(feature?.properties?.source_feature_id)
  || identifier(feature?.properties?.pdok_feature_id) || identifier(feature?.properties?.bag_feature_id)
  || identifier(feature?.id) || identifier(feature?.properties?.identificatie);
const manualId = feature => identifier(feature?.properties?.local_id) || identifier(feature?.id);

function knownArea(feature) {
  const geometry = feature?.geometry;
  const polygons = geometry?.type === "Polygon" ? [geometry.coordinates]
    : geometry?.type === "MultiPolygon" ? geometry.coordinates : null;
  if (!Array.isArray(polygons) || !polygons.length || polygons.length > MAX_ROWS) return null;
  let pointCount = 0;
  for (const polygon of polygons) {
    if (!Array.isArray(polygon) || !polygon.length || polygon.length > MAX_ROWS) return null;
    for (const ring of polygon) {
      if (!Array.isArray(ring) || ring.length < 4 || (pointCount += ring.length) > 10_000
        || !ring.every(point => Array.isArray(point) && point.length >= 2
          && typeof point[0] === "number" && Number.isFinite(point[0]) && Math.abs(point[0]) <= 180
          && typeof point[1] === "number" && Number.isFinite(point[1]) && Math.abs(point[1]) <= 90)
        || ring[0][0] !== ring.at(-1)[0] || ring[0][1] !== ring.at(-1)[1]) return null;
    }
  }
  try {
    const area = featureCollectionAreaSquareMeters(feature);
    return Number.isFinite(area) && area > 0 ? area : null;
  } catch { return null; }
}

function areaLabel(area) {
  if (area === null) return "Onbekend";
  if (area >= 10_000) return `${new Intl.NumberFormat("nl-NL", { maximumFractionDigits: 2 }).format(area / 10_000)} ha`;
  if (area < 1) return "< 1 m²";
  return `${new Intl.NumberFormat("nl-NL", { maximumFractionDigits: 0 }).format(area)} m²`;
}

function buildingRows(configuration) {
  const automatic = configuration.building_selection_mode === "automatic";
  const stored = features(configuration.building_polygon_geojson);
  const explicitManual = features(configuration.manual_building_geojson);
  const manualKeys = new Set(explicitManual.map(manualId).filter(Boolean));
  const isManual = feature => ["manual", "user_drawn"].includes(feature?.properties?.source)
    || Boolean(manualId(feature) && manualKeys.has(manualId(feature)));
  const isBag = feature => !isManual(feature) && (feature?.properties?.source === "pdok_bag"
    || identifier(feature?.properties?.source_feature_id) || identifier(feature?.properties?.bag_feature_id)
    || identifier(feature?.properties?.pdok_feature_id));
  const bagFeatures = new Map();
  stored.filter(isBag).forEach(feature => {
    const id = featureId(feature);
    if (id && (!bagFeatures.has(id) || knownArea(bagFeatures.get(id)) === null)) bagFeatures.set(id, feature);
  });
  // An explicit saved selection is authoritative, including deliberately empty
  // manual selections. Never add unselected candidate IDs to this inventory.
  const bagIds = automatic || !Array.isArray(configuration.selected_bag_feature_ids)
    ? [...bagFeatures.keys()]
    : [...new Set(configuration.selected_bag_feature_ids.slice(0, MAX_ROWS).map(identifier).filter(Boolean))];
  const labels = configuration.building_labels;
  const nameFor = (key, fallback) => text(labels?.[key], 100) || fallback;
  const rows = bagIds.map(id => {
    const feature = bagFeatures.get(id) || stored.find(item => !isManual(item) && featureId(item) === id);
    const identification = identifier(feature?.properties?.source_identificatie)
      || identifier(feature?.properties?.identificatie) || id;
    return { key: `bag:${id}`, name: nameFor(`bag:${id}`, `BAG-pand ${identification}`),
      source: "BAG / Kadaster", identification, area: knownArea(feature) };
  });
  if (!automatic) {
    const seenPoints = new Set();
    (Array.isArray(configuration.building_selection_points) ? configuration.building_selection_points : []).slice(0, MAX_ROWS).forEach((point, index) => {
      const id = identifier(point?.id);
      if (!id || seenPoints.has(id)) return;
      seenPoints.add(id);
      rows.push({ key: `point:${id}`, name: nameFor(`point:${id}`, `Gebouw ${index + 1} zonder BAG-koppeling`),
        source: "Kaartselectie · zonder BAG", identification: "Geen BAG-identificatie", area: null });
    });
  }
  const seenManualIds = new Set();
  const explicitManualGeometries = new Set(explicitManual.map(feature => JSON.stringify(feature.geometry)));
  let manualIndex = 0;
  // The API returns manual contours both separately and inside its combined
  // persisted collection. Prefer the separate record; never count it twice.
  const manual = [...explicitManual, ...stored.filter(feature => !isBag(feature)
    && !bagIds.includes(featureId(feature)) && !explicitManualGeometries.has(JSON.stringify(feature.geometry)))];
  manual.forEach(feature => {
    const id = manualId(feature);
    if (id && seenManualIds.has(id)) return;
    if (id) seenManualIds.add(id);
    manualIndex += 1;
    const key = `manual:${id || `legacy-${manualIndex}`}`;
    rows.push({ key, name: nameFor(key, `Eerder ingetekend gebouw ${manualIndex}`),
      source: "Eigen contour · zonder BAG", identification: "Geen BAG-identificatie", area: knownArea(feature) });
  });
  return rows;
}

/** Saved records only: no candidate fetching, map mounting or form mutation. */
export function objectMapInventoryRows(configuration = {}, workspace = "buildings") {
  const saved = configuration && typeof configuration === "object" ? configuration : {};
  if (workspace !== "terrain") return buildingRows(saved);
  return features(saved.object_area_geojson).map((feature, index) => {
    const properties = feature.properties || {};
    const origin = text(properties.derived_from);
    return { key: `terrain:${identifier(feature.id) || index}`, name: text(properties.name, 100) || text(properties.label, 100) || `Terreindeel ${index + 1}`,
      source: origin === "pdok_brk" ? "Kadastraal perceel (PDOK)" : origin || "Eigen terreinbegrenzing",
      identification: identifier(properties.derived_from_id) || "Niet vastgelegd", area: knownArea(feature) };
  });
}

export default function ObjectMapOverview({ configuration, workspace = "buildings" }) {
  const terrain = workspace === "terrain";
  const automatic = !terrain && configuration?.building_selection_mode === "automatic";
  const rows = objectMapInventoryRows(configuration, workspace);
  const Icon = terrain ? LandPlot : Building2;
  return <div>
    {automatic && <div className="border-b border-border/60 bg-card/25 px-6 py-4 text-sm text-muted-foreground">
      <p className="font-medium text-foreground">Gebouwen worden automatisch bepaald</p>
      <p className="mt-1">De kaart bepaalt gebouwen op basis van de adresnabijheid. Er is geen handmatige gebouwselectie opgeslagen.</p>
      {rows.length > 0 && <p className="mt-1">Hieronder staan eerder opgeslagen contouren; deze zijn geen handmatige selectie voor de huidige automatische weergave.</p>}
    </div>}
    {rows.length > 0 ? <>
      <Table aria-label={terrain ? "Opgeslagen terreinen" : "Opgeslagen gebouwen"} className="min-w-[560px]">
        <TableHeader><TableRow className="bg-card/25 hover:bg-card/25">
          <TableHead className="px-6">Naam</TableHead><TableHead>Bron</TableHead><TableHead>Identificatie</TableHead><TableHead className="px-6 text-right">Oppervlakte</TableHead>
        </TableRow></TableHeader>
        <TableBody>{rows.map(row => <TableRow key={row.key}>
          <TableCell className="max-w-xs px-6 py-4 font-medium"><span className="break-words">{row.name}</span></TableCell>
          <TableCell className="text-muted-foreground">{row.source}</TableCell>
          <TableCell className="max-w-xs break-words text-muted-foreground">{row.identification}</TableCell>
          <TableCell className="whitespace-nowrap px-6 text-right tabular-nums">{areaLabel(row.area)}</TableCell>
        </TableRow>)}</TableBody>
      </Table>
      <p className="border-t border-border/60 px-6 py-3 text-xs text-muted-foreground">Oppervlakten zijn berekend uit de opgeslagen contouren.{terrain ? " Aangepaste grenzen kunnen afwijken van het oorspronkelijke kadastrale perceel." : " Zonder opgeslagen contour is de oppervlakte onbekend."}</p>
    </> : !automatic && <div className="flex min-h-52 flex-col items-center justify-center px-6 py-10 text-center">
      <Icon aria-hidden="true" className="mb-3 h-7 w-7 text-muted-foreground" />
      <p className="text-sm font-medium">{terrain ? "Nog geen terrein vastgelegd" : configuration?.building_selection_mode === "manual" ? "Bewust geen gebouwen gemarkeerd" : "Nog geen gebouwen vastgelegd"}</p>
      <p className="mt-1 max-w-md text-sm text-muted-foreground">{terrain ? "Er is nog geen terreinbegrenzing opgeslagen voor dit object." : configuration?.building_selection_mode === "manual" ? "De opgeslagen handmatige selectie is leeg. Er wordt geen gebouw gemarkeerd." : "Er zijn nog geen gebouwcontouren of eigen gebouwselecties opgeslagen voor dit object."}</p>
    </div>}
  </div>;
}
