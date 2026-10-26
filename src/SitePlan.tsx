import { useId } from "react";
import type { DetailedDesign, PlanAsset, PlanPoint, Project } from "./types";
import { designLocal } from "./design";

function AssetSymbol({ asset }: { asset: PlanAsset }) {
  const { kind, point, rotation } = asset;
  return (
    <g
      transform={`translate(${point[0]} ${point[1]}) rotate(${(rotation * 180) / Math.PI})`}
    >
      {kind === "tree" ? (
        <>
          <circle r="2.2" fill="#93b07c" stroke="#6f8d67" strokeWidth=".16" />
          <circle cx="-.5" cy="-.6" r="1.3" fill="#b0c598" />
          <circle r=".18" fill="#7e7055" />
        </>
      ) : kind === "bench" ? (
        <>
          <rect x="-1" y="-.32" width="2" height=".64" rx=".1" fill="#af835a" />
          <path d="M-1 -.12H1M-1 .1H1" stroke="#d4af83" strokeWidth=".1" />
        </>
      ) : kind === "lamp" ? (
        <>
          <circle r=".6" fill="none" stroke="#b6a45e" strokeWidth=".15" />
          <circle r=".22" fill="#65716e" />
        </>
      ) : kind === "pergola" ? (
        <>
          <rect
            x="-2.5"
            y="-1.8"
            width="5"
            height="3.6"
            fill="#ba956c"
            fillOpacity=".5"
            stroke="#977653"
            strokeWidth=".2"
          />
          {[-2, -1, 0, 1, 2].map((x) => (
            <path
              key={x}
              d={`M${x} -1.8V1.8`}
              stroke="#957653"
              strokeWidth=".18"
            />
          ))}
        </>
      ) : kind === "play" ? (
        <>
          <rect
            x="-1.5"
            y="-1"
            width="3"
            height="2"
            rx=".4"
            fill="#d99c71"
            stroke="#a1795c"
            strokeWidth=".15"
          />
          <path d="M-1 0H1M0 -1V1" stroke="#f6d5a7" strokeWidth=".2" />
        </>
      ) : kind === "bicycle" ? (
        <path
          d="M-1.5 -.6V.6M-.6 -.6V.6M.3 -.6V.6M1.2 -.6V.6"
          stroke="#667473"
          strokeWidth=".22"
        />
      ) : kind === "flowerbed" ? (
        <>
          <ellipse rx="1.9" ry="1" fill="#82956d" />
          {[-1, 0, 1].map((x) => (
            <circle key={x} cx={x} r=".35" fill="#cfa1a0" />
          ))}
        </>
      ) : kind === "fountain" ? (
        <>
          <circle r="1.5" fill="#b9d5d5" stroke="#dfd6bf" strokeWidth=".35" />
          <circle r=".45" fill="#d9eeed" />
        </>
      ) : kind === "sports" ? (
        <>
          <rect
            x="-3"
            y="-5"
            width="6"
            height="10"
            fill="none"
            stroke="white"
            strokeWidth=".15"
          />
          <circle r="1.2" fill="none" stroke="white" strokeWidth=".15" />
          <path d="M-3 0H3" stroke="white" strokeWidth=".15" />
        </>
      ) : (
        <rect x="-.3" y="-.3" width=".6" height=".6" fill="#7f8b80" rx=".1" />
      )}
    </g>
  );
}
export default function SitePlan({
  design: d,
  project,
  showLabels = true,
  onViewpoint,
  camera,
}: {
  design: DetailedDesign;
  project?: Project;
  showLabels?: boolean;
  onViewpoint?: (id: string) => void;
  camera?: PlanPoint;
}) {
  const id = useId().replace(/:/g, ""),
    margin = Math.max(9, Math.min(22, d.width * 0.2)),
    x = -d.width / 2 - margin,
    z = -d.depth / 2 - margin,
    width = d.width + margin * 2,
    height = d.depth + margin * 2;
  const pts = (p: PlanPoint[]) => p.map((v) => v.join(",")).join(" ");
  const fs = Math.max(1.25, Math.min(2.5, d.width * 0.03));
  return (
    <svg
      className="site-plan"
      viewBox={`${x} ${z} ${width} ${height}`}
      xmlns="http://www.w3.org/2000/svg"
      aria-label={`Генплан: ${d.title}. Габариты ${d.width} на ${d.depth} метров`}
    >
      <defs>
        <pattern
          id={`${id}-dots`}
          width="3"
          height="3"
          patternUnits="userSpaceOnUse"
        >
          <circle r=".08" fill="#a8b39d" />
        </pattern>
        <clipPath id={`${id}-clip`}>
          <rect x={x} y={z} width={width} height={height} />
        </clipPath>
      </defs>
      <rect x={x} y={z} width={width} height={height} fill="#f1f3ed" />
      <rect
        x={x}
        y={z}
        width={width}
        height={height}
        fill={`url(#${id}-dots)`}
      />
      <g clipPath={`url(#${id}-clip)`} opacity=".5">
        {project?.dataset.features
          .filter((f) => f.geometry)
          .map((f) =>
            f.kind === "road" ? (
              <polyline
                key={f.id}
                points={pts(f.geometry!.map((p) => designLocal(d, p)))}
                stroke="#d2d4ca"
                strokeWidth={f.major ? 7 : 4}
                fill="none"
              />
            ) : ["building", "water", "park"].includes(f.kind) ? (
              <polygon
                key={f.id}
                points={pts(f.geometry!.map((p) => designLocal(d, p)))}
                fill={
                  f.kind === "water"
                    ? "#b4d3d5"
                    : f.kind === "park"
                      ? "#c5d5bd"
                      : "#d6d9d3"
                }
                stroke="#bfc7bf"
                strokeWidth=".2"
              />
            ) : null,
          )}
      </g>
      {d.context.access.length > 1 && (
        <polyline
          points={pts(d.context.access.map((p) => designLocal(d, p)))}
          fill="none"
          stroke={d.context.accessClear ? "#a38bbc" : "#cfaa77"}
          strokeWidth="1.8"
          strokeDasharray="1 1"
        />
      )}
      <rect
        x={-d.width / 2}
        y={-d.depth / 2}
        width={d.width}
        height={d.depth}
        fill="#c3d0aa"
        stroke={d.fit === "fits" ? "#8e9e83" : "#c0a173"}
        strokeWidth=".3"
      />
      {d.zones.map((zone) => (
        <polygon
          key={zone.id}
          points={pts(zone.polygon)}
          fill={zone.color}
          stroke="#ffffff65"
          strokeWidth=".25"
        />
      ))}
      {d.paths.map((path) => (
        <polyline
          key={path.id}
          points={pts(path.points)}
          stroke={path.color}
          strokeWidth={path.width}
          strokeLinecap="round"
          strokeLinejoin="round"
          fill="none"
        />
      ))}
      {d.volumes.map((v, i) => (
        <g key={v.id}>
          <rect
            x={v.center[0] - v.width / 2 + 0.6}
            y={v.center[1] - v.depth / 2 + 0.6}
            width={v.width}
            height={v.depth}
            fill="#55645d"
            opacity=".13"
          />
          <rect
            x={v.center[0] - v.width / 2}
            y={v.center[1] - v.depth / 2}
            width={v.width}
            height={v.depth}
            fill={v.roof === "green" ? "#91a783" : v.color}
            stroke="#ffffff"
            strokeWidth=".4"
          />
          <rect
            x={v.center[0] - v.width / 2 + 0.7}
            y={v.center[1] - v.depth / 2 + 0.7}
            width={Math.max(0.1, v.width - 1.4)}
            height={Math.max(0.1, v.depth - 1.4)}
            fill="none"
            stroke="#ffffff80"
            strokeWidth=".2"
          />
          <text
            x={v.center[0]}
            y={v.center[1] + fs * 0.35}
            textAnchor="middle"
            fill="#566159"
            fontSize={fs * 1.15}
            fontFamily="system-ui"
            fontWeight="600"
          >
            {String.fromCharCode(65 + i)}
          </text>
        </g>
      ))}
      {d.assets.map((asset) => (
        <AssetSymbol key={asset.id} asset={asset} />
      ))}
      {showLabels &&
        d.zones.map((zone, i) => {
          const center = zone.polygon.reduce<PlanPoint>(
            (s, p) => [
              s[0] + p[0] / zone.polygon.length,
              s[1] + p[1] / zone.polygon.length,
            ],
            [0, 0],
          );
          return (
            <g key={zone.id} transform={`translate(${center.join(" ")})`}>
              <circle
                r={fs * 0.7}
                fill="white"
                fillOpacity=".85"
                stroke="#82947c"
                strokeWidth=".1"
              />
              <text
                y={fs * 0.3}
                textAnchor="middle"
                fontSize={fs * 0.8}
                fontFamily="system-ui"
                fill="#66785f"
              >
                {i + 1}
              </text>
            </g>
          );
        })}
      {d.entrances.map((e) => (
        <g key={e.id}>
          <circle
            cx={e.point[0]}
            cy={e.point[1]}
            r={fs * 0.55}
            fill={e.kind === "main" ? "#8d78b0" : "#b1a18c"}
            stroke="white"
            strokeWidth=".25"
          />
          <path
            d={`M${e.point[0]} ${e.point[1] + fs * 0.45}v${fs * 1.8}`}
            stroke="#8d78b0"
            strokeWidth=".25"
            markerEnd="none"
          />
          {showLabels && e.kind === "main" && (
            <text
              x={e.point[0]}
              y={e.point[1] + fs * 3.4}
              textAnchor="middle"
              fontSize={fs * 0.9}
              fontFamily="system-ui"
              fill="#8a7c99"
            >
              Главный вход
            </text>
          )}
        </g>
      ))}
      <g stroke="#9b9e93" strokeWidth=".16" fill="none">
        <path
          d={`M${-d.width / 2} ${d.depth / 2 + margin * 0.65}H${d.width / 2}M${-d.width / 2} ${d.depth / 2 + margin * 0.5}v${margin * 0.3}M${d.width / 2} ${d.depth / 2 + margin * 0.5}v${margin * 0.3}`}
        />
        <path
          d={`M${d.width / 2 + margin * 0.65} ${-d.depth / 2}V${d.depth / 2}M${d.width / 2 + margin * 0.5} ${-d.depth / 2}h${margin * 0.3}M${d.width / 2 + margin * 0.5} ${d.depth / 2}h${margin * 0.3}`}
        />
      </g>
      <text
        x="0"
        y={d.depth / 2 + margin * 0.61}
        textAnchor="middle"
        fontSize={fs}
        fill="#8c9386"
        fontFamily="system-ui"
      >
        {d.width.toFixed(1)} м
      </text>
      <text
        x={d.width / 2 + margin * 0.7}
        y="0"
        fontSize={fs}
        fill="#8c9386"
        fontFamily="system-ui"
        transform={`rotate(-90 ${d.width / 2 + margin * 0.7} 0)`}
        textAnchor="middle"
      >
        {d.depth.toFixed(1)} м
      </text>
      <g
        transform={`translate(${-d.width / 2 - margin * 0.5} ${-d.depth / 2 - margin * 0.35})`}
      >
        <text
          y={-fs * 1.5}
          textAnchor="middle"
          fill="#83927c"
          fontSize={fs * 0.8}
          fontFamily="system-ui"
        >
          С
        </text>
        <path
          d={`M0 ${-fs}L${fs * 0.45} ${fs}L0 ${fs * 0.6}L${-fs * 0.45} ${fs}Z`}
          fill="#8b9d82"
          transform={`rotate(${(-d.angle * 180) / Math.PI})`}
        />
      </g>
      {onViewpoint &&
        d.viewpoints.map((v, i) => (
          <g
            key={v.id}
            onClick={() => onViewpoint(v.id)}
            role="button"
            tabIndex={0}
            onKeyDown={(e) => {
              if (e.key === "Enter") onViewpoint(v.id);
            }}
            aria-label={`Панорама: ${v.name}`}
            style={{ cursor: "pointer" }}
          >
            <circle
              cx={v.position[0]}
              cy={v.position[1]}
              r={fs}
              fill="#8976b3"
              stroke="white"
              strokeWidth=".35"
            />
            <text
              x={v.position[0]}
              y={v.position[1] + fs * 0.3}
              fontSize={fs * 0.8}
              textAnchor="middle"
              fill="white"
              fontFamily="system-ui"
            >
              {i + 1}
            </text>
          </g>
        ))}
      {camera && (
        <g transform={`translate(${camera.join(" ")})`}>
          <circle r="1.4" fill="#7960d9" stroke="white" strokeWidth=".4" />
          <circle r="3" fill="none" stroke="#7960d960" strokeWidth=".3" />
        </g>
      )}
    </svg>
  );
}
