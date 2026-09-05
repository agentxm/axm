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

import { defineSpecification } from "@agentxm/extension-model/unstable/specifications";
import { makeSpecWorkspace, writeLocalSkillPackage } from "../support/install-harness.js";
import { pinSpecUserHome, snapshotWorkspaceContent } from "../support/workspace-fixtures.js";

export const specification = defineSpecification({
  requirement: "cli/invalid-workspace-state-gates-operations",
  title: "Invalid workspace settings or lockfile state gates every operation",
  statement:
    "When a present project or user settings file, or a present workspace lockfile in the selected scope, is malformed, schema-invalid, unreadable, or of an unsupported version, every read, diagnose, preview, and mutate operation shall stop before it begins with a validation error naming the file, the observed fault, and a non-destructive recovery route, and shall change no workspace state.",
  class: "functional",
  role: "experience",
  goals: ["workspace-intent-fidelity", "actionable-diagnostics", "machine-automation"],
  methods: ["decision-table", "example"],
  derivedFrom: [
    "cli/settings-validity-gates-operations",
    "cli/workspace-lockfile-rejections-name-state-and-recovery",
    "cli/lockfile-version-errors-expose-structured-problem",
  ],
  supersedes: [
    "cli/settings-validity-gates-operations",
    "cli/workspace-lockfile-rejections-name-state-and-recovery",
    "cli/lockfile-version-errors-expose-structured-problem",
  ],
  assumptions: [],
  openQuestions: [],
});

/**
 * The resolved user home is captured by the first workspace construction in
 * this process, so the pin must be module-scoped and stable for the file.
 */
const userHome = pinSpecUserHome();

type WorkspaceScope = "project" | "user";
type SpecWorkspace = ReturnType<typeof makeSpecWorkspace>;
type GateError = ReturnType<typeof getAppError>;

const projectSettingsPath = (workspace: SpecWorkspace): string =>
  path.join(workspace.root, "axm.json");

const lockPathFor = (workspace: SpecWorkspace, scope: WorkspaceScope): string =>
  scope === "project"
    ? path.join(workspace.root, "axm-lock.yaml")
    : path.join(userHome.home, ".axm", "workspace", "axm-lock.yaml");

const initializeUserSettings = (): void => {
  fs.mkdirSync(path.dirname(userHome.settingsPath), { recursive: true });
  fs.writeFileSync(userHome.settingsPath, `${JSON.stringify({ agents: ["claude-code"] })}\n`);
};

const replaceFile = (target: string, write: (target: string) => void): string => {
  fs.rmSync(target, { recursive: true, force: true });
  fs.mkdirSync(path.dirname(target), { recursive: true });
  write(target);
  return target;
};

const suggestedCommands = (error: GateError): ReadonlyArray<string> | undefined =>
  error.suggestions?.flatMap((suggestion) =>
    suggestion.cmd === undefined ? [] : [suggestion.cmd],
  );

/**
 * One row per invalid workspace state: how the fault is arranged and what the
 * validation error must name for it. Every row is crossed with every
 * operation family below.
 */
interface FaultRow {
  readonly fault: string;
  /** Workspace scope the gated operation runs in. */
  readonly scope: WorkspaceScope;
  /** Writes the fault and returns the path of the faulty file. */
  readonly arrange: (workspace: SpecWorkspace) => string;
  /** Row-specific diagnosis: the observed fault and its recovery route. */
  readonly expectDiagnosis: (error: GateError, faultPath: string) => void;
}

