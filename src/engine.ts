import type {
  AnalysisItem,
  Bounds,
  CategoryId,
  Dataset,
  Feature,
  Point,
  Project,
  Proposal,
} from "./types";

export const CATEGORIES: {
  id: CategoryId;
  label: string;
  singular: string;
  color: string;
  per1000: number;
  radius: number;
  capacity: number;
  unit: string;
}[] = [
  {
    id: "school",
    label: "Школы",
    singular: "Школа",
    color: "#648ad0",
    per1000: 0.24,
    radius: 750,
    capacity: 550,
    unit: "мест",
  },
  {
    id: "kindergarten",
    label: "Детские сады",
    singular: "Детский сад",
    color: "#e0a549",
    per1000: 0.47,
    radius: 350,
    capacity: 180,
    unit: "мест",
  },
  {
    id: "health",
    label: "Медицина",
    singular: "Медицинский центр",
    color: "#d97982",
    per1000: 0.24,
    radius: 700,
    capacity: 120,
    unit: "посещений / смену",
  },
  {
    id: "green",
    label: "Зелёные зоны",
    singular: "Сквер",
    color: "#6b9d80",
    per1000: 0.35,
    radius: 500,
    capacity: 150,
    unit: "посетителей",
  },
  {
    id: "sport",
    label: "Спорт",
    singular: "Спортивная площадка",
    color: "#a08ac5",
    per1000: 0.24,
    radius: 600,
    capacity: 40,
    unit: "посетителей",
  },
  {
    id: "food",
    label: "Магазины",
    singular: "Продуктовый магазин",
    color: "#b7997b",
    per1000: 0.7,
    radius: 400,
    capacity: 200,
    unit: "м²",
  },
  {
    id: "transit",
    label: "Транспорт",
    singular: "Остановка",
    color: "#768d9a",
    per1000: 0.82,
    radius: 450,
    capacity: 1,
    unit: "остановка",
  },
];
export const category = (id: CategoryId) =>
  CATEGORIES.find((c) => c.id === id)!;
