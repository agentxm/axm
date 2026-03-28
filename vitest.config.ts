import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    projects: ["packages/*"],
    // Prevent runaway workers
    pool: "forks",
    maxWorkers: 4,
    // Kill hanging tests
    testTimeout: 10000,
    hookTimeout: 10000,
    teardownTimeout: 5000,
  },
});