const settingsFaults = [
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

const settingsRows: ReadonlyArray<FaultRow> = (["project", "user"] as const).flatMap((owner) =>
  settingsFaults.map((entry): FaultRow => ({
    fault: `${owner} settings with ${entry.fault}`,
    scope: "project",
    arrange: (workspace) =>
      replaceFile(
        owner === "project" ? projectSettingsPath(workspace) : userHome.settingsPath,
        entry.write,
      ),
    expectDiagnosis: (error) => {
      expect(error.detail).toContain(entry.diagnostic);
      expect(error.suggestions?.[0]?.description).toMatch(/fix|repair|edit|restore/i);
    },
  })),
);

const lockfileVersionRows: ReadonlyArray<FaultRow> = (["older", "newer"] as const).flatMap(
  (direction) =>
    (["project", "user"] as const).map((scope): FaultRow => {
      const observedVersion = direction === "older" ? LOCKFILE_VERSION - 1 : LOCKFILE_VERSION + 1;
      return {
        fault: `an ${direction} ${scope} lockfile version`,
        scope,
        arrange: (workspace) => {
          if (scope === "user") initializeUserSettings();
          return replaceFile(lockPathFor(workspace, scope), (lockPath) =>
            fs.writeFileSync(lockPath, `lockfileVersion: ${observedVersion}\nskills: {}\n`),
          );
        },
        expectDiagnosis: (error, lockPath) => {
          expect(error.title).toBe("Unsupported workspace lockfile version");
          expect(error.detail).toContain(String(observedVersion));
          expect(error.detail).toContain(String(LOCKFILE_VERSION));
          expect(error.problem).toEqual({
            code: "workspace-lockfile-version-unsupported",
            path: lockPath,
            observedVersion,
            supportedVersion: LOCKFILE_VERSION,
            direction,
          });
          if (direction === "older") {
            expect(suggestedCommands(error)).toEqual(["axm sync --preview", "axm sync"]);
            expect(error.detail).not.toMatch(/permission|restore from version control/i);
          } else {
            expect(suggestedCommands(error)).toEqual(["axm upgrade"]);
            expect(error.detail).not.toMatch(/setup|restore|remove|regenerat/i);
          }
        },
      };
    }),
);

const lockfileContentRows: ReadonlyArray<FaultRow> = [
  {
    fault: "an unreadable project lockfile",
    write: (lockPath: string) => fs.mkdirSync(lockPath),
    diagnostic: "could not be read",
    recovery: /permissions|known-good/i,
  },
  {
    fault: "a project lockfile that is not valid YAML",
    write: (lockPath: string) => fs.writeFileSync(lockPath, "lockfileVersion: [\n"),
    diagnostic: "not valid YAML",
    recovery: /YAML syntax|known-good/i,
  },
  {
    fault: "a schema-invalid project lockfile",
    write: (lockPath: string) => fs.writeFileSync(lockPath, 'lockfileVersion: "six"\nskills: {}\n'),
    diagnostic: "Invalid workspace lockfile",
    recovery: /invalid values|supported format/i,
  },
].map((entry): FaultRow => ({
  fault: entry.fault,
  scope: "project",
  arrange: (workspace) => replaceFile(lockPathFor(workspace, "project"), entry.write),
  expectDiagnosis: (error) => {
    expect(error.detail).toContain(entry.diagnostic);
    expect(error.suggestions?.[0]?.description).toMatch(entry.recovery);
  },
}));

const faultRows: ReadonlyArray<FaultRow> = [
  ...settingsRows,
  ...lockfileVersionRows,
  ...lockfileContentRows,
];

const operationFamilies = ["read", "diagnose", "preview", "mutate", "force-mutate"] as const;
type OperationFamily = (typeof operationFamilies)[number];

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

const decisionTable = faultRows.flatMap((row) =>
  operationFamilies.map((family) => ({ fault: row.fault, family, row })),
);

const workspaceStates = (workspace: SpecWorkspace) => ({
  project: snapshotWorkspaceContent(workspace.root),
  user: snapshotWorkspaceContent(userHome.home),
});

describe("Invalid workspace state gates operations", () => {
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

  it.effect.each(decisionTable)(
    "$fault ends the $family operation before it begins",
    ({ family, row }) =>
      Effect.gen(function* () {
        const workspace = makeSpecWorkspace({
          machine: true,
          flags: { json: true },
          scope: row.scope,
        });
        cleanups.push(workspace.cleanup);
        const packagePath = writeLocalSkillPackage(workspace.root, { name: "gated" });
        const faultPath = row.arrange(workspace);
        const before = workspaceStates(workspace);

        const failure = yield* invokeOperation(workspace, row.scope, family, packagePath);

        const error = getAppError(failure);
        expect(error.code).toBe("validation");
        expect(error.detail).toContain(faultPath);
        row.expectDiagnosis(error, faultPath);
        expect(workspace.rendererState.results).toEqual([]);
        expect(workspaceStates(workspace)).toEqual(before);
      }),
  );

  it.effect("direct correction of project settings restores the original operation", () =>
    Effect.gen(function* () {
      const workspace = makeSpecWorkspace({ machine: true, flags: { json: true } });
      cleanups.push(workspace.cleanup);
      const packagePath = writeLocalSkillPackage(workspace.root, { name: "code-review" });
      const settingsPath = projectSettingsPath(workspace);
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
