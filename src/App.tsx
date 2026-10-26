import { lazy, Suspense, useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowDownToLine,
  ArrowLeft,
  ArrowRight,
  ArrowUpRight,
  Bell,
  Box,
  Building2,
  Check,
  CheckCheck,
  ChevronDown,
  ChevronRight,
  CircleHelp,
  Clock3,
  Compass,
  Eye,
  FileText,
  Folder,
  GraduationCap,
  Heart,
  History,
  Layers3,
  Loader2,
  LocateFixed,
  Map as MapIcon,
  MapPin,
  Maximize2,
  MessageSquare,
  Minus,
  Plus,
  RotateCcw,
  Search,
  Settings2,
  ShieldCheck,
  ShoppingBag,
  SlidersHorizontal,
  Sparkles,
  SquareDashed,
  Trees,
  Upload,
  Users,
  X,
  Dumbbell,
  Bus,
  Baby,
  Send,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import {
  analyze,
  applyFeedback,
  approve,
  areaKm2,
  CATEGORIES,
  category,
  DEMO_BOUNDS,
  detail,
  generateProposals,
  record,
  requestChanges,
  revise,
  submitReview,
} from "./engine";
import type { Edit } from "./engine";
import type { Bounds, CategoryId, Project, Proposal } from "./types";
import { loadOSM, searchPlaces } from "./data";
import type { SearchResult } from "./data";
import {
  download,
  exportProject,
  importProject,
  loadProjects,
  saveProjects,
} from "./storage";
import Schematic from "./Schematic";
import DesignWorkspace from "./DesignWorkspace";
const Panorama = lazy(() => import("./Panorama"));
import MapView, { PickerMap } from "./MapView";

const ICONS: Record<CategoryId, LucideIcon> = {
  school: GraduationCap,
  kindergarten: Baby,
  health: Heart,
  green: Trees,
  sport: Dumbbell,
  food: ShoppingBag,
  transit: Bus,
};
function CategoryIcon({ id, size = 18 }: { id: CategoryId; size?: number }) {
  const Icon = ICONS[id];
  return <Icon size={size} strokeWidth={1.7} />;
}
const STAGES = {
  draft: "Предварительный эскиз",
  review: "На согласовании",
  changes: "Нужны изменения",
  approved: "Эскиз одобрен",
  detailed: "Подробный проект готов",
};
type Panel = "analysis" | "reason" | "review" | "history";
type ModalName =
  | "new"
  | "projects"
  | "methods"
  | "export"
  | "edit"
  | "parameters"
  | null;
const date = (s: string) =>
  new Date(s).toLocaleString("ru-RU", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });

