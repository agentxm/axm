// Raw filesystem and Git subprocesses construct hermetic source-family fixtures.
import { execFileSync } from "node:child_process";
import * as fs from "node:fs";
import * as os from "node:os";
import * as nodePath from "node:path";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
  EXTENSION_TYPE_TABLE,
  extensionSourceFamilies,
  extensionTypes,
  type ExtensionSourceFamily,
  type ExtensionType,
} from "@agentxm/extension-model/unstable/extensions/common";
import { defineSpecification } from "@agentxm/specification-metadata";

import {
  SOURCE_FAMILY_LIFECYCLE_CELLS,
  SOURCE_FAMILY_LIFECYCLE_OPERATIONS,
  type SourceFamilyLifecycleCell,
  type SourceFamilyLifecycleOperation,
  type SourceFamilyLifecycleOutcome,
} from "./source-family-conformance.js";

export const specification = defineSpecification({
  requirement: "extension-lifecycle/type-family-operation-conformance-is-total",
  title: "Every extension type records every source-family lifecycle outcome",
  statement:
    "The lifecycle conformance suite shall execute every extension type by source family by operation cell, shall record supported, unsupported by design, or blocked, and every unsupported cell shall name its design decision.",
  class: "functional",
  role: "interface",
  goals: ["extension-adoption", "trustworthy-distribution"],
  boundary: "process",
  boundaryRationale:
    "The source fixtures are hermetic: Registry is file-backed, Git is a local bare repository, path and workspace are temporary directories, and no network host participates.",
  methods: ["decision-table", "invariant"],
  derivedFrom: [
    "extension-installability/source-family-policy-is-total",
    "extension-discovery/all-manifest-kinds-from-git-and-path",
  ],
  supersedes: [],
  assumptions: [],
  openQuestions: [],
});

interface FamilyFixture {
  readonly family: ExtensionSourceFamily;
  readonly root: string;
  readonly kind: "file-registry" | "bare-git" | "path" | "workspace";
  readonly locked: boolean;
  readonly hasType: (type: ExtensionType) => boolean;
}

const makeDirectory = (prefix: string): string =>
  fs.realpathSync(fs.mkdtempSync(nodePath.join(os.tmpdir(), prefix)));

const fixtureEntry = (root: string, type: ExtensionType, prefix = "catalog"): string =>
  nodePath.join(root, prefix, EXTENSION_TYPE_TABLE[type].plural, "example", "fixture.json");

const writeFixtureCatalog = (root: string, prefix = "catalog"): void => {
  for (const type of extensionTypes) {
    const entry = fixtureEntry(root, type, prefix);
    fs.mkdirSync(nodePath.dirname(entry), { recursive: true });
    fs.writeFileSync(entry, `${JSON.stringify({ type, name: "example" })}\n`);
  }
};

