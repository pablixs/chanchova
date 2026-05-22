import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "node:path";

// En desarrollo y build, Vite resuelve los paquetes locales del monorepo
// directamente al source TS. Esto evita problemas de interop ESM/CJS y
// no requiere compilar los packages antes de levantar el frontend.
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@chanchova/shared": path.resolve(__dirname, "../../packages/shared/src"),
      "@chanchova/engine": path.resolve(__dirname, "../../packages/engine/src"),
      "@chanchova/decks": path.resolve(__dirname, "../../packages/decks/src"),
    },
  },
  server: {
    port: 5173,
  },
});
