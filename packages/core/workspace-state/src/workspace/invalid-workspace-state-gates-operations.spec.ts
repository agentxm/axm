import * as fs from "node:fs";
import * as os from "node:os";
import * as nodePath from "node:path";

import * as ConfigProvider from "effect/ConfigProvider";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as NodeServices from "@effect/platform-node/NodeServices";
import { describe, expect, it } from "@effect/vitest";
import { afterEach } from "vitest";

import { decodeAbsolutePathSync } from "@agentxm/extension-model/unstable/path-types";
import { defineSpecification } from "@agentxm/specification-metadata";

import { LOCKFILE_VERSION } from "../lockfile/schema.js";
import { WorkspaceStateLive } from "../live.js";
import { WorkspaceMutations } from "./service-interface.js";

export const specification = defineSpecification({
  requirement: "cli/invalid-workspace-state-gates-operations",
  title: "Invalid workspace settings or lockfiles block workspace operations",
  statement:
    "When a present project or user settings file, or a present workspace lockfile in the selected scope, is malformed, schema-invalid, unreadable, or of an unsupported version, operations that read or change workspace state, including diagnosis and preview, shall stop before workspace work begins with a validation error naming the file, the observed fault, and a non-destructive recovery route, and shall change no workspace state.",
  class: "functional",
  role: "experience",
  goals: ["workspace-intent-fidelity", "actionable-diagnostics", "machine-automation"],
  boundary: "memory",
  boundaryRationale:
    "The gate is the construction of the workspace records themselves: every operation reads them first, so the typed refusal and the untouched files on disk are the decisive evidence.",
  methods: ["decision-table", "example"],
  derivedFrom: [
    "cli/settings-validity-gates-operations",
    "cli/workspace-lockfile-rejections-name-state-and-recovery",
    "cli/lockfile-version-errors-expose-structured-problem",
    "apps/cli/src/root/invalid-workspace-state-gates-operations.test.ts",
  ],
  supersedes: [
    "cli/settings-validity-gates-operations",
    "cli/workspace-lockfile-rejections-name-state-and-recovery",
    "cli/lockfile-version-errors-expose-structured-problem",
  ],
  assumptions: [],
  openQuestions: [],
});

/** A recovery classification an operator can act on without losing state. */
type Recovery = "repair" | "resync" | "upgrade";

interface FaultRow {
  readonly fault: string;
  /** Which file carries the fault. */
  readonly file: "project-settings" | "user-settings" | "project-lockfile" | "user-lockfile";
  /** Writes the fault into the selected file. */
  readonly write: (target: string) => void;
  /** The tagged failure the reader must raise. */
  readonly tag: string;
  readonly recovery: Recovery;
  /** Row-specific facts the failure must carry beyond its path. */
  readonly expect?: (failure: Readonly<Record<string, unknown>>) => void;
}

const settingsFaults = [
  {
    fault: "malformed JSON",
    write: (target: string) => fs.writeFileSync(target, "{ not-json"),
    tag: "SettingsParseError",
  },
  {
    fault: "schema-invalid values",
    write: (target: string) => fs.writeFileSync(target, JSON.stringify({ agents: "claude-code" })),
    tag: "SettingsDecodeError",
  },
  {
    fault: "an unreadable file",
    write: (target: string) => fs.mkdirSync(target, { recursive: true }),
    tag: "SettingsIoError",
  },
] as const;

const settingsRows: ReadonlyArray<FaultRow> = (["project", "user"] as const).flatMap((owner) =>
  settingsFaults.map((entry): FaultRow => ({
    fault: `${owner} settings with ${entry.fault}`,
    file: owner === "project" ? "project-settings" : "user-settings",
    write: entry.write,
    tag: entry.tag,
    // Nothing about a malformed settings file is recoverable by advancing
    // state: the file itself is what must be corrected.
    recovery: "repair",
  })),
);

