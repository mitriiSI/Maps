import { useId } from "react";
import type { Feature, Point, Project, Proposal } from "./types";
import { category } from "./engine";

export default function Schematic({
  project,
  active,
  onSelect,
  zoom = 1,
  rotation = 0,
  showExisting = true,
  showProposals = true,
  detailed = false,
}: {
  project: Project;
  active?: string;
  onSelect?: (id: string) => void;
  zoom?: number;
  rotation?: number;
  showExisting?: boolean;
  showProposals?: boolean;
  detailed?: boolean;
}) {
  const prefix = useId().replace(/:/g, "");
  const b = project.bounds;
  const xy = (p: Point) => [
    (p[1] - b[1]) / (b[3] - b[1]),
    (b[2] - p[0]) / (b[2] - b[0]),
  ];
  const projectPoint = (x: number, y: number, z = 0): Point => [
    500 + (x - y) * 424,
    100 + (x + y) * 238 - z,
  ];
  const at = (p: Point, z = 0) => {
    const [x, y] = xy(p);
    return projectPoint(x, y, z);
  };
  const path = (points: Point[], z = 0) =>
    points.map((p) => at(p, z).join(",")).join(" ");
  const ground = [
    [0, 0],
    [1, 0],
    [1, 1],
    [0, 1],
  ]
    .map(([x, y]) => projectPoint(x, y).join(","))
    .join(" ");
  const buildings = project.dataset.features
    .filter((f) => f.kind === "building" && f.geometry?.length)
    .sort((a, c) => {
      const [x, y] = xy(a.point),
        [u, v] = xy(c.point);
      return x + y - u - v;
    });
  const structure = (f: Feature | Proposal, isProposal = false, index = 0) => {
    const isPark = isProposal && "category" in f && f.category === "green";
    const color = isProposal
      ? category((f as Proposal).category).color
      : "#d8dddf";
    const [x, y] = xy(f.point),
      size = isPark ? 0.095 : 0.035;
    const geometry: Point[] =
      "geometry" in f && f.geometry?.length
        ? f.geometry
        : [
            [
              b[2] - (y - size) * (b[2] - b[0]),
              b[1] + (x - size) * (b[3] - b[1]),
            ],
            [
              b[2] - (y - size) * (b[2] - b[0]),
              b[1] + (x + size) * (b[3] - b[1]),
            ],
            [
              b[2] - (y + size) * (b[2] - b[0]),
              b[1] + (x + size) * (b[3] - b[1]),
            ],
            [
              b[2] - (y + size) * (b[2] - b[0]),
              b[1] + (x - size) * (b[3] - b[1]),
            ],
          ];
    const vertices =
      geometry.length > 1 &&
      geometry[0][0] === geometry.at(-1)![0] &&
      geometry[0][1] === geometry.at(-1)![1]
        ? geometry.slice(0, -1)
        : geometry;
    const h = isPark
      ? 3
      : isProposal
        ? 23
        : Math.min(54, ("levels" in f ? f.levels || 3 : 3) * 3.3);
    const [px, py] = projectPoint(x, y, h);
    return (
      <g
        key={f.id}
        className={isProposal ? "svg-proposal" : ""}
        onClick={isProposal ? () => onSelect?.(f.id) : undefined}
        role={isProposal ? "button" : undefined}
        tabIndex={isProposal ? 0 : undefined}
        onKeyDown={
          isProposal
            ? (e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  onSelect?.(f.id);
                }
              }
            : undefined
        }
        aria-label={
          isProposal ? `${index + 1}. ${(f as Proposal).title}` : undefined
        }
      >
        <polygon
          points={path(vertices)}
          fill="#52606b"
          opacity=".07"
          transform="translate(10 9)"
        />
        {vertices.map((p, i) => (
          <polygon
            key={i}
            points={[
              at(p),
              at(vertices[(i + 1) % vertices.length]),
              at(vertices[(i + 1) % vertices.length], h),
              at(p, h),
            ]
              .map((a) => a.join(","))
              .join(" ")}
            fill={color}
            stroke={isProposal ? color : "#bfc6c9"}
            strokeWidth=".65"
            style={{ filter: `brightness(${i % 2 ? 0.83 : 0.94})` }}
          />
        ))}
        <polygon
          points={path(vertices, h)}
          fill={isPark ? "#9ec5a4" : isProposal ? color : "#f2f3f1"}
          stroke={active === f.id ? "#7258e6" : isProposal ? "#fff" : "#cfd4d4"}
          strokeWidth={active === f.id ? 3 : 1}
        />
        {!isPark && (
          <polyline
            points={path(
              vertices.map((p) => [p[0] + 0.00006, p[1] - 0.00007]),
              h + 1,
            )}
            fill="none"
            stroke={isProposal ? "#fff" : "#dce0df"}
            strokeWidth={1.1}
            opacity=".7"
          />
        )}
        {detailed &&
          !isPark &&
          vertices.slice(0, 2).map((p, i) => (
            <g key={i}>
              {[0.25, 0.5, 0.75].map((t) => {
                const q = at(p, h * t),
                  z = at(vertices[(i + 1) % vertices.length], h * t);
                return (
                  <line
                    key={t}
                    x1={q[0]}
                    y1={q[1]}
                    x2={z[0]}
                    y2={z[1]}
                    stroke={isProposal ? "#ffffff90" : "#b2bdc2"}
                    strokeWidth="1"
                  />
                );
              })}
            </g>
          ))}
        {isPark &&
          [-1, 0, 1].map((v) => (
            <g key={v} transform={`translate(${px + v * 20} ${py + v * 5})`}>
              <path d="M0 0v-13" stroke="#658474" strokeWidth="2" />
              <ellipse cy="-17" rx="10" ry="13" fill="#6b9b79" />
            </g>
          ))}
        {isProposal && (
          <>
            <line
              x1={px}
              y1={py - 3}
              x2={px}
              y2={py - 52}
              stroke={color}
              strokeWidth="1.5"
            />
            <circle
              cx={px}
              cy={py - 64}
              r={active === f.id ? 21 : 18}
              fill={color}
              stroke="white"
              strokeWidth="4"
              filter={`url(#${prefix}-shadow)`}
            />
            <text
              x={px}
              y={py - 59}
              textAnchor="middle"
              fill="white"
              fontSize="12"
              fontWeight="700"
            >
              {String(index + 1).padStart(2, "0")}
            </text>
            {detailed && (
              <g transform={`translate(${px + 25} ${py - 76})`}>
                <rect
                  width="142"
                  height="41"
                  rx="6"
                  fill="white"
                  stroke="#e1e4e7"
                />
                <text x="9" y="16" fontSize="9" fill="#353c40">
                  {(f as Proposal).title}
                </text>
                <text x="9" y="30" fontSize="8" fill="#798288">
                  {(f as Proposal).capacity}{" "}
                  {category((f as Proposal).category).unit}
                </text>
              </g>
            )}
          </>
        )}
      </g>
    );
  };
  return (
    <svg
      id="city-schematic"
      className="city-schematic"
      viewBox="0 0 1000 730"
      xmlns="http://www.w3.org/2000/svg"
      aria-label={
        detailed
          ? "Детализированный концептуальный макет участка"
          : "Объёмный эскиз выбранной территории"
      }
    >
      <defs>
        <pattern
          id={`${prefix}-grid`}
          width="22"
          height="22"
          patternUnits="userSpaceOnUse"
        >
          <circle cx="1" cy="1" r=".7" fill="#d7dedc" />
        </pattern>
        <filter id={`${prefix}-shadow`}>
          <feDropShadow dx="0" dy="3" stdDeviation="3" floodOpacity=".13" />
        </filter>
        <clipPath id={`${prefix}-clip`}>
          <polygon points={ground} />
        </clipPath>
      </defs>
      <rect width="1000" height="730" fill="#eef1ee" />
      <rect
        width="1000"
        height="730"
        fill={`url(#${prefix}-grid)`}
        opacity=".65"
      />
      <g
        transform={`translate(500 365) scale(${zoom}) rotate(${rotation}) translate(-500 -365)`}
      >
        <polygon
          points={ground}
          fill="#cfd8d0"
          transform="translate(0 11)"
          opacity=".6"
        />
        <polygon
          points={ground}
          fill="#e6eae3"
          stroke="#d4dcd5"
          strokeWidth="1"
        />
        <g clipPath={`url(#${prefix}-clip)`}>
          {project.dataset.features
            .filter((f) => f.kind === "water" || f.kind === "park")
            .flatMap((f) =>
              (f.polygons?.length ? f.polygons : [f.geometry || []]).map(
                (polygon, i) => (
                  <polygon
                    key={`${f.id}-${i}`}
                    points={path(polygon)}
                    fill={f.kind === "water" ? "#b6d6d8" : "#bfd1b8"}
                  />
                ),
              ),
            )}
          {project.dataset.features
            .filter((f) => f.kind === "road" && f.geometry?.length)
            .map((f) => (
              <g key={f.id}>
                <polyline
                  points={path(f.geometry!)}
                  fill="none"
                  stroke="#d7dbd3"
                  strokeWidth={f.major ? 17 : 10}
                  strokeLinejoin="round"
                />
                <polyline
                  points={path(f.geometry!)}
                  fill="none"
                  stroke="#f9faf5"
                  strokeWidth={f.major ? 13 : 7}
                  strokeLinejoin="round"
                />
                {detailed && (
                  <polyline
                    points={path(f.geometry!)}
                    fill="none"
                    stroke="#d2d5cb"
                    strokeWidth=".7"
                    strokeDasharray="3 5"
                  />
                )}
              </g>
            ))}
          {Array.from({ length: detailed ? 90 : 50 }, (_, i) => {
            if (project.dataset.source !== "demo") return null;
            const x = 0.07 + (i % 10) * 0.081,
              y = 0.083 + Math.floor(i / 10) * 0.161,
              [px, py] = projectPoint(x, y);
            return (
              <g key={i} transform={`translate(${px} ${py})`}>
                <ellipse cy="2" rx="6" ry="3" fill="#56765b" opacity=".12" />
                <path d="M0 0v-6" stroke="#8b9b7d" strokeWidth="1.5" />
                <ellipse
                  cy="-9"
                  rx="5"
                  ry="7"
                  fill={i % 3 === 0 ? "#97b28a" : "#aac19b"}
                />
              </g>
            );
          })}
          {showExisting && buildings.slice(0, 800).map((f) => structure(f))}
          {showExisting &&
            project.dataset.features
              .filter((f) => f.category && f.kind !== "building")
              .map((f) => {
                const [px, py] = at(f.point);
                return (
                  <g key={f.id}>
                    <circle
                      cx={px}
                      cy={py}
                      r="6.5"
                      fill="white"
                      stroke="#fff"
                      strokeWidth="2"
                    />
                    <circle
                      cx={px}
                      cy={py}
                      r="3.5"
                      fill={category(f.category!).color}
                    />
                  </g>
                );
              })}
        </g>
        <polygon
          points={ground}
          fill="none"
          stroke="#8c78cd"
          strokeWidth="1.6"
          strokeDasharray="7 5"
          opacity=".8"
        />
        {project.dataset.source === "demo" && (
          <g fill="#8f9a95" fontSize="10" letterSpacing="1.7">
            <text x="300" y="428" transform="rotate(29 300 428)">
              БУЛЬВАР БРАТЬЕВ ВЕСНИНЫХ
            </text>
            <text
              x="639"
              y="378"
              transform="rotate(-29 639 378)"
              fill="#80a9af"
            >
              МОСКВА-РЕКА
            </text>
            <text x="454" y="182" transform="rotate(29 454 182)">
              УЛ. ЛИСИЦКОГО
            </text>
          </g>
        )}
        {showProposals &&
          project.proposals.map((p, i) => structure(p, true, i))}
      </g>
    </svg>
  );
}
