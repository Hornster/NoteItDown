/// <reference types="vitest/config" />
import { fileURLToPath } from "node:url";

import { defineConfig, loadEnv } from "vite";

// Integration tests read SUPABASE_URL/SUPABASE_KEY from process.env (see tests/integration/global-setup.ts).
// loadEnv pulls them in from .env the same way Astro/Vite would, without importing astro:env.
Object.assign(process.env, loadEnv("test", process.cwd(), ""));

export default defineConfig({
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
  test: {
    environment: "node",
    projects: [
      {
        extends: true,
        test: {
          name: "unit",
          include: ["src/**/*.test.ts"],
        },
      },
      {
        extends: true,
        test: {
          name: "integration",
          include: ["tests/integration/**/*.test.ts"],
          globalSetup: ["tests/integration/global-setup.ts"],
          // Integration tests share one local Supabase database; running files in parallel
          // would let tests race each other's rows.
          fileParallelism: false,
        },
      },
    ],
  },
});
