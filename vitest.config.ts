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
    // Most tests here hit a real, shared Supabase project — several
    // sequential real network round-trips per test can exceed vitest's
    // 5000ms/10000ms defaults under any load, and a timed-out (but
    // server-side still-completing) write leaves data behind that then
    // collides with the next run. Generous margin, not a mask for hangs.
    testTimeout: 20_000,
    hookTimeout: 20_000,
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
