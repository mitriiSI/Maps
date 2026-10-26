import { test } from "node:test";
import assert from "node:assert/strict";
import {
  approve,
  category,
  createDemo,
  detail,
  revise,
  submitReview,
} from "../src/engine";
import {
  checkPlot,
  createDetailedDesign,
  designGeo,
  designLocal,
  DESIGN_GENERATION,
  upgradeDetailedProject,
  validateDesign,
} from "../src/design";
import { importProject, validateProject } from "../src/storage";
import { buildReport } from "../src/report";
import type { CategoryId, Project, Proposal } from "../src/types";

const completed = () =>
  detail(approve(submitReview(createDemo()), "Архитектор"));
test("approval produces detailed site geometry, distinct concepts and equipment for every proposal", () => {
  const p = completed();
  assert.equal(p.designs?.length, p.proposals.length);
  for (const d of p.designs!) {
    assert.ok(validateDesign(d));
    assert.equal(d.sourceVersion, p.version);
    assert.equal(d.generation, DESIGN_GENERATION);
    assert.equal(d.fit, "fits");
    assert.equal(d.plot.length, 4);
    assert.ok(d.zones.length >= 3);
    assert.ok(d.paths.length >= 2);
    assert.ok(d.volumes.length >= 1);
    assert.ok(d.assets.length >= 15);
    assert.ok(d.materials.length >= 4);
    assert.ok(d.viewpoints.length >= 4);
    assert.deepEqual(
      d.anchor,
      p.proposals.find((r) => r.id === d.proposalId)!.point,
    );
    assert.ok(Math.abs(designLocal(d, d.anchor)[0]) <= d.width / 2);
    assert.ok(Math.abs(designLocal(d, d.anchor)[1]) <= d.depth / 2);
    assert.equal(
      checkPlot(p, d.anchor, d.angle, d.width, d.depth, [], d.offset).length,
      0,
    );
  }
  assert.equal(new Set(p.designs!.map((d) => d.title)).size, p.designs!.length);
});
test("park is a designed landscape: loop, active and quiet areas, pavilion, rain garden and clear entrance", () => {
  const park = completed().designs!.find((d) => d.category === "green")!;
  assert.deepEqual(
    new Set(park.zones.map((z) => z.id)),
    new Set(["quiet", "play", "plaza", "rain", "meadow"]),
  );
  const loop = park.paths.find((p) => p.id === "loop")!;
  assert.ok(loop.points.length >= 24);
  assert.ok(
    Math.hypot(
      loop.points[0][0] - loop.points.at(-1)![0],
      loop.points[0][1] - loop.points.at(-1)![1],
    ) < 1e-6,
  );
  for (const kind of [
    "tree",
    "bench",
    "lamp",
    "play",
    "pergola",
    "fountain",
    "bicycle",
  ])
    assert.ok(park.assets.some((a) => a.kind === kind));
  assert.ok(
    park.volumes.some((v) => v.id === "pavilion" && v.roof === "green"),
  );
  assert.equal(
    park.assets.filter(
      (a) =>
        a.kind === "tree" &&
        Math.abs(a.point[0]) < 3.35 &&
        a.point[1] > park.depth * 0.3,
    ).length,
    0,
    "no tree trunk obstructs the main entrance",
  );
  for (const volume of park.volumes) {
    assert.ok(Math.abs(volume.center[0]) + volume.width / 2 <= park.width / 2);
    assert.ok(Math.abs(volume.center[1]) + volume.depth / 2 <= park.depth / 2);
  }
});
test("all seven infrastructure categories have their own complete spatial programme", () => {
  const base = createDemo();
  base.bounds = [55.7, 37.62, 55.72, 37.66];
  base.dataset = {
    ...base.dataset,
    features: [
      {
        id: "road",
        name: "Тестовая улица",
        kind: "road",
        point: [55.7092, 37.64],
        geometry: [
          [55.7092, 37.63],
          [55.7092, 37.65],
        ],
      },
    ],
  };
  for (const cat of [
    "green",
    "school",
    "kindergarten",
    "health",
    "sport",
    "food",
    "transit",
  ] as CategoryId[]) {
    const proposal: Proposal = {
      id: `test-${cat}`,
      category: cat,
      point: [55.71, 37.64],
      title: category(cat).singular,
      reason: [],
      distance: 0,
      capacity: category(cat).capacity,
      priority: "Средний",
    };
    const d = createDetailedDesign(base, proposal);
    assert.ok(validateDesign(d), cat);
    assert.equal(d.fit, "fits", cat);
    assert.ok(d.context.access.length === 2);
    assert.equal(d.context.roadName, "Тестовая улица");
    assert.ok(
      d.volumes.every((v) => v.width > 0 && v.depth > 0 && v.height > 0),
    );
    assert.ok(d.viewpoints.some((v) => v.id === "street"));
  }
});
test("metre coordinates, rotation and site offsets round-trip to geographic placement", () => {
  for (const d of completed().designs!) {
    for (const point of [
      [0, 0],
      [d.width / 2, d.depth / 2],
      [-d.width / 2, -d.depth / 2],
    ] as [number, number][]) {
      const roundtrip = designLocal(d, designGeo(d, point));
      assert.ok(Math.abs(roundtrip[0] - point[0]) < 0.001);
      assert.ok(Math.abs(roundtrip[1] - point[1]) < 0.001);
    }
  }
});
test("a blocked plot is explicitly flagged and never reported as fitting", () => {
  const p = createDemo(),
    b = p.bounds;
  p.dataset.features = [
    {
      id: "water",
      name: "Водоём",
      kind: "water",
      point: p.proposals[0].point,
      geometry: [
        [b[0], b[1]],
        [b[0], b[3]],
        [b[2], b[3]],
        [b[2], b[1]],
        [b[0], b[1]],
      ],
    },
  ];
  const d = createDetailedDesign(p, p.proposals[0]);
  assert.equal(d.fit, "needs-review");
  assert.ok(d.fitNotes.some((s) => s.includes("пересекает")));
  assert.ok(d.fitNotes.some((s) => s.includes("подход")));
});
test("crossing plots with no contained vertices are detected as overlaps", () => {
  const p = createDemo();
  p.dataset.features = [];
  const anchor: [number, number] = [55.707, 37.633],
    frame = { anchor, angle: 0 };
  const thin = [
    [-50, -3],
    [50, -3],
    [50, 3],
    [-50, 3],
  ].map((v) => designGeo(frame, v as [number, number]));
  assert.ok(
    checkPlot(p, anchor, 0, 6, 100, [thin]).some((s) =>
      s.includes("другой проектируемый"),
    ),
  );
});
test("legacy approved projects upgrade without moving approved points or losing history", () => {
  const original = completed();
  const legacy: Project = { ...original, designs: undefined };
  const upgraded = upgradeDetailedProject(legacy);
  assert.ok(upgraded.designs?.length);
  assert.deepEqual(upgraded.proposals, legacy.proposals);
  assert.deepEqual(upgraded.revisions, legacy.revisions);
  assert.equal(upgraded.approvedBy, legacy.approvedBy);
  assert.equal(upgraded.version, legacy.version);
  assert.equal(upgradeDetailedProject(upgraded), upgraded);
});
test("a new revision invalidates detailed geometry and imported projects preserve valid geometry", async () => {
  const p = completed();
  const revised = revise(
    { ...p, stage: "draft" },
    {
      action: "note",
      proposalId: p.proposals[0].id,
      note: "Уточнить требования к доступности входа",
    },
  );
  assert.equal(revised.designs, undefined);
  const imported = await importProject(
    new File(
      [
        JSON.stringify({
          format: "forma-project",
          schemaVersion: 1,
          project: p,
        }),
      ],
      "design.json",
    ),
  );
  assert.deepEqual(imported.designs, p.designs);
  assert.ok(validateProject(imported));
  for (const patch of [
    { width: Infinity },
    { assets: [{ id: "bad", kind: "tree", point: ["oops", 0], rotation: 0 }] },
    { volumes: [{ id: "bad", height: -10 }] },
    { offset: [NaN, 0] },
  ])
    assert.equal(
      validateProject({ ...p, designs: [{ ...p.designs![0], ...patch }] }),
      false,
    );
});
test("the project report includes dimensioned site plans, concepts, materials and coordinates", () => {
  const p = completed();
  const html = buildReport(p);
  assert.ok(html.includes("Экспликация зон"));
  assert.ok(html.includes("Дождевой сад"));
  assert.ok(html.includes("Координаты углов"));
  assert.ok(html.includes("Этапы реализации"));
  assert.ok(html.includes("Натуральная древесина"));
  assert.equal((html.match(/<svg/g) || []).length, 1 + p.designs!.length);
});