const lockfileVersionRows: ReadonlyArray<FaultRow> = (["older", "newer"] as const).flatMap(
  (direction) =>
    (["project", "user"] as const).map((scope): FaultRow => {
      const observedVersion = direction === "older" ? LOCKFILE_VERSION - 1 : LOCKFILE_VERSION + 1;
      return {
        fault: `an ${direction} ${scope} lockfile version`,
        file: scope === "project" ? "project-lockfile" : "user-lockfile",
        write: (target) =>
          fs.writeFileSync(target, `lockfileVersion: ${observedVersion}\nskills: {}\n`),
        tag: "LockfileVersionUnsupported",
        // An older lockfile is re-accepted by reconciling desired state; a
        // newer one needs a newer product, never a rewrite of the file.
        recovery: direction === "older" ? "resync" : "upgrade",
        expect: (failure) => {
          expect(failure["observedVersion"]).toBe(observedVersion);
          expect(failure["supportedVersion"]).toBe(LOCKFILE_VERSION);
        },
      };
    }),
);

const lockfileContentRows: ReadonlyArray<FaultRow> = [
  {
    fault: "an unreadable project lockfile",
    write: (target: string) => fs.mkdirSync(target, { recursive: true }),
    tag: "LockfileIoError",
  },
  {
    fault: "a project lockfile that is not valid YAML",
    write: (target: string) => fs.writeFileSync(target, "lockfileVersion: [\n"),
    tag: "LockfileParseError",
  },
  {
    fault: "a schema-invalid project lockfile",
    write: (target: string) => fs.writeFileSync(target, 'lockfileVersion: "six"\nskills: {}\n'),
    tag: "LockfileDecodeError",
  },
].map((entry): FaultRow => ({
  fault: entry.fault,
  file: "project-lockfile",
  write: entry.write,
  tag: entry.tag,
  recovery: "repair",
}));

const faultRows: ReadonlyArray<FaultRow> = [
  ...settingsRows,
  ...lockfileVersionRows,
  ...lockfileContentRows,
];

/**
 * The recovery route a fault leaves open. A reader that reported a version it
 * cannot read leaves exactly one non-destructive route; every other fault is
 * corrected in the file itself.
 */
const recoveryFor = (tag: string, failure: Readonly<Record<string, unknown>>): Recovery => {
  if (tag !== "LockfileVersionUnsupported") return "repair";
  const observed = failure["observedVersion"];
  const supported = failure["supportedVersion"];
  if (typeof observed !== "number" || typeof supported !== "number") {
    throw new Error("An unsupported lockfile version must report both versions");
  }
  return observed < supported ? "resync" : "upgrade";
};

const failureRecord = (failure: unknown): Readonly<Record<string, unknown>> => {
  if (typeof failure !== "object" || failure === null || !("_tag" in failure)) {
    throw new Error(`Expected a tagged workspace-state failure, not ${String(failure)}`);
  }
  return { ...failure };
};

