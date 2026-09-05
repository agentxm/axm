import { readFileSync } from "node:fs";
import { createProjectGraphAsync } from "nx/src/devkit-exports";
import { beforeAll, describe, expect, it } from "vitest";

type ResolvedTarget = {
  readonly cache?: boolean;
  readonly dependsOn?: ReadonlyArray<unknown>;
  readonly executor?: string;
  readonly inputs?: ReadonlyArray<unknown>;
  readonly outputs?: ReadonlyArray<string>;
  readonly options?: {
    readonly clean?: boolean;
    readonly command?: string | ReadonlyArray<string>;
    readonly outputPath?: string;
  };
};

type ResolvedProject = {
  readonly name: string;
  readonly data: {
    readonly root?: string;
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

const commandText = (command: string | ReadonlyArray<string> | undefined): string =>
  typeof command === "string" ? command : (command ?? []).join(" ");

const resolvedOutputPath = (projectRoot: string, output: string): string =>
  outputPrefix(output)
    .replace("{workspaceRoot}/", "")
    .replace("{projectRoot}", projectRoot)
    .replace(/^\.\//u, "");

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

  it("keeps pre-install host tasks reachable through their published names", () => {
    expect(read(".github/workflows/ci.yml")).toContain(
      "pnpm --config.verify-deps-before-run=warn run classify:ci",
    );
    expect(read(".github/workflows/ci-image.yml")).toContain(
      "pnpm --config.verify-deps-before-run=warn run check:ci-image",
    );
  });

  it("keeps verification output phases isolated", () => {
    const scripts = readObject("package.json")["scripts"];
    if (!isRecord(scripts)) throw new Error("package.json must declare scripts.");

    for (const name of ["verify:affected", "verify:workspace"]) {
      const script = scripts[name];
      if (typeof script !== "string") throw new Error(`Missing ${name} script.`);
      const phases = script.split("&&");
      expect(phases[1], name).toContain("-t build --parallel=1 --skip-nx-cache");
      expect(phases[2], name).toContain("-t test --parallel=1 --excludeTaskDependencies");
      for (const [index, phase] of phases.entries()) {
        expect(phase, `${name} phase ${index + 1}`).not.toContain("--batch");
      }
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

  it("includes dependency production inputs in the cached root typecheck contract", () => {
    const root = projects.find((project) => project.name === "axm");
    const typecheck = root?.data.targets?.["typecheck"];
    expect(typecheck?.dependsOn).toContain("^build");
    expect(typecheck?.inputs).toContain("^production");
  });

  it("derives root build prerequisites from the project graph", () => {
    const root = projects.find((project) => project.name === "axm");
    for (const targetName of [
      "typecheck",
      "test",
      "release-prepare",
      "release-prepare-candidate",
      "release-publish",
      "release-publish-local",
      "validate-release-tag",
      "resolve-release-meta",
      "download-ci-binaries",
    ]) {
      const dependencies = root?.data.targets?.[targetName]?.dependsOn ?? [];
      expect(dependencies, targetName).toContain("^build");
      expect(dependencies, targetName).not.toContain("extension-model:build");
      expect(dependencies, targetName).not.toContain("registry-protocol:build");
      expect(dependencies, targetName).not.toContain("extension-workspace:build");
    }
  });

  it("keeps root lint on the supported executor and root-only file scope", () => {
    const root = projects.find((project) => project.name === "axm");
    const lint = root?.data.targets?.["lint"];
    const command = commandText(lint?.options?.command);
    expect(lint?.executor).toBe("nx:run-commands");
    expect(command).toBe(
      "eslint allurerc.ts eslint.config.mjs vitest.config.ts vitest.reporting.ts scripts --max-warnings=192",
    );
    expect(command).not.toContain("eslint .");
  });

  it("hashes host identity for cached host-selective targets", () => {
    for (const project of projects) {
      for (const [targetName, target] of Object.entries(project.data.targets ?? {})) {
        if (
          target.cache !== true ||
          !commandText(target.options?.command).includes("--host-only")
        ) {
          continue;
        }
        expect(target.inputs, `${project.name}:${targetName}`).toContain("hostPlatform");
      }
    }
  });

  it("keeps inferred Vitest inputs when CLI E2E adds dependency and host inputs", () => {
    const e2e = projects.find((project) => project.name === "cli-e2e");
    const inputs = e2e?.data.targets?.["e2e-main"]?.inputs;
    expect(inputs).toContain("^production");
    expect(inputs).toContain("hostPlatform");
    expect(inputs).toContainEqual({ externalDependencies: ["vitest"] });
    expect(inputs).toContainEqual({ env: "CI" });
    expect(inputs).toContainEqual({ dependentTasksOutputFiles: "**/*.js", transitive: true });
    for (const targetName of ["e2e-windows", "binary-smoke"]) {
      expect(e2e?.data.targets?.[targetName]?.inputs, targetName).toContain("hostPlatform");
    }
  });

  it("declares transitive release publishing once after inference", () => {
    for (const project of projects) {
      const dependencies = project.data.targets?.["nx-release-publish"]?.dependsOn;
      if (dependencies === undefined) continue;
      expect(
        dependencies.filter((dependency) => dependency === "^nx-release-publish"),
        project.name,
      ).toHaveLength(1);
      expect(dependencies, project.name).toContain("build");
    }
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

  it("contains TSC clean and write scope within declared outputs", () => {
    for (const project of projects) {
      for (const [targetName, target] of Object.entries(project.data.targets ?? {})) {
        if (target.executor !== "@nx/js:tsc" || target.options?.clean !== true) continue;

        const outputPath = target.options.outputPath;
        if (outputPath === undefined)
          throw new Error(`${project.name}:${targetName} needs outputPath.`);
        const declaredOutputs = (target.outputs ?? []).map((output) =>
          resolvedOutputPath(project.data.root ?? ".", output),
        );
        expect(declaredOutputs, `${project.name}:${targetName}`).toContain(outputPath);
      }
    }
  });

  it("keeps CLI source-build outputs disjoint from compiled binaries", () => {
    const cli = projects.find((project) => project.name === "cli");
    const targets = cli?.data.targets;
    for (const sourceTargetName of ["build", "watch"]) {
      const sourceOutputs = targets?.[sourceTargetName]?.outputs ?? [];
      for (const compileTargetName of ["compile", "compile-host", "compile-host-dev"]) {
        const compileOutputs = targets?.[compileTargetName]?.outputs ?? [];
        for (const sourceOutput of sourceOutputs) {
          for (const compileOutput of compileOutputs) {
            expect(
              outputsOverlap(sourceOutput, compileOutput),
              `${sourceTargetName}:${sourceOutput} <> ${compileTargetName}:${compileOutput}`,
            ).toBe(false);
          }
        }
      }
    }
  });

  it("keeps typecheck writes inside their declared output", () => {
    for (const project of projects) {
      const typecheck = project.data.targets?.["typecheck"];
      if (typecheck === undefined) continue;

      expect(commandText(typecheck.options?.command), project.name).toContain("--noEmit");
      if (project.name === "axm") continue;
      expect(commandText(typecheck.options?.command), project.name).toContain(
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
      "distribute-release",
      "verify-installed-package",
      "verify-release-packs",
      "update-homebrew-formula",
      "promote-release-channel",
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
