import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import {
  ArrowDown,
  ArrowLeft,
  ArrowRight,
  ArrowUp,
  Camera,
  Eye,
  Expand,
  Footprints,
  Loader2,
  Moon,
  RotateCcw,
  Sun,
} from "lucide-react";
import type { DetailedDesign, PlanPoint, Project } from "./types";
import { buildScene } from "./scene";
import SitePlan from "./SitePlan";
import { downloadBlob } from "./storage";

type WalkHandle = {
  jump: (id: string) => void;
  step: (x: number, z: number) => void;
  capture: () => void;
  time: (evening: boolean) => void;
};
export default function Panorama({
  project,
  design,
  onMessage,
}: {
  project: Project;
  design: DetailedDesign;
  onMessage: (s: string) => void;
}) {
  const container = useRef<HTMLDivElement>(null),
    mount = useRef<HTMLDivElement>(null),
    handle = useRef<WalkHandle | null>(null),
    held = useRef(new Set<string>());
  const [ready, setReady] = useState(false),
    [error, setError] = useState(""),
    [evening, setEvening] = useState(false),
    [position, setPosition] = useState<PlanPoint>(
      design.viewpoints[0]?.position || [0, 0],
    ),
    [pointId, setPointId] = useState(design.viewpoints[0]?.id || "entrance");
  useEffect(() => {
    if (!mount.current) return;
    setReady(false);
    setError("");
    setEvening(false);
    setPointId(design.viewpoints[0]?.id || "entrance");
    let renderer: THREE.WebGLRenderer | undefined,
      model: ReturnType<typeof buildScene> | undefined,
      frame = 0,
      disposed = false;
    const element = mount.current,
      root = container.current!;
    const cleanups: (() => void)[] = [];
    try {
      renderer = new THREE.WebGLRenderer({
        antialias: true,
        alpha: false,
        preserveDrawingBuffer: true,
        powerPreference: "high-performance",
      });
      renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
      renderer.shadowMap.enabled = true;
      renderer.shadowMap.type = THREE.PCFSoftShadowMap;
      renderer.shadowMap.autoUpdate = false;
      renderer.shadowMap.needsUpdate = true;
      renderer.outputColorSpace = THREE.SRGBColorSpace;
      renderer.toneMapping = THREE.ACESFilmicToneMapping;
      renderer.toneMappingExposure = 1.12;
      renderer.domElement.setAttribute(
        "aria-label",
        `3D-панорама проекта «${design.title}»`,
      );
      renderer.domElement.setAttribute("role", "img");
      renderer.domElement.dataset.testid = "panorama-canvas";
      element.appendChild(renderer.domElement);
      model = buildScene(project, design);
      const camera = new THREE.PerspectiveCamera(64, 1, 0.08, 700);
      camera.position.y = 2.0;
      let yaw = 0,
        pitch = -0.025,
        dirty = true,
        last = performance.now(),
        lastUi = 0,
        drag: { x: number; y: number } | null = null;
      const look = () => {
        camera.lookAt(
          camera.position.x + Math.sin(yaw) * Math.cos(pitch),
          camera.position.y + Math.sin(pitch),
          camera.position.z - Math.cos(yaw) * Math.cos(pitch),
        );
      };
      const jump = (id: string) => {
        const v =
          design.viewpoints.find((v) => v.id === id) || design.viewpoints[0];
        if (!v) return;
        let p = model!.toWorld(v.position),
          target = model!.toWorld(v.target);
        if (!model!.canWalk(...p)) {
          const alternatives = design.paths
            .flatMap((path) => path.points)
            .map((q) => model!.toWorld(q))
            .filter((q) => model!.canWalk(...q));
          if (alternatives.length)
            p = alternatives.sort(
              (a, b) =>
                Math.hypot(a[0] - p[0], a[1] - p[1]) -
                Math.hypot(b[0] - p[0], b[1] - p[1]),
            )[0];
        }
        camera.position.set(p[0], 2.0, p[1]);
        yaw = Math.atan2(target[0] - p[0], -(target[1] - p[1]));
        pitch = -0.025;
        look();
        dirty = true;
        setPointId(v.id);
        setPosition(model!.toPlan(p));
      };
      jump(design.viewpoints[0]?.id || "entrance");
      const move = (side: number, forward: number, amount: number) => {
        const dx = (Math.cos(yaw) * side + Math.sin(yaw) * forward) * amount,
          dz = (Math.sin(yaw) * side - Math.cos(yaw) * forward) * amount;
        const p = camera.position;
        if (model!.canWalk(p.x + dx, p.z + dz)) {
          p.x += dx;
          p.z += dz;
        } else if (model!.canWalk(p.x + dx, p.z)) p.x += dx;
        else if (model!.canWalk(p.x, p.z + dz)) p.z += dz;
        look();
        dirty = true;
      };
      const resize = () => {
        if (disposed) return;
        const width = element.clientWidth,
          height = element.clientHeight;
        if (width <= 0 || height <= 0) return;
        camera.aspect = width / height;
        camera.updateProjectionMatrix();
        renderer!.setSize(width, height);
        dirty = true;
      };
      const observer = new ResizeObserver(resize);
      observer.observe(element);
      cleanups.push(() => observer.disconnect());
      resize();
      const canvas = renderer.domElement;
      const down = (e: PointerEvent) => {
        if (e.button !== 0) return;
        root.focus({ preventScroll: true });
        drag = { x: e.clientX, y: e.clientY };
        canvas.setPointerCapture(e.pointerId);
      };
      const pointer = (e: PointerEvent) => {
        if (!drag) return;
        const dx = e.clientX - drag.x,
          dy = e.clientY - drag.y;
        drag = { x: e.clientX, y: e.clientY };
        yaw -= dx * 0.004;
        pitch = Math.max(-1.15, Math.min(1.15, pitch + dy * 0.003));
        look();
        dirty = true;
      };
      const up = () => {
        drag = null;
      };
      const wheel = (e: WheelEvent) => {
        e.preventDefault();
        camera.fov = Math.max(38, Math.min(85, camera.fov + e.deltaY * 0.035));
        camera.updateProjectionMatrix();
        dirty = true;
      };
      const keys = (e: KeyboardEvent) => {
        if (
          [
            "KeyW",
            "KeyA",
            "KeyS",
            "KeyD",
            "ArrowUp",
            "ArrowDown",
            "ArrowLeft",
            "ArrowRight",
            "ShiftLeft",
          ].includes(e.code)
        ) {
          e.preventDefault();
          held.current.add(e.code);
        }
      };
      const release = (e: KeyboardEvent) => held.current.delete(e.code),
        blur = () => {
          held.current.clear();
          drag = null;
        };
      canvas.addEventListener("pointerdown", down);
      canvas.addEventListener("pointermove", pointer);
      canvas.addEventListener("pointerup", up);
      canvas.addEventListener("pointercancel", up);
      canvas.addEventListener("wheel", wheel, { passive: false });
      root.addEventListener("keydown", keys);
      window.addEventListener("keyup", release);
      window.addEventListener("blur", blur);
      cleanups.push(() => {
        canvas.removeEventListener("pointerdown", down);
        canvas.removeEventListener("pointermove", pointer);
        canvas.removeEventListener("pointerup", up);
        canvas.removeEventListener("pointercancel", up);
        canvas.removeEventListener("wheel", wheel);
        root.removeEventListener("keydown", keys);
        window.removeEventListener("keyup", release);
        window.removeEventListener("blur", blur);
      });
      handle.current = {
        jump,
        step: (x, z) => {
          move(x, z, 1.3);
          setPosition(model!.toPlan([camera.position.x, camera.position.z]));
        },
        capture: () => {
          renderer!.render(model!.scene, camera);
          canvas.toBlob((blob) => {
            if (blob) {
              downloadBlob(`forma-panorama-${design.proposalId}.png`, blob);
              onMessage("Вид из 3D-панорамы сохранён в PNG.");
            }
          }, "image/png");
        },
        time: (v) => {
          model!.setTime(v);
          renderer!.shadowMap.needsUpdate = true;
          dirty = true;
        },
      };
      const tick = (now: number) => {
        if (disposed) return;
        const dt = Math.min(0.06, (now - last) / 1000);
        last = now;
        const active = held.current,
          side =
            (active.has("KeyD") || active.has("ArrowRight") ? 1 : 0) -
            (active.has("KeyA") || active.has("ArrowLeft") ? 1 : 0),
          forward =
            (active.has("KeyW") || active.has("ArrowUp") ? 1 : 0) -
            (active.has("KeyS") || active.has("ArrowDown") ? 1 : 0);
        if (side || forward) {
          const norm = Math.hypot(side, forward);
          move(
            side / norm,
            forward / norm,
            dt * (active.has("ShiftLeft") ? 5 : 2.5),
          );
          if (now - lastUi > 180) {
            setPosition(model!.toPlan([camera.position.x, camera.position.z]));
            lastUi = now;
          }
        }
        if (dirty) {
          renderer!.render(model!.scene, camera);
          dirty = false;
        }
        frame = requestAnimationFrame(tick);
      };
      frame = requestAnimationFrame(tick);
      canvas.dataset.ready = "true";
      setReady(true);
    } catch (e) {
      setError(
        "3D-панорама недоступна: браузер не смог запустить WebGL. Откройте генплан или используйте браузер с поддержкой 3D.",
      );
      console.warn(
        "Panorama initialization:",
        e instanceof Error ? e.message : "WebGL error",
      );
    }
    return () => {
      disposed = true;
      cancelAnimationFrame(frame);
      held.current.clear();
      handle.current = null;
      cleanups.forEach((fn) => fn());
      model?.dispose();
      if (renderer) {
        renderer.dispose();
        renderer.forceContextLoss();
        renderer.domElement.remove();
      }
    };
  }, [project, design]);
  const jump = (id: string) => handle.current?.jump(id);
  return (
    <div
      className="panorama"
      ref={container}
      tabIndex={0}
      aria-label="Прогулка по проекту"
      aria-describedby="panorama-help"
    >
      <div className="panorama-render" ref={mount} />
      {!ready && !error && (
        <div className="panorama-loading">
          <Loader2 className="spin" size={24} />
          <span>Строим пространство…</span>
        </div>
      )}
      {error && (
        <div className="panorama-fallback">
          <Eye size={26} />
          <p>{error}</p>
          <SitePlan design={design} />
        </div>
      )}
      {ready && (
        <>
          <div className="panorama-title">
            <span>
              <Eye size={14} />
              360° · уровень человека
            </span>
            <strong>{design.title}</strong>
            <small>Высота камеры 1,7 м · проектное предложение</small>
          </div>
          <div className="panorama-tools">
            <button
              aria-label={evening ? "Дневной свет" : "Вечерний свет"}
              title={evening ? "Дневной свет" : "Вечерний свет"}
              onClick={() => {
                setEvening(!evening);
                handle.current?.time(!evening);
              }}
            >
              {evening ? <Moon size={16} /> : <Sun size={16} />}
            </button>
            <button
              aria-label="Сохранить вид PNG"
              title="Сохранить вид"
              onClick={() => handle.current?.capture()}
            >
              <Camera size={16} />
            </button>
            <button
              aria-label="Панорама на весь экран"
              title="На весь экран"
              onClick={() => {
                if (document.fullscreenElement) document.exitFullscreen();
                else
                  container.current
                    ?.requestFullscreen()
                    .catch(() =>
                      onMessage(
                        "Полноэкранный режим недоступен в этом браузере.",
                      ),
                    );
              }}
            >
              <Expand size={16} />
            </button>
            <button
              aria-label="Вернуться ко входу"
              title="Вернуться ко входу"
              onClick={() => jump(design.viewpoints[0].id)}
            >
              <RotateCcw size={16} />
            </button>
          </div>
          <div className="panorama-viewpoints" aria-label="Точки обзора">
            {design.viewpoints.map((v, i) => (
              <button
                key={v.id}
                className={pointId === v.id ? "active" : ""}
                onClick={() => jump(v.id)}
              >
                <span>{String(i + 1).padStart(2, "0")}</span>
                {v.name}
              </button>
            ))}
          </div>
          <div className="panorama-minimap">
            <div>
              <span>Вы здесь</span>
              <Footprints size={12} />
            </div>
            <SitePlan
              design={design}
              showLabels={false}
              camera={position}
              onViewpoint={jump}
            />
          </div>
          <div className="walk-controls" aria-label="Перемещение">
            {[
              { label: "Вперёд", icon: ArrowUp, code: "KeyW", x: 0, z: 1 },
              { label: "Влево", icon: ArrowLeft, code: "KeyA", x: -1, z: 0 },
              { label: "Назад", icon: ArrowDown, code: "KeyS", x: 0, z: -1 },
              { label: "Вправо", icon: ArrowRight, code: "KeyD", x: 1, z: 0 },
            ].map((k) => (
              <button
                key={k.code}
                aria-label={k.label}
                onPointerDown={(e) => {
                  e.preventDefault();
                  held.current.add(k.code);
                  e.currentTarget.setPointerCapture(e.pointerId);
                }}
                onPointerUp={() => held.current.delete(k.code)}
                onPointerCancel={() => held.current.delete(k.code)}
                onClick={(e) => {
                  if (e.detail === 0) handle.current?.step(k.x, k.z);
                }}
              >
                <k.icon size={17} />
              </button>
            ))}
          </div>
          <p className="panorama-help" id="panorama-help">
            Тяните для осмотра · WASD или стрелки — идти · колесо — обзор
          </p>
          <span className="panorama-source">
            Окружение OSM · высоты и ширины улиц при отсутствии данных условные
          </span>
        </>
      )}
    </div>
  );
}
