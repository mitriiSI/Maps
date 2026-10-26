import type {
  DetailedDesign,
  PlanAsset,
  PlanPoint,
  PlanSurface,
  PlanZone,
  Point,
  Project,
  Proposal,
} from "./types";
import {
  blockedPoint,
  category,
  distance,
  inPolygon,
  inside,
  roadDistance,
} from "./engine";

export const DESIGN_GENERATION = 2;
const METERS = 111195;
export function geoToLocal(p: Point, anchor: Point): PlanPoint {
  return [
    (p[1] - anchor[1]) * METERS * Math.cos((anchor[0] * Math.PI) / 180),
    (anchor[0] - p[0]) * METERS,
  ];
}
export function localToGeo(p: PlanPoint, anchor: Point): Point {
  return [
    anchor[0] - p[1] / METERS,
    anchor[1] + p[0] / (METERS * Math.cos((anchor[0] * Math.PI) / 180)),
  ];
}
export function rotatePoint(p: PlanPoint, angle: number): PlanPoint {
  return [
    p[0] * Math.cos(angle) - p[1] * Math.sin(angle),
    p[0] * Math.sin(angle) + p[1] * Math.cos(angle),
  ];
}
export function designGeo(
  d: Pick<DetailedDesign, "anchor" | "angle"> & { offset?: PlanPoint },
  p: PlanPoint,
) {
  return localToGeo(
    rotatePoint(
      [p[0] + (d.offset?.[0] || 0), p[1] + (d.offset?.[1] || 0)],
      d.angle,
    ),
    d.anchor,
  );
}
export function designLocal(
  d: Pick<DetailedDesign, "anchor" | "angle"> & { offset?: PlanPoint },
  p: Point,
) {
  const q = rotatePoint(geoToLocal(p, d.anchor), -d.angle);
  return [
    q[0] - (d.offset?.[0] || 0),
    q[1] - (d.offset?.[1] || 0),
  ] as PlanPoint;
}
export function polygonArea(p: PlanPoint[]) {
  return Math.abs(
    p.reduce((sum, v, i) => {
      const n = p[(i + 1) % p.length];
      return sum + v[0] * n[1] - n[0] * v[1];
    }, 0) / 2,
  );
}
function rect(x: number, z: number, w: number, h: number): PlanPoint[] {
  return [
    [x - w / 2, z - h / 2],
    [x + w / 2, z - h / 2],
    [x + w / 2, z + h / 2],
    [x - w / 2, z + h / 2],
  ];
}
function segmentsCross(a: Point, b: Point, c: Point, d: Point) {
  const cross = (u: Point, v: Point, w: Point) =>
    (v[0] - u[0]) * (w[1] - u[1]) - (v[1] - u[1]) * (w[0] - u[0]);
  const on = (u: Point, v: Point, w: Point) =>
    Math.abs(cross(u, v, w)) < 1e-13 &&
    w[0] >= Math.min(u[0], v[0]) - 1e-10 &&
    w[0] <= Math.max(u[0], v[0]) + 1e-10 &&
    w[1] >= Math.min(u[1], v[1]) - 1e-10 &&
    w[1] <= Math.max(u[1], v[1]) + 1e-10;
  const ac = cross(a, b, c),
    ad = cross(a, b, d),
    ca = cross(c, d, a),
    cb = cross(c, d, b);
  return (
    (ac * ad < 0 && ca * cb < 0) ||
    on(a, b, c) ||
    on(a, b, d) ||
    on(c, d, a) ||
    on(c, d, b)
  );
}
function polygonsIntersect(a: Point[], b: Point[]) {
  if (a.some((p) => inPolygon(p, b)) || b.some((p) => inPolygon(p, a)))
    return true;
  return a.some((v, i) =>
    b.some((w, j) =>
      segmentsCross(v, a[(i + 1) % a.length], w, b[(j + 1) % b.length]),
    ),
  );
}

function closestRoad(project: Project, anchor: Point) {
  let best: { point: Point; distance: number; name: string } | undefined;
  for (const f of project.dataset.features.filter(
    (f) => f.kind === "road" && f.geometry?.length,
  )) {
    const points = f.geometry!;
    for (let i = 1; i < points.length; i++) {
      const a = geoToLocal(points[i - 1], anchor),
        b = geoToLocal(points[i], anchor);
      const dx = b[0] - a[0],
        dz = b[1] - a[1],
        den = dx * dx + dz * dz;
      const t = den
        ? Math.max(0, Math.min(1, -(a[0] * dx + a[1] * dz) / den))
        : 0;
      const point: PlanPoint = [a[0] + dx * t, a[1] + dz * t],
        dist = Math.hypot(...point);
      if (!best || dist < best.distance)
        best = {
          point: localToGeo(point, anchor),
          distance: dist,
          name: f.name || "Безымянный проезд",
        };
    }
  }
  return best;
}

