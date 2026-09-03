import * as fs from "node:fs";
import * as path from "node:path";

import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import { describe, expect, it } from "@effect/vitest";
import { afterAll, afterEach } from "vitest";

import {
  getAppError,
  handleInstall,
  handleLint,
  handleList,
  handleSync,
} from "axm.sh/specification-harness";

import { defineSpecification } from "@agentxm/extension-model/unstable/specifications";
import { makeSpecWorkspace, writeLocalSkillPackage } from "../support/install-harness.js";
import { pinSpecUserHome, snapshotWorkspaceContent } from "../support/workspace-fixtures.js";

export const specification = defineSpecification({
  requirement: "cli/settings-validity-gates-operations",
  title: "Workspace operations begin only after both settings sources validate",
  statement:
    "When a present project or user settings file is malformed, schema-invalid, or unreadable, every workspace operation shall stop before it begins with a validation error naming that file and a repair route, and shall change no workspace state.",
  class: "functional",
  role: "experience",
  goals: ["workspace-intent-fidelity", "actionable-diagnostics"],
  methods: ["decision-table", "example"],
  derivedFrom: [],
  supersedes: [],
  assumptions: [],
  openQuestions: [],
});

/**
 * The resolved user home is captured by the first workspace construction in
 * this process, so the pin must be module-scoped and stable for the file.
 */
const userHome = pinSpecUserHome();

type SettingsOwner = "project" | "user";

/** The bounded fault classes an invalid present settings source can carry. */
const faults = [
  {
    fault: "malformed JSON",
    write: (settingsPath: string) => fs.writeFileSync(settingsPath, "{ not-json"),
    diagnostic: "not valid JSON",
  },
  {
    fault: "schema-invalid values",
    write: (settingsPath: string) =>
      fs.writeFileSync(settingsPath, JSON.stringify({ agents: "claude-code" })),
    diagnostic: "Invalid workspace settings",
  },
  {
    fault: "an unreadable file",
    write: (settingsPath: string) => fs.mkdirSync(settingsPath, { recursive: true }),
    diagnostic: "could not be read",
  },
] as const;

const sourceRows = (["project", "user"] as const).flatMap((owner: SettingsOwner) =>
  faults.map((entry) => ({ owner, ...entry })),
);

type SpecWorkspace = ReturnType<typeof makeSpecWorkspace>;

const settingsPathFor = (workspace: SpecWorkspace, owner: SettingsOwner): string =>
  owner === "project" ? path.join(workspace.root, "axm.json") : userHome.settingsPath;

const corruptSettings = (
  workspace: SpecWorkspace,
  owner: SettingsOwner,
  write: (settingsPath: string) => void,
): string => {
  const settingsPath = settingsPathFor(workspace, owner);
  fs.rmSync(settingsPath, { recursive: true, force: true });
  fs.mkdirSync(path.dirname(settingsPath), { recursive: true });
  write(settingsPath);
  return settingsPath;
};

const workspaceStates = (workspace: SpecWorkspace) => ({
  project: snapshotWorkspaceContent(workspace.root),
  user: snapshotWorkspaceContent(userHome.home),
});

