import { readFileSync } from "node:fs";
import { createProjectGraphAsync } from "nx/src/devkit-exports";
import { beforeAll, describe, expect, it } from "vitest";

type ResolvedTarget = {
  readonly cache?: boolean;
  readonly inputs?: ReadonlyArray<unknown>;
  readonly outputs?: ReadonlyArray<string>;
  readonly options?: {
    readonly command?: string;
  };
};

type ResolvedProject = {
  readonly name: string;
  readonly data: {
    readonly targets?: Readonly<Record<string, ResolvedTarget>>;
  };
};

const read = (path: string): string => readFileSync(path, "utf8");

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null;

const readObject = (path: string): Record<string, unknown> => {
  const value: unknown = JSON.parse(read(path));
  if (!isRecord(value)) throw new Error(`${path} must contain a JSON object.`);
  return value;
};

const readTargets = (path: string): Record<string, unknown> => {
  const targets = readObject(path)["targets"];
  if (!isRecord(targets)) throw new Error(`${path} must declare targets.`);
  return targets;
};

const targetCache = (targets: Record<string, unknown>, targetName: string): unknown => {
  const target = targets[targetName];
  if (!isRecord(target)) throw new Error(`Missing target ${targetName}.`);
  return target["cache"];
};

const outputPrefix = (output: string): string =>
  output.slice(0, output.indexOf("*") === -1 ? undefined : output.indexOf("*")).replace(/\/$/u, "");

const outputsOverlap = (left: string, right: string): boolean => {
  const leftPrefix = outputPrefix(left);
  const rightPrefix = outputPrefix(right);
  return (
    leftPrefix === rightPrefix ||
    leftPrefix.startsWith(`${rightPrefix}/`) ||
    rightPrefix.startsWith(`${leftPrefix}/`)
  );
};

describe("repository task interface", () => {
  let projects: ReadonlyArray<ResolvedProject> = [];

  beforeAll(async () => {
    const graph = await createProjectGraphAsync({ exitOnError: false });
    projects = Object.values(graph.nodes);
  });

  it("uses the current portable guide as the sole semantic authority", () => {
    const manifest = readObject(
      "agent_extensions/agentxm/@craigsmitham/knowledge/software-engineering/knowledge.json",
    );
    expect(manifest["version"]).toBe("2.3.0");

    const binding = read("docs/guides/repository-task-interface.md");
    expect(binding).toContain(
      "agent_extensions/agentxm/@craigsmitham/knowledge/software-engineering/src/repository-task-interface.md",
    );
    expect(read("AGENTS.md")).toContain("docs/guides/repository-task-interface.md");

    for (const path of [
      "AGENTS.md",
      "CONTRIBUTING.md",
      ".github/workflows/ci.yml",
      "docs/index.md",
      "contributing/guides/development-environment.md",
      "scripts/lint-bundled-skill.ts",
    ]) {
      expect(read(path), path).not.toContain("command-execution-policy.md");
      expect(read(path), path).not.toContain("src/command-execution.md");
    }
  });

  it("gives every cached resolved target a non-empty input contract", () => {
    const missing: string[] = [];
    for (const project of projects) {
      for (const [targetName, target] of Object.entries(project.data.targets ?? {})) {
        if (target.cache === true && (target.inputs?.length ?? 0) === 0) {
          missing.push(`${project.name}:${targetName}`);
        }
      }
    }
    expect(missing).toEqual([]);
  });

  it("runs host and live-state work fresh", () => {
    for (const project of projects) {
      for (const [targetName, target] of Object.entries(project.data.targets ?? {})) {
        if (
          /^(?:bench$|compile-host-dev$|lint-bundled-skill$|release-|sync:|watch$)/u.test(
            targetName,
          )
        ) {
          expect(target.cache, `${project.name}:${targetName}`).not.toBe(true);
        }
      }
    }
  });

  it("gives build and typecheck disjoint output ownership", () => {
    const overlaps: string[] = [];
    for (const project of projects) {
      const buildOutputs = project.data.targets?.["build"]?.outputs ?? [];
      const typecheckOutputs = project.data.targets?.["typecheck"]?.outputs ?? [];
      for (const buildOutput of buildOutputs) {
        for (const typecheckOutput of typecheckOutputs) {
          if (outputsOverlap(buildOutput, typecheckOutput)) {
            overlaps.push(`${project.name}: ${buildOutput} <> ${typecheckOutput}`);
          }
        }
      }
    }
    expect(overlaps).toEqual([]);
  });

  it("keeps typecheck writes inside their declared output", () => {
    for (const project of projects) {
      const typecheck = project.data.targets?.["typecheck"];
      if (typecheck === undefined) continue;

      expect(typecheck.options?.command, project.name).toContain("--noEmit");
      if (project.name === "axm") continue;
      expect(typecheck.options?.command, project.name).toContain(
        "--tsBuildInfoFile out-tsc/typecheck/",
      );
      expect(typecheck.outputs, project.name).toEqual(["{projectRoot}/out-tsc/typecheck"]);
    }
  });

  it("builds shared test reporting before isolated release preparation", () => {
    const rootTargets = readTargets("project.json");
    const reportingTarget = rootTargets["build-test-reporting"];
    if (!isRecord(reportingTarget)) throw new Error("Missing build-test-reporting target.");
    expect(reportingTarget["outputs"]).toEqual(["{workspaceRoot}/out-tsc/reporting"]);

    const candidateTarget = rootTargets["release-prepare-candidate"];
    if (!isRecord(candidateTarget)) throw new Error("Missing release-prepare-candidate target.");
    expect(candidateTarget["dependsOn"]).toContain("build-test-reporting");
  });

  it("declares observations and external mutations fresh", () => {
    const rootTargets = readTargets("project.json");
    for (const targetName of [
      "bench",
      "lint-bundled-skill",
      "parity-ledger-check",
      "release-prepare",
      "release-publish",
      "release-publish-local",
      "specification-verdict",
      "validate-release-tag",
    ]) {
      expect(targetCache(rootTargets, targetName), targetName).toBe(false);
    }

    const e2eTargets = readTargets("packages/cli-e2e/project.json");
    for (const targetName of ["binary-smoke-artifact", "install-suite", "install-verification"]) {
      expect(targetCache(e2eTargets, targetName), targetName).toBe(false);
    }
  });

  it("covers every file family read by cached repository-wide checks", () => {
    const targets = readTargets("project.json");
    expect(targetCache(targets, "test")).toBe(false);
    const hygiene = targets["verify-source-hygiene"];
    if (!isRecord(hygiene)) throw new Error("Missing verify-source-hygiene target.");
    expect(hygiene["inputs"]).toContain("{workspaceRoot}/packages/**/*");
  });
});