/** Conservative plot check: corners, interior, boundaries, contained obstacles and road buffers. */
export function checkPlot(
  project: Project,
  anchor: Point,
  angle: number,
  width: number,
  depth: number,
  otherPlots: Point[][] = [],
  offset: PlanPoint = [0, 0],
): string[] {
  const plot = rect(0, 0, width, depth).map((p) =>
    designGeo({ anchor, angle, offset }, p),
  );
  if (plot.some((p) => !inside(p, project.bounds)))
    return ["Контур выходит за границы территории."];
  const features = project.dataset.features.filter(
    (f) =>
      distance(f.point, anchor) < Math.max(width, depth) + 200 ||
      f.kind === "water" ||
      f.kind === "park" ||
      f.kind === "road",
  );
  const samples: Point[] = [];
  for (let x = 0; x <= 8; x++)
    for (let z = 0; z <= 8; z++)
      samples.push(
        designGeo({ anchor, angle, offset }, [
          (x / 8 - 0.5) * width,
          (z / 8 - 0.5) * depth,
        ]),
      );
  if (samples.some((p) => blockedPoint(p, features)))
    return [
      "Пятно пересекает известный контур застройки, воды, парка или буфер дороги.",
    ];
  for (const f of features.filter((f) =>
    ["building", "water", "park"].includes(f.kind),
  )) {
    if (
      (f.polygons?.length ? f.polygons : [f.geometry || []]).some(
        (poly) => poly.length >= 3 && polygonsIntersect(poly, plot),
      )
    )
      return [
        "Внутри пятна есть известный объект; границы необходимо уточнить.",
      ];
  }
  if (
    features
      .filter((f) => f.kind === "road" && f.geometry?.length)
      .some((f) =>
        f
          .geometry!.slice(1)
          .some((v, i) =>
            plot.some((p, j) =>
              segmentsCross(f.geometry![i], v, p, plot[(j + 1) % plot.length]),
            ),
          ),
      )
  )
    return ["Пятно пересекает линию существующего проезда."];
  if (otherPlots.some((poly) => polygonsIntersect(plot, poly)))
    return ["Пятно пересекает другой проектируемый объект."];
  return [];
}

const BRIEFS = {
  green: {
    title: "Сад повседневных маршрутов",
    subtitle: "Тихий квартальный парк для прогулок, игр и встреч",
    size: [96, 72],
    story: [
      "Прогулочная петля соединяет входы, тихий сад и небольшую общественную площадь. Это ежедневный маршрут рядом с домом, а не транзитная пустая площадка.",
      "Активная детская зона отделена от тихого луга полосой посадок. Скамьи смотрят на зелень и площадку; взрослые могут наблюдать за детьми, не мешая прогулочному движению.",
      "Деревья формируют тень вдоль дорожек, дождевой сад принимает поверхностный сток. Низкое освещение аллей и тёплые материалы сохраняют камерный характер парка.",
    ],
  },
  kindergarten: {
    title: "Маленький город открытий",
    subtitle: "Детский сад с самостоятельными игровыми дворами",
    size: [76, 60],
    story: [
      "Двухэтажный корпус раскрывается в защищённый двор. Главный вход обращён к ближайшему проезду; отдельный хозяйственный вход вынесен на боковую границу.",
      "Две игровые группы получают собственные площадки, навесы и места для спокойных занятий. Озеленённая полоса отделяет прогулки от улицы.",
      "Светлый фасад, деревянные акценты и понятная цветовая навигация помогают ориентироваться детям. Сервисные и пешеходные потоки требуют отдельной проверки на следующей стадии.",
    ],
  },
  school: {
    title: "Школа как центр квартала",
    subtitle: "Учебный кампус с двором, спортом и общественным входом",
    size: [100, 80],
    story: [
      "Учебные крылья образуют защищённый двор. Входная площадь работает как место встречи, сохраняя ясный маршрут к учебному корпусу.",
      "Спортивный объём вынесен в отдельное крыло, уличная площадка — к боковой границе. Тихие посадки отделяют обучение от активного отдыха.",
      "Учебные, спортивные и хозяйственные маршруты показаны раздельно. Вместимость и состав кабинетов необходимо проверить по заданию на проектирование.",
    ],
  },
  health: {
    title: "Здоровье в шаговой доступности",
    subtitle: "Медицинский центр с понятным входом и зелёным двором",
    size: [66, 52],
    story: [
      "Основной корпус и диагностическое крыло объединены входной площадью. Главный вход ориентирован к улице и хорошо виден с подхода.",
      "Перед зданием предусмотрены места ожидания, непрерывное твёрдое покрытие и плавный подход. Деревья дают тень, не закрывая входную группу.",
      "Боковой служебный подход отделён от общественного входа. Фактический подъезд специального транспорта и доступность сетей остаются задачами инженерной проверки.",
    ],
  },
  sport: {
    title: "Движение каждый день",
    subtitle: "Открытый спортивный двор для разных возрастов",
    size: [72, 50],
    story: [
      "Многофункциональная площадка становится центром спортивного двора. По периметру идёт прогулочно-разминочная петля.",
      "Павильон раздевалок, места ожидания и питьевая точка собраны у входа. Зона тренажёров отделена от игрового поля.",
      "Свет направлен внутрь территории, а зелёный пояс смягчает соседство с жильём. Шум и режим работы требуют согласования.",
    ],
  },
  food: {
    title: "Магазин у дома",
    subtitle: "Повседневные покупки и небольшая площадь квартала",
    size: [52, 40],
    story: [
      "Компактный торговый зал обращён входом к пешеходному подходу. Перед ним — небольшая площадь со скамьями и велопарковкой.",
      "Загрузка отнесена к тыльной стороне, чтобы не пересекать основной поток покупателей. Конкретная схема движения грузового транспорта требует проверки.",
      "Витрины, навес и тёплый фасад формируют понятный уличный фронт. Озеленение и водопроницаемое покрытие смягчают жёсткие поверхности.",
    ],
  },
  transit: {
    title: "Комфортная пересадка",
    subtitle: "Остановочный павильон с защищённым ожиданием",
    size: [28, 16],
    story: [
      "Прозрачный навес защищает от осадков, сохраняя видимость приближающегося транспорта. Зона ожидания отделена от полосы посадки.",
      "Сиденья, навигация, освещение и велопарковка собраны в компактный узел. Основной пешеходный коридор остаётся непрерывным.",
      "Расположение посадочной кромки — проектное допущение. Реальную полосу движения, габариты и разрешение на остановку должен подтвердить транспортный специалист.",
    ],
  },
} satisfies Record<
  string,
  { title: string; subtitle: string; size: number[]; story: string[] }
