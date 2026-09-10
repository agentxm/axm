import { existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

import { makeTestReporting } from "../vitest.reporting.js";
import { resolveWorkspaceSourceSpecifier } from "./support/source-package-resolver.js";

const projectRoot = fileURLToPath(new URL(".", import.meta.url));

export default defineConfig({
  root: projectRoot,
  plugins: [
    {
      name: "axm-source-relative-imports",
      enforce: "pre",
      resolveId(source, importer) {
        const workspaceSource = resolveWorkspaceSourceSpecifier(source);
        if (workspaceSource !== undefined) return workspaceSource;
        const importerPath = importer?.split("?", 1)[0];
        if (
          importerPath === undefined ||
          !/\/(?:apps|packages|tools)\//u.test(importerPath) ||
          !source.startsWith(".") ||
          !source.endsWith(".js")
        ) {
          return undefined;
        }
        const sourcePath = resolve(dirname(importerPath), `${source.slice(0, -3)}.ts`);
        return existsSync(sourcePath) ? sourcePath : undefined;
      },
    },
  ],
  resolve: {
    conditions: ["axm-source", "module", "browser", "development|production"],
  },
  ssr: {
    noExternal: [/^@agentxm\//u, /^axm\.sh$/u],
    resolve: {
      externalConditions: ["axm-source", "node"],
    },
  },
  test: {
    ...makeTestReporting({
      layer: "specification",
      runtimeMode: "source",
      suite: "specifications-memory",
    }),
    experimental: { fsModuleCache: false },
    fileParallelism: false,
    isolate: false,
    maxWorkers: 1,
    sequence: { shuffle: { files: true, tests: true } },
    include: [
      "cli/install/reinstall-is-idempotent.spec.ts",
      "cli/install/preview-is-pure.spec.ts",
      "cli/install/materializes-canonical-content.spec.ts",
    ],
    setupFiles: ["./support/source-loader.setup.ts", "./support/reporting.setup.ts"],
  },
});
