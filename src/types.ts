export type CategoryId =
  | "school"
  | "kindergarten"
  | "health"
  | "green"
  | "sport"
  | "food"
  | "transit";
export type Point = [number, number];
export type Bounds = [number, number, number, number];
export type Feature = {
  id: string;
  point: Point;
  name: string;
  category?: CategoryId;
  kind: "poi" | "building" | "road" | "park" | "water";
  geometry?: Point[];
  polygons?: Point[][];
  levels?: number;
  major?: boolean;
};
export type Dataset = {
  source: "demo" | "osm";
  fetchedAt: string;
  features: Feature[];
};
export type AnalysisItem = {
  category: CategoryId;
  count: number;
  target: number;
  deficit: number;
  ratio: number;
  status: "deficit" | "balanced" | "surplus";
};
export type Proposal = {
  id: string;
  category: CategoryId;
  point: Point;
  title: string;
  reason: string[];
  distance: number;
  capacity: number;
  priority: "Высокий" | "Средний";
  edited?: boolean;
  note?: string;
};
export type Stage = "draft" | "review" | "changes" | "approved" | "detailed";
export type Revision = {
  version: number;
  createdAt: string;
  author: string;
  event: string;
  comment?: string;
  proposals: Proposal[];
};
/** Local plan coordinates: x = east, z = south, dimensions in metres. */
export type PlanPoint = [number, number];
export type PlanSurface =
  | "grass"
  | "pavers"
  | "rubber"
  | "sand"
  | "deck"
  | "planting";
export type PlanZone = {
  id: string;
  name: string;
  description: string;
  polygon: PlanPoint[];
  surface: PlanSurface;
  color: string;
};
export type PlanPath = {
  id: string;
  name: string;
  points: PlanPoint[];
  width: number;
  color: string;
};
export type PlanVolume = {
  id: string;
  name: string;
  center: PlanPoint;
  width: number;
  depth: number;
  height: number;
  floors: number;
  color: string;
  roof: "flat" | "green" | "canopy";
};
export type AssetKind =
  | "tree"
  | "bench"
  | "lamp"
  | "bin"
  | "bicycle"
  | "pergola"
  | "play"
  | "flowerbed"
  | "sign"
  | "sports"
  | "fountain";
export type PlanAsset = {
  id: string;
  kind: AssetKind;
  point: PlanPoint;
  rotation: number;
  variant?: number;
};
export type PlanEntrance = {
  id: string;
  name: string;
  point: PlanPoint;
  width: number;
  kind: "main" | "secondary" | "service";
};
export type PlanViewpoint = {
  id: string;
  name: string;
  position: PlanPoint;
  target: PlanPoint;
};
export type DetailedDesign = {
  id: string;
  proposalId: string;
  generation: number;
  sourceVersion: number;
  category: CategoryId;
  anchor: Point;
  angle: number;
  offset: PlanPoint;
  width: number;
  depth: number;
  plot: Point[];
  title: string;
  subtitle: string;
  narrative: string[];
  fit: "fits" | "needs-review";
  fitNotes: string[];
  zones: PlanZone[];
  paths: PlanPath[];
  volumes: PlanVolume[];
  assets: PlanAsset[];
  entrances: PlanEntrance[];
  viewpoints: PlanViewpoint[];
  materials: { name: string; use: string; color: string }[];
  program: { name: string; value: string }[];
  context: {
    roadName: string;
    roadPoint?: Point;
    roadDistance?: number;
    access: Point[];
    accessClear: boolean;
    neighbors: { name: string; distance: number; point: Point }[];
  };
  phases: string[];
  requirements: string[];
};
export type Project = {
  id: string;
  name: string;
  location: string;
  bounds: Bounds;
  population: number;
  dataset: Dataset;
  proposals: Proposal[];
  stage: Stage;
  version: number;
  revisions: Revision[];
  approvedBy?: string;
  approvedAt?: string;
  updatedAt: string;
  designs?: DetailedDesign[];
};
