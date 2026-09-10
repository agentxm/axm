import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { fileURLToPath } from "node:url";

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

const tempRoots: string[] = [];

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
    const contents = Buffer.from("a\tb\r\n\u001b[1mc\u001b[0m\n", "utf8");
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
  it("scans only TypeScript sources under packages/*/src", () => {
    const repoRoot = createRepoFixture({
      "packages/workspace-state/src/clean.ts": "export const ok = 1;\n",
      "packages/workspace-state/src/nested/dirty.ts": Buffer.concat([
        Buffer.from("const key = `a", "utf8"),
        Buffer.from([0x00]),
        Buffer.from("b`;\n", "utf8"),
      ]),
      "packages/workspace-state/test/ignored.ts": Buffer.from([0x00]),
      "packages/workspace-state/src/ignored.md": Buffer.from([0x00]),
    });

    const violations = findSourceHygieneViolations(repoRoot);
    expect(violations).toEqual([
      {
        filePath: path.join("packages", "workspace-state", "src", "nested", "dirty.ts"),
        line: 1,
        byte: 0,
      },
    ]);
  });

  it("finds no violations in this repository's package sources", () => {
    const scriptsRoot = fileURLToPath(new URL(".", import.meta.url));
    const repoRoot = path.resolve(scriptsRoot, "..");
    expect(findSourceHygieneViolations(repoRoot).map(formatViolation)).toEqual([]);
  });
});

describe("findAxmEnvironmentContractViolations", () => {
  it("reports an unclassified production AXM environment literal", () => {
    const repoRoot = createRepoFixture({
      "packages/cli/src/runtime.ts": 'const name = "AXM_NEW_CONTROL";\n',
      "packages/cli/help/topics/environment.md": [
        "| Variable | Classification | Details |",
        "| --- | --- | --- |",
        "",
      ].join("\n"),
    });

    expect(
      findAxmEnvironmentContractViolations(repoRoot).map(formatAxmEnvironmentContractViolation),
    ).toEqual([
      `${path.join("packages", "cli", "src", "runtime.ts")}:1 AXM_NEW_CONTROL: production AXM environment literal lacks a classified reference row`,
    ]);
  });

  it("accepts stable and internal classifications and rejects stale rows", () => {
    const repoRoot = createRepoFixture({
      "packages/cli/src/runtime.ts": 'const stable = "AXM_STABLE";\n',
      "packages/workspace-state/src/internal.ts": 'const internal = "AXM_INTERNAL";\n',
      "packages/cli/help/topics/environment.md": [
        "| Variable | Classification | Details |",
        "| --- | --- | --- |",
        "| `AXM_STABLE` | stable automation | Supported. |",
        "| `AXM_INTERNAL` | internal | Reserved. |",
        "| `AXM_STALE` | internal | Removed. |",
        "",
      ].join("\n"),
    });

    expect(findAxmEnvironmentContractViolations(repoRoot)).toEqual([
      {
        variable: "AXM_STALE",
        filePath: path.join("packages", "cli", "help", "topics", "environment.md"),
        line: 5,
        reason: "classified reference row has no production CLI/core string literal",
      },
    ]);
  });

  it("treats installer environment controls as production literals", () => {
    const repoRoot = createRepoFixture({
      "packages/cli/site-content/install.sh": 'repo="${AXM_INSTALL_GITHUB_REPO:-agentxm/axm}"\n',
      "packages/cli/help/topics/environment.md": [
        "| Variable | Classification | Details |",
        "| --- | --- | --- |",
        "| `AXM_INSTALL_GITHUB_REPO` | internal | Installer override. |",
        "",
      ].join("\n"),
    });

    expect(findAxmEnvironmentContractViolations(repoRoot)).toEqual([]);
  });

  it("finds no environment contract violations in this repository", () => {
    const scriptsRoot = fileURLToPath(new URL(".", import.meta.url));
    const repoRoot = path.resolve(scriptsRoot, "..");
    expect(
      findAxmEnvironmentContractViolations(repoRoot).map(formatAxmEnvironmentContractViolation),
    ).toEqual([]);
  });
});

describe("countUnboundedConcurrencySites", () => {
  it("counts production literals while excluding tests and generated clients", () => {
    const repoRoot = createRepoFixture({
      "packages/workspace-state/src/one.ts": 'const options = { concurrency: "unbounded" };\n',
      "packages/cli/src/two.ts": 'const options = { concurrency: "unbounded" };\n',
      "packages/workspace-state/src/one.test.ts": 'const options = { concurrency: "unbounded" };\n',
      "packages/workspace-state/src/__generated__/client.ts":
        'const options = { concurrency: "unbounded" };\n',
    });

    expect(countUnboundedConcurrencySites(repoRoot)).toBe(2);
  });
});

describe("findTestTaxonomyViolations", () => {
  it("flags e2e tests outside e2e projects and misplaced benchmarks", () => {
    const repoRoot = createRepoFixture({
      "project.json": JSON.stringify({ name: "axm", tags: ["type:tooling"] }),
      "packages/demo/project.json": JSON.stringify({ name: "demo", tags: ["type:lib"] }),
      "packages/demo/src/a.spec.ts": "",
      "packages/demo/src/b.test.ts": "",
      "packages/demo/src/c.bench.ts": "",
      "packages/demo/src/d.windows.test.ts": "",
      "packages/demo/src/e.e2e.test.ts": "",
      "packages/demo-e2e/project.json": JSON.stringify({ name: "demo-e2e", tags: ["type:e2e"] }),
      "packages/demo-e2e/src/f.e2e.test.ts": "",
      "packages/demo-e2e/src/g.windows.e2e.test.ts": "",
      "scripts/h.test.ts": "",
      "scripts/i.e2e.test.ts": "",
    });

    expect(findTestTaxonomyViolations(repoRoot).map(formatTestTaxonomyViolation)).toEqual([
      "packages/demo/src/c.bench.ts: diagnostic benchmarks live under benchmarks/",
      "packages/demo/src/e.e2e.test.ts: *.e2e.test.ts lives only inside projects tagged type:e2e",
      "scripts/i.e2e.test.ts: *.e2e.test.ts lives only inside projects tagged type:e2e",
    ]);
  });

  it("finds no taxonomy violations in this repository", () => {
    const scriptsRoot = fileURLToPath(new URL(".", import.meta.url));
    const repoRoot = path.resolve(scriptsRoot, "..");
    expect(findTestTaxonomyViolations(repoRoot).map(formatTestTaxonomyViolation)).toEqual([]);
  });
});
