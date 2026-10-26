import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const sourceHtml = fileURLToPath(new URL("./app.html", import.meta.url));

export default defineConfig({
  plugins: [
    {
      name: "forma-source-html",
      // Pages serves the built index.html. Vite compiles the source template.
      transformIndexHtml: {
        order: "pre",
        handler: () => readFileSync(sourceHtml, "utf8"),
      },
      handleHotUpdate({ file, server }) {
        if (file === sourceHtml) {
          server.ws.send({ type: "full-reload", path: "*" });
          return [];
        }
      },
    },
    react(),
  ],
  base: "./",
});
