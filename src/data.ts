import type { Bounds, CategoryId, Dataset, Feature, Point } from "./types";
import { areaKm2 } from "./engine";

type OSMElement = {
  type: string;
  id: number;
  lat?: number;
  lon?: number;
  center?: { lat: number; lon: number };
  geometry?: { lat: number; lon: number }[];
  members?: { geometry?: { lat: number; lon: number }[]; role?: string }[];
  tags?: Record<string, string>;
};
export function joinOuterRings(paths: Point[][]): Point[][] {
  const remaining = paths.filter((p) => p.length > 1).map((p) => [...p]),
    rings: Point[][] = [];
  const equal = (a: Point, b: Point) =>
    Math.abs(a[0] - b[0]) < 0.0000001 && Math.abs(a[1] - b[1]) < 0.0000001;
  while (remaining.length) {
    let ring = remaining.shift()!;
    while (!equal(ring[0], ring.at(-1)!)) {
      const index = remaining.findIndex(
        (path) =>
          equal(path[0], ring.at(-1)!) ||
          equal(path.at(-1)!, ring.at(-1)!) ||
          equal(path[0], ring[0]) ||
          equal(path.at(-1)!, ring[0]),
      );
      if (index < 0) break;
      let next = remaining.splice(index, 1)[0];
      if (equal(next[0], ring.at(-1)!)) ring = [...ring, ...next.slice(1)];
      else if (equal(next.at(-1)!, ring.at(-1)!))
        ring = [...ring, ...next.reverse().slice(1)];
      else {
        if (equal(next[0], ring[0])) next = next.reverse();
        ring = [...next.slice(0, -1), ...ring];
      }
    }
    if (ring.length >= 4 && equal(ring[0], ring.at(-1)!)) rings.push(ring);
  }
  return rings.sort((a, b) => b.length - a.length);
}
export function classify(t: Record<string, string>): CategoryId | undefined {
  if (t.amenity === "school") return "school";
  if (t.amenity === "kindergarten") return "kindergarten";
  if (
    ["clinic", "hospital", "doctors"].includes(t.amenity) ||
    ["clinic", "hospital", "doctor"].includes(t.healthcare)
  )
    return "health";
  if (
    ["park", "garden"].includes(t.leisure) ||
    t.landuse === "recreation_ground"
  )
    return "green";
  if (
    ["sports_centre", "fitness_centre", "pitch", "playground"].includes(
      t.leisure,
    )
  )
    return "sport";
  if (["supermarket", "convenience", "greengrocer"].includes(t.shop))
    return "food";
  if (
    t.highway === "bus_stop" ||
    ["station", "tram_stop"].includes(t.railway) ||
    t.public_transport === "platform"
  )
    return "transit";
}
export function normalizeOSM(elements: OSMElement[]): Feature[] {
  const result: Feature[] = [];
  for (const e of elements) {
    const tags = e.tags || {},
      cat = classify(tags);
    const toPoints = (raw: { lat: number; lon: number }[]) =>
      raw
        .filter((p) => Number.isFinite(p.lat) && Number.isFinite(p.lon))
        .map((p) => [p.lat, p.lon] as Point);
    const polygons = e.members
      ? joinOuterRings(
          e.members
            .filter((m) => m.role === "outer" || !m.role)
            .map((m) => toPoints(m.geometry || [])),
        )
      : undefined;
    const geometry = e.geometry ? toPoints(e.geometry) : polygons?.[0];
    const point: Point | undefined =
      e.lat !== undefined && e.lon !== undefined
        ? [e.lat, e.lon]
        : e.center
          ? [e.center.lat, e.center.lon]
          : geometry?.length
            ? [
                geometry.reduce((s, p) => s + p[0], 0) / geometry.length,
                geometry.reduce((s, p) => s + p[1], 0) / geometry.length,
              ]
            : undefined;
    if (!point || !point.every(Number.isFinite)) continue;
    const kind: Feature["kind"] | undefined =
      tags.building && tags.building !== "no"
        ? "building"
        : tags.natural === "water" || tags.waterway === "riverbank"
          ? "water"
          : cat === "green"
            ? "park"
            : tags.highway && e.type === "way"
              ? "road"
              : cat
                ? "poi"
                : undefined;
    if (!kind && !cat) continue;
    result.push({
      id: `${e.type}/${e.id}`,
      point,
      name: tags.name || "",
      category: cat,
      kind: kind || "poi",
      geometry,
      polygons,
      levels: Math.min(40, Math.max(1, Number(tags["building:levels"]) || 3)),
      major: ["primary", "secondary", "trunk"].includes(tags.highway),
    });
  }
  // The same named facility can be represented by a building and a POI node.
  return result.filter(
    (f, i) =>
      !f.category ||
      !f.name ||
      !result
        .slice(0, i)
        .some(
          (g) =>
            g.category === f.category &&
            g.name === f.name &&
            Math.abs(g.point[0] - f.point[0]) < 0.0003 &&
            Math.abs(g.point[1] - f.point[1]) < 0.0003,
        ),
  );
}
export async function loadOSM(
  bounds: Bounds,
  signal?: AbortSignal,
): Promise<Dataset> {
  if (areaKm2(bounds) > 10 || areaKm2(bounds) < 0.02)
    throw new Error("Выберите участок площадью от 0,02 до 10 км².");
  const bbox = bounds.join(",");
  const query = `[out:json][timeout:30][maxsize:33554432];(nwr[amenity~"^(school|kindergarten|clinic|hospital|doctors)$"](${bbox});nwr[healthcare~"^(clinic|hospital|doctor)$"](${bbox});nwr[leisure~"^(park|garden|sports_centre|fitness_centre|pitch|playground)$"](${bbox});nwr[shop~"^(supermarket|convenience|greengrocer)$"](${bbox});nwr[highway=bus_stop](${bbox});nwr[public_transport=platform](${bbox});nwr[railway~"^(station|tram_stop)$"](${bbox});nwr[building](${bbox});way[highway](${bbox});nwr[natural=water](${bbox});nwr[waterway=riverbank](${bbox});way[landuse=recreation_ground](${bbox}););out geom;`;
  let error = "Сервис OpenStreetMap временно недоступен.";
  for (const endpoint of [
    "https://overpass-api.de/api/interpreter",
    "https://overpass.kumi.systems/api/interpreter",
  ]) {
    if (signal?.aborted) throw new DOMException("Отменено", "AbortError");
    try {
      const response = await fetch(endpoint, {
        method: "POST",
        body: new URLSearchParams({ data: query }),
        signal: signal
          ? AbortSignal.any([signal, AbortSignal.timeout(45000)])
          : AbortSignal.timeout(45000),
      });
      if (!response.ok) throw new Error(`Overpass: HTTP ${response.status}`);
      const json = await response.json();
      if (json.remark)
        throw new Error(
          "Запрос слишком большой или сервис перегружен. Выберите участок меньше.",
        );
      if (!Array.isArray(json.elements))
        throw new Error("Сервис вернул неполные данные.");
      return {
        source: "osm",
        fetchedAt: new Date().toISOString(),
        features: normalizeOSM(json.elements),
      };
    } catch (e) {
      if (signal?.aborted) throw e;
      error = e instanceof Error ? e.message : error;
    }
  }
  throw new Error(
    `${error} Попробуйте ещё раз или откройте демонстрационный проект.`,
  );
}
export type SearchResult = {
  place_id: number;
  display_name: string;
  lat: string;
  lon: string;
  boundingbox: string[];
};
let lastSearch = 0;
export async function searchPlaces(query: string): Promise<SearchResult[]> {
  if (Date.now() - lastSearch < 1100)
    throw new Error("Подождите секунду перед следующим поиском.");
  lastSearch = Date.now();
  const url = new URL("https://nominatim.openstreetmap.org/search");
  url.search = new URLSearchParams({
    q: query,
    format: "json",
    limit: "4",
    "accept-language": "ru",
  }).toString();
  const r = await fetch(url, { signal: AbortSignal.timeout(15000) });
  if (!r.ok)
    throw new Error("Поиск адресов недоступен. Выберите участок на карте.");
  return r.json();
}
