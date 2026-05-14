import { fileURLToPath } from "node:url";
import { configDefaults, defineConfig } from "vitest/config";

const projectRoot = fileURLToPath(new URL(".", import.meta.url));

export default defineConfig({
  root: projectRoot,
  test: {
    include: ["src/**/*.test.ts", "src/**/*.spec.ts"],
    // `*.type-test.ts` files contain only compile-time assertions (no runtime
    // `it`/`expect` wrappers). They are typechecked via `tsconfig.spec.json`
    // but excluded from the runtime suite so vitest does not try to load a
    // file that registers no tests. Spread Vitest's defaults so the standard
    // ignore set (node_modules, dist, .{idea,git,cache}, build, etc.) is
    // preserved.
    exclude: [...configDefaults.exclude, "src/**/*.type-test.ts"],
    reporters: ["default", "junit"],
    outputFile: { junit: "../../test-results/core/junit.xml" },
  },
});
