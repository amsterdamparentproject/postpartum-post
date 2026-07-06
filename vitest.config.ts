import { defineConfig } from "vitest/config";
import path from "path";

export default defineConfig({
  test: {
    environment: "node",
    globals: true,
    setupFiles: ["__tests__/setup.ts"],
    include: ["__tests__/**/*.test.ts"],
    exclude: ["**/node_modules/**"],
    retry: 1,
    poolOptions: {
      threads: { singleThread: true },
    },
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "."),
      "@tests": path.resolve(__dirname, "__tests__"),
    },
  },
});
