import { execFileSync } from "node:child_process";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { captureEvidenceInputs, digestFiles, readEvidenceRuns } from "./specification-evidence.js";

const roots: string[] = [];
const repository = (): string => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "axm-evidence-"));
  roots.push(root);
  execFileSync("git", ["init", "-q"], { cwd: root });
  execFileSync(
    "git",
    [
      "-c",
      "user.name=Fixture",
      "-c",
      "user.email=fixture@example.test",
      "-c",
      "commit.gpgsign=false",
      "commit",
      "--allow-empty",
      "-qm",
      "fixture",
    ],
    { cwd: root },
  );
  fs.writeFileSync(path.join(root, ".gitignore"), "test-results/\ndist/\n");
  return root;
};
const write = (root: string, file: string, content: string): void => {
  fs.mkdirSync(path.dirname(path.join(root, file)), { recursive: true });
  fs.writeFileSync(path.join(root, file), content);
};
afterEach(() => {
  for (const root of roots.splice(0)) fs.rmSync(root, { recursive: true, force: true });
});

describe("repository execution inputs", () => {
  it.each([
    "specifications/cli/install.spec.ts",
    "specifications/support/install-harness.ts",
    "packages/cli/src/install.ts",
    "pnpm-lock.yaml",
  ])("invalidates changed %s without relying on a new commit", (file) => {
    const root = repository();
    write(root, file, "before");
    const before = captureEvidenceInputs(root);
    write(root, file, "after");
    const after = captureEvidenceInputs(root);
    expect(after.revision).toBe(before.revision);
    expect(after.sourceDigest).not.toBe(before.sourceDigest);
  });

  it("tracks built package content separately from source and ignores generated receipts", () => {
    const root = repository();
    write(root, "packages/cli/dist/index.js", "before");
    const before = captureEvidenceInputs(root);
    write(root, "packages/cli/dist/index.js", "after");
    const after = captureEvidenceInputs(root);
    expect(after.sourceDigest).toBe(before.sourceDigest);
    expect(after.runtimeDigest).not.toBe(before.runtimeDigest);
    write(root, "test-results/specifications/evidence.json", "generated");
    expect(captureEvidenceInputs(root)).toEqual(after);
  });

  it("detects removal, mode, and symlink target changes", () => {
    const root = repository();
    write(root, "input", "bytes");
    const before = digestFiles(root, ["input"]);
    fs.chmodSync(path.join(root, "input"), 0o700);
    expect(digestFiles(root, ["input"])).not.toBe(before);
    fs.rmSync(path.join(root, "input"));
    const removed = digestFiles(root, ["input"]);
    expect(removed).not.toBe(before);
    fs.symlinkSync("first", path.join(root, "input"));
    const linked = digestFiles(root, ["input"]);
    fs.rmSync(path.join(root, "input"));
    fs.symlinkSync("second", path.join(root, "input"));
    expect(digestFiles(root, ["input"])).not.toBe(linked);
  });

  it("reports malformed evidence as an issue instead of silently adopting it", () => {
    const root = repository();
    write(root, "test-results/specifications/evidence.json", '{"passed":true}');
    expect(readEvidenceRuns(root)).toEqual({
      runs: [],
      issues: ["Invalid execution evidence: test-results/specifications/evidence.json"],
    });
  });
});