const makeWorkspace = () => {
  const root = fs.realpathSync(fs.mkdtempSync(nodePath.join(os.tmpdir(), "axm-state-gate-")));
  const home = fs.realpathSync(fs.mkdtempSync(nodePath.join(os.tmpdir(), "axm-state-gate-home-")));
  const userWorkspace = nodePath.join(home, ".axm", "workspace");
  fs.mkdirSync(nodePath.join(root, ".axm"), { recursive: true });
  fs.mkdirSync(userWorkspace, { recursive: true });
  const settings = `${JSON.stringify({ owner: "@acme", agents: ["claude-code"] }, null, 2)}\n`;
  const lockfile = "lockfileVersion: 7\nskills: {}\n";
  fs.writeFileSync(nodePath.join(root, "axm.json"), settings);
  fs.writeFileSync(nodePath.join(root, "axm-lock.yaml"), lockfile);
  fs.writeFileSync(nodePath.join(userWorkspace, "axm.json"), settings);
  fs.writeFileSync(nodePath.join(userWorkspace, "axm-lock.yaml"), lockfile);
  const pathFor = (file: FaultRow["file"]): string =>
    file === "project-settings"
      ? nodePath.join(root, "axm.json")
      : file === "project-lockfile"
        ? nodePath.join(root, "axm-lock.yaml")
        : file === "user-settings"
          ? nodePath.join(userWorkspace, "axm.json")
          : nodePath.join(userWorkspace, "axm-lock.yaml");
  const snapshotUnder = (base: string): ReadonlyArray<readonly [string, string]> => {
    const entries: Array<readonly [string, string]> = [];
    const walk = (directory: string): void => {
      for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
        const absolute = nodePath.join(directory, entry.name);
        const relative = nodePath.relative(base, absolute);
        if (entry.isDirectory()) {
          entries.push([relative, "directory"]);
          walk(absolute);
          continue;
        }
        entries.push([relative, fs.readFileSync(absolute, "utf8")]);
      }
    };
    walk(base);
    return entries.sort((left, right) => left[0].localeCompare(right[0]));
  };
  return {
    root,
    home,
    pathFor,
    arrange: (row: FaultRow): string => {
      const target = pathFor(row.file);
      fs.rmSync(target, { recursive: true, force: true });
      fs.mkdirSync(nodePath.dirname(target), { recursive: true });
      row.write(target);
      return target;
    },
    states: () => ({ project: snapshotUnder(root), user: snapshotUnder(home) }),
    layerFor: (scope: "project" | "user") =>
      Layer.provide(
        WorkspaceStateLive({ scope, projectRoot: decodeAbsolutePathSync(root) }),
        ConfigProvider.layer(ConfigProvider.fromEnv({ env: { AXM_USER_HOME: home } })),
      ),
    cleanup: () => {
      fs.rmSync(root, { recursive: true, force: true });
      fs.rmSync(home, { recursive: true, force: true });
    },
  };
};

describe("Invalid workspace state gates operations", () => {
  const cleanups: Array<() => void> = [];
  afterEach(() => {
    for (const cleanup of cleanups.splice(0)) cleanup();
  });

  it.effect.each(faultRows)(
    "$fault is refused before any workspace work, naming the file and a recovery route",
    (row) =>
      Effect.gen(function* () {
        const workspace = makeWorkspace();
        cleanups.push(workspace.cleanup);
        const faultPath = workspace.arrange(row);
        const before = workspace.states();

        const scope = row.file.startsWith("user") ? "user" : "project";
        const failure = yield* Effect.flip(
          Effect.provide(
            Effect.flatMap(WorkspaceMutations, (state) => state.records.rows("skill")),
            workspace.layerFor(scope),
          ),
        );

        const record = failureRecord(failure);
        expect(record["_tag"]).toBe(row.tag);
        expect(record["path"]).toBe(faultPath);
        expect(recoveryFor(row.tag, record)).toBe(row.recovery);
        row.expect?.(record);
        // The refusal precedes every workspace write: both scopes are exactly
        // as the fault left them.
        expect(workspace.states()).toEqual(before);
      }).pipe(Effect.provide(NodeServices.layer)),
  );

  it.effect("correcting the file restores the records the operation needed", () =>
    Effect.gen(function* () {
      const workspace = makeWorkspace();
      cleanups.push(workspace.cleanup);
      const settingsPath = workspace.pathFor("project-settings");
      const valid = fs.readFileSync(settingsPath, "utf8");
      fs.writeFileSync(settingsPath, "{ not-json");

      const read = () =>
        Effect.provide(
          Effect.flatMap(WorkspaceMutations, (state) => state.records.rows("skill")),
          workspace.layerFor("project"),
        );

      const failure = failureRecord(yield* Effect.flip(read()));
      expect(failure["_tag"]).toBe("SettingsParseError");
      expect(fs.readFileSync(settingsPath, "utf8")).toBe("{ not-json");

      fs.writeFileSync(settingsPath, valid);
      expect(yield* read()).toEqual([]);
    }).pipe(Effect.provide(NodeServices.layer)),
  );
});