export const DEMO_BOUNDS: Bounds = [55.702, 37.624, 55.712, 37.642];
export function distance(a: Point, b: Point) {
  const r = Math.PI / 180,
    dLat = (b[0] - a[0]) * r,
    dLon = (b[1] - a[1]) * r;
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(a[0] * r) * Math.cos(b[0] * r) * Math.sin(dLon / 2) ** 2;
  return 6371000 * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
}
export function areaKm2(b: Bounds) {
  return (
    (distance([b[0], b[1]], [b[2], b[1]]) *
      distance([b[0], b[1]], [b[0], b[3]])) /
    1e6
  );
}
export function inside(p: Point, b: Bounds) {
  return p[0] >= b[0] && p[0] <= b[2] && p[1] >= b[1] && p[1] <= b[3];
}
export function inPolygon(p: Point, polygon: Point[]) {
  let hit = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const a = polygon[i],
      b = polygon[j];
    if (
      a[0] > p[0] !== b[0] > p[0] &&
      p[1] < ((b[1] - a[1]) * (p[0] - a[0])) / (b[0] - a[0]) + a[1]
    )
      hit = !hit;
  }
  return hit;
}
export function roadDistance(p: Point, a: Point, b: Point) {
  const metersLat = 111195,
    metersLon = metersLat * Math.cos((p[0] * Math.PI) / 180);
  const ax = (a[1] - p[1]) * metersLon,
    ay = (a[0] - p[0]) * metersLat;
  const bx = (b[1] - p[1]) * metersLon,
    by = (b[0] - p[0]) * metersLat;
  const dx = bx - ax,
    dy = by - ay,
    length = dx * dx + dy * dy;
  const t = length
    ? Math.max(0, Math.min(1, -(ax * dx + ay * dy) / length))
    : 0;
  return Math.hypot(ax + t * dx, ay + t * dy);
}
export function blockedPoint(p: Point, features: Feature[]) {
  return features.some((f) => {
    if (!f.geometry?.length) return false;
    if (["building", "water", "park"].includes(f.kind))
      return (f.polygons?.length ? f.polygons : [f.geometry]).some((polygon) =>
        inPolygon(p, polygon),
      );
    if (f.kind === "road")
      return f.geometry
        .slice(1)
        .some(
          (v, i) => roadDistance(p, f.geometry![i], v) < (f.major ? 17 : 8),
        );
    return false;
  });
}
export function analyze(
  dataset: Dataset,
  population: number,
  bounds?: Bounds,
): AnalysisItem[] {
  if (!Number.isFinite(population) || population <= 0)
    throw new Error("Укажите численность населения больше нуля.");
  return CATEGORIES.map((c) => {
    const count = dataset.features.filter(
      (f) => f.category === c.id && (!bounds || inside(f.point, bounds)),
    ).length;
    const target = Math.max(1, Math.ceil((population / 1000) * c.per1000));
    const ratio = count / target;
    return {
      category: c.id,
      count,
      target,
      deficit: Math.max(0, target - count),
      ratio,
      status: ratio < 1 ? "deficit" : ratio > 1.3 ? "surplus" : "balanced",
    };
  });
}
export function explainPlacement(
  cat: CategoryId,
  point: Point,
  dataset: Dataset,
  bounds: Bounds,
  population: number,
): Pick<Proposal, "reason" | "distance" | "priority" | "capacity"> {
  const c = category(cat),
    existing = dataset.features.filter((f) => f.category === cat);
  const nearest = existing.length
    ? Math.round(Math.min(...existing.map((f) => distance(point, f.point))))
    : 0;
  const analysis = analyze(dataset, population, bounds).find(
    (a) => a.category === cat,
  )!;
  return {
    distance: nearest,
    capacity: c.capacity,
    priority: analysis.deficit >= 2 ? "Высокий" : "Средний",
    reason: [
      `На участке отмечено ${analysis.count} ${c.label.toLowerCase()}, ориентир модели — ${analysis.target} при населении ${population.toLocaleString("ru-RU")} человек. ${analysis.deficit ? `Расчётный дефицит — ${analysis.deficit}.` : "Новый объект добавлен по решению специалиста."}`,
      nearest
        ? `Ближайший существующий объект этой категории находится в ${nearest} м по прямой. Размещение расширяет территориальное распределение услуг; ориентир доступности — ${c.radius} м. Пешеходный маршрут необходимо проверить отдельно.`
        : "В загруженных данных нет объектов этой категории. Новая точка формирует предварительный центр обслуживания жилой застройки.",
      `Координаты: ${point[0].toFixed(5)}, ${point[1].toFixed(5)}. Точка проверена по известным контурам зданий, воды, парков и буферу дорог. Подбор учитывает расстояние до существующих объектов и застройки. Свободный статус земли не подтверждён.`,
      cat === "green"
        ? "Сквер создаёт место повседневного отдыха рядом с жильём. Предусмотреть тень, проницаемые покрытия и безбарьерный доступ."
        : cat === "kindergarten" || cat === "school"
          ? "Для детского учреждения важны короткие подходы от жилья и безопасный вход. Проверить переходы, шум, инсоляцию и санитарные ограничения."
          : cat === "health"
            ? "Приоритет — доступность для пожилых людей и подъезд специального транспорта. Необходима проверка безбарьерного маршрута и инженерных подключений."
            : "Объект дополняет повседневные услуги района. Проверить фактическую потребность, безопасные подходы и совместимость с соседней застройкой.",
    ],
  };
}
export function generateProposals(
  dataset: Dataset,
  population: number,
  bounds: Bounds,
): Proposal[] {
  const needs = analyze(dataset, population, bounds)
    .filter((a) => a.deficit > 0)
    .sort((a, b) => b.deficit / b.target - a.deficit / a.target);
  const candidates: Point[] = [];
  for (let row = 1; row < 13; row++)
    for (let col = 1; col < 13; col++) {
      const p: Point = [
        bounds[0] + ((bounds[2] - bounds[0]) * row) / 13,
        bounds[1] + ((bounds[3] - bounds[1]) * col) / 13,
      ];
      if (!blockedPoint(p, dataset.features)) candidates.push(p);
    }
  const proposals: Proposal[] = [];
  for (const item of needs) {
    const existing = dataset.features.filter(
      (f) => f.category === item.category,
    );
    const houses = dataset.features.filter((f) => f.kind === "building");
    const available = candidates.filter(
      (p) =>
        !proposals.some((q) => distance(p, q.point) < 130) &&
        !dataset.features.some(
          (f) => f.kind === "poi" && distance(p, f.point) < 35,
        ),
    );
    if (!available.length) continue;
    const score = (p: Point) => {
      const gap = existing.length
        ? Math.min(...existing.map((f) => distance(p, f.point)))
        : 500;
      const home = houses.length
        ? Math.min(...houses.map((f) => distance(p, f.point)))
        : 100;
      const edge = Math.min(
        distance(p, [bounds[0], p[1]]),
        distance(p, [bounds[2], p[1]]),
        distance(p, [p[0], bounds[1]]),
        distance(p, [p[0], bounds[3]]),
      );
      return Math.min(gap, 1500) - home * 1.1 + Math.min(edge, 150) * 0.4;
    };
    available.sort((a, b) => score(b) - score(a));
    const point = available[0];
    proposals.push({
      id: `p-${item.category}`,
      category: item.category,
      point,
      title: category(item.category).singular,
      ...explainPlacement(item.category, point, dataset, bounds, population),
    });
  }
  return proposals;
}
export function demoDataset(): Dataset {
  const features: Feature[] = [];
  const b = DEMO_BOUNDS;
  const at = (x: number, y: number): Point => [
    b[2] - y * (b[2] - b[0]),
    b[1] + x * (b[3] - b[1]),
  ];
  const counts: Record<CategoryId, number> = {
    school: 3,
    kindergarten: 2,
    health: 1,
    green: 1,
    sport: 3,
    food: 11,
    transit: 7,
  };
  CATEGORIES.forEach((c, ci) => {
    for (let i = 0; i < counts[c.id]; i++)
      features.push({
        id: `demo-${c.id}-${i}`,
        point: at(
          0.12 + ((i * 29 + ci * 13) % 65) / 100,
          0.13 + ((i * 23 + ci * 11) % 70) / 100,
        ),
        category: c.id,
        name: `${c.singular} ${i + 1}`,
        kind: "poi",
      });
  });
  for (let row = 0; row < 5; row++)
    for (let col = 0; col < 5; col++) {
      if (
        (row === 1 && col === 2) ||
        (row === 3 && col === 3) ||
        (row === 0 && col === 0)
      )
        continue;
      const x = 0.08 + col * 0.158,
        y = 0.1 + row * 0.167,
        w = col % 2 ? 0.09 : 0.075,
        h = row % 2 ? 0.09 : 0.068;
      features.push({
        id: `building-${row}-${col}`,
        point: at(x + w / 2, y + h / 2),
        kind: "building",
        name: "Жилой корпус",
        geometry: [
          at(x, y),
          at(x + w, y),
          at(x + w, y + h),
          at(x, y + h),
          at(x, y),
        ],
        levels: 4 + ((row * 3 + col) % 9),
      });
    }
  [0.06, 0.224, 0.386, 0.548, 0.71, 0.875].forEach((v, i) => {
    features.push({
      id: `road-h-${i}`,
      name: [
        "Автозаводская улица",
        "улица Лисицкого",
        "бульвар Братьев Весниных",
        "улица Архитектора Леонидова",
        "улица Родченко",
        "Набережная Марка Шагала",
      ][i],
      kind: "road",
      point: at(0.5, v),
      geometry: [at(-0.1, v), at(1.1, v)],
      major: i === 0 || i === 5,
    });
    if (i < 5)
      features.push({
        id: `road-v-${i}`,
        name: "",
        kind: "road",
        point: at(v, 0.5),
        geometry: [at(v, -0.1), at(v, 1.1)],
        major: i === 0,
      });
  });
  features.push({
    id: "water",
    point: at(0.965, 0.5),
    name: "Москва-река",
    kind: "water",
    geometry: [
      at(0.92, -0.1),
      at(1.2, -0.1),
      at(1.2, 1.2),
      at(0.82, 1.2),
      at(0.91, 0.58),
      at(0.92, -0.1),
    ],
  });
  features.push({
    id: "park",
    point: at(0.46, 0.32),
    name: "Зелёный квартал",
    kind: "park",
    geometry: [
      at(0.4, 0.265),
      at(0.52, 0.265),
      at(0.52, 0.37),
      at(0.4, 0.37),
      at(0.4, 0.265),
    ],
  });
  return { source: "demo", fetchedAt: new Date().toISOString(), features };
}
export function createDemo(): Project {
  const dataset = demoDataset(),
    now = new Date().toISOString();
  const proposals = generateProposals(dataset, 8500, DEMO_BOUNDS);
  return {
    id: "demo-danilovsky",
    name: "Даниловский район",
    location: "Москва · территория ЗИЛ",
    bounds: DEMO_BOUNDS,
    population: 8500,
    dataset,
    proposals,
    stage: "draft",
    version: 1,
    updatedAt: now,
    revisions: [
      {
        version: 1,
        createdAt: now,
        author: "Система",
        event: "Сформирован предварительный эскиз",
        proposals: structuredClone(proposals),
      },
    ],
  };
}