>;

export function createDetailedDesign(
  project: Project,
  proposal: Proposal,
  otherPlots: Point[][] = [],
): DetailedDesign {
  const brief = BRIEFS[proposal.category],
    road = closestRoad(project, proposal.point);
  const roadLocal = road ? geoToLocal(road.point, proposal.point) : [0, 1];
  const baseAngle = Math.atan2(-roadLocal[0], roadLocal[1]);
  let w = brief.size[0] * 0.22,
    h = brief.size[1] * 0.22,
    angle = baseAngle,
    offset: PlanPoint = [0, 0],
    fitNotes: string[] = [],
    fitScale = 0.22;
  let found = false;
  for (const scale of [1, 0.85, 0.7, 0.55, 0.4, 0.3, 0.22]) {
    for (const turn of [
      0,
      Math.PI / 12,
      -Math.PI / 12,
      Math.PI / 2,
      -Math.PI / 2,
    ]) {
      for (const [ox, oz] of [
        [0, 0],
        [-0.3, 0],
        [0.3, 0],
        [0, -0.3],
        [0, 0.3],
        [-0.3, -0.3],
        [0.3, -0.3],
        [-0.3, 0.3],
        [0.3, 0.3],
        [-0.42, -0.42],
        [0.42, -0.42],
        [-0.42, 0.42],
        [0.42, 0.42],
      ]) {
        const candidate: PlanPoint = [
          ox * brief.size[0] * scale,
          oz * brief.size[1] * scale,
        ];
        const notes = checkPlot(
          project,
          proposal.point,
          baseAngle + turn,
          brief.size[0] * scale,
          brief.size[1] * scale,
          otherPlots,
          candidate,
        );
        if (!notes.length) {
          w = brief.size[0] * scale;
          h = brief.size[1] * scale;
          angle = baseAngle + turn;
          offset = candidate;
          fitScale = scale;
          found = true;
          break;
        }
      }
      if (found) break;
    }
    if (found) break;
  }
  if (!found)
    fitNotes = checkPlot(project, proposal.point, angle, w, h, otherPlots);
  if (fitScale < 0.55)
    fitNotes.push(
      "Участок меньше целевого: состав и вместимость нужно пересогласовать или выбрать другое место.",
    );
  const plan: DetailedDesign = {
    id: `design-${proposal.id}`,
    proposalId: proposal.id,
    generation: DESIGN_GENERATION,
    sourceVersion: project.version,
    category: proposal.category,
    anchor: [...proposal.point],
    angle,
    offset,
    width: Math.round(w * 10) / 10,
    depth: Math.round(h * 10) / 10,
    plot: rect(0, 0, w, h).map((p) =>
      designGeo({ anchor: proposal.point, angle, offset }, p),
    ),
    title: brief.title,
    subtitle: brief.subtitle,
    narrative: [...brief.story],
    fit: fitNotes.length ? "needs-review" : "fits",
    fitNotes,
    zones: [],
    paths: [],
    volumes: [],
    assets: [],
    entrances: [],
    viewpoints: [],
    materials: [
      {
        name: "Светлый бетонный камень",
        use: "Главные подходы и площадки",
        color: "#d8d0bb",
      },
      {
        name: "Натуральная древесина",
        use: "Скамьи, настилы и навесы",
        color: "#af8056",
      },
      {
        name: "Многолетники и газон",
        use: "Посадки и проницаемые поверхности",
        color: "#86a374",
      },
      {
        name: "Графитовый металл",
        use: "Освещение, стойки и оборудование",
        color: "#505c5b",
      },
    ],
    program: [],
    context: {
      roadName: road?.name || "Дорога не найдена в данных",
      roadPoint: road?.point,
      roadDistance: road ? Math.round(road.distance) : undefined,
      access: [],
      accessClear: false,
      neighbors: [],
    },
    phases: [
      "Уточнить границы и правовой статус участка, выполнить съёмку и обследование.",
      "Согласовать генплан, входы, состав помещений и инженерные подключения.",
      "Подготовить покрытия, водоотвод и сети; возвести объёмы и установить оборудование.",
      "Выполнить озеленение, проверить освещение и доступность, передать в эксплуатацию.",
    ],
    requirements: [
      "Геометрия — проектное предложение в метрах; кадастровая граница и геодезическая съёмка не загружены.",
      "Проверить местные нормы, пожарные проезды, охранные зоны, инсоляцию и инженерные мощности.",
      "Доступность, ширины проходов и уклоны необходимо подтвердить на реальном рельефе.",
      ...(proposal.note ? [`Требование специалиста: ${proposal.note}`] : []),
    ],
  };
  const pos = (x: number, z: number): PlanPoint => [x * w, z * h];
  const zone = (
    id: string,
    name: string,
    x: number,
    z: number,
    width: number,
    depth: number,
    surface: PlanSurface,
    color: string,
    description: string,
  ) =>
    plan.zones.push({
      id,
      name,
      polygon: rect(x * w, z * h, width * w, depth * h),
      surface,
      color,
      description,
    });
  const path = (
    id: string,
    name: string,
    points: PlanPoint[],
    width = 2.4,
    color = "#d9cfb7",
  ) =>
    plan.paths.push({
      id,
      name,
      points: points.map((p) => pos(...p)),
      width: Math.min(width, w * 0.065),
      color,
    });
  const volume = (
    id: string,
    name: string,
    x: number,
    z: number,
    width: number,
    depth: number,
    height: number,
    floors: number,
    color: string,
    roof: "flat" | "green" | "canopy" = "flat",
  ) =>
    plan.volumes.push({
      id,
      name,
      center: pos(x, z),
      width: width * w,
      depth: depth * h,
      height,
      floors,
      color,
      roof,
    });
  const asset = (
    kind: PlanAsset["kind"],
    x: number,
    z: number,
    rotation = 0,
    variant = 0,
  ) =>
    plan.assets.push({
      id: `${kind}-${plan.assets.length}`,
      kind,
      point: pos(x, z),
      rotation,
      variant,
    });
  plan.entrances.push(
    {
      id: "main",
      name: "Главный вход",
      point: pos(0, 0.5),
      width: Math.min(4, w * 0.14),
      kind: "main",
    },
    {
      id: "side",
      name:
        proposal.category === "green"
          ? "Вход со стороны квартала"
          : "Служебный вход",
      point: pos(0.5, 0),
      width: Math.min(3, w * 0.1),
      kind: proposal.category === "green" ? "secondary" : "service",
    },
  );

  if (proposal.category === "green") {
    zone(
      "quiet",
      "Тихий сад",
      -0.25,
      -0.14,
      0.3,
      0.43,
      "grass",
      "#a8bf8d",
      "Теневые посадки и места спокойного отдыха вдали от входной площади.",
    );
    zone(
      "play",
      "Детская поляна",
      0.25,
      -0.2,
      0.29,
      0.28,
      "rubber",
      "#cd997a",
      "Игровой комплекс и качели на мягком покрытии; обзор со скамей.",
    );
    zone(
      "plaza",
      "Площадь встреч",
      0.18,
      0.25,
      0.34,
      0.25,
      "pavers",
      "#dbd0b8",
      "Небольшая площадь у павильона для встреч и сезонных событий.",
    );
    zone(
      "rain",
      "Дождевой сад",
      -0.27,
      0.31,
      0.24,
      0.16,
      "planting",
      "#809e82",
      "Понижение с влаголюбивыми многолетниками; расчёт стока уточняется.",
    );
    zone(
      "meadow",
      "Центральный луг",
      0.01,
      -0.04,
      0.23,
      0.27,
      "grass",
      "#adc591",
      "Открытая зелёная поляна, сохраняющая обзор и гибкость использования.",
    );
    path(
      "spine",
      "Главная аллея",
      [
        [0, 0.5],
        [0, 0.28],
        [-0.04, 0],
        [0, -0.47],
      ],
      3.5,
    );
    const loop: PlanPoint[] = Array.from({ length: 33 }, (_, i) => [
      Math.cos((i / 32) * Math.PI * 2) * 0.38,
      Math.sin((i / 32) * Math.PI * 2) * 0.36,
    ]);
    path("loop", "Прогулочная петля", loop, 2.5);
    path(
      "cross",
      "Поперечная связь",
      [
        [-0.5, 0],
        [-0.23, 0],
        [0, 0.03],
        [0.25, -0.02],
        [0.5, 0],
      ],
      2.4,
    );
    path(
      "play-access",
      "Подход к детской зоне",
      [
        [0.25, -0.02],
        [0.25, -0.2],
      ],
      2,
    );
    path(
      "plaza-access",
      "Подход к павильону",
      [
        [0, 0.28],
        [0.28, 0.36],
      ],
      2.4,
    );
    volume(
      "pavilion",
      "Садовый павильон",
      0.28,
      0.27,
      0.14,
      0.14,
      3.8,
      1,
      "#b98b62",
      "green",
    );
    for (let i = 0; i < 20; i++) {
      const a = (i / 20) * Math.PI * 2;
      asset("tree", Math.cos(a) * 0.445, Math.sin(a) * 0.43, 0, i % 3);
    }
    [
      [-0.3, -0.25],
      [-0.2, -0.28],
      [-0.32, -0.08],
      [-0.24, -0.04],
      [-0.16, -0.17],
    ].forEach((p) => asset("tree", p[0], p[1], 0, 2));
    for (let i = 0; i < 10; i++) {
      const a = (i / 10) * Math.PI * 2;
      asset("bench", Math.cos(a) * 0.3, Math.sin(a) * 0.29, -a + Math.PI / 2);
      asset("lamp", Math.cos(a) * 0.405, Math.sin(a) * 0.385);
    }
    asset("pergola", -0.25, -0.15);
    asset("play", 0.25, -0.22, 0, 0);
    asset("play", 0.31, -0.15, 0, 1);
    asset("play", 0.18, -0.15, 0, 2);
    asset("fountain", 0.09, 0.25);
    [
      [-0.32, 0.3],
      [-0.22, 0.3],
      [0.1, -0.34],
      [0.34, 0.12],
    ].forEach((p) => asset("flowerbed", p[0], p[1]));
    plan.viewpoints = [
      {
        id: "entrance",
        name: "Главный вход",
        position: pos(0, 0.46),
        target: pos(0, 0),
      },
      {
        id: "garden",
        name: "Тихий сад",
        position: pos(-0.29, 0.03),
        target: pos(-0.25, -0.2),
      },
      {
        id: "play",
        name: "Детская поляна",
        position: pos(0.14, -0.01),
        target: pos(0.27, -0.21),
      },
      {
        id: "plaza",
        name: "Площадь встреч",
        position: pos(0.02, 0.28),
        target: pos(0.28, 0.27),
      },
    ];
  } else {
    zone(
      "forecourt",
      "Входная площадь",
      0,
      0.31,
      0.45,
      0.23,
      "pavers",
      "#d9cfba",
      "Понятный подход, места ожидания и пространство перед главным входом.",
    );
    zone(
      "garden",
      "Зелёный двор",
      -0.31,
      0.16,
      0.19,
      0.24,
      "grass",
      "#a7bc8e",
      "Посадки и спокойные места ожидания в стороне от основного движения.",
    );
    path(
      "main-access",
      "Главный пешеходный подход",
      [
        [0, 0.5],
        [0, 0.3],
        [0, 0.12],
      ],
      3.6,
    );
    path(
      "side-access",
      "Боковая связь",
      [
        [0.5, 0],
        [0.4, 0],
        [0.4, 0.31],
        [0, 0.31],
      ],
      2.2,
    );
    const cat = proposal.category;
    if (cat === "kindergarten") {
      volume(
        "main",
        "Групповой корпус",
        -0.1,
        -0.18,
        0.49,
        0.31,
        6.8,
        2,
        "#e6c796",
        "green",
      );
      volume(
        "service",
        "Пищеблок и служебные помещения",
        0.24,
        -0.17,
        0.16,
        0.27,
        3.6,
        1,
        "#d9b887",
      );
      zone(
        "play-a",
        "Игровой двор младшей группы",
        -0.23,
        0.22,
        0.24,
        0.23,
        "rubber",
        "#d4b07e",
        "Мягкое покрытие, низкий игровой комплекс и теневой навес.",
      );
      zone(
        "play-b",
        "Игровой двор старшей группы",
        0.25,
        0.22,
        0.23,
        0.23,
        "rubber",
        "#93b0a6",
        "Двигательные игры, лазание и места спокойных занятий.",
      );
      asset("play", -0.25, 0.22, 0, 0);
      asset("play", 0.25, 0.22, 0, 1);
      asset("pergola", -0.28, 0.34);
      asset("pergola", 0.3, 0.34);
    } else if (cat === "school") {
      volume(
        "classrooms",
        "Учебное крыло",
        -0.23,
        -0.09,
        0.25,
        0.56,
        12,
        3,
        "#d0b99c",
      );
      volume(
        "main",
        "Общий корпус и столовая",
        0.04,
        -0.28,
        0.39,
        0.18,
        8,
        2,
        "#ded4be",
        "green",
      );
      volume(
        "gym",
        "Спортивный зал",
        0.28,
        -0.12,
        0.23,
        0.35,
        7.2,
        1,
        "#9fafaa",
      );
      zone(
        "court",
        "Уличный спортивный двор",
        0.26,
        0.21,
        0.25,
        0.25,
        "rubber",
        "#a6b5a2",
        "Малые игровые занятия и разминка.",
      );
      asset("sports", 0.25, 0.22);
      asset("pergola", -0.25, 0.23);
    } else if (cat === "health") {
      volume(
        "main",
        "Амбулаторный корпус",
        -0.1,
        -0.12,
        0.56,
        0.43,
        10.5,
        3,
        "#e3ded0",
      );
      volume(
        "diagnostics",
        "Диагностическое крыло",
        0.29,
        -0.15,
        0.19,
        0.31,
        4.2,
        1,
        "#b6cbc6",
        "green",
      );
      zone(
        "waiting",
        "Сад ожидания",
        -0.29,
        0.23,
        0.22,
        0.2,
        "grass",
        "#abc49a",
        "Теневые места ожидания и обзор входной группы.",
      );
      asset("pergola", -0.25, 0.27);
    } else if (cat === "sport") {
      zone(
        "court",
        "Многофункциональное поле",
        0,
        -0.12,
        0.57,
        0.57,
        "rubber",
        "#8fa993",
        "Игры с мячом; разметка и оборудование уточняются по выбранным видам спорта.",
      );
      volume(
        "changing",
        "Раздевалки и прокат",
        -0.31,
        0.27,
        0.23,
        0.17,
        3.6,
        1,
        "#c8b79d",
        "green",
      );
      asset("sports", 0, -0.12);
      path(
        "track",
        "Разминочная петля",
        [
          [-0.4, 0.4],
          [-0.4, -0.43],
          [0.4, -0.43],
          [0.4, 0.4],
          [-0.4, 0.4],
        ],
        1.8,
        "#cfaf96",
      );
      asset("play", 0.32, 0.28, 0, 2);
    } else if (cat === "food") {
      volume(
        "shop",
        "Торговый зал",
        -0.03,
        -0.09,
        0.59,
        0.49,
        4.8,
        1,
        "#d3b797",
      );
      volume(
        "service",
        "Склад и загрузка",
        0.31,
        -0.23,
        0.15,
        0.23,
        4,
        1,
        "#b4b5a4",
      );
      zone(
        "service-yard",
        "Хозяйственная площадка",
        0.31,
        -0.4,
        0.23,
        0.12,
        "pavers",
        "#bbc0b5",
        "Служебный подход; маршрут грузового транспорта пока не подтверждён.",
      );
    } else {
      volume(
        "shelter",
        "Навес ожидания",
        0,
        -0.08,
        0.65,
        0.29,
        3.2,
        1,
        "#8ca6a4",
        "canopy",
      );
      zone(
        "boarding",
        "Полоса посадки",
        0,
        0.28,
        0.87,
        0.22,
        "pavers",
        "#e0d3ac",
        "Посадочная кромка требует проверки транспортной схемы и габаритов.",
      );
      asset("sign", -0.37, -0.1);
      asset("bench", -0.17, -0.07);
      asset("bench", 0.17, -0.07);
    }
    for (let i = 0; i < 8; i++) {
      asset("tree", -0.44 + i * 0.125, -0.44, 0, i % 3);
      if (i < 4)
        asset("tree", i % 2 ? -0.43 : 0.43, 0.12 + Math.floor(i / 2) * 0.21);
    }
    [
      [-0.14, 0.36],
      [0.14, 0.36],
      [-0.33, 0.11],
      [0.4, 0.26],
    ].forEach((p, i) => {
      asset("bench", p[0], p[1], i > 1 ? Math.PI / 2 : 0);
      asset("lamp", p[0] + 0.035, p[1] + 0.06);
    });
    asset("flowerbed", -0.36, 0.34);
    asset("flowerbed", 0.35, 0.37);
    plan.viewpoints = [
      {
        id: "entrance",
        name: "Главный вход",
        position: pos(0, 0.46),
        target: pos(0, -0.07),
      },
      {
        id: "courtyard",
        name: "Двор",
        position: pos(-0.34, 0.3),
        target: pos(0.08, 0.12),
      },
      {
        id: "side",
        name: "Боковой подход",
        position: pos(0.43, 0.26),
        target: pos(0, -0.05),
      },
    ];
  }
  asset("bicycle", -0.11, 0.45);
  asset("sign", 0.1, 0.44);
  asset("bin", -0.06, 0.43);
  asset("bin", 0.44, 0.02);
  const segmentGap = (p: PlanPoint, a: PlanPoint, b: PlanPoint) => {
    const dx = b[0] - a[0],
      dz = b[1] - a[1],
      den = dx * dx + dz * dz,
      t = den
        ? Math.max(
            0,
            Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dz) / den),
          )
        : 0;
    return Math.hypot(p[0] - a[0] - dx * t, p[1] - a[1] - dz * t);
  };
  plan.assets = plan.assets.filter(
    (a) =>
      a.kind !== "tree" ||
      !plan.paths.some((path) =>
        path.points
          .slice(1)
          .some(
            (p, i) =>
              segmentGap(a.point, path.points[i], p) < path.width / 2 + 1.6,
          ),
      ),
  );
  plan.viewpoints.push({
    id: "street",
    name: "Со стороны улицы",
    position: [0, h / 2 + 6],
    target: [0, 0],
  });
  if (proposal.category !== "green") {
    const main =
      plan.volumes.find(
        (v) =>
          v.id === "main" ||
          v.id === "shop" ||
          v.id === "shelter" ||
          v.id === "changing",
      ) || plan.volumes[0];
    const approach = plan.paths.find((p) => p.id === "main-access");
    if (main && approach)
      approach.points[approach.points.length - 1] = [
        main.center[0],
        main.center[1] + main.depth / 2 + Math.min(1.8, h * 0.04),
      ];
  }
  const entrance = designGeo(plan, plan.entrances[0].point);
  plan.context.access = road ? [entrance, road.point] : [];
  const obstacles = project.dataset.features.filter(
    (f) => f.kind === "building" || f.kind === "water",
  );
  plan.context.accessClear =
    !!road &&
    Array.from(
      { length: 21 },
      (_, i) =>
        [
          entrance[0] + ((road.point[0] - entrance[0]) * i) / 20,
          entrance[1] + ((road.point[1] - entrance[1]) * i) / 20,
        ] as Point,
    ).every((p) => !blockedPoint(p, obstacles));
  plan.context.neighbors = project.dataset.features
    .filter((f) => f.kind === "building")
    .map((f) => ({
      name: f.name || "Существующее здание",
      point: f.point,
      distance: Math.round(
        f.geometry?.length
          ? Math.min(
              ...f.geometry
                .slice(1)
                .map((v, i) => roadDistance(proposal.point, f.geometry![i], v)),
            )
          : distance(proposal.point, f.point),
      ),
    }))
    .sort((a, b) => a.distance - b.distance)
    .slice(0, 3);
  plan.program = [
    {
      name: "Площадь проектируемого участка",
      value: `${Math.round(w * h).toLocaleString("ru-RU")} м²`,
    },
    { name: "Габариты участка", value: `${w.toFixed(1)} × ${h.toFixed(1)} м` },
    {
      name: "Площадь пятен зданий",
      value: `${Math.round(plan.volumes.reduce((s, v) => s + v.width * v.depth, 0))} м²`,
    },
    { name: "Функциональные зоны", value: `${plan.zones.length}` },
    {
      name: "Деревья",
      value: `${plan.assets.filter((a) => a.kind === "tree").length} шт.`,
    },
    {
      name: "Скамьи / светильники",
      value: `${plan.assets.filter((a) => a.kind === "bench").length} / ${plan.assets.filter((a) => a.kind === "lamp").length} шт.`,
    },
    {
      name: "Расчётная вместимость*",
      value: `${proposal.capacity} ${category(proposal.category).unit}`,
    },
  ];
  if (!plan.context.accessClear)
    plan.fitNotes.push(
      "Прямой подход к дороге не подтверждён: необходимо уточнить пешеходную связь.",
    );
  plan.fit = plan.fitNotes.length ? "needs-review" : "fits";
  return plan;
}

