import type { DetailedDesign, PlanPoint, Point } from "./types";
import { designGeo } from "./design";

export default function IsometricDesign({
  design: d,
  at,
  active,
  onSelect,
}: {
  design: DetailedDesign;
  at: (p: Point, z?: number) => Point;
  active?: boolean;
  onSelect?: () => void;
}) {
  const p = (v: PlanPoint, z = 0) => at(designGeo(d, v), z);
  const origin = p([0, 0]),
    unit = p([1, 0]),
    m = Math.hypot(unit[0] - origin[0], unit[1] - origin[1]);
  const pts = (v: PlanPoint[], z = 0) =>
    v.map((q) => p(q, z).join(",")).join(" ");
  const rect = (x: number, z: number, w: number, h: number): PlanPoint[] => [
    [x - w / 2, z - h / 2],
    [x + w / 2, z - h / 2],
    [x + w / 2, z + h / 2],
    [x - w / 2, z + h / 2],
  ];
  const objects = [
    ...d.volumes.map((v) => ({
      key: v.id,
      type: "volume" as const,
      point: v.center,
      value: v,
    })),
    ...d.assets.map((a) => ({
      key: a.id,
      type: "asset" as const,
      point: a.point,
      value: a,
    })),
  ].sort((a, b) => p(a.point)[1] - p(b.point)[1]);
  return (
    <g
      className="isometric-design"
      onClick={onSelect}
      role={onSelect ? "button" : undefined}
      tabIndex={onSelect ? 0 : undefined}
      onKeyDown={(e) => {
        if (e.key === "Enter") onSelect?.();
      }}
      aria-label={`Подробный проект: ${d.title}`}
    >
      <polygon
        points={pts(rect(0, 0, d.width, d.depth))}
        fill="#bdcfa8"
        stroke={active ? "#9474cf" : d.fit === "fits" ? "#8fa47e" : "#c8a472"}
        strokeWidth={active ? Math.max(0.2, m * 0.7) : Math.max(0.15, m * 0.35)}
      />
      {d.zones.map((z) => (
        <polygon key={z.id} points={pts(z.polygon, 0.2 * m)} fill={z.color} />
      ))}
      {d.paths.map((path) => (
        <polyline
          key={path.id}
          points={pts(path.points, 0.3 * m)}
          fill="none"
          stroke={path.color}
          strokeWidth={path.width * m}
          strokeLinejoin="round"
          strokeLinecap="round"
        />
      ))}
      {objects.map((o) => {
        if (o.type === "volume") {
          const v = o.value,
            poly = rect(v.center[0], v.center[1], v.width, v.depth),
            height = v.height * m;
          return (
            <g key={o.key}>
              {poly.map((q, i) => (
                <polygon
                  key={i}
                  points={[
                    p(q),
                    p(poly[(i + 1) % 4]),
                    p(poly[(i + 1) % 4], height),
                    p(q, height),
                  ]
                    .map((x) => x.join(","))
                    .join(" ")}
                  fill={v.color}
                  stroke="#b8b5a350"
                  strokeWidth=".4"
                  style={{ filter: `brightness(${i % 2 ? 0.85 : 1})` }}
                />
              ))}
              <polygon
                points={pts(poly, height)}
                fill={
                  v.roof === "green"
                    ? "#95aa83"
                    : v.roof === "canopy"
                      ? "#b4d0ce"
                      : v.color
                }
                stroke="#ffffffb0"
                strokeWidth=".6"
              />
              {v.roof !== "canopy" &&
                Array.from({ length: v.floors }, (_, floor) =>
                  poly.slice(1, 3).map((q, i) => {
                    const next = poly[i + 2] || poly[0],
                      a = p(q, (height * (floor + 0.48)) / v.floors),
                      b = p(next, (height * (floor + 0.48)) / v.floors);
                    return (
                      <line
                        key={`${floor}-${i}`}
                        x1={a[0]}
                        y1={a[1]}
                        x2={b[0]}
                        y2={b[1]}
                        stroke="#66817e"
                        strokeWidth={Math.max(0.5, m * 1.2)}
                        strokeDasharray={`${m * 1.3} ${m * 0.7}`}
                      />
                    );
                  }),
                )}
            </g>
          );
        }
        const a = o.value,
          [x, y] = p(a.point),
          h = 4.6 * m;
        return (
          <g key={a.id}>
            {a.kind === "tree" ? (
              <>
                <line
                  x1={x}
                  y1={y}
                  x2={x}
                  y2={y - h}
                  stroke="#8c7858"
                  strokeWidth={Math.max(0.5, m * 0.35)}
                />
                <ellipse
                  cx={x + m * 0.5}
                  cy={y - h}
                  rx={2.3 * m}
                  ry={2.9 * m}
                  fill={a.variant === 2 ? "#819b6f" : "#98ae80"}
                />
                <ellipse
                  cx={x - m * 0.6}
                  cy={y - h - m * 0.8}
                  rx={1.5 * m}
                  ry={2 * m}
                  fill="#afc293"
                />
              </>
            ) : a.kind === "bench" ? (
              <>
                <polygon
                  points={pts(rect(a.point[0], a.point[1], 2, 0.65), m * 0.5)}
                  fill="#a67f55"
                />
                <line
                  x1={x - m}
                  y1={y - m}
                  x2={x + m}
                  y2={y - m}
                  stroke="#c7a67c"
                  strokeWidth={m * 0.35}
                />
              </>
            ) : a.kind === "lamp" ? (
              <>
                <line
                  x1={x}
                  y1={y}
                  x2={x}
                  y2={y - 3.8 * m}
                  stroke="#708078"
                  strokeWidth={Math.max(0.5, m * 0.15)}
                />
                <ellipse
                  cx={x}
                  cy={y - 3.8 * m}
                  rx={m * 0.55}
                  ry={m * 0.22}
                  fill="#e5d7b0"
                />
              </>
            ) : a.kind === "pergola" ? (
              <>
                {rect(a.point[0], a.point[1], 5, 3.6).map((q, i) => {
                  const u = p(q);
                  return (
                    <line
                      key={i}
                      x1={u[0]}
                      y1={u[1]}
                      x2={u[0]}
                      y2={u[1] - m * 2.8}
                      stroke="#a5825b"
                      strokeWidth={m * 0.25}
                    />
                  );
                })}
                <polygon
                  points={pts(rect(a.point[0], a.point[1], 5.4, 4), m * 2.8)}
                  fill="#c3a67c"
                  stroke="#a1835d"
                  strokeWidth={m * 0.15}
                />
              </>
            ) : a.kind === "play" ? (
              <>
                <line
                  x1={x - m * 1.2}
                  y1={y}
                  x2={x}
                  y2={y - m * 2.3}
                  stroke="#a27e55"
                  strokeWidth={m * 0.35}
                />
                <line
                  x1={x + m * 1.2}
                  y1={y}
                  x2={x}
                  y2={y - m * 2.3}
                  stroke="#a27e55"
                  strokeWidth={m * 0.35}
                />
                <path
                  d={`M${x} ${y - m * 1.9}L${x + m * 2.3} ${y + m * 0.3}`}
                  stroke="#cd9673"
                  strokeWidth={m * 0.7}
                />
              </>
            ) : a.kind === "fountain" ? (
              <>
                <ellipse
                  cx={x}
                  cy={y}
                  rx={m * 1.7}
                  ry={m * 0.9}
                  fill="#b5d6d4"
                  stroke="#d7cfb6"
                  strokeWidth={m * 0.4}
                />
                <path
                  d={`M${x} ${y}v${-m * 1.5}`}
                  stroke="#dbeeed"
                  strokeWidth={m * 0.4}
                />
              </>
            ) : a.kind === "flowerbed" ? (
              <ellipse cx={x} cy={y} rx={m * 2} ry={m} fill="#a7a17f" />
            ) : a.kind === "sports" ? (
              <>
                <line
                  x1={x}
                  y1={y}
                  x2={x}
                  y2={y - m * 3}
                  stroke="#81958c"
                  strokeWidth={m * 0.25}
                />
                <rect
                  x={x - m * 0.9}
                  y={y - m * 3.5}
                  width={m * 1.8}
                  height={m}
                  fill="#e7e3d0"
                />
              </>
            ) : (
              <circle cx={x} cy={y - m * 0.4} r={m * 0.35} fill="#718477" />
            )}
          </g>
        );
      })}
      {d.context.access.length > 1 && (
        <polyline
          points={d.context.access
            .map((q) => at(q, 0.2 * m).join(","))
            .join(" ")}
          fill="none"
          stroke="#b69dcc"
          strokeWidth={Math.max(1, m * 1.5)}
          strokeDasharray={`${m * 2} ${m * 1.5}`}
        />
      )}
    </g>
  );
}