export function record(
  project: Project,
  event: string,
  author: string,
  comment?: string,
): Project {
  const now = new Date().toISOString();
  return {
    ...project,
    updatedAt: now,
    revisions: [
      ...project.revisions,
      {
        version: project.version,
        createdAt: now,
        author,
        event,
        comment,
        proposals: structuredClone(project.proposals),
      },
    ],
  };
}
export function submitReview(p: Project): Project {
  if (!["draft", "changes"].includes(p.stage))
    throw new Error(
      "Отправить на согласование можно только эскиз или исправленную версию.",
    );
  const lastRequest = [...p.revisions]
    .reverse()
    .find((r) => r.event === "Запрошены изменения");
  if (p.stage === "changes" && lastRequest && p.version <= lastRequest.version)
    throw new Error(
      "Сначала внесите изменения по замечанию специалиста и сохраните новую версию.",
    );
  return record(
    { ...p, stage: "review", approvedBy: undefined, approvedAt: undefined },
    "Эскиз передан на согласование",
    "Автор проекта",
  );
}
export function approve(p: Project, name: string): Project {
  if (p.stage !== "review")
    throw new Error("Сначала передайте эскиз на согласование.");
  if (!name.trim()) throw new Error("Укажите имя специалиста.");
  return record(
    {
      ...p,
      stage: "approved",
      approvedBy: name.trim(),
      approvedAt: new Date().toISOString(),
    },
    "Эскиз одобрен специалистом",
    name.trim(),
  );
}
export function requestChanges(
  p: Project,
  name: string,
  comment: string,
): Project {
  if (p.stage !== "review")
    throw new Error("Замечания принимаются на этапе согласования.");
  if (!name.trim() || !comment.trim())
    throw new Error("Укажите имя и замечание.");
  return record(
    { ...p, stage: "changes", approvedBy: undefined, approvedAt: undefined },
    "Запрошены изменения",
    name.trim(),
    comment.trim(),
  );
}
export function detail(p: Project): Project {
  if (p.stage !== "approved" || !p.approvedBy)
    throw new Error("Для детализации необходимо одобрение специалиста.");
  return record(
    { ...p, stage: "detailed" },
    "Подготовлен детализированный концептуальный макет",
    "Автор проекта",
  );
}
export type Edit = {
  action: "move" | "add" | "remove" | "note";
  proposalId?: string;
  category?: CategoryId;
  point?: Point;
  note: string;
};
export function revise(p: Project, edit: Edit): Project {
  if (!["draft", "changes"].includes(p.stage))
    throw new Error(
      "На этом этапе редактирование заблокировано. Верните проект к эскизу.",
    );
  if (!edit.note.trim()) throw new Error("Опишите причину изменения.");
  let proposals = structuredClone(p.proposals);
  if (edit.action !== "add" && !proposals.some((x) => x.id === edit.proposalId))
    throw new Error("Выберите существующий объект.");
  if (edit.action === "remove")
    proposals = proposals.filter((x) => x.id !== edit.proposalId);
  if (edit.action === "move" || edit.action === "add") {
    if (
      !edit.point ||
      !edit.point.every(Number.isFinite) ||
      !inside(edit.point, p.bounds)
    )
      throw new Error(
        "Координаты должны находиться внутри выбранного участка.",
      );
    if (blockedPoint(edit.point, p.dataset.features))
      throw new Error(
        "Точка попадает в известный контур здания, воды, парка или на дорогу. Выберите другое место.",
      );
    const cat =
      edit.action === "add"
        ? edit.category
        : proposals.find((x) => x.id === edit.proposalId)?.category;
    if (!cat) throw new Error("Выберите объект.");
    const proposal: Proposal = {
      id: edit.action === "add" ? `p-${Date.now()}` : edit.proposalId!,
      title: category(cat).singular,
      category: cat,
      point: edit.point,
      ...explainPlacement(cat, edit.point, p.dataset, p.bounds, p.population),
      edited: true,
      note: edit.note.trim(),
    };
    if (edit.action === "add") proposals.push(proposal);
    else
      proposals = proposals.map((x) =>
        x.id === edit.proposalId ? proposal : x,
      );
  }
  if (edit.action === "note")
    proposals = proposals.map((x) =>
      x.id === edit.proposalId
        ? { ...x, note: edit.note.trim(), edited: true }
        : x,
    );
  return record(
    {
      ...p,
      proposals,
      version: p.version + 1,
      approvedBy: undefined,
      approvedAt: undefined,
    },
    "Эскиз и обоснование обновлены",
    "Автор проекта",
    edit.note.trim(),
  );
}

