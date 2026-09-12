import assert from "node:assert/strict";
import { mkdtemp, mkdir, realpath, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { cruise } from "dependency-cruiser";
import { capabilityCycles } from "./cycles.mjs";

const elements = [
  {
    type: "backstage",
    pattern: "packages/*/workspace/src/*",
    capture: ["strategy", "capability"],
    partialMatch: false,
  },
];

async function analyze(files) {
  const root = await realpath(await mkdtemp(join(tmpdir(), "axm-cycle-proof-")));
  try {
    for (const [path, source] of Object.entries(files)) {
      await mkdir(dirname(join(root, path)), { recursive: true });
      await writeFile(join(root, path), source);
    }
    const result = await cruise(["packages"], {
      baseDir: root,
      outputType: "json",
      metrics: true,
      validate: true,
      tsPreCompilationDeps: true,
      ruleSet: {
        forbidden: [
          { name: "no-file-cycles", severity: "error", from: {}, to: { circular: true } },
          {
            name: "no-capability-cycles",
            severity: "error",
            scope: "folder",
            from: {},
            to: { circular: true },
          },
        ],
      },
    });
    const parsed = typeof result.output === "string" ? JSON.parse(result.output) : result.output;
    return { ...parsed, capabilityCycles: capabilityCycles(parsed.modules, root, elements) };
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}

test("file-cycle analysis includes type-only dependencies", async () => {
  const result = await analyze({
    "packages/core/workspace/src/alpha/domain/a.ts":
      'import type { B } from "../../beta/domain/b.ts"; export interface A { b: B }',
    "packages/core/workspace/src/beta/domain/b.ts":
      'import type { A } from "../../alpha/domain/a.ts"; export interface B { a: A }',
  });
  assert.ok(
    result.summary.violations.some(({ rule }) => rule.name === "no-file-cycles"),
    JSON.stringify(result.modules),
  );
});

test("capability cycles are detected across different architectural-role folders", async () => {
  const result = await analyze({
    "packages/core/workspace/src/alpha/application/use.ts":
      'import { b } from "../../beta/domain/index.ts"; export const result = b;',
    "packages/core/workspace/src/alpha/domain/index.ts": "export const a = 1;",
    "packages/core/workspace/src/beta/application/use.ts":
      'import { a } from "../../alpha/domain/index.ts"; export const result = a;',
    "packages/core/workspace/src/beta/domain/index.ts": "export const b = 2;",
  });
  assert.ok(
    !result.summary.violations.some(({ rule }) => rule.name === "no-file-cycles"),
    "This must exercise a capability cycle without a file cycle",
  );
  assert.deepEqual(result.capabilityCycles, [
    ["packages/core/workspace/src/alpha", "packages/core/workspace/src/beta"],
  ]);
});

test("dependencies within one capability do not create a capability cycle", async () => {
  const result = await analyze({
    "packages/core/workspace/src/alpha/application/use.ts":
      'import { a } from "../domain/index.ts"; export const result = a;',
    "packages/core/workspace/src/alpha/domain/index.ts": "export const a = 1;",
  });
  assert.equal(result.summary.error, 0);
  assert.deepEqual(result.capabilityCycles, []);
});

test("an unclassified source fails instead of disappearing from the graph", async () => {
  await assert.rejects(
    analyze({ "packages/unclassified/source.ts": "export const a = 1;" }),
    /Unclassified source/u,
  );
});

test("adapter inversion does not create a domain-capability cycle", async () => {
  const result = await analyze({
    "packages/core/workspace/src/alpha/application/use.ts":
      'import { b } from "../../beta/domain/index.ts"; export const result = b;',
    "packages/core/workspace/src/alpha/domain/index.ts": "export const a = 1;",
    "packages/core/workspace/src/beta/adapters/storage/index.ts":
      'import { a } from "../../../alpha/domain/index.ts"; export const result = a;',
    "packages/core/workspace/src/beta/domain/index.ts": "export const b = 2;",
  });
  assert.ok(!result.summary.violations.some(({ rule }) => rule.name === "no-file-cycles"));
  assert.deepEqual(result.capabilityCycles, []);
});
