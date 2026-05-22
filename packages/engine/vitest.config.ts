import { defineConfig } from "vitest/config";

// Configuracion minima de Vitest para el motor.
// Los tests del motor son unidades puras (sin DOM, sin red).
export default defineConfig({
  test: {
    include: ["src/**/__tests__/**/*.test.ts"],
    environment: "node",
  },
});
