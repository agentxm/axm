import assert from "node:assert/strict";
import { mkdtemp, mkdir, realpath, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { after, before, test } from "node:test";
import { ESLint } from "eslint";
import tseslint from "typescript-eslint";

import { capabilityBoundaries } from "./boundaries.mjs";

const elements = [
  {
    type: "frontstage",
    pattern: "packages/*/workspace/src/skills",
    capture: ["strategy"],
    partialMatch: false,
  },
  {
    type: "frontstage",
    pattern: "packages/*/workspace/src/subagents",
    capture: ["strategy"],
    partialMatch: false,
  },
  {
    type: "backstage",
    pattern: "packages/*/workspace/src/resolution",
    capture: ["strategy"],
    partialMatch: false,
  },
  {
    type: "backstage",
    pattern: "packages/*/workspace/src/state",
    capture: ["strategy"],
    partialMatch: false,
  },
  {
    type: "frontstage",
    pattern: "packages/*/commerce/src/billing",
    capture: ["strategy"],
    partialMatch: false,
  },
  {
    type: "backstage",
    pattern: "packages/*/primitives/src/ids",
    capture: ["strategy"],
    partialMatch: false,
  },
];

const paths = {
  skillPolicy: "packages/core/workspace/src/skills/domain/select.ts",
  skillApplication: "packages/core/workspace/src/skills/application/index.ts",
  skillAdapter: "packages/core/workspace/src/skills/adapters/fs/index.ts",
  skillComposition: "packages/core/workspace/src/skills/composition/index.ts",
  skillTest: "packages/core/workspace/src/skills/application/select.test.ts",
  skillUnclassified: "packages/core/workspace/src/skills/unclassified.ts",
  subagentApplication: "packages/core/workspace/src/subagents/application/index.ts",
  resolutionPolicy: "packages/core/workspace/src/resolution/domain/index.ts",
  resolutionPrivate: "packages/core/workspace/src/resolution/domain/private.ts",
  resolutionApplication: "packages/core/workspace/src/resolution/application/index.ts",
  resolutionAdapter: "packages/core/workspace/src/resolution/adapters/registry/index.ts",
  resolutionComposition: "packages/core/workspace/src/resolution/composition/index.ts",
  statePolicy: "packages/core/workspace/src/state/domain/index.ts",
  billingApplication: "packages/supporting/commerce/src/billing/application/index.ts",
  genericPolicy: "packages/generic/primitives/src/ids/domain/index.ts",
  unknown: "packages/core/workspace/src/unregistered/domain/index.ts",
};

let root;
let eslint;

before(async () => {
  root = await realpath(await mkdtemp(join(tmpdir(), "axm-architecture-")));
  for (const path of Object.values(paths)) {
    await mkdir(dirname(join(root, path)), { recursive: true });
    await writeFile(
      join(root, path),
      "export const value = 1;\nexport interface Value { readonly value: number }\n",
    );
  }
  eslint = new ESLint({
    cwd: root,
    overrideConfigFile: true,
    overrideConfig: [
      {
        files: ["**/*.{ts,tsx,mts,cts,js,jsx,mjs,cjs}"],
        languageOptions: { parser: tseslint.parser },
      },
      ...capabilityBoundaries(root, elements, ["packages/**/*.{ts,tsx,mts,cts,js,jsx,mjs,cjs}"]),
    ],
  });
});

after(async () => {
  if (root) await rm(root, { recursive: true, force: true });
});

async function lint(from, code) {
  const [result] = await eslint.lintText(code, { filePath: from });
  assert.ok(result, "ESLint must analyze the fixture");
  assert.equal(result.fatalErrorCount, 0, JSON.stringify(result.messages));
  return result.messages;
}

async function dependency(from, to, kind = "value") {
  const source = `${root}/${to}`;
  const code =
    kind === "type"
      ? `import type { Value } from ${JSON.stringify(source)};`
      : `import { value } from ${JSON.stringify(source)}; void value;`;
  const messages = await lint(from, code);
  if (to !== paths.unknown) {
    assert.ok(
      !messages.some(({ ruleId }) => ruleId === "boundaries/no-unknown-dependencies"),
      JSON.stringify(messages),
    );
  }
  return messages;
}

for (const [name, from, to] of [
  [
    "frontstage application consumes a backstage contract",
    paths.skillApplication,
    paths.resolutionApplication,
  ],
  [
    "supporting application consumes a core backstage contract",
    paths.billingApplication,
    paths.resolutionApplication,
  ],
  [
    "a concrete domain algorithm consumes another domain contract",
    paths.resolutionPolicy,
    paths.statePolicy,
  ],
  [
    "an adapter implements its owner's domain contract",
    paths.resolutionAdapter,
    paths.resolutionPolicy,
  ],
  ["composition selects an owner's concrete adapter", paths.skillComposition, paths.skillAdapter],
  ["an owning test substitutes a concrete adapter", paths.skillTest, paths.skillAdapter],
  [
    "composition wires frontstage application contracts",
    paths.resolutionComposition,
    paths.skillApplication,
  ],
  [
    "an adapter can invoke a frontstage application contract",
    paths.resolutionAdapter,
    paths.skillApplication,
  ],
]) {
  test(name, async () => assert.deepEqual(await dependency(from, to), []));
}

for (const [name, from, to, kind] of [
  [
    "backstage rejects a frontstage application",
    paths.resolutionApplication,
    paths.skillApplication,
  ],
  ["backstage rejects a frontstage type", paths.resolutionPolicy, paths.skillApplication, "type"],
  ["domain rejects its own application", paths.skillPolicy, paths.skillApplication],
  ["domain rejects its own adapter", paths.resolutionPolicy, paths.resolutionAdapter],
  ["application rejects its own adapter", paths.skillApplication, paths.skillAdapter],
  ["application rejects composition", paths.skillApplication, paths.skillComposition],
  [
    "frontstage peers require an explicit outer workflow",
    paths.skillApplication,
    paths.subagentApplication,
  ],
  ["cross-capability private files stay private", paths.skillPolicy, paths.resolutionPrivate],
  ["generic policy cannot depend on product policy", paths.genericPolicy, paths.resolutionPolicy],
  ["production cannot import a test", paths.skillAdapter, paths.skillTest],
  ["unregistered capabilities fail dependency checks", paths.skillApplication, paths.unknown],
]) {
  test(name, async () => {
    const messages = await dependency(from, to, kind);
    assert.ok(
      messages.some(({ ruleId }) => ruleId?.startsWith("boundaries/")),
      JSON.stringify(messages),
    );
  });
}

test("unknown production files fail even without imports", async () => {
  assert.ok(
    (await lint(paths.unknown, "export const value = 1;")).some(
      ({ ruleId }) => ruleId === "boundaries/no-unknown-files",
    ),
  );
});

test("a known capability cannot hide code outside an architectural role", async () => {
  assert.ok(
    (await lint(paths.skillUnclassified, "export const value = 1;")).some(
      ({ ruleId }) => ruleId === "no-restricted-syntax",
    ),
  );
});

for (const extension of ["ts", "tsx", "mts", "cts", "js", "jsx", "mjs", "cjs"]) {
  test(`dependency rules analyze .${extension} source`, async () => {
    const path = paths.skillApplication.replace(/\.ts$/u, `.${extension}`);
    const source = JSON.stringify(`${root}/${paths.skillAdapter}`);
    const messages = await lint(path, `import { value } from ${source}; void value;`);
    assert.ok(
      messages.some(({ ruleId }) => ruleId === "boundaries/dependencies"),
      JSON.stringify(messages),
    );
  });
}

for (const form of [
  (source) => `export { value } from ${source};`,
  (source) => `export * from ${source};`,
  (source) => `const loaded = import(${source}); void loaded;`,
  (source) => `const loaded = require(${source}); void loaded;`,
]) {
  test(`private adapter access is rejected through ${form('"adapter"')}`, async () => {
    const messages = await lint(
      paths.skillApplication,
      form(JSON.stringify(`${root}/${paths.skillAdapter}`)),
    );
    assert.ok(
      messages.some(({ ruleId }) => ruleId === "boundaries/dependencies"),
      JSON.stringify(messages),
    );
  });
}

test("domain cannot import a Node mechanism", async () => {
  const messages = await lint(
    paths.skillPolicy,
    'import { readFile } from "node:fs/promises"; void readFile;',
  );
  assert.ok(
    messages.some(({ ruleId }) => ruleId === "boundaries/dependencies"),
    JSON.stringify(messages),
  );
});

test("an adapter can import its Node mechanism", async () => {
  assert.deepEqual(
    await lint(paths.skillAdapter, 'import { readFile } from "node:fs/promises"; void readFile;'),
    [],
  );
});

test("a barrel import cannot smuggle filesystem access into policy", async () => {
  const messages = await lint(
    paths.skillPolicy,
    'import { FileSystem } from "effect"; void FileSystem;',
  );
  assert.ok(
    messages.some(({ ruleId }) => ruleId === "no-restricted-imports"),
    JSON.stringify(messages),
  );
});

test("ambient HTTP access remains outside application policy", async () => {
  const messages = await lint(paths.skillApplication, 'void fetch("https://example.invalid");');
  assert.ok(
    messages.some(({ ruleId }) => ruleId === "no-restricted-globals"),
    JSON.stringify(messages),
  );
});
