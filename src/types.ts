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
};
