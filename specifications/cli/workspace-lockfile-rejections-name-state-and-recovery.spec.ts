import * as fs from "node:fs";
import * as path from "node:path";

import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import { describe, expect, it } from "@effect/vitest";
import { afterAll, afterEach } from "vitest";

import {
  LOCKFILE_VERSION,
  getAppError,
  handleInstall,
  handleLint,
  handleList,
  handleSync,
} from "axm.sh/specification-harness";

import { defineSpecification } from "../support/contract.js";
import { makeSpecWorkspace, writeLocalSkillPackage } from "../support/install-harness.js";
import { pinSpecUserHome, snapshotWorkspaceContent } from "../support/workspace-fixtures.js";

export const specification = defineSpecification({
  requirement: "cli/workspace-lockfile-rejections-name-state-and-recovery",
  title: "Workspace lockfile rejections name the observed state and a safe recovery route",
  class: "functional",
  role: "experience",
  goals: ["workspace-intent-fidelity", "actionable-diagnostics", "machine-automation"],
  methods: ["decision-table", "example", "invariant"],
});

const userHome = pinSpecUserHome();

type WorkspaceScope = "project" | "user";
type OperationFamily = "read" | "diagnose" | "preview" | "mutate" | "force-mutate";
type SpecWorkspace = ReturnType<typeof makeSpecWorkspace>;

const lockPathFor = (workspace: SpecWorkspace, scope: WorkspaceScope): string =>
  scope === "project"
    ? path.join(workspace.root, "axm-lock.yaml")
    : path.join(userHome.home, ".axm", "workspace", "axm-lock.yaml");

const initializeUserSettings = (): void => {
  fs.mkdirSync(path.dirname(userHome.settingsPath), { recursive: true });
  fs.writeFileSync(userHome.settingsPath, `${JSON.stringify({ agents: ["claude-code"] })}\n`);
};

const writeUnsupportedLockfile = (
  workspace: SpecWorkspace,
  scope: WorkspaceScope,
  observedVersion: number,
): string => {
  const lockPath = lockPathFor(workspace, scope);
  fs.mkdirSync(path.dirname(lockPath), { recursive: true });
  fs.writeFileSync(lockPath, `lockfileVersion: ${observedVersion}\nskills: {}\n`);
  return lockPath;
};

const workspaceStates = (workspace: SpecWorkspace) => ({
  project: snapshotWorkspaceContent(workspace.root),
  user: snapshotWorkspaceContent(userHome.home),
});

