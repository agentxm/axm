import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { fileURLToPath } from "node:url";

import { afterEach, describe, expect, it } from "vitest";

import {
  findControlBytes,
  findMachineOutputBoundaryViolations,
  findSourceHygieneViolations,
  countUnboundedConcurrencySites,
  formatMachineOutputBoundaryViolation,
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
      "packages/core/src/clean.ts": "export const ok = 1;\n",
      "packages/core/src/nested/dirty.ts": Buffer.concat([
        Buffer.from("const key = `a", "utf8"),
        Buffer.from([0x00]),
        Buffer.from("b`;\n", "utf8"),
      ]),
      "packages/core/test/ignored.ts": Buffer.from([0x00]),
      "packages/core/src/ignored.md": Buffer.from([0x00]),
    });

    const violations = findSourceHygieneViolations(repoRoot);
    expect(violations).toEqual([
      {
        filePath: path.join("packages", "core", "src", "nested", "dirty.ts"),
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

describe("findMachineOutputBoundaryViolations", () => {
  it("reports handler stdout writes and implicit result streaming", () => {
    const repoRoot = createRepoFixture({
      "packages/cli/src/root/unsafe.ts": [
        "process.stdout.write('unsafe');",
        "console.log('also unsafe');",
        "renderer.resultStream(stream, schema);",
        "",
      ].join("\n"),
      "packages/core/src/unstable/cli-renderer/renderer-helpers.ts":
        "process.stdout.write('approved');\n",
    });

    expect(
      findMachineOutputBoundaryViolations(repoRoot).map(formatMachineOutputBoundaryViolation),
    ).toEqual([
      `${path.join("packages", "cli", "src", "root", "unsafe.ts")}:1 uses process.stdout.write: production stdout must flow through the approved CLI renderer/runtime boundary`,
      `${path.join("packages", "cli", "src", "root", "unsafe.ts")}:2 uses console.log: production stdout must flow through the approved CLI renderer/runtime boundary`,
      `${path.join("packages", "cli", "src", "root", "unsafe.ts")}:3 uses resultStream: ordinary --json output is one document; streaming requires a future explicit output mode`,
    ]);
  });

  it("finds no machine-output boundary violations in this repository", () => {
    const scriptsRoot = fileURLToPath(new URL(".", import.meta.url));
    const repoRoot = path.resolve(scriptsRoot, "..");
    expect(
      findMachineOutputBoundaryViolations(repoRoot).map(formatMachineOutputBoundaryViolation),
    ).toEqual([]);
  });
});

describe("countUnboundedConcurrencySites", () => {
  it("counts production literals while excluding tests and generated clients", () => {
    const repoRoot = createRepoFixture({
      "packages/core/src/one.ts": 'const options = { concurrency: "unbounded" };\n',
      "packages/cli/src/two.ts": 'const options = { concurrency: "unbounded" };\n',
      "packages/core/src/one.test.ts": 'const options = { concurrency: "unbounded" };\n',
      "packages/core/src/__generated__/client.ts":
        'const options = { concurrency: "unbounded" };\n',
    });

    expect(countUnboundedConcurrencySites(repoRoot)).toBe(2);
  });
});
