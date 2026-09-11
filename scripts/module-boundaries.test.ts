/**
 * The module-boundary controls: dependency direction, feature peerage, and
 * acyclicity across production packages.
 *
 * Native enforcement is the `@nx/enforce-module-boundaries` depConstraint
 * matrix in `eslint.config.mjs` (role and domain tables, cycle detection,
 * `@nx/dependency-checks`). These cases keep the declared structure honest
 * from the repository's own declarations, and lint a real forbidden import
 * through the repository's flat configuration so the constraint is proven
 * reachable rather than merely present as a string.
 *
 * Supersedes the retired specification identities
 * `system/architecture/package-dependencies-point-inward`,
 * `system/architecture/feature-packages-stay-peers`, and
 * `system/architecture/package-dependencies-stay-acyclic`
 * (see `specifications/disposition-ledger.json`).
 */

import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";

import { ESLint } from "eslint";
import { beforeAll, describe, expect, it } from "vitest";

import { readProductionPackages } from "./production-packages.js";

const repoRoot = path.resolve(fileURLToPath(new URL(".", import.meta.url)), "..");

/**
 * Dependency levels by distance from the application: the application is the
 * outermost level, contracts are the innermost, and capabilities and
 * integrations are peers. A dependency points inward when its target is at
 * least as far from the application as its source.
 */
const LEVEL_DEPTH = {
  application: 0,
  feature: 1,
  capability: 2,
  integration: 2,
  contract: 3,
} as const;

const isKnownLevel = (level: string): level is keyof typeof LEVEL_DEPTH =>
  Object.hasOwn(LEVEL_DEPTH, level);

const depthByPackage = (): ReadonlyMap<string, number> =>
  new Map(
    readProductionPackages(repoRoot).map((entry) => {
      const level = entry.levels[0];
      if (level === undefined || !isKnownLevel(level)) {
        throw new Error(`${entry.name} declares no known dependency level`);
      }
      return [entry.name, LEVEL_DEPTH[level]];
    }),
  );

/**
 * Walks the declared dependency graph depth-first and renders every chain
 * that returns to a package already on the current path.
 */
const findDependencyCycles = (
  dependencies: ReadonlyMap<string, ReadonlyArray<string>>,
): ReadonlyArray<string> => {
  const cycles: string[] = [];
  const finished = new Set<string>();
  const visit = (name: string, trail: ReadonlyArray<string>): void => {
    if (finished.has(name)) return;
    const position = trail.indexOf(name);
    if (position >= 0) {
      cycles.push([...trail.slice(position), name].join(" -> "));
      return;
    }
    for (const dependency of dependencies.get(name) ?? []) visit(dependency, [...trail, name]);
    finished.add(name);
  };
  for (const name of dependencies.keys()) visit(name, []);
  return cycles;
};

describe("production package dependency structure", () => {
  it("every production package declares exactly one known role", () => {
    const packages = readProductionPackages(repoRoot);
    expect(packages.length).toBeGreaterThan(0);
    for (const entry of packages) {
      expect(entry.levels, entry.name).toHaveLength(1);
      expect(Object.keys(LEVEL_DEPTH), entry.name).toContain(entry.levels[0]);
    }
  });

  it("no production package depends on a package at a level nearer the application", () => {
    const depth = depthByPackage();
    const outward = readProductionPackages(repoRoot).flatMap((entry) =>
      entry.dependencies
        .filter((dependency) => (depth.get(dependency) ?? 0) < (depth.get(entry.name) ?? 0))
        .map((dependency) => `${entry.name} -> ${dependency}`),
    );
    expect(outward).toEqual([]);
  });

  it("no feature package depends on another feature package", () => {
    const packages = readProductionPackages(repoRoot);
    const features = packages.filter((entry) => entry.levels.includes("feature"));
    expect(features.length).toBeGreaterThan(0);
    const featureNames = new Set(features.map((entry) => entry.name));
    expect(
      features.flatMap((entry) =>
        entry.dependencies
          .filter((dependency) => featureNames.has(dependency))
          .map((dependency) => `${entry.name} -> ${dependency}`),
      ),
    ).toEqual([]);
  });

  it("no chain of production package dependencies returns to its starting package", () => {
    const packages = readProductionPackages(repoRoot);
    expect(packages.length).toBeGreaterThan(0);
    expect(findDependencyCycles(new Map(packages.map((e) => [e.name, e.dependencies])))).toEqual(
      [],
    );
  });

  it("the module-boundary and manifest-fidelity gates stay armed for every project", () => {
    const nxConfig: unknown = JSON.parse(fs.readFileSync(path.join(repoRoot, "nx.json"), "utf8"));
    if (typeof nxConfig !== "object" || nxConfig === null || !("plugins" in nxConfig)) {
      throw new Error("nx.json must register plugins");
    }
    const registeredPlugins = Array.isArray(nxConfig.plugins)
      ? nxConfig.plugins.flatMap((entry: unknown) =>
          typeof entry === "object" && entry !== null && "plugin" in entry
            ? typeof entry.plugin === "string"
              ? [entry.plugin]
              : []
            : [],
        )
      : [];
    expect(registeredPlugins).toContain("@nx/eslint/plugin");
    const eslintConfig = fs.readFileSync(path.join(repoRoot, "eslint.config.mjs"), "utf8");
    expect(eslintConfig).toContain("@nx/enforce-module-boundaries");
    expect(eslintConfig).toContain("@nx/dependency-checks");
  });
});

describe("module-boundary constraint reachability", () => {
  let boundaryViolations: (code: string, filePath: string) => Promise<ReadonlyArray<string>>;

  beforeAll(() => {
    const eslint = new ESLint({ cwd: repoRoot });
    boundaryViolations = async (code, filePath) => {
      const [result] = await eslint.lintText(code, { filePath });
      return (result?.messages ?? [])
        .filter((message) => message.ruleId === "@nx/enforce-module-boundaries")
        .map((message) => message.message);
    };
  });

  it("reports a feature importing a peer feature", async () => {
    const reported = await boundaryViolations(
      'import { PublishExtensions } from "@agentxm/extension-publish";\nvoid PublishExtensions;\n',
      "packages/core/workspace-sync/src/index.ts",
    );
    expect(reported.length).toBeGreaterThan(0);
  });

  it("reports a supporting package importing a core capability outside the sanctioned seams", async () => {
    const reported = await boundaryViolations(
      'import { WorkspaceMutations } from "@agentxm/workspace-state";\nvoid WorkspaceMutations;\n',
      "packages/supporting/registry-auth/src/index.ts",
    );
    expect(reported.length).toBeGreaterThan(0);
  });

  it("permits a feature importing a capability", async () => {
    expect(
      await boundaryViolations(
        'import { observeUnit } from "@agentxm/workspace-operations";\nvoid observeUnit;\n',
        "packages/core/workspace-sync/src/index.ts",
      ),
    ).toEqual([]);
  });
});