const invokeOperation = (
  workspace: SpecWorkspace,
  scope: WorkspaceScope,
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
            scope,
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

const matrix = (["older", "newer"] as const).flatMap((direction) =>
  (["project", "user"] as const).flatMap((scope) =>
    (["read", "diagnose", "preview", "mutate", "force-mutate"] as const).map((family) => ({
      direction,
      scope,
      family,
    })),
  ),
);

describe("Workspace lockfile rejection gate", () => {
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

  it.effect.each(matrix)(
    "rejects $direction state in $scope scope before the $family operation begins",
    ({ direction, scope, family }) =>
      Effect.gen(function* () {
        if (scope === "user") initializeUserSettings();
        const workspace = makeSpecWorkspace({
          machine: true,
          flags: { json: true },
          scope,
        });
        cleanups.push(workspace.cleanup);
        const packagePath = writeLocalSkillPackage(workspace.root, { name: "gated" });
        const observedVersion = direction === "older" ? LOCKFILE_VERSION - 1 : LOCKFILE_VERSION + 1;
        const lockPath = writeUnsupportedLockfile(workspace, scope, observedVersion);
        const before = workspaceStates(workspace);

        const failure = yield* invokeOperation(workspace, scope, family, packagePath);
        const error = getAppError(failure);

        expect(error.code).toBe("validation");
        expect(error.title).toBe("Unsupported workspace lockfile version");
        expect(error.detail).toContain(lockPath);
        expect(error.detail).toContain(String(observedVersion));
        expect(error.detail).toContain(String(LOCKFILE_VERSION));
        expect(error.problem).toEqual({
          code: "workspace-lockfile-version-unsupported",
          path: lockPath,
          observedVersion,
          supportedVersion: LOCKFILE_VERSION,
          direction,
        });
        const commands = error.suggestions?.flatMap((suggestion) =>
          suggestion.cmd === undefined ? [] : [suggestion.cmd],
        );
        if (direction === "older") {
          expect(commands).toEqual(["axm sync --preview", "axm sync"]);
          expect(error.detail).not.toMatch(/permission|restore from version control/i);
        } else {
          expect(commands).toEqual(["axm upgrade"]);
          expect(error.detail).not.toMatch(/setup|restore|remove|regenerat/i);
        }
        expect(workspace.rendererState.results).toEqual([]);
        expect(workspaceStates(workspace)).toEqual(before);
      }),
  );

  it.effect.each([
    {
      fault: "IO",
      arrange: (lockPath: string) => {
        fs.rmSync(lockPath, { force: true });
        fs.mkdirSync(lockPath);
      },
      diagnostic: "could not be read",
      recovery: /permissions|known-good/i,
    },
    {
      fault: "YAML parse",
      arrange: (lockPath: string) => fs.writeFileSync(lockPath, "lockfileVersion: [\n"),
      diagnostic: "not valid YAML",
      recovery: /YAML syntax|known-good/i,
    },
    {
      fault: "schema decode",
      arrange: (lockPath: string) =>
        fs.writeFileSync(lockPath, 'lockfileVersion: "six"\nskills: {}\n'),
      diagnostic: "Invalid workspace lockfile",
      recovery: /invalid values|supported format/i,
    },
  ])("classifies a present lockfile $fault failure", ({ arrange, diagnostic, recovery }) =>
    Effect.gen(function* () {
      const workspace = makeSpecWorkspace({ machine: true, flags: { json: true } });
      cleanups.push(workspace.cleanup);
      const lockPath = path.join(workspace.root, "axm-lock.yaml");
      arrange(lockPath);
      const before = workspaceStates(workspace);

      const failure = yield* workspace
        .provide(handleList({ type: Option.none(), outdated: false, deprecated: false }))
        .pipe(Effect.flip);
      const error = getAppError(failure);

      expect(error.code).toBe("validation");
      expect(error.detail).toContain(lockPath);
      expect(error.detail).toContain(diagnostic);
      expect(error.suggestions?.[0]?.description).toMatch(recovery);
      expect(workspace.rendererState.results).toEqual([]);
      expect(workspaceStates(workspace)).toEqual(before);
    }),
  );

  it.effect(
    "lets an operator explicitly re-accept older external state after preservation and preview",
    () =>
      Effect.gen(function* () {
        const workspace = makeSpecWorkspace({ machine: true, flags: { json: true } });
        cleanups.push(workspace.cleanup);
        const packagePath = writeLocalSkillPackage(workspace.root, { name: "reaccepted" });
        fs.writeFileSync(
          path.join(workspace.root, "axm.json"),
          `${JSON.stringify({ agents: ["claude-code"], skills: { reaccepted: packagePath } })}\n`,
        );
        const lockPath = writeUnsupportedLockfile(workspace, "project", LOCKFILE_VERSION - 1);

        const failure = yield* workspace.provide(handleSync({ preview: true })).pipe(Effect.flip);
        expect(getAppError(failure).problem).toMatchObject({ direction: "older" });

        const preservedPath = path.join(workspace.root, "recovery", "axm-lock.previous.yaml");
        fs.mkdirSync(path.dirname(preservedPath), { recursive: true });
        fs.copyFileSync(lockPath, preservedPath);
        fs.rmSync(lockPath);

        yield* workspace.provide(handleSync({ preview: true }));
        expect(fs.existsSync(lockPath)).toBe(false);
        yield* workspace.provide(handleSync({ preview: false }));

        expect(fs.readFileSync(preservedPath, "utf8")).toContain(
          `lockfileVersion: ${LOCKFILE_VERSION - 1}`,
        );
        expect(fs.readFileSync(lockPath, "utf8")).toContain(`lockfileVersion: ${LOCKFILE_VERSION}`);
        expect(workspace.exists(".agents/skills/reaccepted")).toBe(true);
      }),
  );

  it.effect("allows an authored-only workspace to finish recovery without a lockfile", () =>
    Effect.gen(function* () {
      const workspace = makeSpecWorkspace({ machine: true, flags: { json: true } });
      cleanups.push(workspace.cleanup);
      const lockPath = writeUnsupportedLockfile(workspace, "project", LOCKFILE_VERSION - 1);
      fs.rmSync(lockPath);

      yield* workspace.provide(handleSync({ preview: true }));
      yield* workspace.provide(handleSync({ preview: false }));

      expect(fs.existsSync(lockPath)).toBe(false);
    }),
  );
});
