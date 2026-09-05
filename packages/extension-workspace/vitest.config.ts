import { fileURLToPath } from "node:url";
import { configDefaults, defineConfig } from "vitest/config";
import { makeTestReporting } from "../../vitest.reporting.js";

const projectRoot = fileURLToPath(new URL(".", import.meta.url));

export default defineConfig({
  root: projectRoot,
  test: {
    ...makeTestReporting({ layer: "internal", suite: "extension-workspace" }),
    include: ["src/**/*.internal.test.ts"],
    // `*.type-test.ts` files contain only compile-time assertions (no runtime
    // `it`/`expect` wrappers). They are typechecked via `tsconfig.spec.json`
    // but excluded from the runtime suite so vitest does not try to load a
    // file that registers no tests. Spread Vitest's defaults so the standard
    // ignore set (node_modules, dist, .{idea,git,cache}, build, etc.) is
    // preserved.
    exclude: [...configDefaults.exclude, "src/**/*.type-test.ts", "src/**/*.windows.test.ts"],
  },
});
