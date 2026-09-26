import assert from "node:assert/strict";
import { mkdtemp, mkdir, realpath, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { cruise } from "dependency-cruiser";
import { sliceFolder } from "./config.mjs";

const kernel = "packages/core/workspace-kernel/src";
const features = "packages/core/workspace-features/src";

// Cruises a synthetic tree with the folder rule check.mjs applies, so the
// production regex itself decides which folder cycles count.
async function sliceCycles(files) {
  const root = await realpath(await mkdtemp(join(tmpdir(), "axm-slice-cycles-")));
  try {
    for (const [path, source] of Object.entries(files)) {
      await mkdir(dirname(join(root, path)), { recursive: true });
      await writeFile(join(root, path), source);
    }
    const result = await cruise(["packages"], {
      baseDir: root,
      outputType: "json",
      validate: true,
      tsPreCompilationDeps: true,
      ruleSet: {
        forbidden: [
          {
            name: "no-slice-cycles",
            severity: "error",
            scope: "folder",
            from: { path: sliceFolder },
            to: { path: sliceFolder, circular: true },
          },
        ],
      },
    });
    const report = typeof result.output === "string" ? JSON.parse(result.output) : result.output;
    return report.summary.violations.map(({ from, to }) => `${from} -> ${to}`).sort();
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}

test("sub-folders inside one slice may depend on each other", async () => {
  assert.deepEqual(
    await sliceCycles({
      [`${features}/lifecycle/install/a.ts`]:
        'import { b } from "../update/b.ts"; export const a = () => b;',
      [`${features}/lifecycle/install/c.ts`]: "export const c = 1;",
      [`${features}/lifecycle/update/b.ts`]:
        'import { c } from "../install/c.ts"; export const b = c;',
    }),
    [],
  );
});

test("a cycle between slices through their entry files is reported", async () => {
  assert.deepEqual(
    await sliceCycles({
      [`${kernel}/planning/index.ts`]:
        'import { r } from "../resolution/index.ts"; export const p = r;',
      [`${kernel}/planning/x.ts`]: "export const x = 1;",
      [`${kernel}/resolution/index.ts`]:
        'import { x } from "../planning/x.ts"; export const r = x;',
    }),
    [`${kernel}/planning -> ${kernel}/resolution`, `${kernel}/resolution -> ${kernel}/planning`],
  );
});

test("a type-only cycle between packages is reported", async () => {
  assert.deepEqual(
    await sliceCycles({
      [`${kernel}/operations/index.ts`]:
        'import type { F } from "../../../workspace-features/src/lifecycle/index.ts"; export type O = F;',
      [`${features}/lifecycle/index.ts`]:
        'import type { O } from "../../../workspace-kernel/src/operations/index.ts"; export interface F { o?: O }',
    }),
    [
      `${features}/lifecycle -> ${kernel}/operations`,
      `${kernel}/operations -> ${features}/lifecycle`,
    ],
  );
});
