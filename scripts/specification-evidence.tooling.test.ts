import { execFileSync } from "node:child_process";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { withoutLocalGitEnvironment } from "@agentxm/client-e2e-utils";
import { captureEvidenceInputs, digestFiles, readEvidenceRuns } from "./specification-evidence.js";

const roots: string[] = [];
const repository = (): string => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "axm-evidence-"));
  roots.push(root);
  const env = withoutLocalGitEnvironment(process.env);
  execFileSync("git", ["init", "-q"], { cwd: root, env });
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
    { cwd: root, env },
  );
  fs.writeFileSync(path.join(root, ".gitignore"), "test-results/\ndist/\n");
  return root;
};
const write = (root: string, file: string, content: string): void => {
  fs.mkdirSync(path.dirname(path.join(root, file)), { recursive: true });
  fs.writeFileSync(path.join(root, file), content);
};
afterEach(() => {
  vi.unstubAllEnvs();
  for (const root of roots.splice(0)) fs.rmSync(root, { recursive: true, force: true });
});

describe("repository execution inputs", () => {
  it("isolates fixture writes and input observations from inherited Git hook selectors", () => {
    const outer = repository();
    write(outer, "outer-input", "outside the observed repository");
    const before = captureEvidenceInputs(outer);
    const configBefore = fs.readFileSync(path.join(outer, ".git", "config"), "utf8");
    vi.stubEnv("GIT_DIR", path.join(outer, ".git"));
    vi.stubEnv("GIT_COMMON_DIR", path.join(outer, ".git"));
    vi.stubEnv("GIT_WORK_TREE", outer);
    vi.stubEnv("GIT_INDEX_FILE", path.join(outer, ".git", "index"));
    const inner = repository();
    expect(fs.existsSync(path.join(inner, ".git", "HEAD"))).toBe(true);
    write(inner, "inner-input", "the selected repository");
    const observed = captureEvidenceInputs(inner);
    expect(observed.sourceDigest).not.toBe(before.sourceDigest);
    expect(captureEvidenceInputs(outer)).toEqual(before);
    expect(fs.readFileSync(path.join(outer, ".git", "config"), "utf8")).toBe(configBefore);
    vi.unstubAllEnvs();
    expect(captureEvidenceInputs(inner)).toEqual(observed);
  });

  it.each([
    "specifications/cli/install.spec.ts",
    "specifications/support/install-harness.ts",
    "packages/cli-e2e/src/cli-commands/auth/token/token.e2e.ts",
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
