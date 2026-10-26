import { useEffect, useState } from "react";
import {
  MapContainer,
  TileLayer,
  Rectangle,
  CircleMarker,
  Popup,
  Tooltip,
  useMap,
  useMapEvents,
  Polyline,
  Polygon,
} from "react-leaflet";
import type { Bounds, Point, Project } from "./types";
import { category, DEMO_BOUNDS } from "./engine";

function Fit({ bounds }: { bounds: Bounds }) {
  const map = useMap();
  useEffect(() => {
    map.fitBounds(
      [
        [bounds[0], bounds[1]],
        [bounds[2], bounds[3]],
      ],
      { padding: [35, 35], animate: true },
    );
  }, [map, ...bounds]);
  useEffect(() => {
    const timer = setTimeout(() => map.invalidateSize(), 150);
    return () => clearTimeout(timer);
  }, [map]);
  return null;
}
function Selection({
  selecting,
  onSelect,
  onFirst,
}: {
  selecting: boolean;
  onSelect: (b: Bounds) => void;
  onFirst: (first: boolean) => void;
}) {
  const [first, setFirst] = useState<Point | null>(null);
  const [hover, setHover] = useState<Point | null>(null);
  useEffect(() => {
    setFirst(null);
    setHover(null);
    onFirst(false);
  }, [selecting]);
  useMapEvents({
    click(e) {
      if (!selecting) return;
      const p: Point = [e.latlng.lat, e.latlng.lng];
      if (!first) {
        setFirst(p);
        onFirst(true);
      } else {
        onSelect([
          Math.min(first[0], p[0]),
          Math.min(first[1], p[1]),
          Math.max(first[0], p[0]),
          Math.max(first[1], p[1]),
        ]);
        setFirst(null);
        setHover(null);
        onFirst(false);
      }
    },
    mousemove(e) {
      if (first) setHover([e.latlng.lat, e.latlng.lng]);
    },
  });
  return first && hover ? (
    <Rectangle
      bounds={[first, hover]}
      pathOptions={{ color: "#7860e6", dashArray: "6 5", fillOpacity: 0.1 }}
    />
  ) : first ? (
    <CircleMarker
      center={first}
      radius={4}
      pathOptions={{ color: "#7860e6" }}
    />
  ) : null;
}
export function PickerMap({
  bounds,
  onSelect,
  selecting,
  onFirst,
}: {
  bounds: Bounds;
  onSelect: (b: Bounds) => void;
  selecting: boolean;
  onFirst: (first: boolean) => void;
}) {
  const [failed, setFailed] = useState(false);
  const safe =
    bounds.every(Number.isFinite) &&
    Math.abs(bounds[0]) < 85 &&
    Math.abs(bounds[2]) < 85 &&
    Math.abs(bounds[1]) <= 180 &&
    Math.abs(bounds[3]) <= 180 &&
    bounds[0] < bounds[2] &&
    bounds[1] < bounds[3]
      ? bounds
      : DEMO_BOUNDS;
  return (
    <div className={`picker-map ${selecting ? "selecting-map" : ""}`}>
      <MapContainer
        center={[(safe[0] + safe[2]) / 2, (safe[1] + safe[3]) / 2]}
        zoom={15}
        scrollWheelZoom
      >
        <TileLayer
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">OpenStreetMap</a>'
          eventHandlers={{ tileerror: () => setFailed(true) }}
        />
        <Fit bounds={safe} />
        <Selection
          selecting={selecting}
          onSelect={onSelect}
          onFirst={onFirst}
        />
        <Rectangle
          bounds={[
            [safe[0], safe[1]],
            [safe[2], safe[3]],
          ]}
          pathOptions={{ color: "#7860e6", weight: 2, fillOpacity: 0.12 }}
        />
      </MapContainer>
      {failed && (
        <span className="tile-error">
          Подложка недоступна. Можно задать координаты ниже.
        </span>
      )}
    </div>
  );
}
export default function MapView({
  project,
  active,
  onSelect,
  showExisting,
  showProposals,
}: {
  project: Project;
  active?: string;
  onSelect: (id: string) => void;
  showExisting: boolean;
  showProposals: boolean;
}) {
  const [failed, setFailed] = useState(false);
  return (
    <div className="leaflet-main">
      <MapContainer
        center={[
          (project.bounds[0] + project.bounds[2]) / 2,
          (project.bounds[1] + project.bounds[3]) / 2,
        ]}
        zoom={15}
        scrollWheelZoom
      >
        <TileLayer
          url="https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}.png"
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OSM</a> &copy; <a href="https://carto.com/attributions">CARTO</a>'
          eventHandlers={{ tileerror: () => setFailed(true) }}
        />
        <Fit bounds={project.bounds} />
        {showProposals &&
          project.designs?.map((d) => (
            <Polygon
              key={d.id}
              positions={d.plot}
              pathOptions={{
                color: d.fit === "fits" ? "#8e77b5" : "#c5a26e",
                fillColor: d.category === "green" ? "#9dbb8b" : "#c7b9d9",
                fillOpacity: 0.45,
                weight: 2,
              }}
              eventHandlers={{ click: () => onSelect(d.proposalId) }}
            >
              <Popup>
                <b>{d.title}</b>
                <p>
                  Проектируемый участок: {d.width} × {d.depth} м<br />
                  {d.fit === "fits"
                    ? "Контур проверен по загруженным данным"
                    : "Требуется уточнение границ"}
                </p>
              </Popup>
            </Polygon>
          ))}
        {showProposals &&
          project.designs
            ?.filter((d) => d.context.access.length > 1)
            .map((d) => (
              <Polyline
                key={`access-${d.id}`}
                positions={d.context.access}
                pathOptions={{ color: "#a28bbd", weight: 3, dashArray: "5 5" }}
              />
            ))}
        <Rectangle
          bounds={[
            [project.bounds[0], project.bounds[1]],
            [project.bounds[2], project.bounds[3]],
          ]}
          pathOptions={{
            color: "#8068da",
            weight: 1.5,
            dashArray: "7 5",
            fillOpacity: 0.025,
          }}
        />
        {showExisting &&
          project.dataset.features
            .filter((f) => f.kind === "road" && f.geometry)
            .map((f) => (
              <Polyline
                key={f.id}
                positions={f.geometry!}
                pathOptions={{ color: "#bac2c2", weight: 2, opacity: 0.4 }}
              />
            ))}
        {showExisting &&
          project.dataset.features
            .filter((f) => f.category)
            .map((f) => (
              <CircleMarker
                key={f.id}
                center={f.point}
                radius={5}
                pathOptions={{
                  color: "white",
                  weight: 2,
                  fillColor: category(f.category!).color,
                  fillOpacity: 1,
                }}
              >
                <Popup>
                  <b>{f.name || category(f.category!).singular}</b>
                  <p>
                    Существующий объект
                    {project.dataset.source === "demo"
                      ? " · демоданные"
                      : " · OpenStreetMap"}
                  </p>
                </Popup>
              </CircleMarker>
            ))}
        {showProposals &&
          project.proposals.map((p, i) => (
            <CircleMarker
              key={p.id}
              center={p.point}
              radius={active === p.id ? 17 : 13}
              pathOptions={{
                color: "white",
                weight: 3,
                fillColor: category(p.category).color,
                fillOpacity: 1,
              }}
              eventHandlers={{ click: () => onSelect(p.id) }}
            >
              <Tooltip
                permanent
                direction="center"
                className="proposal-tooltip"
              >
                {String(i + 1).padStart(2, "0")}
              </Tooltip>
              <Popup>
                <b>{p.title}</b>
                <p>
                  Предложение · {p.point.map((n) => n.toFixed(5)).join(", ")}
                </p>
              </Popup>
            </CircleMarker>
          ))}
      </MapContainer>
      {failed && (
        <span className="tile-error">
          Подложка недоступна · объекты показаны по координатам
        </span>
      )}
    </div>
  );
}
