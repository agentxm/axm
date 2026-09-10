import { execFileSync } from "node:child_process";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { withoutLocalGitEnvironment } from "@agentxm/client-e2e-utils";
import {
  captureEvidenceInputs as captureInputs,
  digestFiles,
  readEvidenceRuns,
  type EvidenceInputOptions,
} from "./specification-evidence.js";
import { fixtureRun } from "./specification-verdict-fixtures.js";

const captureEvidenceInputs = (
  root: string,
  options: Partial<EvidenceInputOptions> = {},
): ReturnType<typeof captureInputs> =>
  captureInputs(root, { runtimeOutputs: ["apps/cli/dist"], ...options });

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
    "packages/core/extension-lifecycle/src/install/install.spec.ts",
    "tools/test-support/src/install-harness.ts",
    "apps/cli-e2e/src/cli-commands/auth/token/token.e2e.ts",
    "apps/cli/src/install.ts",
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

  it("tracks the named runtime outputs separately from source and ignores generated receipts", () => {
    const root = repository();
    write(root, "apps/cli/package.json", "{}");
    write(root, "apps/cli/dist/index.js", "before");
    write(root, "packages/core/model/dist/index.js", "unnamed output");
    const before = captureEvidenceInputs(root);
    write(root, "apps/cli/dist/index.js", "after");
    const after = captureEvidenceInputs(root);
    expect(after.sourceDigest).toBe(before.sourceDigest);
    expect(after.runtimeDigest).not.toBe(before.runtimeDigest);
    write(root, "packages/core/model/dist/index.js", "changed but not a resolved output");
    expect(captureEvidenceInputs(root)).toEqual(after);
    expect(
      captureEvidenceInputs(root, { runtimeOutputs: ["apps/cli/dist", "packages/core/model/dist"] })
        .runtimeDigest,
    ).not.toBe(after.runtimeDigest);
    write(root, "test-results/extension-lifecycle/evidence.json", "generated");
    expect(captureEvidenceInputs(root)).toEqual(after);
  });

  it("tracks source execution without requiring or inheriting built artifacts", () => {
    const root = repository();
    write(root, "apps/cli/package.json", "{}");
    write(root, "apps/cli/src/index.ts", "before");
    const before = captureEvidenceInputs(root, { runtimeMode: "source" });
    expect(before.runtimeMode).toBe("source");
    write(root, "apps/cli/dist/index.js", "generated");
    expect(captureEvidenceInputs(root, { runtimeMode: "source" })).toEqual(before);
    write(root, "apps/cli/src/index.ts", "after");
    const after = captureEvidenceInputs(root, { runtimeMode: "source" });
    expect(after.runtimeDigest).not.toBe(before.runtimeDigest);
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

  it("reports malformed or superseded-format evidence as an issue instead of silently adopting it", () => {
    const root = repository();
    write(root, "test-results/extension-lifecycle/evidence.json", '{"passed":true}');
    write(
      root,
      "test-results/cli/evidence.json",
      JSON.stringify({ ...fixtureRun(), format: 1, files: [{ source: "x.spec.ts" }] }),
    );
    write(root, "test-results/workspace-state/evidence.json", JSON.stringify(fixtureRun()));
    expect(readEvidenceRuns(root)).toEqual({
      runs: [fixtureRun()],
      issues: [
        "Invalid execution evidence: test-results/cli/evidence.json",
        "Invalid execution evidence: test-results/extension-lifecycle/evidence.json",
      ],
    });
  });
});