describe("Settings validity gates project workspace operations", () => {
  const cleanups: Array<() => void> = [];
  afterEach(() => {
    userHome.reset();
    for (const cleanup of cleanups.splice(0)) {
      cleanup();
    }
  });
  afterAll(() => {
    userHome.cleanup();
  });

  it.effect.each(sourceRows)(
    "a present $owner settings source with $fault ends the invocation before the operation begins",
    (row) =>
      Effect.gen(function* () {
        const workspace = makeSpecWorkspace({ machine: true, flags: { json: true } });
        cleanups.push(workspace.cleanup);
        const settingsPath = corruptSettings(workspace, row.owner, row.write);
        const before = workspaceStates(workspace);

        const failure = yield* handleSync({ preview: false }).pipe(
          Effect.provide(workspace.layer),
          Effect.flip,
        );

        const error = getAppError(failure);
        expect(error.code).toBe("validation");
        expect(error.detail).toContain(settingsPath);
        expect(error.detail).toContain(row.diagnostic);
        expect(error.suggestions?.[0]?.description).toMatch(/fix|repair|edit|restore/i);
        expect(workspace.rendererState.results).toEqual([]);
        expect(workspaceStates(workspace)).toEqual(before);
      }),
  );

  const operationFamilies = ["read", "diagnose", "preview", "mutate", "force-mutate"] as const;
  type OperationFamily = (typeof operationFamilies)[number];
  const operationRows = operationFamilies.map((family) => ({ family }));

  const gatedOperationFailure = (
    workspace: SpecWorkspace,
    family: OperationFamily,
    packagePath: string,
  ): Effect.Effect<unknown, unknown> => {
    switch (family) {
      case "read":
        return workspace
          .provide(handleList({ type: Option.none(), outdated: false, deprecated: false }))
          .pipe(
            Effect.flip,
            Effect.map((error): unknown => error),
          );
      case "diagnose":
        return workspace
          .provide(
            handleLint({
              pathArg: Option.some(workspace.root),
              scope: "project",
              strict: false,
              details: false,
              fix: false,
              input: { view: "workspace" },
            }),
          )
          .pipe(
            Effect.flip,
            Effect.map((error): unknown => error),
          );
      case "preview":
        return workspace.provide(handleSync({ preview: true })).pipe(
          Effect.flip,
          Effect.map((error): unknown => error),
        );
      case "mutate":
        return workspace
          .provide(
            handleInstall({
              source: Option.some(packagePath),
              yes: true,
              force: false,
              preview: false,
            }),
          )
          .pipe(
            Effect.flip,
            Effect.map((error): unknown => error),
          );
      case "force-mutate":
        return workspace
          .provide(
            handleInstall({
              source: Option.some(packagePath),
              yes: true,
              force: true,
              preview: false,
            }),
          )
          .pipe(
            Effect.flip,
            Effect.map((error): unknown => error),
          );
    }
  };

  it.effect.each(operationRows)(
    "the $family operation family is gated by invalid project settings",
    (row) =>
      Effect.gen(function* () {
        const workspace = makeSpecWorkspace({ machine: true, flags: { json: true } });
        cleanups.push(workspace.cleanup);
        const packagePath = writeLocalSkillPackage(workspace.root, { name: "gated" });
        const settingsPath = corruptSettings(workspace, "project", (target) =>
          fs.writeFileSync(target, "{ not-json"),
        );
        const before = workspaceStates(workspace);

        const failure = yield* gatedOperationFailure(workspace, row.family, packagePath);

        const error = getAppError(failure);
        expect(error.code).toBe("validation");
        expect(error.detail).toContain(settingsPath);
        expect(workspace.rendererState.results).toEqual([]);
        expect(workspaceStates(workspace)).toEqual(before);
      }),
  );

  it.effect("direct correction of project settings restores the original operation", () =>
    Effect.gen(function* () {
      const workspace = makeSpecWorkspace({ machine: true, flags: { json: true } });
      cleanups.push(workspace.cleanup);
      const packagePath = writeLocalSkillPackage(workspace.root, { name: "code-review" });
      const settingsPath = path.join(workspace.root, "axm.json");
      const validSettings = fs.readFileSync(settingsPath, "utf8");
      fs.writeFileSync(settingsPath, "{ not-json");

      const install = () =>
        handleInstall({
          source: Option.some(packagePath),
          yes: true,
          force: false,
          preview: false,
        }).pipe(Effect.provide(workspace.layer));

      const failure = yield* install().pipe(Effect.flip);
      expect(getAppError(failure).code).toBe("validation");
      expect(fs.readFileSync(settingsPath, "utf8")).toBe("{ not-json");

      fs.writeFileSync(settingsPath, validSettings);
      yield* install();

      expect(workspace.exists(".claude/skills/code-review")).toBe(true);
      const [entry] = workspace.rendererState.results;
      expect(entry?.data).toMatchObject({ result: { outcome: "applied" } });
    }),
  );

  it.effect("direct correction of user settings restores the original operation", () =>
    Effect.gen(function* () {
      const workspace = makeSpecWorkspace({ machine: true, flags: { json: true } });
      cleanups.push(workspace.cleanup);
      fs.mkdirSync(path.dirname(userHome.settingsPath), { recursive: true });
      fs.writeFileSync(userHome.settingsPath, "{ not-json");

      const sync = () => handleSync({ preview: false }).pipe(Effect.provide(workspace.layer));

      const failure = yield* sync().pipe(Effect.flip);
      const error = getAppError(failure);
      expect(error.code).toBe("validation");
      expect(error.detail).toContain(userHome.settingsPath);
      expect(fs.readFileSync(userHome.settingsPath, "utf8")).toBe("{ not-json");

      fs.rmSync(userHome.settingsPath, { force: true });
      yield* sync();

      const [entry] = workspace.rendererState.results;
      expect(entry?.data).toMatchObject({ result: { planName: "Sync workspace" } });
    }),
  );

  it.effect("missing user settings keep their documented absence semantics", () =>
    Effect.gen(function* () {
      const workspace = makeSpecWorkspace({ machine: true, flags: { json: true } });
      cleanups.push(workspace.cleanup);
      expect(fs.existsSync(userHome.settingsPath)).toBe(false);

      yield* handleSync({ preview: false }).pipe(Effect.provide(workspace.layer));

      expect(fs.existsSync(userHome.settingsPath)).toBe(false);
    }),
  );
});
