import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import { describe, expect, it } from "@effect/vitest";
import { afterEach } from "vitest";

import * as fs from "node:fs";
import * as path from "node:path";

import {
  handleInstall,
  handleInstructionsEnable,
  handleLint,
  handleSync,
  handleUninstall,
} from "axm.sh/specification-harness";

import { defineSpecification } from "@agentxm/extension-model/unstable/specifications";
import { makeSpecWorkspace } from "../support/install-harness.js";
import { writeLocalKnowledgePackage } from "../support/extension-fixtures.js";

export const specification = defineSpecification({
  requirement: "cli/unreadable-knowledge-is-left-out-and-reported",
  title: "A Knowledge bundle AXM cannot read is left out of the instructions file and reported",
  statement:
    "When a desired Knowledge bundle's package cannot be read, AXM shall leave that bundle out of the generated instructions file, shall report the omission with its reason and remedy on every command that writes or inspects that file, and shall not fail another extension's operation because of it.",
  class: "functional",
  role: "experience",
  goals: ["workspace-intent-fidelity", "safe-repetition"],
  status: "candidate",
  methods: ["example"],
  derivedFrom: [
    "packages/extension-lifecycle/src/knowledge/manager.ts",
    "packages/extension-workspace/src/projection/planning.ts",
  ],
  supersedes: [],
  assumptions: [],
  openQuestions: [],
});

const stepWarnings = (result: unknown): ReadonlyArray<string> => {
  const units = (result as { readonly result?: { readonly units?: ReadonlyArray<unknown> } })
    ?.result?.units;
  return (units ?? []).flatMap((unit) => {
    const warnings = (unit as { readonly warnings?: ReadonlyArray<string> }).warnings;
    return warnings ?? [];
  });
};

describe("An unreadable Knowledge bundle", () => {
  const cleanups: Array<() => void> = [];
  afterEach(() => {
    for (const cleanup of cleanups.splice(0)) {
      cleanup();
    }
  });

  /** Two installed bundles publishing into a managed AGENTS.md. */
  const workspaceWithTwoBundles = () =>
    Effect.gen(function* () {
      const workspace = makeSpecWorkspace({ machine: true, flags: { json: true } });
      cleanups.push(workspace.cleanup);
      fs.mkdirSync(path.join(workspace.root, ".git"));
      fs.writeFileSync(path.join(workspace.root, "AGENTS.md"), "# Authored instructions\n");
      yield* handleInstructionsEnable({ fileName: "AGENTS.md", gitignore: false }).pipe(
        Effect.provide(workspace.layer),
      );
      for (const name of ["alpha-notes", "other-notes"]) {
        yield* handleInstall({
          source: Option.some(writeLocalKnowledgePackage(workspace.root, { name })),
          yes: true,
          force: false,
          preview: false,
        }).pipe(Effect.provide(workspace.layer));
      }
      return workspace;
    });

  const canonicalRoot = (workspace: ReturnType<typeof makeSpecWorkspace>, name: string): string => {
    const match = workspace
      .snapshotTree("agent_extensions")
      .find((entry) => entry.endsWith(`${path.sep}${name}`));
    if (match === undefined) throw new Error(`No canonical package for ${name}`);
    return path.join(workspace.root, match);
  };

  const makeInvalid = (workspace: ReturnType<typeof makeSpecWorkspace>, name: string): void => {
    fs.writeFileSync(
      path.join(canonicalRoot(workspace, name), "src", "index.md"),
      `---\ndescription: "no format version"\n---\n\n# ${name}\n`,
    );
  };

  const makeMissing = (workspace: ReturnType<typeof makeSpecWorkspace>, name: string): void => {
    fs.rmSync(canonicalRoot(workspace, name), { recursive: true, force: true });
  };

  const uninstall = (workspace: ReturnType<typeof makeSpecWorkspace>, name: string) =>
    handleUninstall({
      source: `@acme/knowledge/${name}`,
      yes: true,
      preview: false,
    }).pipe(Effect.provide(workspace.layer));

  it.effect("does not fail an unrelated bundle's uninstall, and names itself in the report", () =>
    Effect.gen(function* () {
      const workspace = yield* workspaceWithTwoBundles();
      makeInvalid(workspace, "other-notes");

      yield* uninstall(workspace, "alpha-notes");

      const result = workspace.rendererState.results.at(-1)?.data;
      expect(result).toMatchObject({ result: { outcome: "applied" } });
      expect(stepWarnings(result).join("\n")).toContain(
        "other-notes was left out of AGENTS.md because its package is invalid",
      );
      expect(stepWarnings(result).join("\n")).toContain("Fix the file and run `axm sync`.");
      expect(workspace.readFile("AGENTS.md")).not.toContain("alpha-notes");
      expect(workspace.readFile("AGENTS.md")).not.toContain("other-notes");
      expect(workspace.readFile("AGENTS.md")).toContain("# Authored instructions");
    }),
  );

  it.effect("names the missing package and how to retire it", () =>
    Effect.gen(function* () {
      const workspace = yield* workspaceWithTwoBundles();
      makeMissing(workspace, "other-notes");

      yield* uninstall(workspace, "alpha-notes");

      expect(stepWarnings(workspace.rendererState.results.at(-1)?.data).join("\n")).toContain(
        "other-notes was left out of AGENTS.md because its package is missing. Remove it with `axm knowledge uninstall other-notes`, or restore its files and run `axm sync`.",
      );
    }),
  );

  it.effect("stops reporting once the unreadable bundle is itself retired", () =>
    Effect.gen(function* () {
      const workspace = yield* workspaceWithTwoBundles();
      makeInvalid(workspace, "other-notes");
      yield* uninstall(workspace, "other-notes");

      yield* uninstall(workspace, "alpha-notes");

      expect(stepWarnings(workspace.rendererState.results.at(-1)?.data)).toEqual([]);
    }),
  );

  it.effect("reports the omission from lint, which keeps observing the file", () =>
    Effect.gen(function* () {
      const workspace = yield* workspaceWithTwoBundles();
      makeInvalid(workspace, "other-notes");

      // Lint exits non-zero when it reports anything; the report is what
      // this obligation is about.
      yield* handleLint({
        pathArg: Option.some(workspace.root),
        scope: "project",
        strict: false,
        details: false,
        fix: false,
        input: { view: "workspace" },
      }).pipe(
        Effect.provide(workspace.layer),
        Effect.catchCause(() => Effect.void),
      );

      expect(JSON.stringify(workspace.rendererState.results.at(-1)?.data)).toContain(
        "other-notes was left out of AGENTS.md",
      );
    }),
  );

  it.effect("reports the omission from sync rather than dropping the file from its report", () =>
    Effect.gen(function* () {
      const workspace = yield* workspaceWithTwoBundles();
      makeInvalid(workspace, "other-notes");

      yield* handleSync({ preview: false }).pipe(Effect.provide(workspace.layer));

      expect(JSON.stringify(workspace.rendererState.results.at(-1)?.data)).toContain("other-notes");
    }),
  );
});