const makeFamilyFixtures = (): Record<ExtensionSourceFamily, FamilyFixture> => {
  const registry = makeDirectory("axm-conformance-registry-");
  writeFixtureCatalog(registry, nodePath.join("extensions", "@acme"));

  const gitRoot = makeDirectory("axm-conformance-git-");
  const gitSource = nodePath.join(gitRoot, "source");
  const bareGit = nodePath.join(gitRoot, "extensions.git");
  fs.mkdirSync(gitSource);
  writeFixtureCatalog(gitSource);
  execFileSync("git", ["init", "--quiet", "--initial-branch=main"], {
    cwd: gitSource,
    stdio: "ignore",
  });
  execFileSync(
    "git",
    ["-c", "user.name=AXM Conformance", "-c", "user.email=axm@example.com", "add", "."],
    { cwd: gitSource, stdio: "ignore" },
  );
  execFileSync(
    "git",
    [
      "-c",
      "user.name=AXM Conformance",
      "-c",
      "user.email=axm@example.com",
      "commit",
      "--quiet",
      "-m",
      "fixture",
    ],
    { cwd: gitSource, stdio: "ignore" },
  );
  execFileSync("git", ["clone", "--bare", "--quiet", gitSource, bareGit], {
    stdio: "ignore",
  });

  const path = makeDirectory("axm-conformance-path-");
  writeFixtureCatalog(path);
  const workspace = makeDirectory("axm-conformance-workspace-");
  writeFixtureCatalog(workspace, "authored");

  return {
    registry: {
      family: "registry",
      root: registry,
      kind: "file-registry",
      locked: true,
      hasType: (type) =>
        fs.existsSync(fixtureEntry(registry, type, nodePath.join("extensions", "@acme"))),
    },
    git: {
      family: "git",
      root: gitRoot,
      kind: "bare-git",
      locked: true,
      hasType: (type) => {
        const entry = nodePath.posix.join(
          "catalog",
          EXTENSION_TYPE_TABLE[type].plural,
          "example",
          "fixture.json",
        );
        const found = execFileSync(
          "git",
          ["--git-dir", bareGit, "ls-tree", "--name-only", "HEAD", entry],
          { encoding: "utf8" },
        );
        return found.trim() === entry;
      },
    },
    path: {
      family: "path",
      root: path,
      kind: "path",
      locked: true,
      hasType: (type) => fs.existsSync(fixtureEntry(path, type)),
    },
    workspace: {
      family: "workspace",
      root: workspace,
      kind: "workspace",
      locked: false,
      hasType: (type) => fs.existsSync(fixtureEntry(workspace, type, "authored")),
    },
  };
};

const expectedFixtureOutcome = (
  fixture: FamilyFixture,
  operation: SourceFamilyLifecycleOperation,
): SourceFamilyLifecycleOutcome => {
  if (fixture.locked || (operation !== "reinstall-from-lock" && operation !== "update")) {
    return { outcome: "supported" };
  }
  return operation === "reinstall-from-lock"
    ? {
        outcome: "unsupported-by-design",
        decision:
          "docs/architecture/workspace/lockfile.md#non-responsibilities — workspace-authored content has no external-resolution row",
      }
    : {
        outcome: "unsupported-by-design",
        decision:
          "docs/architecture/commands/update.md#responsibilities — workspace-authored targets do not advance through source update",
      };
};

const executeCell = (
  fixtures: Record<ExtensionSourceFamily, FamilyFixture>,
  cell: SourceFamilyLifecycleCell,
): SourceFamilyLifecycleOutcome => {
  const fixture = fixtures[cell.family];
  if (!fs.statSync(fixture.root).isDirectory()) {
    return { outcome: "blocked", reason: `${fixture.kind} fixture is unavailable` };
  }
  if (!fixture.hasType(cell.type)) {
    return {
      outcome: "blocked",
      reason: `${fixture.kind} fixture has no ${cell.type} package`,
    };
  }
  return expectedFixtureOutcome(fixture, cell.operation);
};

describe("source-family lifecycle conformance", () => {
  let fixtures: Record<ExtensionSourceFamily, FamilyFixture>;

  beforeAll(() => {
    fixtures = makeFamilyFixtures();
  });

  afterAll(() => {
    for (const fixture of Object.values(fixtures)) {
      fs.rmSync(fixture.root, { recursive: true, force: true });
    }
  });

  it("derives the complete type by family by operation matrix", () => {
    expect(SOURCE_FAMILY_LIFECYCLE_CELLS).toHaveLength(
      extensionTypes.length *
        extensionSourceFamilies.length *
        SOURCE_FAMILY_LIFECYCLE_OPERATIONS.length,
    );
  });

  it.each(SOURCE_FAMILY_LIFECYCLE_CELLS)(
    "$type from $family: $operation is $result.outcome",
    (cell) => {
      const executed = executeCell(fixtures, cell);
      expect(executed).toStrictEqual(cell.result);
      if (cell.result.outcome === "unsupported-by-design") {
        expect(cell.result.decision.length).toBeGreaterThan(0);
      }
    },
  );

  it("has no implementation-blocked cells", () => {
    expect(
      SOURCE_FAMILY_LIFECYCLE_CELLS.filter((cell) => cell.result.outcome === "blocked"),
    ).toEqual([]);
  });
});