export function createDetailedDesigns(project: Project): DetailedDesign[] {
  const designs: DetailedDesign[] = [];
  for (const proposal of project.proposals)
    designs.push(
      createDetailedDesign(
        project,
        proposal,
        designs.map((d) => d.plot),
      ),
    );
  return designs;
}
export function upgradeDetailedProject(p: Project): Project {
  if (p.stage !== "detailed" || !p.approvedBy) return p;
  if (
    p.designs?.length === p.proposals.length &&
    p.designs.every(
      (d) =>
        d.generation === DESIGN_GENERATION &&
        d.sourceVersion === p.version &&
        p.proposals.some(
          (r) =>
            r.id === d.proposalId &&
            r.point[0] === d.anchor[0] &&
            r.point[1] === d.anchor[1],
        ),
    )
  )
    return p;
  return { ...p, designs: createDetailedDesigns(p) };
}

/** Validate saved geometry before it can reach a renderer or a model exporter. */
export function validateDesign(value: unknown): value is DetailedDesign {
  if (!value || typeof value !== "object") return false;
  const d = value as DetailedDesign,
    num = (n: unknown, max = 10000) =>
      typeof n === "number" && Number.isFinite(n) && Math.abs(n) <= max;
  const point = (p: unknown) =>
    Array.isArray(p) && p.length === 2 && p.every((n) => num(n));
  const geo = (p: unknown) =>
    point(p) &&
    Math.abs((p as number[])[0]) <= 90 &&
    Math.abs((p as number[])[1]) <= 180;
  const text = (s: unknown) => typeof s === "string",
    color = (s: unknown) => typeof s === "string" && /^#[0-9a-f]{6}$/i.test(s);
  const texts = (v: unknown) =>
    Array.isArray(v) && v.length <= 100 && v.every(text);
  const list = (v: unknown, test: (x: any) => boolean, max = 500) =>
    Array.isArray(v) &&
    v.length <= max &&
    v.every((x) => x && typeof x === "object" && test(x));
  return (
    text(d.id) &&
    text(d.proposalId) &&
    Number.isInteger(d.generation) &&
    Number.isInteger(d.sourceVersion) &&
    [
      "school",
      "kindergarten",
      "health",
      "green",
      "sport",
      "food",
      "transit",
    ].includes(d.category) &&
    geo(d.anchor) &&
    point(d.offset) &&
    num(d.angle, Math.PI * 4) &&
    num(d.width, 2000) &&
    d.width > 0 &&
    num(d.depth, 2000) &&
    d.depth > 0 &&
    Array.isArray(d.plot) &&
    d.plot.length === 4 &&
    d.plot.every(geo) &&
    text(d.title) &&
    text(d.subtitle) &&
    texts(d.narrative) &&
    ["fits", "needs-review"].includes(d.fit) &&
    texts(d.fitNotes) &&
    list(
      d.zones,
      (z) =>
        text(z.id) &&
        text(z.name) &&
        text(z.description) &&
        ["grass", "pavers", "rubber", "sand", "deck", "planting"].includes(
          z.surface,
        ) &&
        color(z.color) &&
        Array.isArray(z.polygon) &&
        z.polygon.length >= 3 &&
        z.polygon.length <= 100 &&
        z.polygon.every(point),
    ) &&
    list(
      d.paths,
      (p) =>
        text(p.id) &&
        text(p.name) &&
        num(p.width, 50) &&
        p.width > 0 &&
        color(p.color) &&
        Array.isArray(p.points) &&
        p.points.length >= 2 &&
        p.points.length <= 100 &&
        p.points.every(point),
    ) &&
    list(
      d.volumes,
      (v) =>
        text(v.id) &&
        text(v.name) &&
        point(v.center) &&
        num(v.width, 1000) &&
        v.width > 0 &&
        num(v.depth, 1000) &&
        v.depth > 0 &&
        num(v.height, 300) &&
        v.height > 0 &&
        Number.isInteger(v.floors) &&
        v.floors > 0 &&
        v.floors <= 100 &&
        color(v.color) &&
        ["flat", "green", "canopy"].includes(v.roof),
    ) &&
    list(
      d.assets,
      (a) =>
        text(a.id) &&
        [
          "tree",
          "bench",
          "lamp",
          "bin",
          "bicycle",
          "pergola",
          "play",
          "flowerbed",
          "sign",
          "sports",
          "fountain",
        ].includes(a.kind) &&
        point(a.point) &&
        num(a.rotation, Math.PI * 4) &&
        (a.variant === undefined || Number.isInteger(a.variant)),
    ) &&
    list(
      d.entrances,
      (e) =>
        text(e.id) &&
        text(e.name) &&
        point(e.point) &&
        num(e.width, 50) &&
        e.width > 0 &&
        ["main", "secondary", "service"].includes(e.kind),
    ) &&
    list(
      d.viewpoints,
      (v) => text(v.id) && text(v.name) && point(v.position) && point(v.target),
      20,
    ) &&
    d.viewpoints.length > 0 &&
    list(d.materials, (m) => text(m.name) && text(m.use) && color(m.color)) &&
    list(d.program, (p) => text(p.name) && text(p.value)) &&
    texts(d.phases) &&
    texts(d.requirements) &&
    !!d.context &&
    text(d.context.roadName) &&
    (d.context.roadPoint === undefined || geo(d.context.roadPoint)) &&
    (d.context.roadDistance === undefined ||
      num(d.context.roadDistance, 100000)) &&
    typeof d.context.accessClear === "boolean" &&
    Array.isArray(d.context.access) &&
    d.context.access.length <= 100 &&
    d.context.access.every(geo) &&
    list(
      d.context.neighbors,
      (n) => text(n.name) && num(n.distance, 100000) && geo(n.point),
    )
  );
}