export function applyFeedback(p: Project, comment: string): Project {
  if (p.stage !== "changes")
    throw new Error("Автоправка доступна после замечания специалиста.");
  const text = comment.trim().toLowerCase();
  const verb = text.match(
    /^(?:пожалуйста[, ]+)?(перенеси(?:те)?|перемести(?:те)?|передвинь(?:те)?|добавь(?:те)?|убери(?:те)?|удали(?:те)?)\s/,
  );
  if (!verb)
    throw new Error(
      "Замечание сохранено. Для этой формулировки нужно уточнить изменения вручную.",
    );
  const matches: CategoryId[] = [];
  if (/детск.{0,12}сад|детсад|садик/.test(text)) matches.push("kindergarten");
  if (/школ/.test(text)) matches.push("school");
  if (/медицин|поликлин|медцентр|клиник/.test(text)) matches.push("health");
  if (/сквер|парк|зел[её]н/.test(text)) matches.push("green");
  if (/спорт|площадк/.test(text)) matches.push("sport");
  if (/магазин/.test(text)) matches.push("food");
  if (/остановк/.test(text)) matches.push("transit");
  if (matches.length !== 1 || /[;\n]|\bи затем\b|потом/.test(text))
    throw new Error(
      "Укажите одну правку и один тип объекта или внесите изменения вручную.",
    );
  const cat = matches[0],
    existing = p.proposals.filter((r) => r.category === cat);
  const action = /^(уб|уд)/.test(verb[1])
    ? "remove"
    : verb[1].startsWith("добав")
      ? "add"
      : "move";
  if (action !== "add" && existing.length !== 1)
    throw new Error(
      "Не удалось однозначно выбрать объект. Уточните правку вручную.",
    );
  if (action === "remove")
    return revise(p, {
      action,
      proposalId: existing[0].id,
      note: `По замечанию специалиста: ${comment}`,
    });
  const directions = [
    /север/.test(text),
    /юг|южн/.test(text),
    /запад/.test(text),
    /восток|восточ/.test(text),
  ];
  if (directions.filter(Boolean).length !== 1)
    throw new Error(
      "Для автоматического размещения укажите одно направление: север, юг, запад или восток.",
    );
  const base: Point =
    action === "add"
      ? [(p.bounds[0] + p.bounds[2]) / 2, (p.bounds[1] + p.bounds[3]) / 2]
      : existing[0].point;
  const desired: Point = [
    base[0] + (directions[0] ? 0.00135 : directions[1] ? -0.00135 : 0),
    base[1] +
      (directions[3] ? 0.00135 : directions[2] ? -0.00135 : 0) /
        Math.cos((base[0] * Math.PI) / 180),
  ];
  const candidates: Point[] = [],
    b = p.bounds;
  for (let row = 1; row < 30; row++)
    for (let col = 1; col < 30; col++) {
      const point: Point = [
        b[0] + ((b[2] - b[0]) * row) / 30,
        b[1] + ((b[3] - b[1]) * col) / 30,
      ];
      const directional = directions[0]
        ? point[0] > base[0] + 0.0002
        : directions[1]
          ? point[0] < base[0] - 0.0002
          : directions[2]
            ? point[1] < base[1] - 0.0003
            : point[1] > base[1] + 0.0003;
      if (
        directional &&
        !blockedPoint(point, p.dataset.features) &&
        !p.proposals.some(
          (r) =>
            (action === "add" || r.id !== existing[0]?.id) &&
            distance(point, r.point) < 60,
        )
      )
        candidates.push(point);
    }
  candidates.sort((a, b) => distance(a, desired) - distance(b, desired));
  if (!candidates.length)
    throw new Error(
      "В указанном направлении не найдена доступная точка. Уточните размещение вручную.",
    );
  return revise(p, {
    action,
    proposalId: existing[0]?.id,
    category: cat,
    point: candidates[0],
    note: `По замечанию специалиста: ${comment}. Координаты и обоснование пересчитаны; требуется повторная проверка.`,
  });
}
