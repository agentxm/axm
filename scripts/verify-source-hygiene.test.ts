import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import {
  findAxmEnvironmentContractViolations,
  findControlBytes,
  findSourceHygieneViolations,
  findTestTaxonomyViolations,
  countUnboundedConcurrencySites,
  formatAxmEnvironmentContractViolation,
  formatTestTaxonomyViolation,
  formatViolation,
} from "./verify-source-hygiene-lib.js";
import { readWorkspace, workspaceFromProjectFiles } from "./workspace-discovery.js";

const tempRoots: string[] = [];

const project = (name: string, ...tags: ReadonlyArray<string>): string =>
  JSON.stringify({ name, tags });

const rootProject = JSON.stringify({ name: "axm", tags: ["role:tooling"], sourceRoot: "scripts" });

const specification = (requirement: string): string => `
export const specification = defineSpecification({
  requirement: "${requirement}",
  title: "Title",
  statement: "AXM shall do the thing.",
  class: "functional",
  role: "experience",
  goals: ["extension-adoption"],
  methods: ["example"],
  derivedFrom: [],
  supersedes: [],
  assumptions: [],
  openQuestions: [],
});
`;

const createRepoFixture = (files: Readonly<Record<string, Buffer | string>>): string => {
  const repoRoot = fs.mkdtempSync(path.join(os.tmpdir(), "axm-source-hygiene-"));
  tempRoots.push(repoRoot);
  for (const [relativePath, content] of Object.entries(files)) {
    const absolutePath = path.join(repoRoot, relativePath);
    fs.mkdirSync(path.dirname(absolutePath), { recursive: true });
    fs.writeFileSync(absolutePath, content);
  }
  return repoRoot;
};

afterEach(() => {
  for (const tempRoot of tempRoots.splice(0)) {
    fs.rmSync(tempRoot, { recursive: true, force: true });
  }
});

describe("findControlBytes", () => {
  it("allows tab, LF, CR, and ESC", () => {
    const contents = Buffer.from("a\tb\r\n[1mc[0m\n", "utf8");
    expect(findControlBytes("a.ts", contents)).toEqual([]);
  });

  it("reports a NUL byte with its line number", () => {
    const contents = Buffer.concat([
      Buffer.from("line one\nlock(`${a}", "utf8"),
      Buffer.from([0x00]),
      Buffer.from("${b}`)\n", "utf8"),
    ]);
    const violations = findControlBytes("a.ts", contents);
    expect(violations).toEqual([{ filePath: "a.ts", line: 2, byte: 0 }]);
    expect(violations.map(formatViolation)).toEqual([
      "a.ts:2 contains forbidden control byte 0x00",
    ]);
  });
});

describe("findSourceHygieneViolations", () => {
  it("scans only TypeScript sources under every discovered project's source root", () => {
    const repoRoot = createRepoFixture({
      "project.json": rootProject,
      "scripts/dirty.ts": Buffer.from([0x00]),
      "benchmarks/ignored.ts": Buffer.from([0x00]),
      "packages/core/workspace-state/project.json": project("workspace-state", "role:capability"),
      "packages/core/workspace-state/src/clean.ts": "export const ok = 1;\n",
      "packages/core/workspace-state/src/nested/dirty.ts": Buffer.concat([
        Buffer.from("const key = `a", "utf8"),
        Buffer.from([0x00]),
        Buffer.from("b`;\n", "utf8"),
      ]),
      "packages/core/workspace-state/test/ignored.ts": Buffer.from([0x00]),
      "packages/core/workspace-state/src/ignored.md": Buffer.from([0x00]),
      "tools/test-support/project.json": project("test-support", "role:tooling"),
      "tools/test-support/src/dirty.ts": Buffer.from([0x00]),
      "apps/cli/project.json": project("cli", "role:application"),
      "apps/cli/src/dirty.ts": Buffer.from([0x00]),
    });

    const violations = findSourceHygieneViolations(workspaceFromProjectFiles(repoRoot));
    expect(violations).toEqual([
      { filePath: "apps/cli/src/dirty.ts", line: 1, byte: 0 },
      { filePath: "packages/core/workspace-state/src/nested/dirty.ts", line: 1, byte: 0 },
      { filePath: "scripts/dirty.ts", line: 1, byte: 0 },
      { filePath: "tools/test-support/src/dirty.ts", line: 1, byte: 0 },
    ]);
  });

  it("finds no violations in this repository's sources", async () => {
    expect(findSourceHygieneViolations(await readWorkspace()).map(formatViolation)).toEqual([]);
  });
});

