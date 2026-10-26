import type { Project } from "./types";
import { CATEGORIES, createDemo } from "./engine";
const KEY = "forma-maps-projects-v1";
export function validateProject(p: unknown): p is Project {
  if (!p || typeof p !== "object") return false;
  const x = p as Project;
  const point = (v: unknown) =>
    Array.isArray(v) &&
    v.length === 2 &&
    v.every((n) => typeof n === "number" && Number.isFinite(n)) &&
    Math.abs(v[0]) <= 90 &&
    Math.abs(v[1]) <= 180;
  const proposal = (v: Project["proposals"][number]) =>
    v &&
    typeof v.id === "string" &&
    CATEGORIES.some((c) => c.id === v.category) &&
    point(v.point) &&
    typeof v.title === "string" &&
    Array.isArray(v.reason) &&
    v.reason.every((s) => typeof s === "string") &&
    Number.isFinite(v.capacity) &&
    v.capacity > 0 &&
    Number.isFinite(v.distance) &&
    v.distance >= 0 &&
    ["Высокий", "Средний"].includes(v.priority) &&
    (v.note === undefined || typeof v.note === "string");
  return (
    typeof x.id === "string" &&
    typeof x.name === "string" &&
    typeof x.location === "string" &&
    Array.isArray(x.bounds) &&
    x.bounds.length === 4 &&
    point(x.bounds.slice(0, 2)) &&
    point(x.bounds.slice(2)) &&
    x.bounds[0] < x.bounds[2] &&
    x.bounds[1] < x.bounds[3] &&
    Number.isFinite(x.population) &&
    x.population > 0 &&
    Number.isInteger(x.version) &&
    x.version > 0 &&
    ["draft", "review", "changes", "approved", "detailed"].includes(x.stage) &&
    typeof x.updatedAt === "string" &&
    !!x.dataset &&
    ["demo", "osm"].includes(x.dataset.source) &&
    typeof x.dataset.fetchedAt === "string" &&
    Array.isArray(x.dataset.features) &&
    x.dataset.features.every(
      (f) =>
        typeof f.id === "string" &&
        typeof f.name === "string" &&
        point(f.point) &&
        ["poi", "building", "road", "park", "water"].includes(f.kind) &&
        (!f.category || CATEGORIES.some((c) => c.id === f.category)) &&
        (!f.geometry ||
          (Array.isArray(f.geometry) && f.geometry.every(point))) &&
        (!f.polygons ||
          (Array.isArray(f.polygons) &&
            f.polygons.every(
              (poly) => Array.isArray(poly) && poly.every(point),
            ))),
    ) &&
    Array.isArray(x.proposals) &&
    x.proposals.every(proposal) &&
    Array.isArray(x.revisions) &&
    x.revisions.every(
      (r) =>
        Number.isInteger(r.version) &&
        typeof r.event === "string" &&
        typeof r.author === "string" &&
        typeof r.createdAt === "string" &&
        (r.comment === undefined || typeof r.comment === "string") &&
        Array.isArray(r.proposals) &&
        r.proposals.every(proposal),
    ) &&
    (!["approved", "detailed"].includes(x.stage) ||
      (typeof x.approvedBy === "string" &&
        !!x.approvedBy.trim() &&
        typeof x.approvedAt === "string"))
  );
}
export function loadProjects(): Project[] {
  try {
    const saved = JSON.parse(localStorage.getItem(KEY) || "null");
    if (Array.isArray(saved) && saved.length && saved.every(validateProject))
      return saved;
  } catch {
    /* Invalid or unavailable browser storage: open demo. */
  }
  return [createDemo()];
}
export function saveProjects(projects: Project[]) {
  localStorage.setItem(KEY, JSON.stringify(projects));
}
export function download(
  name: string,
  data: string,
  type = "application/json",
) {
  const url = URL.createObjectURL(new Blob([data], { type }));
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
export function exportProject(project: Project) {
  download(
    `forma-${project.id}-v${project.version}.json`,
    JSON.stringify(
      { format: "forma-project", schemaVersion: 1, project },
      null,
      2,
    ),
  );
}
export async function importProject(file: File): Promise<Project> {
  if (file.size > 15 * 1024 * 1024)
    throw new Error("Размер файла не должен превышать 15 МБ.");
  const data = JSON.parse(await file.text());
  if (
    data.format !== "forma-project" ||
    data.schemaVersion !== 1 ||
    !validateProject(data.project)
  )
    throw new Error("Файл не соответствует формату проекта «Форма».");
  return data.project;
}
