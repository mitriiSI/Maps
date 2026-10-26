import { renderToStaticMarkup } from "react-dom/server";
import Schematic from "./Schematic";
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
  return html;
}
export function exportReport(p: Project) {
  download(
    `forma-report-v${p.version}.html`,
    buildReport(p),
    "text/html;charset=utf-8",
  );
}
