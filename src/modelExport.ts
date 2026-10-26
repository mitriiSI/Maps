import type { DetailedDesign, Project } from "./types";
import { downloadBlob } from "./storage";
export async function exportDetailedModel(
  project: Project,
  design: DetailedDesign,
) {
  const [{ buildScene }, { GLTFExporter }] = await Promise.all([
    import("./scene"),
    import("three/examples/jsm/exporters/GLTFExporter.js"),
  ]);
  const model = buildScene(project, design);
  try {
    const buffer = await new GLTFExporter().parseAsync(model.scene, {
      binary: true,
      onlyVisible: true,
    });
    if (!(buffer instanceof ArrayBuffer))
      throw new Error("Не удалось собрать 3D-файл.");
    downloadBlob(
      `forma-${design.proposalId}-v${project.version}.glb`,
      new Blob([buffer], { type: "model/gltf-binary" }),
    );
  } finally {
    model.dispose();
  }
}