function Modal({
  title,
  subtitle,
  onClose,
  children,
  wide = false,
}: {
  title: string;
  subtitle?: string;
  onClose: () => void;
  children: React.ReactNode;
  wide?: boolean;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const previous = document.activeElement as HTMLElement;
    ref.current?.focus();
    const key = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      if (e.key === "Tab") {
        const nodes = Array.from(
          ref.current?.querySelectorAll<HTMLElement>(
            'button:not(:disabled),a[href],input:not(:disabled),select:not(:disabled),textarea:not(:disabled),[tabindex="0"]',
          ) || [],
        );
        if (!nodes.length) return;
        const first = nodes[0],
          last = nodes.at(-1)!;
        if (
          e.shiftKey &&
          (document.activeElement === first ||
            document.activeElement === ref.current)
        ) {
          e.preventDefault();
          last.focus();
        } else if (
          !e.shiftKey &&
          (document.activeElement === last ||
            document.activeElement === ref.current)
        ) {
          e.preventDefault();
          first.focus();
        }
      }
    };
    document.addEventListener("keydown", key);
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", key);
      document.body.style.overflow = overflow;
      previous?.focus();
    };
  }, []);
  return (
    <div
      className="modal-backdrop"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        ref={ref}
        tabIndex={-1}
        className={`modal ${wide ? "modal-wide" : ""}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby="modal-title"
      >
        <div className="modal-heading">
          <div>
            <h2 id="modal-title">{title}</h2>
            {subtitle && <p>{subtitle}</p>}
          </div>
          <button
            className="icon-button"
            onClick={onClose}
            aria-label="Закрыть окно"
          >
            <X size={20} />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

function NewProject({
  onClose,
  onCreate,
  notify,
}: {
  onClose: () => void;
  onCreate: (p: Project) => void;
  notify: (s: string) => void;
}) {
  const [bounds, setBounds] = useState<Bounds>(DEMO_BOUNDS),
    [selecting, setSelecting] = useState(false),
    [first, setFirst] = useState(false);
  const [name, setName] = useState("Новый городской квартал"),
    [population, setPopulation] = useState("8500");
  const [query, setQuery] = useState(""),
    [results, setResults] = useState<SearchResult[]>([]),
    [searching, setSearching] = useState(false),
    [loading, setLoading] = useState(false),
    [error, setError] = useState("");
  const abort = useRef<AbortController | null>(null);
  useEffect(() => () => abort.current?.abort(), []);
  const area = areaKm2(bounds),
    valid =
      bounds.every(Number.isFinite) &&
      bounds[0] < bounds[2] &&
      bounds[1] < bounds[3] &&
      bounds[0] >= -85 &&
      bounds[2] <= 85 &&
      bounds[1] >= -180 &&
      bounds[3] <= 180 &&
      area >= 0.02 &&
      area <= 10;
  const doSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!query.trim()) return;
    setSearching(true);
    setError("");
    try {
      const r = await searchPlaces(query.trim());
      setResults(r);
      if (!r.length)
        setError(
          "Ничего не найдено. Уточните адрес или выберите участок на карте.",
        );
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSearching(false);
    }
  };
  const create = async () => {
    if (
      !valid ||
      !name.trim() ||
      !Number.isFinite(Number(population)) ||
      Number(population) <= 0
    ) {
      setError("Укажите название, население и участок от 0,02 до 10 км².");
      return;
    }
    setLoading(true);
    setError("");
    abort.current = new AbortController();
    try {
      const dataset = await loadOSM(bounds, abort.current.signal),
        now = new Date().toISOString();
      const proposals = generateProposals(dataset, Number(population), bounds);
      const p: Project = {
        id: `project-${Date.now()}`,
        name: name.trim(),
        location: query.trim() || "Участок на карте",
        population: Number(population),
        bounds,
        dataset,
        proposals,
        stage: "draft",
        version: 1,
        revisions: [],
        updatedAt: now,
      };
      onCreate(
        record(
          p,
          "Загружены данные OSM, выполнен анализ и сформирован эскиз",
          "Автор проекта",
        ),
      );
      notify(
        dataset.features.length
          ? "Территория проанализирована. Предварительный эскиз готов."
          : "OSM не вернул объектов. Проверьте полноту данных перед принятием решений.",
      );
    } catch (e) {
      if (!abort.current.signal.aborted) setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  };
  return (
    <Modal
      title="Новая территория"
      subtitle="Выберите участок города — начнём с того, что уже есть."
      onClose={onClose}
      wide
    >
      <div className="new-project-grid">
        <div className="new-project-map">
          <form className="map-search" onSubmit={doSearch}>
            <Search size={18} />
            <input
              aria-label="Город или адрес"
              placeholder="Город, район или адрес"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
            <button
              type="submit"
              className="button button-small"
              disabled={searching}
            >
              {searching ? <Loader2 size={15} className="spin" /> : "Найти"}
            </button>
          </form>
          {!!results.length && (
            <div className="search-results">
              {results.map((r) => (
                <button
                  key={r.place_id}
                  onClick={() => {
                    const lat = Number(r.lat),
                      lon = Number(r.lon);
                    setBounds([
                      lat - 0.005,
                      lon - 0.009,
                      lat + 0.005,
                      lon + 0.009,
                    ]);
                    setName(r.display_name.split(",").slice(0, 2).join(","));
                    setQuery(r.display_name);
                    setResults([]);
                  }}
                >
                  <MapPin size={16} />
                  {r.display_name}
                </button>
              ))}
            </div>
          )}
          <PickerMap
            bounds={bounds}
            selecting={selecting}
            onFirst={setFirst}
            onSelect={(b) => {
              setBounds(b);
              setSelecting(false);
            }}
          />
          <div className="selection-hint">
            <button
              className={`button button-small ${selecting ? "primary" : ""}`}
              onClick={() => setSelecting(!selecting)}
            >
              <SquareDashed size={16} />
              {selecting ? "Отменить выделение" : "Выделить участок"}
            </button>
            <span>
              {selecting
                ? first
                  ? "Нажмите на второй угол"
                  : "Нажмите на первый угол участка"
                : "Два клика по противоположным углам"}
            </span>
          </div>
        </div>
        <div className="project-form">
          <label>
            Название проекта
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={100}
            />
          </label>
          <label>
            Расчётное население
            <div className="input-suffix">
              <input
                type="number"
                min="1"
                max="1000000"
                value={population}
                onChange={(e) => setPopulation(e.target.value)}
              />
              <span>чел.</span>
            </div>
          </label>
          <p className="field-help">
            Укажите жителей выбранного участка. Оценка потребностей зависит от
            этого значения.
          </p>
          <div className="area-summary">
            <SquareDashed size={19} />
            <span>
              Площадь участка
              <strong>
                {valid ? area.toFixed(2).replace(".", ",") : "—"} км²
              </strong>
            </span>
          </div>
          <details className="coordinate-details">
            <summary>Координаты границ</summary>
            <div className="coordinate-grid">
              {[
                "Юг (широта)",
                "Запад (долгота)",
                "Север (широта)",
                "Восток (долгота)",
              ].map((label, i) => (
                <label key={label}>
                  {label}
                  <input
                    type="number"
                    step=".00001"
                    value={Number.isFinite(bounds[i]) ? bounds[i] : ""}
                    onChange={(e) =>
                      setBounds(
                        bounds.map((n, j) =>
                          j === i ? Number(e.target.value) : n,
                        ) as Bounds,
                      )
                    }
                  />
                </label>
              ))}
            </div>
          </details>
          <div className="source-note">
            <Layers3 size={16} />
            <p>
              Реальные объекты из OpenStreetMap. Состав данных может быть
              неполным. Контуры участка — расчётные, не кадастровые.
            </p>
          </div>
        </div>
      </div>
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
      <div className="modal-footer">
        <span>Площадь от 0,02 до 10 км²</span>
        <button className="button" onClick={onClose}>
          {loading ? "Отменить загрузку" : "Отмена"}
        </button>
        <button
          className="button primary"
          onClick={create}
          disabled={loading || !valid}
        >
          {loading ? (
            <Loader2 size={17} className="spin" />
          ) : (
            <Sparkles size={17} />
          )}{" "}
          {loading ? "Анализируем территорию…" : "Анализировать участок"}
        </button>
      </div>
    </Modal>
  );
}

function EditProposal({
  project,
  initial,
  onSave,
  onClose,
}: {
  project: Project;
  initial?: string;
  onSave: (e: Edit) => void;
  onClose: () => void;
}) {
  const [action, setAction] = useState<Edit["action"]>(
      project.proposals.length ? "move" : "add",
    ),
    [proposalId, setProposalId] = useState(
      initial || project.proposals[0]?.id || "",
    ),
    [cat, setCat] = useState<CategoryId>("kindergarten");
  const selected = project.proposals.find((p) => p.id === proposalId);
  const [lat, setLat] = useState(
      String(
        selected?.point[0].toFixed(5) ||
          ((project.bounds[0] + project.bounds[2]) / 2).toFixed(5),
      ),
    ),
    [lon, setLon] = useState(
      String(
        selected?.point[1].toFixed(5) ||
          ((project.bounds[1] + project.bounds[3]) / 2).toFixed(5),
      ),
    ),
    [note, setNote] = useState(""),
    [error, setError] = useState("");
  const save = (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    try {
      onSave({
        action,
        proposalId,
        category: cat,
        point: [Number(lat), Number(lon)],
        note,
      });
    } catch (e) {
      setError((e as Error).message);
    }
  };
  return (
    <Modal
      title="Уточнить эскиз"
      subtitle="Изменение сохранится в новой версии вместе с обоснованием."
      onClose={onClose}
    >
      <form onSubmit={save} className="edit-form">
        <label>
          Что изменить
          <select
            value={action}
            onChange={(e) => setAction(e.target.value as Edit["action"])}
          >
            <option value="move">Переместить объект</option>
            <option value="add">Добавить объект</option>
            <option value="remove">Убрать объект</option>
            <option value="note">Уточнить требования к объекту</option>
          </select>
        </label>
        {action !== "add" ? (
          <label>
            Объект
            <select
              required
              value={proposalId}
              onChange={(e) => {
                setProposalId(e.target.value);
                const p = project.proposals.find(
                  (p) => p.id === e.target.value,
                );
                if (p) {
                  setLat(p.point[0].toFixed(5));
                  setLon(p.point[1].toFixed(5));
                }
              }}
            >
              {project.proposals.map((p, i) => (
                <option value={p.id} key={p.id}>
                  {i + 1}. {p.title}
                </option>
              ))}
            </select>
          </label>
        ) : (
          <label>
            Тип инфраструктуры
            <select
              value={cat}
              onChange={(e) => setCat(e.target.value as CategoryId)}
            >
              {CATEGORIES.map((c) => (
                <option value={c.id} key={c.id}>
                  {c.singular}
                </option>
              ))}
            </select>
          </label>
        )}
        {(action === "add" || action === "move") && (
          <>
            <div className="coordinate-grid">
              <label>
                Широта
                <input
                  required
                  type="number"
                  step="any"
                  value={lat}
                  onChange={(e) => setLat(e.target.value)}
                />
              </label>
              <label>
                Долгота
                <input
                  required
                  type="number"
                  step="any"
                  value={lon}
                  onChange={(e) => setLon(e.target.value)}
                />
              </label>
            </div>
            <p className="field-help">
              Границы: {project.bounds.map((n) => n.toFixed(5)).join(" / ")}.
              Размещение проверяется по известным контурам застройки и воды.
            </p>
          </>
        )}
        <label>
          Основание изменения
          <textarea
            required
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Например: перенести детский сад ближе к северным жилым корпусам, предусмотреть отдельный вход…"
            rows={4}
            maxLength={4000}
          />
        </label>
        {error && (
          <p className="form-error" role="alert">
            {error}
          </p>
        )}
        <div className="modal-footer">
          <button type="button" className="button" onClick={onClose}>
            Отмена
          </button>
          <button className="button primary" type="submit">
            <Check size={17} />
            Сохранить новую версию
          </button>
        </div>
      </form>
    </Modal>
  );
}

export default function App() {
  const [projects, setProjects] = useState<Project[]>(loadProjects),
    [activeId, setActiveId] = useState<string>(() => {
      try {
        return localStorage.getItem("forma-active-project-v1") || "";
      } catch {
        return "";
      }
    });
  const project = projects.find((p) => p.id === activeId) || projects[0];
  const [panel, setPanel] = useState<Panel>("analysis"),
    [view, setView] = useState<"model" | "map" | "panorama">("model"),
    [focusObject, setFocusObject] = useState(false),
    [selected, setSelected] = useState<string | undefined>();
  const [modal, setModal] = useState<ModalName>(null),
    [toast, setToast] = useState(""),
    [storageError, setStorageError] = useState(false);
  const [showExisting, setShowExisting] = useState(true),
    [showProposals, setShowProposals] = useState(true),
    [layersOpen, setLayersOpen] = useState(false),
    [zoom, setZoom] = useState(1.04),
    [rotation, setRotation] = useState(0),
    [sidebar, setSidebar] = useState(false);
  const [reviewer, setReviewer] = useState(""),
    [comment, setComment] = useState(""),
    [reviewError, setReviewError] = useState(""),
    [paramPopulation, setParamPopulation] = useState(""),
    [paramName, setParamName] = useState("");
  const inputRef = useRef<HTMLInputElement>(null),
    toastTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const notify = (message: string) => {
    setToast(message);
    clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(""), 6500);
  };
  useEffect(() => {
    try {
      saveProjects(projects);
      setStorageError(false);
    } catch {
      setStorageError(true);
    }
  }, [projects]);
  useEffect(() => {
    try {
      localStorage.setItem("forma-active-project-v1", project.id);
    } catch {
      /* Project save error is shown separately. */
    }
  }, [project.id]);
  useEffect(() => () => clearTimeout(toastTimer.current), []);
  useEffect(() => {
    setSelected(
      project.stage === "detailed"
        ? project.designs?.find((d) => d.category === "green")?.proposalId
        : undefined,
    );
    setZoom(1.04);
    setRotation(0);
    setReviewError("");
    setComment("");
  }, [project.id]);
  const analysis = useMemo(
    () => analyze(project.dataset, project.population, project.bounds),
    [project.dataset, project.population, project.bounds],
  );
  const deficits = analysis.filter((a) => a.status === "deficit");
  const count = analysis.reduce((a, b) => a + b.count, 0),
    canEdit = ["draft", "changes"].includes(project.stage),
    detailed = project.stage === "detailed";
  const activeProposal =
    project.proposals.find((p) => p.id === selected) || project.proposals[0];
  const activeDesign =
    project.designs?.find((d) => d.proposalId === activeProposal?.id) ||
    project.designs?.[0];
  const scrollToMap = () =>
    document
      .querySelector(".map-card")
      ?.scrollIntoView({ behavior: "smooth", block: "center" });
  const setProject = (p: Project) =>
    setProjects((ps) => ps.map((x) => (x.id === p.id ? p : x)));
  const selectProposal = (id: string) => {
    setSelected(id);
    setPanel("reason");
  };
  const primary = () => {
    try {
      if (canEdit) {
        setProject(submitReview(project));
        setPanel("review");
        notify("Версия передана на проверку. Ожидается решение специалиста.");
      } else if (project.stage === "approved") {
        const completed = detail(project);
        setProject(completed);
        setSelected(
          completed.designs?.find((d) => d.category === "green")?.proposalId ||
            completed.designs?.[0]?.proposalId,
        );
        setFocusObject(true);
        setView("model");
        setPanel("reason");
        notify(
          "Разработаны генпланы, концепции объектов и 3D-панорамы. Подробный проект — ниже карты.",
        );
      } else if (project.stage === "review") setPanel("review");
      else setModal("export");
    } catch (e) {
      notify((e as Error).message);
    }
  };
  const decision = (isApprove: boolean) => {
    setReviewError("");
    try {
      let p = isApprove
        ? approve(project, reviewer)
        : requestChanges(project, reviewer, comment);
      let message = isApprove
        ? "Одобрение сохранено. Теперь доступна детализация."
        : "Замечание сохранено. Уточните правку в эскизе и отправьте его повторно.";
      if (!isApprove) {
        try {
          p = applyFeedback(p, comment);
          message =
            "Замечание применено: макет и обоснование обновлены. Отправьте новую версию на проверку.";
        } catch {
          /* Ambiguous comments remain pending for explicit editing. */
        }
      }
      setProject(p);
      setComment("");
      notify(message);
    } catch (e) {
      setReviewError((e as Error).message);
    }
  };
  const importFile = async (file?: File) => {
    if (!file) return;
    try {
      const p = await importProject(file);
      setProjects((ps) => [...ps.filter((x) => x.id !== p.id), p]);
      setActiveId(p.id);
      setModal(null);
      notify("Проект импортирован с историей версий и замечаний.");
    } catch (e) {
      notify(e instanceof Error ? e.message : "Не удалось прочитать файл.");
    } finally {
      if (inputRef.current) inputRef.current.value = "";
    }
  };
  const reopen = () => {
    setProject(
      record(
        {
          ...project,
          stage: "draft",
          designs: undefined,
          version: project.version + 1,
          approvedBy: undefined,
          approvedAt: undefined,
        },
        "Открыта новая итерация; требуется повторное одобрение",
        "Автор проекта",
      ),
    );
    setPanel("analysis");
    notify(
      "Новая итерация открыта. После правок потребуется повторное согласование.",
    );
  };
  const steps = [
    1,
    project.stage === "draft" || project.stage === "changes" ? 1 : 2,
    project.stage === "review"
      ? 1
      : ["approved", "detailed"].includes(project.stage)
        ? 2
        : 0,
    detailed ? 2 : project.stage === "approved" ? 1 : 0,
  ];

  return (
    <div className="app-shell">
      {sidebar && (
        <button
          className="sidebar-shade"
          aria-label="Закрыть навигацию"
          onClick={() => setSidebar(false)}
        />
      )}
      <aside className={`sidebar ${sidebar ? "sidebar-open" : ""}`}>
        <a
          href="#"
          className="brand"
          onClick={(e) => {
            e.preventDefault();
            setPanel("analysis");
            setModal(null);
          }}
        >
          <span className="brand-mark">
            <i />
            <i />
            <i />
          </span>
          форма<span className="brand-dot">®</span>
        </a>
        <div className="workspace-picker">
          <span className="workspace-avatar">
            <Building2 size={18} />
          </span>
          <span>
            Городская среда<small>Рабочее пространство</small>
          </span>
          <ChevronDown size={14} />
        </div>
        <div className="sidebar-caption">ПРОЕКТИРОВАНИЕ</div>
        <nav aria-label="Основная навигация">
          <button
            className="nav-item active"
            onClick={() => {
              setPanel("analysis");
              setModal(null);
              setSidebar(false);
            }}
          >
            <Layers3 size={18} />
            Рабочая область
            <span className="nav-active-dot" />
          </button>
          <button
            className="nav-item"
            onClick={() => {
              setModal("projects");
              setSidebar(false);
            }}
          >
            <Folder size={18} />
            Мои проекты
            <span className="nav-count">
              {projects.length.toString().padStart(2, "0")}
            </span>
          </button>
          <button
            className="nav-item"
            onClick={() => {
              setModal("methods");
              setSidebar(false);
            }}
          >
            <Box size={18} />
            Библиотека решений
          </button>
          <button
            className="nav-item"
            onClick={() => {
              setPanel("history");
              setSidebar(false);
            }}
          >
            <History size={18} />
            История изменений
          </button>
        </nav>
        <div className="sidebar-project-heading">
          <span>ТЕКУЩИЙ ПРОЕКТ</span>
          <button aria-label="Новый проект" onClick={() => setModal("new")}>
            <Plus size={15} />
          </button>
        </div>
        <button
          className="sidebar-current"
          onClick={() => setModal("projects")}
        >
          <span className="project-tiny-dot" />
          <span>{project.name}</span>
        </button>
        <button className="new-project-link" onClick={() => setModal("new")}>
          <Plus size={15} />
          Добавить территорию
        </button>
        <div className="sidebar-bottom">
          <div className="sidebar-tip">
            <span className="tip-spark">
              <Sparkles size={19} />
            </span>
            <strong>
              Хорошие города
              <br />
              начинаются с деталей
            </strong>
            <p>
              От первого анализа
              <br />
              до продуманного решения.
            </p>
            <button onClick={() => setModal("methods")}>
              Как работает Форма
              <ArrowUpRight size={15} />
            </button>
          </div>
          <button className="sidebar-help" onClick={() => setModal("methods")}>
            <CircleHelp size={18} />
            Помощь и методология
            <ArrowUpRight size={14} />
          </button>
          <div className="user-profile">
            <span className="user-avatar">
              АП
              <span />
            </span>
            <span>
              Автор проекта<small>Локальная сессия</small>
            </span>
            <button
              aria-label="Параметры проекта"
              onClick={() => {
                setParamPopulation(String(project.population));
                setParamName(project.name);
                setModal("parameters");
              }}
            >
              <Settings2 size={17} />
            </button>
          </div>
        </div>
      </aside>

      <main className="workspace">
        <header className="topbar">
          <div className="breadcrumbs">
            <button
              className="mobile-menu icon-button"
              aria-label="Открыть навигацию"
              onClick={() => setSidebar(true)}
            >
              <Layers3 size={20} />
            </button>
            <span>Рабочая область</span>
            <ChevronRight size={14} />
            <strong>Планирование территории</strong>
          </div>
          <div className="topbar-actions">
            <span className={`save-status ${storageError ? "save-error" : ""}`}>
              <span />
              {storageError ? "Экспортируйте проект" : "Сохранено в браузере"}
            </span>
            <button
              className="icon-button notification-button"
              aria-label="Открыть согласование"
              onClick={() => setPanel("review")}
            >
              <Bell size={19} />
              {project.stage === "changes" && <i />}
            </button>
            <span className="topbar-divider" />
            <button
              className="top-avatar"
              onClick={() => setModal("projects")}
              aria-label="Открыть мои проекты"
            >
              АП
            </button>
          </div>
        </header>
        <div className="workspace-content">
          <div className="project-heading">
            <div>
              <div className="eyebrow">
                <span />
                ПЛАНИРОВОЧНЫЙ ПРОЕКТ{" "}
                <span className="eyebrow-separator">/</span>{" "}
                {String(projects.indexOf(project) + 1).padStart(3, "0")}
              </div>
              <div className="title-row">
                <h1>{project.name}</h1>
                <span className={`stage-badge stage-${project.stage}`}>
                  <span />
                  {STAGES[project.stage]}
                </span>
              </div>
              <div className="project-meta">
                <span>
                  <MapPin size={14} />
                  {project.location}
                </span>
                <i />
                <span>
                  {areaKm2(project.bounds).toFixed(2).replace(".", ",")} км²
                </span>
                <i />
                <button
                  onClick={() => {
                    setParamPopulation(String(project.population));
                    setParamName(project.name);
                    setModal("parameters");
                  }}
                >
                  <Users size={14} />
                  {project.population.toLocaleString("ru-RU")} жителей
                  <SlidersHorizontal size={12} />
                </button>
              </div>
            </div>
            <div className="heading-actions">
              <button
                className="button export-button"
                onClick={() => setModal("export")}
              >
                <ArrowDownToLine size={16} />
                <span>Экспорт</span>
              </button>
              <button className="button primary" onClick={primary}>
                {detailed ? (
                  <CheckCheck size={17} />
                ) : project.stage === "approved" ? (
                  <Box size={17} />
                ) : project.stage === "review" ? (
                  <Clock3 size={17} />
                ) : (
                  <Send size={16} />
                )}
                <span>
                  {detailed
                    ? "Получить результат"
                    : project.stage === "approved"
                      ? "Разработать проект"
                      : project.stage === "review"
                        ? "Открыть проверку"
                        : "На согласование"}
                </span>
                {canEdit && <ArrowUpRight size={15} />}
              </button>
            </div>
          </div>

          <div className="workflow" aria-label="Этапы проекта">
            {[
              {
                icon: MapPin,
                label: "Выбор территории",
                sub: "Участок определён",
              },
              {
                icon: Sparkles,
                label: "Анализ и эскиз",
                sub:
                  project.stage === "changes"
                    ? "Внесите изменения"
                    : "Инфраструктура и концепция",
              },
              {
                icon: MessageSquare,
                label: "Согласование",
                sub: ["approved", "detailed"].includes(project.stage)
                  ? "Одобрено специалистом"
                  : "Обратная связь специалиста",
              },
              {
                icon: Box,
                label: "Детальный макет",
                sub: detailed ? "Результат готов" : "После одобрения эскиза",
              },
            ].map((step, i) => {
              const Icon = step.icon;
              return (
                <button
                  key={step.label}
                  className={`workflow-step ${steps[i] === 2 || i === 0 ? "complete" : ""} ${steps[i] === 1 && i !== 0 ? "current" : ""}`}
                  onClick={() => {
                    if (i === 0) setModal("new");
                    if (i === 1) setPanel("analysis");
                    if (i === 2) setPanel("review");
                    if (i === 3) {
                      if (detailed) {
                        setView("model");
                        setPanel("reason");
                      } else if (project.stage === "approved") primary();
                      else
                        notify(
                          "Детальный макет будет доступен после одобрения специалиста.",
                        );
                    }
                  }}
                >
                  <span className="step-icon">
                    {steps[i] === 2 || i === 0 ? (
                      <Check size={17} />
                    ) : (
                      <Icon size={17} />
                    )}
                  </span>
                  <span>
                    <strong>
                      <span className="step-number">0{i + 1}</span>
                      {step.label}
                    </strong>
                    <small>{step.sub}</small>
                  </span>
                  {i < 3 && <ChevronRight size={15} className="step-chevron" />}
                </button>
              );
            })}
          </div>

          {storageError && (
            <div className="storage-warning" role="alert">
              Не удалось сохранить изменения в браузере. Скачайте JSON проекта
              через «Экспорт», чтобы не потерять работу.
            </div>
          )}
          <div className="section-title">
            <div>
              <h2>
                {detailed ? "От эскиза — к деталям" : "Территория в фокусе"}
                <span className="subtle-count">
                  {project.proposals.length} предложений
                </span>
              </h2>
              <p>
                {detailed
                  ? "Генпланы объектов, благоустройство и прогулка по проектируемому пространству."
                  : "Существующая инфраструктура и возможности для развития."}
              </p>
            </div>
            <div
              className={`data-badge ${project.dataset.source === "demo" ? "demo-data" : ""}`}
            >
              <span />
              {project.dataset.source === "demo"
                ? "Демонстрационный проект"
                : "Данные OpenStreetMap"}
              <button
                aria-label="О данных проекта"
                onClick={() => setModal("methods")}
              >
                <CircleHelp size={14} />
              </button>
            </div>
          </div>

          <div className="planning-grid">
            <section className="map-card" aria-label="Макет территории">
              <div className="map-toolbar">
                <div className="map-title">
                  <span className="map-title-icon">
                    <SquareDashed size={17} />
                  </span>
                  <strong>Участок 01</strong>
                  <span className="map-version">v{project.version}.0</span>
                </div>
                <div
                  className="view-switch"
                  role="group"
                  aria-label="Вид территории"
                >
                  <button
                    className={view === "map" ? "selected" : ""}
                    onClick={() => setView("map")}
                  >
                    <MapIcon size={14} />
                    Карта
                  </button>
                  <button
                    className={view === "model" ? "selected" : ""}
                    onClick={() => setView("model")}
                  >
                    <Box size={14} />
                    3D-макет
                  </button>
                  <button
                    className={view === "panorama" ? "selected" : ""}
                    onClick={() => setView("panorama")}
                  >
                    <Eye size={14} />
                    3D-панорама
                  </button>
                </div>
                <div className="map-tools">
                  <div className="layers-wrap">
                    <button
                      className={`icon-button ${layersOpen ? "active" : ""}`}
                      aria-label="Слои карты"
                      aria-expanded={layersOpen}
                      onClick={() => setLayersOpen(!layersOpen)}
                    >
                      <Layers3 size={17} />
                    </button>
                    {layersOpen && (
                      <div className="layers-popover">
                        <strong>Слои территории</strong>
                        <label>
                          <input
                            type="checkbox"
                            checked={showExisting}
                            onChange={(e) => setShowExisting(e.target.checked)}
                          />
                          Существующие объекты
                        </label>
                        <label>
                          <input
                            type="checkbox"
                            checked={showProposals}
                            onChange={(e) => setShowProposals(e.target.checked)}
                          />
                          Предлагаемые объекты
                        </label>
                      </div>
                    )}
                  </div>
                  <button
                    className="icon-button"
                    aria-label="Скачать макет SVG"
                    onClick={() => {
                      const svg = document.querySelector("#city-schematic");
                      if (svg)
                        download(
                          `forma-model-v${project.version}.svg`,
                          new XMLSerializer().serializeToString(svg),
                          "image/svg+xml",
                        );
                      else
                        notify("Переключитесь на 3D-макет, чтобы скачать SVG.");
                    }}
                  >
                    <Maximize2 size={17} />
                  </button>
                </div>
              </div>
              <div
                className={`map-canvas ${view === "panorama" ? "map-panorama" : ""}`}
              >
                {view === "model" ? (
                  <Schematic
                    project={project}
                    active={selected}
                    onSelect={selectProposal}
                    zoom={zoom}
                    rotation={rotation}
                    showExisting={showExisting}
                    showProposals={showProposals}
                    detailed={detailed}
                    focus={focusObject ? activeProposal?.id : undefined}
                  />
                ) : view === "panorama" ? (
                  detailed && activeDesign ? (
                    <Suspense
                      fallback={
                        <div className="panorama-loading">
                          <Loader2 size={23} className="spin" />
                          Загружаем 3D-панораму…
                        </div>
                      }
                    >
                      <Panorama
                        project={project}
                        design={activeDesign}
                        onMessage={notify}
                      />
                    </Suspense>
                  ) : (
                    <div className="panorama-locked">
                      <Eye size={32} />
                      <h3>Прогулка по будущему пространству</h3>
                      <p>
                        После одобрения эскиза Форма разработает сам объект:
                        дорожки, зоны, посадки, здания и оборудование. Здесь вы
                        сможете осмотреть его с уровня человека.
                      </p>
                      <button
                        className="button primary"
                        onClick={() => {
                          setPanel("review");
                          if (project.stage === "approved") primary();
                        }}
                      >
                        {" "}
                        {project.stage === "approved"
                          ? "Разработать проект и открыть панораму"
                          : "Перейти к согласованию"}
                        <ArrowRight size={15} />
                      </button>
                    </div>
                  )
                ) : (
                  <MapView
                    key={project.id}
                    project={project}
                    active={selected}
                    onSelect={selectProposal}
                    showExisting={showExisting}
                    showProposals={showProposals}
                  />
                )}
                {view === "model" && (
                  <>
                    <div className="model-label">
                      <span className="live-dot" />
                      {detailed
                        ? "Подробный пространственный проект"
                        : "Предварительный эскиз"}
                    </div>
                    {detailed && (
                      <div className="object-focus-switch">
                        <button
                          className={!focusObject ? "active" : ""}
                          onClick={() => {
                            setFocusObject(false);
                            setZoom(1.04);
                          }}
                        >
                          Весь район
                        </button>
                        <button
                          className={focusObject ? "active" : ""}
                          onClick={() => {
                            setFocusObject(true);
                            setZoom(1.04);
                          }}
                        >
                          Объект крупно
                        </button>
                      </div>
                    )}
                    <div className="map-compass">
                      <span>С</span>
                      <Compass
                        size={29}
                        strokeWidth={1}
                        style={{ transform: `rotate(${rotation}deg)` }}
                      />
                    </div>
                    <div className="model-controls">
                      <button
                        aria-label="Приблизить макет"
                        onClick={() => setZoom((z) => Math.min(1.8, z + 0.15))}
                      >
                        <Plus size={18} />
                      </button>
                      <button
                        aria-label="Отдалить макет"
                        onClick={() => setZoom((z) => Math.max(0.65, z - 0.15))}
                      >
                        <Minus size={18} />
                      </button>
                      <i />
                      <button
                        aria-label="Повернуть макет"
                        onClick={() => setRotation((r) => r + 90)}
                      >
                        <RotateCcw size={16} />
                      </button>
                      <button
                        aria-label="Сбросить вид макета"
                        onClick={() => {
                          setZoom(1.04);
                          setRotation(0);
                        }}
                      >
                        <LocateFixed size={17} />
                      </button>
                    </div>
                    <span className="model-scale">Схематическая геометрия</span>
                  </>
                )}
                {view !== "panorama" && (
                  <div className="map-legend">
                    <span>
                      <i className="legend-existing" />
                      Существующее
                    </span>
                    <span>
                      <i className="legend-new" />
                      Предлагаемое
                    </span>
                    <span>
                      <i className="legend-boundary" />
                      Граница участка
                    </span>
                  </div>
                )}
              </div>
              <div className="map-footer">
                <span>
                  <Layers3 size={13} />
                  {project.dataset.source === "demo"
                    ? "Синтетические данные · пример планирования"
                    : `OpenStreetMap · ${date(project.dataset.fetchedAt)}`}
                </span>
                <button onClick={() => setModal("new")}>
                  Выбрать другую территорию
                  <ArrowUpRight size={13} />
                </button>
              </div>
            </section>

            <aside className="inspector">
              <div
                className="inspector-tabs"
                role="tablist"
                aria-label="Сведения о проекте"
              >
                {(
                  [
                    { id: "analysis", label: "Анализ" },
                    { id: "reason", label: "Обоснование" },
                    { id: "review", label: "Проверка" },
                  ] as const
                ).map((t) => (
                  <button
                    key={t.id}
                    role="tab"
                    aria-selected={panel === t.id}
                    className={panel === t.id ? "active" : ""}
                    onClick={() => setPanel(t.id)}
                  >
                    {t.label}
                    {t.id === "review" && project.stage === "changes" && <i />}
                  </button>
                ))}
              </div>
              <div className="inspector-body">
                {panel === "analysis" && (
                  <>
                    <div className="inspector-title">
                      <h3>Баланс инфраструктуры</h3>
                      <button
                        className="icon-button small"
                        aria-label="Методика анализа"
                        onClick={() => setModal("methods")}
                      >
                        <CircleHelp size={16} />
                      </button>
                    </div>
                    <p className="inspector-description">
                      Что уже есть и чего не хватает
                      <br />
                      на выбранной территории.
                    </p>
                    <div className="analysis-totals">
                      <div>
                        <strong>
                          {count}
                          <span>объекта</span>
                        </strong>
                        <small>в границах участка</small>
                      </div>
                      <span className="totals-divider" />
                      <div>
                        <strong>
                          {deficits.length}
                          <span>категории</span>
                        </strong>
                        <small>требуют внимания</small>
                      </div>
                    </div>
                    <div className="analysis-table">
                      <div className="analysis-table-labels">
                        <span>ИНФРАСТРУКТУРА</span>
                        <span>ЕСТЬ / ОРИЕНТИР</span>
                      </div>
                      {analysis.map((a) => {
                        const c = category(a.category);
                        return (
                          <button
                            className="analysis-row"
                            key={a.category}
                            onClick={() => {
                              const p = project.proposals.find(
                                (p) => p.category === a.category,
                              );
                              if (p) selectProposal(p.id);
                              else
                                notify(
                                  `${c.label}: ${a.count} объектов при ориентире ${a.target}. ${a.status === "surplus" ? "Превышение ориентира не означает необходимость сноса." : "Расчётного дефицита нет."}`,
                                );
                            }}
                          >
                            <span
                              className="category-icon"
                              style={{
                                color: c.color,
                                background: `${c.color}12`,
                              }}
                            >
                              <CategoryIcon id={a.category} size={17} />
                            </span>
                            <span className="analysis-row-content">
                              <span>
                                <strong>{c.label}</strong>
                                <small className={a.status}>
                                  {a.status === "deficit"
                                    ? `Не хватает ${a.deficit}`
                                    : a.status === "surplus"
                                      ? "Выше ориентира"
                                      : "В балансе"}
                                </small>
                              </span>
                              <span className="mini-bar">
                                <i
                                  style={{
                                    width: `${Math.min(100, a.ratio * 100)}%`,
                                    background:
                                      a.status === "deficit"
                                        ? "#d9ac70"
                                        : a.status === "surplus"
                                          ? "#9a8fb3"
                                          : "#90b59d",
                                  }}
                                />
                              </span>
                            </span>
                            <span className="analysis-count">
                              <strong>{a.count}</strong>
                              <span>/ {a.target}</span>
                            </span>
                          </button>
                        );
                      })}
                    </div>
                    <div className="analysis-summary">
                      <Sparkles size={17} />
                      <p>
                        <strong>
                          {deficits.length
                            ? "Есть потенциал для развития"
                            : "Базовый баланс достигнут"}
                        </strong>
                        {deficits.length
                          ? `Приоритет — ${deficits.map((a) => category(a.category).label.toLowerCase()).join(", ")}.`
                          : "Проверьте вместимость и реальную доступность объектов."}
                      </p>
                    </div>
                    <button
                      className="text-button methodology-link"
                      onClick={() => setModal("methods")}
                    >
                      Как рассчитывается баланс
                      <ArrowUpRight size={13} />
                    </button>
                  </>
                )}
                {panel === "reason" && (
                  <>
                    {activeProposal ? (
                      <>
                        <div className="inspector-title">
                          <h3>Логика размещения</h3>
                          <span className="subtle-count">
                            {project.proposals.indexOf(activeProposal) + 1} /{" "}
                            {project.proposals.length}
                          </span>
                        </div>
                        <label className="sr-only" htmlFor="proposal-select">
                          Объект для обоснования
                        </label>
                        <select
                          id="proposal-select"
                          className="proposal-select"
                          value={activeProposal.id}
                          onChange={(e) => setSelected(e.target.value)}
                        >
                          {project.proposals.map((p, i) => (
                            <option value={p.id} key={p.id}>
                              {String(i + 1).padStart(2, "0")} · {p.title}
                            </option>
                          ))}
                        </select>
                        <div
                          className="reason-category"
                          style={{
                            color: category(activeProposal.category).color,
                          }}
                        >
                          <CategoryIcon
                            id={activeProposal.category}
                            size={24}
                          />
                          <span>
                            {activeProposal.title}
                            <small>Предлагаемый объект</small>
                          </span>
                          <span
                            className={`priority priority-${activeProposal.priority === "Высокий" ? "high" : "medium"}`}
                          >
                            {activeProposal.priority}
                          </span>
                        </div>
                        <div className="reason-list">
                          {activeProposal.reason.map((r, i) => (
                            <div key={i}>
                              <span>{String(i + 1).padStart(2, "0")}</span>
                              <p>{r}</p>
                            </div>
                          ))}
                        </div>
                        {activeProposal.note && (
                          <div className="expert-note">
                            <MessageSquare size={15} />
                            <p>
                              <strong>Уточнение проекта</strong>
                              {activeProposal.note}
                            </p>
                          </div>
                        )}
                        {detailed && activeDesign && (
                          <div className="detail-spec">
                            <h4>{activeDesign.title}</h4>
                            <div>
                              <span>Проектируемый участок</span>
                              <strong>
                                {activeDesign.width} × {activeDesign.depth} м
                              </strong>
                            </div>
                            <div>
                              <span>Состав проекта</span>
                              <strong>
                                {activeDesign.zones.length} зон ·{" "}
                                {activeDesign.volumes.length} объёмов
                              </strong>
                            </div>
                            <button
                              className="text-button"
                              onClick={() =>
                                document
                                  .querySelector(".design-workspace")
                                  ?.scrollIntoView({
                                    behavior: "smooth",
                                    block: "start",
                                  })
                              }
                            >
                              Открыть подробный проект
                              <ArrowRight size={13} />
                            </button>
                            <button
                              className="button full-width"
                              onClick={() => setView("panorama")}
                            >
                              <Eye size={14} />
                              Осмотреть в 3D-панораме
                            </button>
                          </div>
                        )}
                        <div className="coordinates-card">
                          <MapPin size={15} />
                          {activeProposal.point
                            .map((n) => n.toFixed(5))
                            .join(", ")}
                        </div>
                        {canEdit && (
                          <button
                            className="button full-width"
                            onClick={() => {
                              setSelected(activeProposal.id);
                              setModal("edit");
                            }}
                          >
                            <SlidersHorizontal size={15} />
                            Уточнить размещение
                          </button>
                        )}
                      </>
                    ) : (
                      <div className="empty-state">
                        <CheckCheck size={30} />
                        <h3>Нет новых объектов</h3>
                        <p>
                          Расчётных дефицитов не выявлено либо подходящие точки
                          не найдены. Специалист может добавить объект вручную.
                        </p>
                        {canEdit && (
                          <button
                            className="button"
                            onClick={() => setModal("edit")}
                          >
                            <Plus size={16} />
                            Добавить объект
                          </button>
                        )}
                      </div>
                    )}
                  </>
                )}
                {panel === "review" && (
                  <>
                    <div className="inspector-title">
                      <h3>Проверка специалиста</h3>
                      <ShieldCheck size={18} />
                    </div>
                    <p className="inspector-description">
                      Хорошее решение — результат диалога.
                    </p>
                    <div className={`review-status review-${project.stage}`}>
                      <span>
                        {project.stage === "review" ? (
                          <Clock3 size={21} />
                        ) : ["approved", "detailed"].includes(project.stage) ? (
                          <CheckCheck size={21} />
                        ) : (
                          <MessageSquare size={21} />
                        )}
                      </span>
                      <strong>
                        {STAGES[project.stage]}
                        <small>
                          Версия {project.version}.0
                          {project.approvedBy ? ` · ${project.approvedBy}` : ""}
                        </small>
                      </strong>
                    </div>
                    <div className="local-review-note">
                      <Users size={16} />
                      <p>
                        Локальная проверка: передайте специалисту JSON проекта
                        или откройте его вместе. Имя вводится вручную;
                        уведомления не отправляются.
                      </p>
                    </div>
                    {project.stage === "review" ? (
                      <div className="review-form">
                        <label>
                          Имя специалиста
                          <input
                            placeholder="Имя и фамилия"
                            value={reviewer}
                            onChange={(e) => setReviewer(e.target.value)}
                            maxLength={100}
                          />
                        </label>
                        <label>
                          Замечания к эскизу
                          <textarea
                            value={comment}
                            onChange={(e) => setComment(e.target.value)}
                            placeholder="Например: перенеси детский сад на север"
                            rows={4}
                            maxLength={4000}
                          />
                        </label>
                        <p className="field-help">
                          Автоправки: перенос на север, юг, запад или восток;
                          добавление и удаление. Одна команда и один объект за
                          раз. Сложные замечания уточняются вручную.
                        </p>
                        {reviewError && (
                          <p role="alert" className="form-error">
                            {reviewError}
                          </p>
                        )}
                        <button
                          className="button primary full-width"
                          onClick={() => decision(true)}
                        >
                          <Check size={17} />
                          Одобрить эскиз
                        </button>
                        <button
                          className="button full-width"
                          onClick={() => decision(false)}
                        >
                          <MessageSquare size={16} />
                          Вернуть с замечаниями
                        </button>
                      </div>
                    ) : project.stage === "changes" ? (
                      <>
                        <div className="expert-note">
                          <MessageSquare size={16} />
                          <p>
                            <strong>
                              {
                                [...project.revisions]
                                  .reverse()
                                  .find(
                                    (r) => r.event === "Запрошены изменения",
                                  )?.author
                              }
                            </strong>
                            {
                              [...project.revisions]
                                .reverse()
                                .find((r) => r.event === "Запрошены изменения")
                                ?.comment
                            }
                          </p>
                        </div>
                        <p className="field-help">
                          {project.version >
                          ([...project.revisions]
                            .reverse()
                            .find((r) => r.event === "Запрошены изменения")
                            ?.version || 0)
                            ? "Изменения внесены. Проверьте обновлённый макет и обоснование, затем отправьте новую версию специалисту."
                            : "Выберите объект и уточните правки в размещении или требованиях. Затем отправьте обновлённую версию на проверку."}
                        </p>
                        <button
                          className="button primary full-width"
                          onClick={() => setModal("edit")}
                        >
                          <SlidersHorizontal size={16} />
                          Внести изменения
                        </button>
                        <button className="button full-width" onClick={primary}>
                          <Send size={15} />
                          Отправить повторно
                        </button>
                      </>
                    ) : project.stage === "approved" ? (
                      <>
                        <p className="review-explanation">
                          Специалист одобрил текущую версию. Можно уточнить
                          объёмы, добавить членение фасадов и расчётные
                          параметры объектов.
                        </p>
                        <button
                          className="button primary full-width"
                          onClick={primary}
                        >
                          <Box size={16} />
                          Разработать подробный проект
                        </button>
                      </>
                    ) : detailed ? (
                      <>
                        <p className="review-explanation">
                          Одобренный эскиз преобразован в детализированную
                          концепцию. Скачайте макет, обоснования и историю
                          согласований.
                        </p>
                        <button
                          className="button primary full-width"
                          onClick={() => setModal("export")}
                        >
                          <ArrowDownToLine size={16} />
                          Скачать результат
                        </button>
                        <button className="button full-width" onClick={reopen}>
                          <RotateCcw size={15} />
                          Начать новую итерацию
                        </button>
                      </>
                    ) : (
                      <>
                        <p className="review-explanation">
                          Передайте эскиз специалисту. Детализация откроется
                          после его одобрения. Все решения сохраняются в истории
                          проекта.
                        </p>
                        <button
                          className="button primary full-width"
                          onClick={primary}
                        >
                          <Send size={15} />
                          Передать на проверку
                        </button>
                      </>
                    )}
                    <button
                      className="text-button history-link"
                      onClick={() => setPanel("history")}
                    >
                      <History size={14} />
                      История согласований
                      <ArrowRight size={14} />
                    </button>
                  </>
                )}
                {panel === "history" && (
                  <>
                    <button
                      className="text-button"
                      onClick={() => setPanel("review")}
                    >
                      <ArrowLeft size={14} />К проверке
                    </button>
                    <h3 className="history-heading">История проекта</h3>
                    <p className="inspector-description">
                      Решения и изменения сохраняются
                      <br />
                      вместе с каждой версией.
                    </p>
                    <div className="timeline">
                      {[...project.revisions].reverse().map((r, i) => (
                        <div
                          className="timeline-item"
                          key={`${r.createdAt}-${i}`}
                        >
                          <span className="timeline-dot" />
                          <div>
                            <span className="timeline-meta">
                              v{r.version}.0 · {date(r.createdAt)}
                            </span>
                            <h4>{r.event}</h4>
                            <small>{r.author}</small>
                            {r.comment && <p>{r.comment}</p>}
                            <span className="timeline-objects">
                              {r.proposals.length} объектов в этой версии
                            </span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </>
                )}
              </div>
            </aside>
          </div>

          {detailed && activeDesign && (
            <DesignWorkspace
              key={project.id}
              project={project}
              design={activeDesign}
              onChoose={(id) => {
                setSelected(id);
                setPanel("reason");
              }}
              onPanorama={() => {
                setView("panorama");
                scrollToMap();
              }}
              onFocus={() => {
                setView("model");
                setFocusObject(true);
                setZoom(1.04);
                scrollToMap();
              }}
              onMessage={notify}
            />
          )}
          <section className="recommendations">
            <div className="recommendations-header">
              <div>
                <span className="spark-box">
                  <Sparkles size={17} />
                </span>
                <h2>Предложения для территории</h2>
                <span className="subtle-count">{project.proposals.length}</span>
              </div>
              <button
                className="text-button"
                onClick={() => {
                  if (canEdit) setModal("edit");
                  else
                    notify(
                      "Сначала откройте новую итерацию проекта, чтобы внести изменения.",
                    );
                }}
              >
                <Plus size={15} />
                Добавить объект
              </button>
            </div>
            <div className="recommendation-grid">
              {project.proposals.map((p, i) => (
                <button
                  className={`recommendation ${selected === p.id ? "recommendation-active" : ""}`}
                  key={p.id}
                  onClick={() => selectProposal(p.id)}
                >
                  <span className="recommendation-number">
                    {String(i + 1).padStart(2, "0")}
                  </span>
                  <span
                    className="recommendation-icon"
                    style={{
                      color: category(p.category).color,
                      background: `${category(p.category).color}14`,
                    }}
                  >
                    <CategoryIcon id={p.category} size={23} />
                  </span>
                  <div>
                    <h3>
                      {p.title}
                      <ArrowUpRight size={14} />
                    </h3>
                    <p>
                      {p.category === "green"
                        ? "Больше зелени рядом с домом"
                        : p.category === "kindergarten"
                          ? "Забота о самых маленьких жителях"
                          : p.category === "health"
                            ? "Помощь в шаговой доступности"
                            : "Повседневные услуги ближе к дому"}
                    </p>
                    <span
                      className={`priority priority-${p.priority === "Высокий" ? "high" : "medium"}`}
                    >
                      <i />
                      {p.priority} приоритет
                    </span>
                    {p.edited && (
                      <span className="edited-mark">
                        <Check size={11} />
                        Уточнено
                      </span>
                    )}
                  </div>
                </button>
              ))}
            </div>
            {!project.proposals.length && (
              <div className="no-proposals">
                Нет автоматических предложений. Добавьте объект по решению
                специалиста или уточните население участка.
              </div>
            )}
          </section>
          <footer className="page-footer">
            <span>
              <ShieldCheck size={13} />
              Решения принимает специалист. Форма помогает их обосновать.
            </span>
            <button onClick={() => setModal("methods")}>
              О данных и ограничениях
              <ArrowUpRight size={12} />
            </button>
          </footer>
        </div>
      </main>
      <input
        type="file"
        accept=".json,application/json"
        hidden
        ref={inputRef}
        onChange={(e) => importFile(e.target.files?.[0])}
      />
      {toast && (
        <div className="toast" role="status">
          <span>
            <Check size={17} />
          </span>
          {toast}
          <button aria-label="Закрыть уведомление" onClick={() => setToast("")}>
            <X size={15} />
          </button>
        </div>
      )}

      {modal === "new" && (
        <NewProject
          onClose={() => setModal(null)}
          notify={notify}
          onCreate={(p) => {
            setProjects((ps) => [...ps, p]);
            setActiveId(p.id);
            setModal(null);
            setPanel("analysis");
            setView("model");
          }}
        />
      )}
      {modal === "edit" && (
        <EditProposal
          project={project}
          initial={selected}
          onClose={() => setModal(null)}
          onSave={(edit) => {
            setProject(revise(project, edit));
            setModal(null);
            setPanel("reason");
            notify("Макет и обоснование обновлены. Новая версия сохранена.");
          }}
        />
      )}
      {modal === "projects" && (
        <Modal
          title="Мои проекты"
          subtitle="Каждая территория — отдельная история решений."
          onClose={() => setModal(null)}
        >
          <div className="project-list">
            {projects.map((p) => (
              <button
                key={p.id}
                className={p.id === project.id ? "project-list-active" : ""}
                onClick={() => {
                  setActiveId(p.id);
                  setModal(null);
                  setPanel("analysis");
                }}
              >
                <span className="project-list-icon">
                  <MapIcon size={22} />
                </span>
                <span>
                  <strong>{p.name}</strong>
                  <small>
                    {p.location} · v{p.version}.0
                  </small>
                  <span className="project-list-status">
                    {STAGES[p.stage]}
                    {p.dataset.source === "demo" ? " · демо" : ""}
                  </span>
                </span>
                {p.id === project.id ? (
                  <Check size={19} />
                ) : (
                  <ChevronRight size={18} />
                )}
              </button>
            ))}
          </div>
          <div className="modal-footer">
            <button
              className="button"
              onClick={() => inputRef.current?.click()}
            >
              <Upload size={16} />
              Импорт JSON
            </button>
            <button className="button primary" onClick={() => setModal("new")}>
              <Plus size={16} />
              Новый проект
            </button>
          </div>
        </Modal>
      )}
      {modal === "export" && (
        <Modal
          title={detailed ? "Ваш проект готов к передаче" : "Экспорт проекта"}
          subtitle="Сохраните результат или передайте его специалисту."
          onClose={() => setModal(null)}
        >
          <div className="export-options">
            <button
              onClick={async () => {
                const { exportReport } = await import("./report");
                exportReport(project);
                notify(
                  "Отчёт скачан. Откройте HTML в браузере; печать позволяет сохранить PDF.",
                );
              }}
            >
              <span className="export-icon">
                <FileText size={25} />
              </span>
              <span>
                <strong>Макет и пояснительная записка</strong>
                <small>
                  HTML · анализ, обоснования, согласования · печать в PDF
                </small>
              </span>
              <ArrowDownToLine size={19} />
            </button>
            <button
              onClick={() => {
                exportProject(project);
                notify(
                  "JSON проекта скачан. Специалист может импортировать его в «Форму».",
                );
              }}
            >
              <span className="export-icon">
                <Folder size={25} />
              </span>
              <span>
                <strong>Редактируемый проект</strong>
                <small>JSON · вся территория, объекты и история версий</small>
              </span>
              <ArrowDownToLine size={19} />
            </button>
            <button
              onClick={() => {
                const svg = document.querySelector("#city-schematic");
                if (svg)
                  download(
                    `forma-model-v${project.version}.svg`,
                    new XMLSerializer().serializeToString(svg),
                    "image/svg+xml",
                  );
                else {
                  setView("model");
                  notify(
                    "Макет открыт. Нажмите «Объёмный макет» ещё раз для скачивания SVG.",
                  );
                }
              }}
            >
              <span className="export-icon">
                <Box size={25} />
              </span>
              <span>
                <strong>Объёмный макет</strong>
                <small>SVG · масштабируемая изометрическая схема</small>
              </span>
              <ArrowDownToLine size={19} />
            </button>
          </div>
          {detailed && activeDesign && (
            <button
              className="button full-width"
              onClick={async () => {
                notify("Собираем пространственный проект…");
                try {
                  const { exportDetailedModel } = await import("./modelExport");
                  await exportDetailedModel(project, activeDesign);
                  notify(
                    "3D-проект сохранён в GLB: здания, благоустройство и окружение.",
                  );
                } catch (e) {
                  notify(
                    e instanceof Error
                      ? e.message
                      : "Не удалось сохранить 3D-проект.",
                  );
                }
              }}
            >
              <Box size={17} />
              Скачать проект объекта .glb
              <ArrowDownToLine size={15} />
            </button>
          )}
          <div className="export-note">
            <ShieldCheck size={17} />
            <p>
              Статус: {STAGES[project.stage]}.{" "}
              {detailed
                ? "Детализированная концепция требует инженерной и нормативной проверки."
                : "Это предварительная концепция. Для детализации необходимо одобрение специалиста."}
            </p>
          </div>
          <div className="modal-footer">
            <button
              className="button"
              onClick={() => inputRef.current?.click()}
            >
              <Upload size={16} />
              Импортировать проект
            </button>
            <button className="button primary" onClick={() => setModal(null)}>
              Готово
              <Check size={16} />
            </button>
          </div>
        </Modal>
      )}
      {modal === "parameters" && (
        <Modal
          title="Параметры проекта"
          subtitle="Название и население выбранной территории."
          onClose={() => setModal(null)}
        >
          <form
            className="edit-form"
            onSubmit={(e) => {
              e.preventDefault();
              if (
                !paramName.trim() ||
                Number(paramPopulation) <= 0 ||
                !Number.isFinite(Number(paramPopulation))
              )
                return;
              if (!canEdit && Number(paramPopulation) !== project.population) {
                notify("Для перерасчёта сначала откройте новую итерацию.");
                return;
              }
              const changed = Number(paramPopulation) !== project.population;
              const p = {
                ...project,
                name: paramName.trim(),
                population: Number(paramPopulation),
                proposals: changed
                  ? generateProposals(
                      project.dataset,
                      Number(paramPopulation),
                      project.bounds,
                    )
                  : project.proposals,
                version: project.version + (changed ? 1 : 0),
              };
              setProject(
                record(
                  p,
                  changed
                    ? "Изменено население; анализ и эскиз пересчитаны"
                    : "Изменено название проекта",
                  "Автор проекта",
                ),
              );
              setModal(null);
              notify(
                changed
                  ? "Анализ пересчитан. Прежний эскиз сохранён в истории."
                  : "Параметры сохранены.",
              );
            }}
          >
            <label>
              Название
              <input
                required
                value={paramName}
                maxLength={100}
                onChange={(e) => setParamName(e.target.value)}
              />
            </label>
            <label>
              Население, человек
              <input
                required
                type="number"
                min="1"
                max="1000000"
                value={paramPopulation}
                disabled={!canEdit}
                onChange={(e) => setParamPopulation(e.target.value)}
              />
            </label>
            <p className="field-help">
              Изменение населения заново сформирует предложения. Предыдущая
              версия останется в истории.
            </p>
            {!canEdit && (
              <button
                type="button"
                className="button full-width"
                onClick={() => {
                  reopen();
                  setModal(null);
                }}
              >
                <RotateCcw size={16} />
                Открыть новую итерацию для правок
              </button>
            )}
            <div className="modal-footer">
              <button
                type="button"
                className="button"
                onClick={() => setModal(null)}
              >
                Отмена
              </button>
              <button type="submit" className="button primary">
                Сохранить
              </button>
            </div>
          </form>
        </Modal>
      )}
      {modal === "methods" && (
        <Modal
          title="Город начинается с понимания"
          subtitle="Методология, данные и работа с решениями."
          onClose={() => setModal(null)}
          wide
        >
          <div className="methods-grid">
            <div>
              <span className="method-number">01 / ИССЛЕДОВАТЬ</span>
              <h3>Сначала — существующий город</h3>
              <p>
                Выберите прямоугольный участок и задайте население. Форма
                загружает здания, дороги, воду и семь категорий инфраструктуры
                из OpenStreetMap через Overpass. Геокодирование — Nominatim;
                подложка — OSM / CARTO. Для работы с реальными данными нужен
                интернет.
              </p>
              <h3>Ориентиры вместо ложной точности</h3>
              <p>
                Цель по категории = округлённое вверх произведение населения /
                1000 и коэффициента. Это открытая эвристика, не официальные
                нормативы. Количество не учитывает вместимость, качество и
                загрузку учреждений. «Выше ориентира» не означает необходимость
                удаления.
              </p>
              <div className="method-coefficients">
                {CATEGORIES.map((c) => (
                  <div key={c.id}>
                    <span>
                      <CategoryIcon id={c.id} size={14} />
                      {c.label}
                    </span>
                    <strong>{c.per1000} / 1000 чел.</strong>
                  </div>
                ))}
              </div>
            </div>
            <div>
              <span className="method-number">
                02 / ОБОСНОВАТЬ И СОГЛАСОВАТЬ
              </span>
              <h3>Почему объект именно здесь</h3>
              <p>
                Сетка кандидатов исключает известные контуры зданий, воды и
                парков. Выбор учитывает расстояние до объектов той же категории,
                близость застройки и границы участка. Предлагается одна точка на
                категорию с дефицитом: она не обязательно закрывает весь
                дефицит. Расстояния — по прямой.
              </p>
              <h3>Решение остаётся за специалистом</h3>
              <p>
                Цикл: эскиз → проверка → замечания → явные правки объекта и
                текста → повторная проверка. Простые команды автоматически
                меняют объект и обоснование: например, «перенеси детский сад на
                север», «добавь сквер на юге» или «убери медицинский центр».
                Одна команда на замечание. Неоднозначные указания остаются на
                доработке: автор уточняет их через «Уточнить эскиз». После
                одобрения доступны условные объёмы, фасадное членение и
                расчётные параметры.
              </p>
              <div className="method-callout">
                <ShieldCheck size={21} />
                <p>
                  Макет — концепция. Необходимо проверить землю, ПЗЗ, охранные
                  зоны, безопасность, реальные маршруты и инженерные сети.
                  Высоты условные, CAD/BIM-документация не формируется.
                </p>
              </div>
              <h3>Как передать проект</h3>
              <p>
                Проекты хранятся в этом браузере. Экспортируйте JSON и передайте
                специалисту для импорта. Проверка не требует аккаунта, не
                подтверждает личность и не отправляет уведомления. Отчёт HTML
                открывается автономно и печатается в PDF.
              </p>
            </div>
          </div>
          <div className="method-demo-note">
            <Sparkles size={18} />
            <p>
              Проект «Даниловский район» содержит синтетические данные для
              знакомства с инструментом. Он не описывает реальную обеспеченность
              района. Откройте новую территорию для загрузки данных OSM.
            </p>
          </div>
          <div className="modal-footer">
            <a
              href="https://www.openstreetmap.org/copyright"
              target="_blank"
              rel="noreferrer"
              className="text-button"
            >
              © Участники OpenStreetMap · ODbL
              <ArrowUpRight size={13} />
            </a>
            <button className="button primary" onClick={() => setModal(null)}>
              Понятно
              <Check size={16} />
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}
