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
    readonly sourceRoot?: string;
    readonly tags?: ReadonlyArray<string>;
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
      "agent_extensions/agentxm/@craigsmitham/knowledge/product-engineering/knowledge.json",
    );
    expect(manifest["version"]).toBe("2.1.0");

    const binding = read("docs/guides/repository-task-interface.md");
    expect(binding).toContain(
      "agent_extensions/agentxm/@craigsmitham/knowledge/product-engineering/src/engineering/repository-task-interface.md",
    );
    expect(read("AGENTS.md")).toContain("docs/guides/repository-task-interface.md");

    for (const path of [
      "AGENTS.md",
      "CONTRIBUTING.md",
      ".github/workflows/ci.yml",
      "docs/index.md",
      "devops/environments/native-development.md",
      "devops/environments/linux-ci.md",
      "devops/environments/native-platform-ci.md",
      "devops/runbooks/run-source-cli.md",
      "devops/runbooks/reproduce-linux-ci.md",
      "devops/runbooks/upgrade-ci-image.md",
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

  it("checks the complete capability graph before dependency-aware verification", () => {
    const scripts = readObject("package.json")["scripts"];
    if (!isRecord(scripts)) throw new Error("package.json must declare scripts.");

    for (const name of ["verify:affected", "verify:workspace"]) {
      const script = scripts[name];
      if (typeof script !== "string") throw new Error(`Missing ${name} script.`);
      const phases = script.split("&&");
      expect(phases[0]?.trim(), name).toBe("pnpm exec nx run architecture:check");
      expect(phases[1], name).toContain("-t lint typecheck build test");
      expect(phases[1], name).toContain("pnpm exec nx");
      expect(phases[1], name).not.toContain("scripts/profile-nx.ts");
      expect(script, name).not.toContain("--skip-nx-cache");
      expect(script, name).not.toContain("--excludeTaskDependencies");
      expect(script, name).not.toContain("--batch");
      expect(phases).toHaveLength(2);
    }

    const verifyPr = scripts["verify:pr"];
    if (typeof verifyPr !== "string") throw new Error("Missing verify:pr script.");
    expect(verifyPr).toContain("pnpm run verify:clean");
    expect(verifyPr).toContain("pnpm run format:check");
    expect(verifyPr).toContain("pnpm run verify:affected");
    expect(verifyPr).toContain("pnpm exec nx run axm:verify-release-packs");
    expect(verifyPr).toContain("pnpm run test:e2e:affected");
    expect(scripts["verify:workspace"]).toContain("verify-release-packs");
    expect(scripts["verify:affected"]).not.toContain("verify-release-packs");

    const affectedE2e = scripts["test:e2e:affected"];
    if (typeof affectedE2e !== "string") {
      throw new Error("Missing test:e2e:affected script.");
    }
    expect(affectedE2e).toContain("pnpm exec nx affected -t e2e");
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
      "promote-release-channel",
    ]) {
      const dependencies = root?.data.targets?.[targetName]?.dependsOn ?? [];
      expect(dependencies, targetName).toContain("^build");
      // The prerequisite is the graph edge itself. Naming an individual
      // project's build pins the root contract to a package list that goes
      // stale the moment a package is renamed, split, or retired.
      const namedProjectBuilds = dependencies.filter(
        (dependency) => typeof dependency === "string" && dependency.endsWith(":build"),
      );
      expect(namedProjectBuilds, targetName).toEqual([]);
    }
  });

  it("keeps root lint on the supported executor and root-only file scope", () => {
    const root = projects.find((project) => project.name === "axm");
    const lint = root?.data.targets?.["lint"];
    const command = commandText(lint?.options?.command);
    expect(lint?.executor).toBe("nx:run-commands");
    expect(command).toBe(
      "eslint .pnpmfile.cjs allurerc.ts eslint.config.mjs vitest.config.ts vitest.execution.ts vitest.reporting.ts vitest.purpose.setup.ts scripts --max-warnings=0",
    );
    expect(command.split(/\s+/u)).not.toContain(".");
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

  it("reaches candidate generation only through the release-preparation entry point", () => {
    // Supersedes part of the retired specification identity
    // `system/process/release-preparation-isolates-candidate-state`
    // (see `specifications/disposition-ledger.json`): the published script
    // routes to the root release-preparation target, and candidate
    // generation is an internal target that runs only inside the disposable
    // checkout.
    const scripts = readObject("package.json")["scripts"];
    if (!isRecord(scripts)) throw new Error("package.json must declare scripts.");
    const rootTargets = readTargets("project.json");
    expect(scripts["release:prepare"]).toBe("pnpm exec nx run axm:release-prepare");
    expect(Object.keys(rootTargets)).toContain("release-prepare");
    expect(Object.keys(rootTargets)).toContain("release-prepare-candidate");
    expect(
      Object.values(scripts).filter(
        (command) => typeof command === "string" && command.includes("release-prepare-candidate"),
      ),
    ).toEqual([]);
  });

  it("builds shared test reporting before isolated release preparation", () => {
    const rootTargets = readTargets("project.json");
    const reportingTarget = rootTargets["build-test-reporting"];
    if (!isRecord(reportingTarget)) throw new Error("Missing build-test-reporting target.");
    expect(reportingTarget["dependsOn"]).toContain("specification-metadata:build");
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
      // A cached result would skip the production Registry preflight or the
      // exact candidate preview.
      "release-prepare-candidate",
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

    const e2eTargets = readTargets("apps/cli-e2e/project.json");
    for (const targetName of ["binary-smoke-artifact", "install-suite", "install-verification"]) {
      expect(targetCache(e2eTargets, targetName), targetName).toBe(false);
    }
  });

  it("covers every file family read by cached repository-wide checks", () => {
    const targets = readTargets("project.json");
    expect(targetCache(targets, "test")).toBe(false);
    const hygiene = targets["verify-source-hygiene"];
    if (!isRecord(hygiene)) throw new Error("Missing verify-source-hygiene target.");
    // Specifications are colocated, so the families that hold authored source
    // are the project trees plus the repository scripts; `specifications/`
    // holds only the generated catalog, the disposition ledger, and the
    // product-goal registry.
    for (const family of ["apps", "packages", "tools", "scripts"]) {
      expect(hygiene["inputs"]).toContain(`{workspaceRoot}/${family}/**/*`);
    }
    expect(hygiene["inputs"]).toContain("{workspaceRoot}/specifications/product-goals.ts");
    const catalog = targets["generate:specification-catalog"];
    if (!isRecord(catalog)) throw new Error("Missing generate:specification-catalog target.");
    for (const family of ["apps", "packages", "tools", "scripts"]) {
      expect(catalog["inputs"]).toContain(`{workspaceRoot}/${family}/**/*.spec.ts`);
    }
    expect(catalog["inputs"]).toContain("{workspaceRoot}/specifications/product-goals.ts");
    expect(catalog["outputs"]).toEqual(["{workspaceRoot}/specifications/catalog.md"]);
  });

  it("invalidates discovery-dependent targets when discovery, tags, or reporting change", () => {
    const nx = readObject("nx.json");
    const namedInputs = nx["namedInputs"];
    if (!isRecord(namedInputs)) throw new Error("nx.json must declare namedInputs.");
    const sharedGlobals = namedInputs["sharedGlobals"];
    for (const file of [
      "scripts/workspace-discovery.ts",
      "scripts/placement-tags-plugin.ts",
      "scripts/test-purpose.ts",
      "vitest.purpose.setup.ts",
      "vitest.reporting.ts",
    ]) {
      expect(sharedGlobals, file).toContain(`{workspaceRoot}/${file}`);
    }
    const root = projects.find((project) => project.name === "axm");
    for (const targetName of ["generate:specification-catalog", "verify-source-hygiene", "test"]) {
      const inputs = root?.data.targets?.[targetName]?.inputs;
      expect(inputs, targetName).toContain("sharedGlobals");
    }
    expect(root?.data.targets?.["generate"]?.dependsOn).toContain("generate:specification-catalog");
    expect(root?.data.sourceRoot).toBe("scripts");
  });

  it("infers one domain from placement and declares one role for every project", () => {
    expect(projects.length).toBeGreaterThan(0);
    for (const project of projects) {
      const root = project.data.root ?? "";
      const tags = project.data.tags ?? [];
      const domains = tags.filter((tag) => tag.startsWith("domain:"));
      const roles = tags.filter((tag) => tag.startsWith("role:"));
      expect(roles, project.name).toHaveLength(1);
      if (root.startsWith("packages/")) {
        expect(domains, project.name).toHaveLength(1);
        expect(root.split("/"), project.name).toHaveLength(3);
        expect(["core", "supporting", "generic"], project.name).toContain(root.split("/")[1]);
      } else {
        expect(domains, project.name).toEqual([]);
      }
      if (tags.includes("release:cli")) {
        // The cohort ships the application, domain-classified libraries, and
        // the published engineering libraries under tools/ (role:tooling).
        expect(project.data.targets?.["build"], project.name).toBeDefined();
        if (!tags.includes("type:app") && !tags.includes("role:tooling")) {
          expect(domains, project.name).toHaveLength(1);
        }
        if (tags.includes("role:tooling")) expect(root, project.name).toMatch(/^tools\//u);
      }
    }
  });
});
