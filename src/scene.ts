import * as THREE from "three";
import type { DetailedDesign, PlanAsset, PlanPoint, Project } from "./types";
import { designGeo, designLocal, geoToLocal } from "./design";
import { distance } from "./engine";

export type SceneModel = {
  scene: THREE.Scene;
  canWalk: (x: number, z: number) => boolean;
  toWorld: (p: PlanPoint) => PlanPoint;
  toPlan: (p: PlanPoint) => PlanPoint;
  setTime: (evening: boolean) => void;
  dispose: () => void;
};

export function buildScene(
  project: Project,
  selected: DetailedDesign,
): SceneModel {
  const scene = new THREE.Scene();
  scene.name = `Форма — ${selected.title}`;
  scene.userData = {
    originWGS84: selected.anchor,
    units: "metres",
    east: "X",
    up: "Y",
    south: "Z",
    projectVersion: project.version,
    approvedBy: project.approvedBy || null,
    status:
      "Проектное предложение; окружение OpenStreetMap; высоты при отсутствии данных условные",
  };
  const geometries = new Set<THREE.BufferGeometry>(),
    materials = new Set<THREE.Material>(),
    textures = new Set<THREE.Texture>();
  const boxGeometry = new THREE.BoxGeometry(1, 1, 1);
  geometries.add(boxGeometry);
  const sphereGeometry = new THREE.IcosahedronGeometry(1, 1);
  geometries.add(sphereGeometry);
  const cylinderGeometry = new THREE.CylinderGeometry(1, 1, 1, 8);
  geometries.add(cylinderGeometry);
  const matCache = new Map<string, THREE.MeshStandardMaterial>();
  const material = (color: string, roughness = 0.85) => {
    const key = `${color}-${roughness}`;
    let m = matCache.get(key);
    if (!m) {
      m = new THREE.MeshStandardMaterial({ color, roughness });
      materials.add(m);
      matCache.set(key, m);
    }
    return m;
  };
  const metal = material("#52635e", 0.45),
    wood = material("#b38b60"),
    concrete = material("#d6ceba"),
    glass = material("#91b6b7", 0.25),
    bark = material("#80715a"),
    white = material("#ece8db");
  const bulb = material("#e8d6a9", 0.3);
  bulb.emissive = new THREE.Color("#ffcf85");
  const box = (
    parent: THREE.Object3D,
    color: string | THREE.Material,
    x: number,
    y: number,
    z: number,
    w: number,
    h: number,
    d: number,
    rotation = 0,
  ) => {
    const mesh = new THREE.Mesh(
      boxGeometry,
      typeof color === "string" ? material(color) : color,
    );
    mesh.position.set(x, y, z);
    mesh.scale.set(w, h, d);
    mesh.rotation.y = rotation;
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    parent.add(mesh);
    return mesh;
  };
  const cylinder = (
    parent: THREE.Object3D,
    color: THREE.Material,
    x: number,
    y: number,
    z: number,
    r: number,
    h: number,
  ) => {
    const mesh = new THREE.Mesh(cylinderGeometry, color);
    mesh.position.set(x, y, z);
    mesh.scale.set(r, h, r);
    mesh.castShadow = true;
    parent.add(mesh);
    return mesh;
  };
  const ellipsoid = (
    parent: THREE.Object3D,
    color: string,
    x: number,
    y: number,
    z: number,
    rx: number,
    ry: number,
    rz: number,
  ) => {
    const mesh = new THREE.Mesh(sphereGeometry, material(color));
    mesh.position.set(x, y, z);
    mesh.scale.set(rx, ry, rz);
    mesh.castShadow = true;
    parent.add(mesh);
    return mesh;
  };
  const polygon = (
    parent: THREE.Object3D,
    points: PlanPoint[],
    color: string,
    height = 0.06,
    y = 0,
  ) => {
    if (points.length < 3) return;
    const shape = new THREE.Shape(
      points.map((p) => new THREE.Vector2(p[0], -p[1])),
    );
    const geometry = new THREE.ExtrudeGeometry(shape, {
      depth: height,
      bevelEnabled: false,
    });
    geometry.rotateX(-Math.PI / 2);
    geometries.add(geometry);
    const mesh = new THREE.Mesh(geometry, material(color));
    mesh.position.y = y;
    mesh.receiveShadow = true;
    mesh.castShadow = height > 1;
    parent.add(mesh);
    return mesh;
  };
  const line = (
    parent: THREE.Object3D,
    points: PlanPoint[],
    width: number,
    color: string,
    y = 0.1,
  ) => {
    for (let i = 1; i < points.length; i++) {
      const a = points[i - 1],
        b = points[i],
        length = Math.hypot(b[0] - a[0], b[1] - a[1]);
      if (length < 0.01) continue;
      box(
        parent,
        color,
        (a[0] + b[0]) / 2,
        y,
        (a[1] + b[1]) / 2,
        width,
        0.08,
        length,
        Math.atan2(b[0] - a[0], b[1] - a[1]),
      );
    }
  };
  const labelTexture = (text: string) => {
    const canvas = document.createElement("canvas");
    canvas.width = 512;
    canvas.height = 128;
    const ctx = canvas.getContext("2d")!;
    ctx.fillStyle = "#eee7d7";
    ctx.fillRect(0, 0, 512, 128);
    ctx.fillStyle = "#4d625b";
    ctx.font = "500 34px sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    const shortened = text.length > 29 ? text.slice(0, 27) + "…" : text;
    ctx.fillText(shortened, 256, 65, 475);
    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    textures.add(texture);
    return texture;
  };
  const addAsset = (parent: THREE.Object3D, a: PlanAsset, title: string) => {
    const group = new THREE.Group();
    group.position.set(a.point[0], 0.17, a.point[1]);
    group.rotation.y = -a.rotation;
    group.name = `${a.kind}: ${a.id}`;
    parent.add(group);
    if (a.kind === "tree") {
      cylinder(group, bark, 0, 1.55, 0, 0.13, 3.1);
      const palette =
        a.variant === 2
          ? ["#769468", "#87a177", "#a1b88d"]
          : a.variant === 1
            ? ["#8b9f6a", "#a1b37e", "#bcc995"]
            : ["#7d9b70", "#94ad80", "#aec395"];
      ellipsoid(group, palette[0], 0, 4.2, 0, 1.9, 2.4, 1.9);
      ellipsoid(group, palette[1], -0.95, 3.7, 0.3, 1.25, 1.7, 1.4);
      ellipsoid(group, palette[2], 0.65, 5.1, -0.35, 1.25, 1.5, 1.2);
    } else if (a.kind === "bench") {
      for (const x of [-0.7, 0.7]) {
        box(group, metal, x, 0.22, 0, 0.08, 0.45, 0.58);
        box(group, metal, x, 0.72, -0.26, 0.07, 0.8, 0.07);
      }
      for (let i = 0; i < 5; i++)
        box(group, wood, 0, 0.47, -0.22 + i * 0.105, 1.9, 0.055, 0.085);
      for (let i = 0; i < 3; i++)
        box(group, wood, 0, 0.72 + i * 0.12, -0.29, 1.9, 0.095, 0.05);
    } else if (a.kind === "lamp") {
      cylinder(group, metal, 0, 1.95, 0, 0.065, 3.9);
      box(group, metal, 0.22, 3.9, 0, 0.65, 0.08, 0.24);
      box(group, bulb, 0.22, 3.85, 0, 0.5, 0.035, 0.18);
    } else if (a.kind === "pergola") {
      for (const x of [-2.3, 2.3])
        for (const z of [-1.55, 1.55])
          box(group, wood, x, 1.4, z, 0.16, 2.8, 0.16);
      box(group, wood, 0, 2.75, -1.55, 5.2, 0.2, 0.17);
      box(group, wood, 0, 2.75, 1.55, 5.2, 0.2, 0.17);
      for (let i = 0; i < 14; i++)
        box(group, wood, -2.5 + i * 0.39, 2.94, 0, 0.1, 0.14, 3.7);
      box(group, "#bfa482", 0, 0.04, 0, 5.4, 0.08, 3.8);
    } else if (a.kind === "play") {
      if (a.variant === 1) {
        for (const x of [-1.6, 1.6])
          for (const z of [-0.6, 0.6])
            box(group, wood, x, 1.3, z, 0.13, 2.6, 0.13, z > 0 ? 0.16 : -0.16);
        box(group, wood, 0, 2.65, 0, 3.6, 0.17, 0.17);
        for (const x of [-0.65, 0.65]) {
          for (const z of [-0.14, 0.14])
            cylinder(group, metal, x, 1.6, z, 0.018, 1.9);
          box(group, "#b18259", x, 0.65, 0, 0.55, 0.07, 0.35);
        }
      } else if (a.variant === 2) {
        for (let i = 0; i < 4; i++) {
          box(
            group,
            wood,
            -1 + i * 0.65,
            0.7 + i * 0.18,
            0,
            0.11,
            1.4 + i * 0.36,
            0.1,
          );
          box(group, wood, -1 + i * 0.65, 1.4 + i * 0.36, 0, 0.55, 0.09, 0.5);
        }
      } else {
        for (const x of [-0.6, 0.6])
          for (const z of [-0.6, 0.6]) box(group, wood, x, 1, z, 0.12, 2, 0.12);
        box(group, wood, 0, 1.3, 0, 1.4, 0.12, 1.4);
        box(group, "#bd8f65", 0, 2.15, 0, 1.65, 0.18, 1.65);
        const slide = box(group, "#d6a173", 1.1, 0.75, 0, 2.3, 0.09, 0.62);
        slide.rotation.z = -0.5;
        for (let i = 0; i < 4; i++)
          box(
            group,
            wood,
            -1.25 + i * 0.15,
            0.22 + i * 0.28,
            0,
            0.35,
            0.08,
            0.62,
          );
      }
    } else if (a.kind === "bicycle") {
      for (let i = 0; i < 4; i++) {
        for (const x of [-0.25, 0.25])
          cylinder(group, metal, x, 0.43, i * 0.65 - 0.9, 0.035, 0.86);
        box(group, metal, 0, 0.86, i * 0.65 - 0.9, 0.57, 0.06, 0.06);
      }
    } else if (a.kind === "flowerbed") {
      box(group, "#849674", 0, 0.12, 0, 3.6, 0.25, 1.65);
      for (let i = 0; i < 12; i++) {
        const x = ((i % 6) - 0.5) * 0.5 - 1,
          z = Math.floor(i / 6) * 0.6 - 0.3;
        cylinder(group, material("#869365"), x, 0.36, z, 0.025, 0.5);
        ellipsoid(
          group,
          i % 3 ? "#c899ad" : "#d4cda5",
          x,
          0.65,
          z,
          0.16,
          0.13,
          0.16,
        );
      }
    } else if (a.kind === "fountain") {
      cylinder(group, concrete, 0, 0.22, 0, 1.65, 0.4);
      cylinder(group, material("#91bdc0", 0.2), 0, 0.45, 0, 1.4, 0.05);
      cylinder(group, material("#c4e0df", 0.18), 0, 1, 0, 0.055, 1.15);
      ellipsoid(group, "#d2e8e4", 0, 1.6, 0, 0.16, 0.2, 0.16);
    } else if (a.kind === "sports") {
      for (const z of [-4.8, 4.8]) {
        cylinder(group, metal, 0, 1.65, z, 0.06, 3.3);
        box(group, white, 0, 3.1, z, 0.95, 0.65, 0.07);
        const ring = new THREE.TorusGeometry(0.22, 0.025, 6, 16);
        geometries.add(ring);
        const mesh = new THREE.Mesh(ring, material("#ba8d66"));
        mesh.rotation.x = Math.PI / 2;
        mesh.position.set(0, 2.85, z + (z > 0 ? -0.35 : 0.35));
        group.add(mesh);
      }
    } else if (a.kind === "sign") {
      box(group, metal, 0, 0.9, 0, 0.08, 1.8, 0.08);
      const signMaterial = new THREE.MeshStandardMaterial({
        map: labelTexture(title),
        roughness: 0.8,
      });
      materials.add(signMaterial);
      box(group, signMaterial, 0, 1.75, 0, 2.4, 0.65, 0.07);
    } else {
      cylinder(group, metal, 0, 0.42, 0, 0.25, 0.84);
      cylinder(group, wood, 0, 0.86, 0, 0.3, 0.06);
    }
  };
  const addVolume = (
    parent: THREE.Object3D,
    v: DetailedDesign["volumes"][number],
    cat: DetailedDesign["category"],
  ) => {
    if (v.roof === "canopy") {
      for (const x of [-v.width * 0.45, v.width * 0.45])
        for (const z of [-v.depth * 0.4, v.depth * 0.4])
          box(
            parent,
            metal,
            v.center[0] + x,
            v.height / 2,
            v.center[1] + z,
            0.14,
            v.height,
            0.14,
          );
      box(
        parent,
        glass,
        v.center[0],
        v.height,
        v.center[1],
        v.width + 0.3,
        0.15,
        v.depth + 0.3,
      );
      box(
        parent,
        glass,
        v.center[0],
        v.height / 2,
        v.center[1] - v.depth / 2,
        v.width,
        v.height - 0.3,
        0.06,
      );
      return;
    }
    box(
      parent,
      v.color,
      v.center[0],
      v.height / 2 + 0.15,
      v.center[1],
      v.width,
      v.height,
      v.depth,
    );
    const front = v.center[1] + v.depth / 2 + 0.04,
      back = v.center[1] - v.depth / 2 - 0.04;
    const n = Math.max(1, Math.floor(v.width / 2.5));
    for (let floor = 0; floor < v.floors; floor++)
      for (let col = 0; col < n; col++) {
        const x = v.center[0] - v.width / 2 + ((col + 0.5) * v.width) / n,
          y = 0.8 + ((floor + 0.55) * (v.height - 0.9)) / v.floors;
        for (const z of [front, back]) {
          box(parent, concrete, x, y, z, 1.35, 1.55, 0.09);
          box(
            parent,
            glass,
            x,
            y,
            z + (z === front ? 0.055 : -0.055),
            1.1,
            1.3,
            0.055,
          );
        }
      }
    for (let floor = 0; floor < v.floors; floor++)
      for (let col = 0; col < Math.max(1, Math.floor(v.depth / 3)); col++) {
        const z =
            v.center[1] -
            v.depth / 2 +
            ((col + 0.5) * v.depth) / Math.max(1, Math.floor(v.depth / 3)),
          y = 0.8 + ((floor + 0.55) * (v.height - 0.9)) / v.floors;
        for (const x of [
          v.center[0] - v.width / 2 - 0.04,
          v.center[0] + v.width / 2 + 0.04,
        ])
          box(parent, glass, x, y, z, 0.06, 1.3, 1.1);
      }
    box(parent, metal, v.center[0], 1.3, front + 0.07, 1.6, 2.6, 0.11);
    box(parent, glass, v.center[0], 1.45, front + 0.14, 1.36, 2.15, 0.04);
    box(parent, wood, v.center[0], 2.85, front + 0.75, 3.1, 0.15, 1.7);
    box(parent, concrete, v.center[0], 0.17, front + 0.8, 3.2, 0.3, 1.5);
    const roofColor = v.roof === "green" ? "#8ca475" : "#bcbfaf";
    box(
      parent,
      roofColor,
      v.center[0],
      v.height + 0.23,
      v.center[1],
      v.width - 0.35,
      0.14,
      v.depth - 0.35,
    );
    for (const z of [-v.depth / 2, v.depth / 2])
      box(
        parent,
        concrete,
        v.center[0],
        v.height + 0.4,
        v.center[1] + z,
        v.width + 0.2,
        0.5,
        0.16,
      );
    for (const x of [-v.width / 2, v.width / 2])
      box(
        parent,
        concrete,
        v.center[0] + x,
        v.height + 0.4,
        v.center[1],
        0.16,
        0.5,
        v.depth,
      );
    if (v.roof !== "green")
      for (let i = 0; i < Math.min(5, Math.floor(v.width / 3)); i++)
        box(
          parent,
          material("#657e82", 0.45),
          v.center[0] - v.width * 0.3 + i * 2.3,
          v.height + 0.45,
          v.center[1],
          1.8,
          0.09,
          2.5,
        );
    if (cat === "health" && v.id === "main") {
      box(
        parent,
        "#b8887d",
        v.center[0] + v.width * 0.3,
        v.height * 0.75,
        front + 0.09,
        0.35,
        1.6,
        0.08,
      );
      box(
        parent,
        "#b8887d",
        v.center[0] + v.width * 0.3,
        v.height * 0.75,
        front + 0.1,
        1.6,
        0.35,
        0.08,
      );
    }
  };

  const ground = box(scene, "#c2ccb7", 0, -0.25, 0, 650, 0.4, 650);
  ground.castShadow = false;
  const toWorld = (p: PlanPoint) =>
    geoToLocal(designGeo(selected, p), selected.anchor);
  const toPlan = (p: PlanPoint) =>
    designLocal(selected, [
      selected.anchor[0] - p[1] / 111195,
      selected.anchor[1] +
        p[0] / (111195 * Math.cos((selected.anchor[0] * Math.PI) / 180)),
    ]);
  const colliders: { points: PlanPoint[] }[] = [];
  const trunks: { point: PlanPoint; radius: number }[] = [];
  for (const f of project.dataset.features) {
    if (!f.geometry?.length) continue;
    if (
      f.kind !== "water" &&
      f.kind !== "park" &&
      distance(f.point, selected.anchor) > 360
    )
      continue;
    const polygons = f.polygons?.length ? f.polygons : [f.geometry];
    if (f.kind === "building") {
      for (const shape of polygons) {
        const points = shape.map((p) => geoToLocal(p, selected.anchor)),
          height = Math.min(60, (f.levels || 3) * 3.1);
        polygon(scene, points, "#c8ceca", height, 0.03);
        colliders.push({ points });
      }
    } else if (f.kind === "water" || f.kind === "park") {
      for (const shape of polygons) {
        const points = shape.map((p) => geoToLocal(p, selected.anchor));
        polygon(
          scene,
          points,
          f.kind === "water" ? "#93bfc5" : "#a9bd94",
          0.03,
          0.005,
        );
        if (f.kind === "water") colliders.push({ points });
      }
    } else if (f.kind === "road") {
      const points = f.geometry.map((p) => geoToLocal(p, selected.anchor));
      line(scene, points, f.major ? 10 : 5, "#aaaFA8", 0.025);
      line(scene, points, f.major ? 0.12 : 0.07, "#d4d1bb", 0.08);
    }
  }
  const designs = (
    project.designs?.length ? project.designs : [selected]
  ).filter((d) => distance(d.anchor, selected.anchor) < 300);
  for (const d of designs) {
    const group = new THREE.Group(),
      center = geoToLocal(designGeo(d, [0, 0]), selected.anchor);
    group.position.set(center[0], 0.08, center[1]);
    group.rotation.y = -d.angle;
    group.name = d.title;
    scene.add(group);
    box(group, "#b8c99e", 0, 0.005, 0, d.width, 0.15, d.depth);
    for (const z of d.zones) {
      polygon(group, z.polygon, z.color, 0.035, 0.11);
      if (z.id === "court") {
        const xs = z.polygon.map((p) => p[0]),
          zs = z.polygon.map((p) => p[1]),
          minx = Math.min(...xs) + 0.4,
          maxx = Math.max(...xs) - 0.4,
          minz = Math.min(...zs) + 0.4,
          maxz = Math.max(...zs) - 0.4;
        line(
          group,
          [
            [minx, minz],
            [maxx, minz],
            [maxx, maxz],
            [minx, maxz],
            [minx, minz],
          ],
          0.08,
          "#e8e5d2",
          0.16,
        );
        line(
          group,
          [
            [minx, (minz + maxz) / 2],
            [maxx, (minz + maxz) / 2],
          ],
          0.08,
          "#e8e5d2",
          0.16,
        );
      }
    }
    for (const path of d.paths)
      line(group, path.points, path.width, path.color, 0.17);
    for (const volume of d.volumes) {
      addVolume(group, volume, d.category);
      const points: [
        [number, number],
        [number, number],
        [number, number],
        [number, number],
      ] = [
        [
          volume.center[0] - volume.width / 2,
          volume.center[1] - volume.depth / 2,
        ],
        [
          volume.center[0] + volume.width / 2,
          volume.center[1] - volume.depth / 2,
        ],
        [
          volume.center[0] + volume.width / 2,
          volume.center[1] + volume.depth / 2,
        ],
        [
          volume.center[0] - volume.width / 2,
          volume.center[1] + volume.depth / 2,
        ],
      ];
      if (volume.roof !== "canopy")
        colliders.push({
          points: points.map((p) =>
            geoToLocal(designGeo(d, p), selected.anchor),
          ),
        });
    }
    for (const a of d.assets) {
      addAsset(group, a, d.title);
      if (a.kind === "tree")
        trunks.push({
          point: geoToLocal(designGeo(d, a.point), selected.anchor),
          radius: 0.4,
        });
    }
    if (d.context.accessClear && d.context.access.length > 1)
      line(
        scene,
        d.context.access.map((p) => geoToLocal(p, selected.anchor)),
        2.2,
        "#d9cfb8",
        0.12,
      );
  }
  const ambient = new THREE.HemisphereLight("#e9f2f2", "#929c7e", 2.1);
  scene.add(ambient);
  const sun = new THREE.DirectionalLight("#fff1d4", 3.4);
  sun.position.set(-45, 80, 55);
  sun.castShadow = true;
  sun.shadow.mapSize.set(1024, 1024);
  sun.shadow.camera.left = -100;
  sun.shadow.camera.right = 100;
  sun.shadow.camera.top = 100;
  sun.shadow.camera.bottom = -100;
  sun.shadow.camera.far = 250;
  sun.shadow.bias = -0.0007;
  sun.shadow.normalBias = 0.16;
  scene.add(sun);
  const setTime = (evening: boolean) => {
    scene.background = new THREE.Color(evening ? "#778b9b" : "#dce8e8");
    scene.fog = new THREE.Fog(evening ? "#879395" : "#dce8e8", 80, 320);
    ambient.intensity = evening ? 1.0 : 2.1;
    sun.intensity = evening ? 1.7 : 3.4;
    sun.color.set(evening ? "#f4bb86" : "#fff1d4");
    sun.position.set(-45, evening ? 16 : 80, 55);
    bulb.emissiveIntensity = evening ? 2.2 : 0.2;
    sun.shadow.needsUpdate = true;
  };
  setTime(false);
  const canWalk = (x: number, z: number) => {
    const local = toPlan([x, z]);
    if (
      Math.abs(local[0]) > selected.width / 2 + 15 ||
      Math.abs(local[1]) > selected.depth / 2 + 15
    )
      return false;
    return (
      !colliders.some((c) => pointInPlan([x, z], c.points)) &&
      !trunks.some((t) => Math.hypot(t.point[0] - x, t.point[1] - z) < t.radius)
    );
  };
  return {
    scene,
    canWalk,
    toWorld,
    toPlan,
    setTime,
    dispose: () => {
      for (const t of textures) t.dispose();
      for (const g of geometries) g.dispose();
      for (const m of materials) m.dispose();
      scene.clear();
    },
  };
}
function pointInPlan(p: PlanPoint, poly: PlanPoint[]) {
  let hit = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i],
      b = poly[j];
    if (
      a[1] > p[1] !== b[1] > p[1] &&
      p[0] < ((b[0] - a[0]) * (p[1] - a[1])) / (b[1] - a[1]) + a[0]
    )
      hit = !hit;
  }
  return hit;
}