describe("findAxmEnvironmentContractViolations", () => {
  it("reports an unclassified production AXM environment literal", () => {
    const repoRoot = createRepoFixture({
      "apps/cli/project.json": project("cli", "type:app", "role:application"),
      "apps/cli/src/runtime.ts": 'const name = "AXM_NEW_CONTROL";\n',
      "apps/cli/help/topics/environment.md": [
        "| Variable | Classification | Details |",
        "| --- | --- | --- |",
        "",
      ].join("\n"),
    });

    expect(
      findAxmEnvironmentContractViolations(workspaceFromProjectFiles(repoRoot)).map(
        formatAxmEnvironmentContractViolation,
      ),
    ).toEqual([
      "apps/cli/src/runtime.ts:1 AXM_NEW_CONTROL: production AXM environment literal lacks a classified reference row",
    ]);
  });

  it("accepts stable and internal classifications and rejects stale rows", () => {
    const repoRoot = createRepoFixture({
      "apps/cli/project.json": project("cli", "type:app", "role:application"),
      "apps/cli/src/runtime.ts": 'const stable = "AXM_STABLE";\n',
      "packages/core/workspace-state/project.json": project("workspace-state", "role:capability"),
      "packages/core/workspace-state/src/internal.ts": 'const internal = "AXM_INTERNAL";\n',
      "tools/test-support/project.json": project("test-support", "role:tooling"),
      "tools/test-support/src/fixture.ts": 'const tooling = "AXM_TOOLING_ONLY";\n',
      "apps/cli/help/topics/environment.md": [
        "| Variable | Classification | Details |",
        "| --- | --- | --- |",
        "| `AXM_STABLE` | stable automation | Supported. |",
        "| `AXM_INTERNAL` | internal | Reserved. |",
        "| `AXM_STALE` | internal | Removed. |",
        "",
      ].join("\n"),
    });

    expect(findAxmEnvironmentContractViolations(workspaceFromProjectFiles(repoRoot))).toEqual([
      {
        variable: "AXM_STALE",
        filePath: "apps/cli/help/topics/environment.md",
        line: 5,
        reason: "classified reference row has no production CLI/core string literal",
      },
    ]);
  });

  it("treats installer environment controls as production literals", () => {
    const repoRoot = createRepoFixture({
      "apps/cli/project.json": project("cli", "type:app", "role:application"),
      "apps/cli/site-content/install.sh": 'repo="${AXM_INSTALL_GITHUB_REPO:-agentxm/axm}"\n',
      "apps/cli/help/topics/environment.md": [
        "| Variable | Classification | Details |",
        "| --- | --- | --- |",
        "| `AXM_INSTALL_GITHUB_REPO` | internal | Installer override. |",
        "",
      ].join("\n"),
    });

    expect(findAxmEnvironmentContractViolations(workspaceFromProjectFiles(repoRoot))).toEqual([]);
  });

  it("finds no environment contract violations in this repository", async () => {
    expect(
      findAxmEnvironmentContractViolations(await readWorkspace()).map(
        formatAxmEnvironmentContractViolation,
      ),
    ).toEqual([]);
  });
});

