import { renderToStaticMarkup } from "react-dom/server";
import Schematic from "./Schematic";
import SitePlan from "./SitePlan";
import { polygonArea } from "./design";
import { analyze, areaKm2, category } from "./engine";
import { download } from "./storage";
import type { Project } from "./types";
const escape = (s: unknown) =>
  String(s ?? "").replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ]!,
  );
export function buildReport(p: Project) {
  const analysis = analyze(p.dataset, p.population, p.bounds);
  const svg = renderToStaticMarkup(
    <Schematic project={p} detailed={p.stage === "detailed"} />,
  );
  const html = `<!doctype html><html lang="ru"><meta charset="utf-8"><title>${escape(p.name)} — отчёт Форма</title><style>body{font:15px/1.7 system-ui;color:#283137;max-width:1000px;margin:45px auto;padding:0 24px}h1{font-size:34px;line-height:1.2}h2{margin-top:40px}h3{margin-bottom:4px}.tag{color:#7657c9}table{width:100%;border-collapse:collapse}td,th{padding:10px;text-align:left;border-bottom:1px solid #e2e5e7}svg{width:100%;height:auto;border-radius:16px}.note{background:#f3f1fa;padding:18px;border-radius:10px}.meta{color:#707b80}article{break-inside:avoid;border-top:1px solid #ddd;padding-top:15px}button{padding:10px 18px;border:0;border-radius:6px;background:#7860e6;color:white;cursor:pointer}@media print{button{display:none}body{margin:0;font-size:11px}svg{max-height:480px}}</style><body><span class="tag">ФОРМА / ПЛАНИРОВОЧНАЯ КОНЦЕПЦИЯ</span><h1>${escape(p.name)}</h1><p class="meta">${escape(p.location)} · версия ${p.version} · ${new Date(p.updatedAt).toLocaleDateString("ru-RU")} · ${areaKm2(p.bounds).toFixed(2)} км² · ${p.population.toLocaleString("ru-RU")} жителей</p><p>Статус: ${escape({ draft: "Предварительный эскиз", review: "Ожидает проверки", changes: "На доработке", approved: "Эскиз одобрен", detailed: "Детализированный концептуальный макет" }[p.stage])}${p.approvedBy ? ` · специалист: ${escape(p.approvedBy)}` : ""}</p><p class="note">Источник: ${p.dataset.source === "demo" ? "демонстрационные синтетические данные, не инвентаризация реального района" : "OpenStreetMap / Overpass (ODbL, © участники OpenStreetMap)"}. Получено: ${new Date(p.dataset.fetchedAt).toLocaleString("ru-RU")}. Численность населения задана пользователем. Количество объектов сравнивается с настраиваемыми в исходном коде ориентирами модели; это не проверка местных нормативов, вместимости или качества услуг. Отсутствие объекта в OSM не доказывает его отсутствие на местности. Одобрение фиксируется локально и не является электронной подписью.</p><button onclick="window.print()">Печать / сохранить PDF</button>${svg}<h2>Инфраструктура участка</h2><table><tr><th>Категория</th><th>Существует</th><th>Ориентир</th><th>Оценка</th></tr>${analysis.map((a) => `<tr><td>${category(a.category).label}</td><td>${a.count}</td><td>${a.target}</td><td>${a.status === "deficit" ? `Дефицит ${a.deficit}` : a.status === "surplus" ? "Выше ориентира" : "Баланс"}</td></tr>`).join("")}</table><h2>Размещение и обоснования</h2>${p.proposals.map((r, i) => `<article><h3>${String(i + 1).padStart(2, "0")}. ${escape(r.title)}</h3><p class="meta">${r.point.map((n) => n.toFixed(5)).join(", ")} · приоритет: ${escape(r.priority)}</p>${r.reason.map((s) => `<p>${escape(s)}</p>`).join("")}${r.note ? `<p><b>Изменение специалиста:</b> ${escape(r.note)}</p>` : ""}${p.stage === "detailed" ? `<p><b>Параметры концепции:</b> ${escape(r.capacity)} ${escape(category(r.category).unit)} (проектное допущение). Радиус доступности: ${category(r.category).radius} м по прямой. ${r.category === "green" ? "Посадки, места отдыха, пешеходные дорожки и освещение." : "Условный объём, входная группа и поэтажное членение."}</p>` : ""}</article>`).join("")}<h2>История согласования</h2>${p.revisions.map((r) => `<p><b>v${r.version} · ${escape(r.event)}</b><br>${escape(r.author)} · ${new Date(r.createdAt).toLocaleString("ru-RU")}${r.comment ? `<br>${escape(r.comment)}` : ""}</p>`).join("")}<h2>Следующие проверки</h2><p>Детализированная концепция не заменяет проектную документацию. До реализации проверить права на землю, ПЗЗ, охранные и санитарные зоны, мощности инженерных сетей, реальные пешеходные маршруты, вместимость существующих учреждений и применимые местные нормативы. Высоты и площади условные; кадастровые границы не загружены.</p><p class="meta">Создано в «Форма» · проект Maps · <a href="https://www.openstreetmap.org/copyright">Условия использования данных OSM</a></p></body></html>`;
  const sections =
    p.designs
      ?.map(
        (d, i) =>
          `<article style="break-before:page"><h2>Проект ${i + 1}. ${escape(d.title)}</h2><p class="meta">${escape(d.subtitle)} · ${d.width} × ${d.depth} м · ${Math.round(d.width * d.depth)} м²</p>${renderToStaticMarkup(<SitePlan design={d} project={p} />)}<h3>Концепция пространства</h3>${d.narrative.map((s) => `<p>${escape(s)}</p>`).join("")}<h3>Параметры проекта</h3><table>${d.program.map((v) => `<tr><td>${escape(v.name)}</td><td>${escape(v.value)}</td></tr>`).join("")}</table><h3>Экспликация зон</h3><table><tr><th>№</th><th>Зона</th><th>Площадь</th><th>Решение</th></tr>${d.zones.map((z, n) => `<tr><td>${n + 1}</td><td>${escape(z.name)}</td><td>${Math.round(polygonArea(z.polygon))} м²</td><td>${escape(z.description)}</td></tr>`).join("")}</table><h3>Здания и навесы</h3><table>${d.volumes.map((v, n) => `<tr><td>${String.fromCharCode(65 + n)}</td><td>${escape(v.name)}</td><td>${v.width.toFixed(1)} × ${v.depth.toFixed(1)} × ${v.height} м; ${v.floors} эт.</td></tr>`).join("")}</table><h3>Маршруты и материалы</h3>${d.paths.map((v) => `<p>${escape(v.name)} · ширина ${v.width.toFixed(1)} м.</p>`).join("")}${d.materials.map((v) => `<p><b>${escape(v.name)}</b> — ${escape(v.use)}.</p>`).join("")}<h3>Размещение в городе</h3><p>Одобренная якорная точка: ${d.anchor.map((v) => v.toFixed(6)).join(", ")}. Центр участка смещён относительно якоря на ${d.offset.map((v) => v.toFixed(1)).join(" / ")} м в локальных осях участка. Якорная точка остаётся внутри предлагаемого контура.</p><p>Ближайшая улица: ${escape(d.context.roadName)}${d.context.roadDistance !== undefined ? ` · ${d.context.roadDistance} м от якорной точки до оси` : ""}. ${d.context.accessClear ? "Прямой подход не пересекает известные контуры зданий и воды; фактическая проходимость требует проверки." : "Прямой подход требует уточнения."}</p><p>Координаты углов: ${d.plot.map((v, n) => `${n + 1}: ${v.map((q) => q.toFixed(6)).join(", ")}`).join(" / ")}.</p><p class="note">${d.fit === "fits" ? "Контур проверен по загруженным препятствиям." : escape(d.fitNotes.join(" "))} Права на землю и нормативные ограничения не подтверждены.</p><h3>Этапы реализации</h3><ol>${d.phases.map((s) => `<li>${escape(s)}</li>`).join("")}</ol><h3>Условия дальнейшей разработки</h3>${d.requirements.map((s) => `<p>${escape(s)}</p>`).join("")}<p class="meta">Панорама использует эту же геометрию и оборудование. Пространственный проект можно отдельно скачать в GLB; координаты в файле — метры относительно указанной WGS84-точки. Вместимость и размеры — проектные допущения.</p></article>`,
      )
      .join("") || "";
  return html.replace(
    "<h2>История согласования</h2>",
    `${sections}<h2>История согласования</h2>`,
  );
}
export function exportReport(p: Project) {
  download(
    `forma-report-v${p.version}.html`,
    buildReport(p),
    "text/html;charset=utf-8",
  );
}
