import { useState } from "react";
import {
  ArrowDownToLine,
  ArrowUpRight,
  Box,
  Check,
  Eye,
  Layers3,
  Leaf,
  MapPin,
  Ruler,
  Sparkles,
  TriangleAlert,
} from "lucide-react";
import type { DetailedDesign, Project } from "./types";
import SitePlan from "./SitePlan";
import { polygonArea } from "./design";
import { download } from "./storage";

export default function DesignWorkspace({
  project,
  design,
  onChoose,
  onPanorama,
  onFocus,
  onMessage,
}: {
  project: Project;
  design: DetailedDesign;
  onChoose: (id: string) => void;
  onPanorama: () => void;
  onFocus: () => void;
  onMessage: (s: string) => void;
}) {
  const [tab, setTab] = useState("concept"),
    [busy, setBusy] = useState(false),
    [zoneId, setZoneId] = useState("");
  const zone = design.zones.find((z) => z.id === zoneId) || design.zones[0];
  const svg = async () => {
    const { renderToStaticMarkup } = await import("react-dom/server");
    download(
      `forma-plan-${design.proposalId}.svg`,
      renderToStaticMarkup(<SitePlan design={design} project={project} />),
      "image/svg+xml",
    );
    onMessage("Генплан с размерами и привязкой сохранён в SVG.");
  };
  const glb = async () => {
    setBusy(true);
    try {
      const { exportDetailedModel } = await import("./modelExport");
      await exportDetailedModel(project, design);
      onMessage(
        "3D-проект в метрах сохранён в GLB. Его можно открыть в Blender и других 3D-редакторах.",
      );
    } catch (e) {
      onMessage(
        e instanceof Error ? e.message : "Не удалось сохранить 3D-проект.",
      );
    } finally {
      setBusy(false);
    }
  };
  return (
    <section
      className="design-workspace"
      aria-label="Подробный проект инфраструктуры"
    >
      <div className="design-heading">
        <div>
          <span className="design-eyebrow">
            <Layers3 size={13} />
            ПОДРОБНЫЙ ПРОЕКТ ОБЪЕКТА
          </span>
          <h2>{design.title}</h2>
          <p>{design.subtitle}</p>
        </div>
        <div className="design-heading-actions">
          <button className="button" onClick={svg}>
            <ArrowDownToLine size={15} />
            Генплан SVG
          </button>
          <button className="button primary" onClick={onPanorama}>
            <Eye size={16} />
            Войти в 3D-панораму
            <ArrowUpRight size={14} />
          </button>
        </div>
      </div>
      <div className="design-object-strip" aria-label="Объект проектирования">
        {project.designs?.map((d, i) => (
          <button
            key={d.id}
            className={d.id === design.id ? "active" : ""}
            onClick={() => {
              onChoose(d.proposalId);
              setZoneId("");
            }}
          >
            <span>{String(i + 1).padStart(2, "0")}</span>
            {project.proposals.find((p) => p.id === d.proposalId)?.title}
            <small>{Math.round(d.width * d.depth)} м²</small>
          </button>
        ))}
      </div>
      <div className="design-content">
        <div className="design-plan-column">
          <div className="design-plan-heading">
            <span>
              <Ruler size={15} />
              Генплан и размещение в окружении
            </span>
            <button onClick={onFocus}>
              Приблизить на 3D-карте
              <ArrowUpRight size={13} />
            </button>
          </div>
          <div className="design-plan-canvas">
            <SitePlan design={design} project={project} />
            <button className="plan-panorama-link" onClick={onPanorama}>
              <Eye size={14} />
              Осмотреть с уровня человека
            </button>
          </div>
          <div className="design-zone-legend">
            {design.zones.map((z, i) => (
              <button
                key={z.id}
                className={zone.id === z.id ? "active" : ""}
                onClick={() => setZoneId(z.id)}
              >
                <span style={{ background: z.color }}>{i + 1}</span>
                {z.name}
              </button>
            ))}
          </div>
          <div className="design-zone-description">
            <strong>{zone?.name}</strong>
            <p>{zone?.description}</p>
          </div>
          <div className="design-plan-footnote">
            <MapPin size={13} />
            <span>
              {design.anchor.map((n) => n.toFixed(5)).join(", ")} · размеры в
              метрах · север показан на плане
            </span>
          </div>
        </div>
        <div className="design-spec-column">
          <div
            className="design-tabs"
            role="tablist"
            aria-label="Разделы подробного проекта"
          >
            {[
              { id: "concept", name: "Концепция" },
              { id: "program", name: "Состав" },
              { id: "materials", name: "Материалы" },
              { id: "location", name: "Привязка" },
              { id: "phases", name: "Реализация" },
            ].map((t) => (
              <button
                key={t.id}
                role="tab"
                aria-selected={tab === t.id}
                className={tab === t.id ? "active" : ""}
                onClick={() => setTab(t.id)}
              >
                {t.name}
              </button>
            ))}
          </div>
          <div className="design-spec-body">
            {tab === "concept" && (
              <>
                <span className="design-section-kicker">
                  <Sparkles size={13} />
                  Идея пространства
                </span>
                <h3>{design.title}</h3>
                {design.narrative.map((s, i) => (
                  <div className="design-story" key={i}>
                    <span>0{i + 1}</span>
                    <p>{s}</p>
                  </div>
                ))}
                <div className="design-asset-stats">
                  <span>
                    <strong>{design.zones.length}</strong>функциональных зон
                  </span>
                  <span>
                    <strong>
                      {design.assets.filter((a) => a.kind === "tree").length}
                    </strong>
                    деревьев
                  </span>
                  <span>
                    <strong>
                      {design.assets.filter((a) => a.kind === "bench").length}
                    </strong>
                    скамей
                  </span>
                </div>
              </>
            )}
            {tab === "program" && (
              <>
                <span className="design-section-kicker">
                  <Ruler size={13} />
                  Параметры и экспликация
                </span>
                <h3>Что входит в проект</h3>
                <dl className="design-program">
                  {design.program.map((p) => (
                    <div key={p.name}>
                      <dt>{p.name}</dt>
                      <dd>{p.value}</dd>
                    </div>
                  ))}
                </dl>
                <h4>Функциональные зоны</h4>
                {design.zones.map((z, i) => (
                  <div className="design-program-zone" key={z.id}>
                    <span style={{ background: z.color }}>{i + 1}</span>
                    <p>
                      {z.name}
                      <small>
                        {Math.round(polygonArea(z.polygon))} м² ·{" "}
                        {z.description}
                      </small>
                    </p>
                  </div>
                ))}
                <h4>Здания и навесы</h4>
                {design.volumes.map((v, i) => (
                  <div className="design-volume-row" key={v.id}>
                    <span>{String.fromCharCode(65 + i)}</span>
                    <p>
                      {v.name}
                      <small>
                        {v.width.toFixed(1)} × {v.depth.toFixed(1)} м · высота{" "}
                        {v.height} м · {v.floors} эт.
                      </small>
                    </p>
                  </div>
                ))}
                <p className="design-small-note">
                  *Вместимость и габариты — проектное задание, не подтверждение
                  нормативной обеспеченности. Площади дорожек могут
                  перекрываться с функциональными зонами.
                </p>
              </>
            )}
            {tab === "materials" && (
              <>
                <span className="design-section-kicker">
                  <Leaf size={13} />
                  Характер и фактуры
                </span>
                <h3>Спокойные, тёплые материалы</h3>
                <div className="material-list">
                  {design.materials.map((m) => (
                    <div key={m.name}>
                      <span style={{ background: m.color }} />
                      <p>
                        <strong>{m.name}</strong>
                        <small>{m.use}</small>
                      </p>
                    </div>
                  ))}
                </div>
                <h4>Озеленение и оборудование</h4>
                <p>
                  Лиственные деревья вдоль маршрутов, группы многолетников и
                  низкие посадки для обзора. Деревянные скамьи на металлическом
                  каркасе, велостойки у входа и светильники вдоль пешеходных
                  связей.
                </p>
                <p>
                  Состав пород, шаг посадки, подбор светильников и основания
                  покрытий уточняются с учётом климата, грунта и эксплуатации.
                </p>
              </>
            )}
            {tab === "location" && (
              <>
                <span className="design-section-kicker">
                  <MapPin size={13} />
                  Точное положение предложения
                </span>
                <h3>Как проект встраивается в район</h3>
                <div className="design-location-card">
                  <span>Якорная точка одобренного эскиза</span>
                  <strong>
                    {design.anchor.map((n) => n.toFixed(6)).join(", ")}
                  </strong>
                  <small>
                    Сохранена внутри контура; смещение центра —{" "}
                    {design.offset.map((v) => v.toFixed(1)).join(" / ")} м в
                    осях участка. Поворот —{" "}
                    {((design.angle * 180) / Math.PI).toFixed(1)}°.
                  </small>
                </div>
                <h4>Улица и вход</h4>
                <p>
                  <strong>{design.context.roadName}</strong>
                  {design.context.roadDistance !== undefined
                    ? ` · ${design.context.roadDistance} м от якорной точки до оси проезда.`
                    : "."}
                </p>
                <p>
                  {design.context.accessClear
                    ? "Прямой подход от главного входа показан на плане. По загруженным контурам зданий и воды пересечений не найдено; проходимость и право прохода нужно подтвердить."
                    : "Пешеходную связь необходимо уточнить: прямой подход отсутствует в данных или пересекает известное препятствие."}
                </p>
                <h4>Ближайшая застройка</h4>
                {design.context.neighbors.map((n, i) => (
                  <div className="design-neighbor" key={i}>
                    <span>{n.name}</span>
                    <strong>{n.distance} м</strong>
                  </div>
                ))}
                <p className="design-small-note">
                  Расстояния до зданий приведены от якорной точки до известного
                  контура; это не проверка отступов от границы проектируемого
                  участка.
                </p>
                <h4>Координаты контура участка</h4>
                <div className="design-coordinates">
                  {design.plot.map((p, i) => (
                    <span key={i}>
                      Угол {i + 1}
                      <strong>{p.map((n) => n.toFixed(6)).join(", ")}</strong>
                    </span>
                  ))}
                </div>
              </>
            )}
            {tab === "phases" && (
              <>
                <span className="design-section-kicker">
                  <Box size={13} />
                  От проекта к реализации
                </span>
                <h3>Последовательность работ</h3>
                {design.phases.map((s, i) => (
                  <div className="design-story" key={i}>
                    <span>0{i + 1}</span>
                    <p>{s}</p>
                  </div>
                ))}
                <h4>Условия дальнейшего проектирования</h4>
                {design.requirements.map((r, i) => (
                  <p key={i} className="design-requirement">
                    <Check size={13} />
                    {r}
                  </p>
                ))}
              </>
            )}
            <div
              className={`design-fit-note ${design.fit === "needs-review" ? "needs-review" : ""}`}
            >
              {design.fit === "needs-review" ? (
                <TriangleAlert size={17} />
              ) : (
                <Check size={17} />
              )}
              <p>
                <strong>
                  {design.fit === "needs-review"
                    ? "Участок требует уточнения"
                    : "Контур проверен по загруженным данным"}
                </strong>
                {design.fitNotes.length
                  ? design.fitNotes.join(" ")
                  : "Пересечений с известными препятствиями не найдено. Земельные права и нормативные ограничения пока не подтверждены."}
              </p>
            </div>
            <button className="button full-width" onClick={glb} disabled={busy}>
              <Box size={15} />
              {busy
                ? "Собираем 3D-файл…"
                : "Скачать пространственный проект .glb"}
              <ArrowDownToLine size={14} />
            </button>
          </div>
        </div>
      </div>
    </section>
  );
}