describe("countUnboundedConcurrencySites", () => {
  it("counts production literals while excluding tests and generated clients", () => {
    const repoRoot = createRepoFixture({
      "packages/core/workspace-state/project.json": project("workspace-state", "role:capability"),
      "packages/core/workspace-state/src/one.ts": 'const options = { concurrency: "unbounded" };\n',
      "apps/cli/project.json": project("cli", "role:application"),
      "apps/cli/src/two.ts": 'const options = { concurrency: "unbounded" };\n',
      "packages/core/workspace-state/src/one.test.ts":
        'const options = { concurrency: "unbounded" };\n',
      "packages/core/workspace-state/src/__generated__/client.ts":
        'const options = { concurrency: "unbounded" };\n',
    });

    expect(countUnboundedConcurrencySites(workspaceFromProjectFiles(repoRoot))).toBe(2);
  });
});

describe("findTestTaxonomyViolations", () => {
  it("enforces the specification and test file rules discovery relies on", () => {
    const repoRoot = createRepoFixture({
      "project.json": rootProject,
      "scripts/h.test.ts": "",
      "scripts/i.e2e.test.ts": "",
      "scripts/j.test.ts": specification("scripts/j"),
      "benchmarks/allowed.bench.ts": "",
      "packages/core/demo/project.json": project("demo", "role:capability"),
      "packages/core/demo/src/a.spec.ts": specification("demo/a"),
      "packages/core/demo/src/again.spec.ts": specification("demo/a"),
      "packages/core/demo/src/b.test.ts": "",
      "packages/core/demo/src/c.bench.ts": "",
      "packages/core/demo/src/d.windows.test.ts": "",
      "packages/core/demo/src/e.e2e.test.ts": "",
      "packages/core/demo/src/f.spec.ts": "export const other = 1;",
      "packages/core/demo/src/__generated__/g.test.ts": "",
      "packages/core/demo/src/__generated__/h.spec.ts": specification("demo/h"),
      "apps/demo-e2e/project.json": project("demo-e2e", "role:e2e"),
      "apps/demo-e2e/src/f.e2e.test.ts": "",
      "apps/demo-e2e/src/g.windows.e2e.test.ts": "",
    });
    fs.symlinkSync("a.spec.ts", path.join(repoRoot, "packages/core/demo/src/linked.spec.ts"));
    fs.symlinkSync("src", path.join(repoRoot, "packages/core/demo/hidden"));
    fs.symlinkSync("README.md", path.join(repoRoot, "packages/core/demo/notes.md"));

    expect(
      findTestTaxonomyViolations(workspaceFromProjectFiles(repoRoot)).map(
        formatTestTaxonomyViolation,
      ),
    ).toEqual([
      "packages/core/demo/hidden: symbolic links may not hide test or specification files",
      "packages/core/demo/src/__generated__/g.test.ts: test and specification files never live inside __generated__/",
      "packages/core/demo/src/__generated__/h.spec.ts: test and specification files never live inside __generated__/",
      "packages/core/demo/src/again.spec.ts: requirement identity `demo/a` is already declared by packages/core/demo/src/a.spec.ts; exactly one canonical specification file per identity",
      "packages/core/demo/src/c.bench.ts: diagnostic benchmarks live under benchmarks/",
      "packages/core/demo/src/e.e2e.test.ts: *.e2e.test.ts lives only inside projects tagged role:e2e",
      "packages/core/demo/src/f.spec.ts: *.spec.ts must export a valid `specification`: specification file must export a `specification` constant",
      "packages/core/demo/src/linked.spec.ts: symbolic links may not hide test or specification files",
      "scripts/i.e2e.test.ts: *.e2e.test.ts lives only inside projects tagged role:e2e",
      "scripts/j.test.ts: *.test.ts must not export `specification`; name it *.spec.ts or drop the export",
    ]);
  });

  it("finds no taxonomy violations in this repository", async () => {
    expect(
      findTestTaxonomyViolations(await readWorkspace()).map(formatTestTaxonomyViolation),
    ).toEqual([]);
  });
});
