import * as fs from "node:fs";
import * as nodePath from "node:path";

import * as Effect from "effect/Effect";
import * as NodeServices from "@effect/platform-node/NodeServices";
import { describe, expect, it } from "@effect/vitest";
import { afterEach } from "vitest";

import { deriveOperationOutcome, type OperationResolution } from "@agentxm/workspace-operations";
import { defineSpecification } from "@agentxm/specification-metadata";

import {
  makeLifecycleFixture,
  writeLocalKnowledgePackage,
  type LifecycleFixture,
} from "../testing.js";
import { applyInstall, installRequest } from "../install/test-helpers.js";
import { applyUninstall, uninstallRequest } from "../uninstall/test-helpers.js";

export const specification = defineSpecification({
  requirement: "cli/unreadable-knowledge-is-left-out-and-reported",
  title: "A Knowledge bundle AXM cannot read is left out of the instructions file and reported",
  statement:
    "When a desired Knowledge bundle's package cannot be read, AXM shall leave that bundle out of the generated instructions file, shall report the omission with its reason and remedy on every command that writes or inspects that file, and shall not fail another extension's operation because of it.",
  class: "functional",
  role: "experience",
  goals: ["workspace-intent-fidelity", "safe-repetition"],
  boundary: "memory",
  boundaryRationale:
    "The omission is decided while the instructions file is projected and is reported on the unit that projected it; running a real removal over a real workspace shows both the file that was written and the report that accompanied it.",
  methods: ["example"],
  derivedFrom: [
    "packages/core/extension-lifecycle/src/knowledge/manager.ts",
    "packages/core/workspace-projection/src/planning.ts",
    "packages/core/workspace-sync/src/knowledge-exclusions-are-reported.test.ts",
    "packages/core/workspace-lint/src/catalog/workspace/conformance/workspace-state/test-helpers.ts",
  ],
  supersedes: [],
  assumptions: [],
  openQuestions: [],
});

/** Every warning the units of a resolution carried. */
const stepWarnings = (resolution: OperationResolution<unknown>): ReadonlyArray<string> =>
  resolution.units.flatMap((unit) => unit.warnings ?? []);

describe("An unreadable Knowledge bundle", () => {
  const cleanups: Array<() => void> = [];
  afterEach(() => {
    for (const cleanup of cleanups.splice(0)) cleanup();
  });

  /** Two installed bundles publishing into a managed AGENTS.md. */
  const workspaceWithTwoBundles = () =>
    Effect.gen(function* () {
      const workspace = makeLifecycleFixture({
        sources: "live",
        settings: {
          owner: "@acme",
          agents: [],
          instructionFiles: { fileName: "AGENTS.md", gitignoreAliases: false },
        },
      });
      cleanups.push(workspace.cleanup);
      fs.mkdirSync(nodePath.join(workspace.root, ".git"));
      workspace.writeFile("AGENTS.md", "# Authored instructions\n");
      for (const name of ["alpha-notes", "other-notes"]) {
        yield* workspace.provide(
          applyInstall(
            installRequest({
              subject: {
                kind: "source",
                source: writeLocalKnowledgePackage(workspace.root, { name }),
              },
            }),
          ),
        );
      }
      return workspace;
    });

  const canonicalRoot = (workspace: LifecycleFixture, name: string): string => {
    const match = workspace
      .snapshot()
      .map(([relative]) => relative)
      .find(
        (relative) =>
          relative.startsWith("agent_extensions") && relative.endsWith(`${nodePath.sep}${name}`),
      );
    if (match === undefined) throw new Error(`No canonical package for ${name}`);
    return nodePath.join(workspace.root, match);
  };

  const makeInvalid = (workspace: LifecycleFixture, name: string): void => {
    fs.writeFileSync(
      nodePath.join(canonicalRoot(workspace, name), "src", "index.md"),
      `---\ndescription: "no format version"\n---\n\n# ${name}\n`,
    );
  };

  const makeMissing = (workspace: LifecycleFixture, name: string): void => {
    fs.rmSync(canonicalRoot(workspace, name), { recursive: true, force: true });
  };

  const uninstall = (workspace: LifecycleFixture, name: string) =>
    workspace.provide(applyUninstall(uninstallRequest({ selector: `@acme/knowledge/${name}` })));

  it.effect("does not fail an unrelated bundle's uninstall, and names itself in the report", () =>
    Effect.gen(function* () {
      const workspace = yield* workspaceWithTwoBundles();
      makeInvalid(workspace, "other-notes");

      const resolution = yield* uninstall(workspace, "alpha-notes");

      expect(deriveOperationOutcome(resolution)).toBe("applied");
      expect(stepWarnings(resolution).join("\n")).toContain(
        "other-notes was left out of AGENTS.md because its package is invalid",
      );
      expect(stepWarnings(resolution).join("\n")).toContain("Fix the file and run `axm sync`.");
      expect(workspace.readFile("AGENTS.md")).not.toContain("alpha-notes");
      expect(workspace.readFile("AGENTS.md")).not.toContain("other-notes");
      expect(workspace.readFile("AGENTS.md")).toContain("# Authored instructions");
    }).pipe(Effect.provide(NodeServices.layer)),
  );

  it.effect("names the missing package and how to retire it", () =>
    Effect.gen(function* () {
      const workspace = yield* workspaceWithTwoBundles();
      makeMissing(workspace, "other-notes");

      const resolution = yield* uninstall(workspace, "alpha-notes");

      expect(stepWarnings(resolution).join("\n")).toContain(
        "other-notes was left out of AGENTS.md because its package is missing. Remove it with `axm knowledge uninstall other-notes`, or restore its files and run `axm sync`.",
      );
    }).pipe(Effect.provide(NodeServices.layer)),
  );

  it.effect("stops reporting once the unreadable bundle is itself retired", () =>
    Effect.gen(function* () {
      const workspace = yield* workspaceWithTwoBundles();
      makeInvalid(workspace, "other-notes");
      yield* uninstall(workspace, "other-notes");

      const resolution = yield* uninstall(workspace, "alpha-notes");

      expect(stepWarnings(resolution)).toEqual([]);
    }).pipe(Effect.provide(NodeServices.layer)),
  );
});
