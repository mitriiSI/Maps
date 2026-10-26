import { test } from "node:test";
import assert from "node:assert/strict";
import {
  analyze,
  applyFeedback,
  approve,
  blockedPoint,
  createDemo,
  detail,
  generateProposals,
  inside,
  requestChanges,
  revise,
  submitReview,
} from "../src/engine";
import { classify, joinOuterRings, normalizeOSM } from "../src/data";
import { importProject, validateProject } from "../src/storage";
import { buildReport } from "../src/report";

test("demo analysis has three shortages and does not treat surplus as a demolition instruction", () => {
  const p = createDemo(),
    analysis = analyze(p.dataset, p.population, p.bounds);
  assert.equal(analysis.filter((a) => a.status === "deficit").length, 3);
  assert.equal(analysis.find((a) => a.category === "food")?.status, "surplus");
  assert.equal(p.proposals.length, 3);
  assert.ok(p.proposals.every((r) => r.category !== "food"));
});
test("candidates stay inside the area, outside known buildings, parks, water and road buffers", () => {
  const p = createDemo();
  for (const r of p.proposals) {
    assert.ok(inside(r.point, p.bounds));
    assert.equal(blockedPoint(r.point, p.dataset.features), false);
    assert.ok(r.reason.join(" ").includes(r.point[0].toFixed(5)));
  }
});
test("objects outside the selected bounds are excluded and population is validated", () => {
  const p = createDemo();
  p.dataset.features.push({
    id: "outside",
    name: "School",
    kind: "poi",
    category: "school",
    point: [0, 0],
  });
  assert.equal(
    analyze(p.dataset, p.population, p.bounds).find(
      (a) => a.category === "school",
    )?.count,
    3,
  );
  for (const n of [0, -1, NaN, Infinity])
    assert.throws(() => analyze(p.dataset, n, p.bounds));
});
test("no speculative placement is generated when the entire area is occupied", () => {
  const p = createDemo(),
    b = p.bounds;
  const dataset = {
    ...p.dataset,
    features: [
      {
        id: "all-water",
        name: "",
        kind: "water" as const,
        point: [b[0], b[1]] as [number, number],
        geometry: [
          [b[0], b[1]],
          [b[0], b[3]],
          [b[2], b[3]],
          [b[2], b[1]],
          [b[0], b[1]],
        ] as [number, number][],
      },
    ],
  };
  assert.equal(generateProposals(dataset, p.population, b).length, 0);
});
test("approval is mandatory, named and only allowed after submission", () => {
  const p = createDemo();
  assert.throws(() => detail(p));
  assert.throws(() => approve(p, "Архитектор"));
  const review = submitReview(p);
  assert.throws(() => approve(review, "  "));
  assert.throws(() => detail(review));
  const approved = approve(review, "Анна Петрова");
  assert.equal(detail(approved).stage, "detailed");
  assert.equal(approved.approvedBy, "Анна Петрова");
  assert.throws(() =>
    revise(approved, {
      action: "note",
      proposalId: p.proposals[0].id,
      note: "change",
    }),
  );
});
test("review comments require an actual new revision before resubmission; the cycle can repeat", () => {
  let p = requestChanges(
    submitReview(createDemo()),
    "Архитектор",
    "Добавить отдельный вход",
  );
  assert.throws(() => submitReview(p), /Сначала внесите изменения/);
  assert.throws(() => requestChanges(p, "Архитектор", "Again"));
  p = revise(p, {
    action: "note",
    proposalId: p.proposals[0].id,
    note: "Предусмотрен отдельный вход с пешеходной улицы",
  });
  assert.equal(p.version, 2);
  assert.ok(p.proposals[0].note?.includes("отдельный вход"));
  p = requestChanges(submitReview(p), "Архитектор", "Уточнить благоустройство");
  p = revise(p, {
    action: "note",
    proposalId: p.proposals[0].id,
    note: "Добавлены требования к освещению и озеленению входа",
  });
  p = detail(approve(submitReview(p), "Архитектор"));
  assert.equal(p.version, 3);
  assert.equal(p.stage, "detailed");
  assert.equal(
    p.revisions.filter((r) => r.event === "Запрошены изменения").length,
    2,
  );
  assert.equal(
    p.revisions[0].proposals[0].note,
    undefined,
    "old snapshots are immutable",
  );
});
test("a move updates coordinates and explanation; invalid moves and unknown objects are rejected", () => {
  const p = createDemo(),
    old = p.proposals[0];
  assert.throws(() =>
    revise(p, {
      action: "move",
      proposalId: old.id,
      point: [0, 0],
      note: "outside",
    }),
  );
  assert.throws(() =>
    revise(p, { action: "remove", proposalId: "unknown", note: "remove" }),
  );
  const point = p.proposals[1].point;
  const result = revise(p, {
    action: "move",
    proposalId: old.id,
    point,
    note: "Размещение уточнено специалистом",
  });
  assert.deepEqual(result.proposals[0].point, point);
  assert.ok(result.proposals[0].reason.join(" ").includes(point[0].toFixed(5)));
  assert.notDeepEqual(p.proposals[0].point, point);
});
test("clear specialist commands move, add and remove objects and update their explanations", () => {
  const start = createDemo();
  const original = start.proposals.find((p) => p.category === "kindergarten")!;
  let p = requestChanges(
    submitReview(start),
    "Специалист",
    "Перенеси детский сад на север",
  );
  p = applyFeedback(p, "Перенеси детский сад на север");
  const moved = p.proposals.find((p) => p.category === "kindergarten")!;
  assert.ok(moved.point[0] > original.point[0]);
  assert.ok(moved.reason.join(" ").includes(moved.point[0].toFixed(5)));
  assert.equal(blockedPoint(moved.point, p.dataset.features), false);
  assert.equal(p.stage, "changes");
  assert.equal(p.version, 2);
  p = requestChanges(submitReview(p), "Специалист", "Добавь сквер на юге");
  p = applyFeedback(p, "Добавь сквер на юге");
  assert.equal(p.proposals.filter((p) => p.category === "green").length, 2);
  assert.throws(
    () => applyFeedback(p, "Перенеси сквер на север"),
    /однозначно/,
  );
  assert.throws(() => applyFeedback(p, "Сделай красиво"), /уточнить/);
  assert.throws(
    () => applyFeedback(p, "Перенеси детский сад на север и юг"),
    /направление/,
  );
  p = requestChanges(submitReview(p), "Специалист", "Убери медицинский центр");
  p = applyFeedback(p, "Убери медицинский центр");
  assert.equal(
    p.proposals.some((p) => p.category === "health"),
    false,
  );
});
test("OSM classification preserves building geometry, facilities and avoids named duplicate POIs", () => {
  assert.equal(classify({ amenity: "school" }), "school");
  assert.equal(classify({ healthcare: "doctor" }), "health");
  const geometry = [
    { lat: 55, lon: 37 },
    { lat: 55.001, lon: 37 },
    { lat: 55.001, lon: 37.001 },
    { lat: 55, lon: 37.001 },
  ];
  const f = normalizeOSM([
    {
      type: "way",
      id: 1,
      geometry,
      tags: { building: "school", amenity: "school", name: "Школа" },
    },
    {
      type: "node",
      id: 2,
      lat: 55.0005,
      lon: 37.0005,
      tags: { amenity: "school", name: "Школа" },
    },
    { type: "node", id: 3, lat: 55, lon: 37.01, tags: { highway: "bus_stop" } },
  ]);
  assert.equal(f.filter((x) => x.category === "school").length, 1);
  assert.equal(f[0].kind, "building");
  assert.equal(f[0].geometry?.length, 4);
  assert.equal(f[1].category, "transit");
});
test("OSM multipolygon water is joined from unordered ways and excluded from placement", () => {
  const a: [number, number] = [55, 37],
    b: [number, number] = [55, 38],
    c: [number, number] = [56, 38],
    d: [number, number] = [56, 37];
  const paths = [
    [a, b],
    [d, c],
    [a, d],
    [b, c],
  ];
  const rings = joinOuterRings(paths);
  assert.equal(rings.length, 1);
  assert.equal(rings[0].length, 5);
  const f = normalizeOSM([
    {
      type: "relation",
      id: 99,
      tags: { type: "multipolygon", natural: "water", name: "Река" },
      members: paths.map((p) => ({
        role: "outer",
        geometry: p.map((v) => ({ lat: v[0], lon: v[1] })),
      })),
    },
  ]);
  assert.equal(f[0].kind, "water");
  assert.equal(blockedPoint([55.5, 37.5], f), true);
  assert.equal(blockedPoint([54, 37.5], f), false);
});
test("project exchange validates geometry and review state", async () => {
  const p = createDemo();
  assert.ok(validateProject(p));
  const file = new File(
    [JSON.stringify({ format: "forma-project", schemaVersion: 1, project: p })],
    "project.json",
  );
  assert.deepEqual(await importProject(file), p);
  assert.equal(validateProject({ ...p, stage: "approved" }), false);
  assert.equal(validateProject({ ...p, bounds: [0, 0, Infinity, 1] }), false);
  assert.equal(
    validateProject({
      ...p,
      proposals: [
        { ...p.proposals[0], capacity: "<img src=x onerror=alert(1)>" },
      ],
    }),
    false,
  );
  await assert.rejects(importProject(new File(["{}"], "wrong.json")));
});
test("standalone report escapes user content and includes the model, explanations and review history", () => {
  const p = createDemo();
  p.name = "<script>alert(1)</script>";
  p.proposals[0].note = "<img src=x onerror=alert(1)>";
  const html = buildReport(p);
  assert.ok(!html.includes("<script>alert(1)</script>"));
  assert.ok(!html.includes("<img src=x"));
  assert.ok(html.includes("&lt;script&gt;"));
  assert.ok(html.includes("<svg"));
  assert.ok(html.includes("История согласования"));
  assert.ok(html.includes("синтетические данные"));
});
