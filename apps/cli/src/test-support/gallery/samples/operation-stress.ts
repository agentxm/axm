/**
 * The stress data set behind the failure and over-time gallery frames.
 *
 * Every other operation sample is short enough that the layout never has to
 * choose between information and columns: names fit the key lane, reasons fit
 * a cell, and no unit fails. A real workspace operation is none of those
 * things, so this set carries what one actually holds — qualified names
 * across every extension type, a scope too long for its lane, absolute paths,
 * reasons that run to several sentences, and a command a reader copies out —
 * and the fixtures built from it are where the shared ledger has to keep all
 * of it.
 */

import * as Option from "effect/Option";

import {
  StepFailure,
  makeOperationResolution,
  operationPresentation,
  type JobStepArtifact,
  type OperationEvent,
  type OperationPresentation,
  type OperationResolution,
  type ResolvedUnit,
} from "@agentxm/workspace/transitions/planning";

import type { LivePlan } from "../../../screen/live-ledger.js";

export const updatePresentation: OperationPresentation = operationPresentation({
  imperative: "update",
  past: "Updated",
  gerund: "Updating",
});

export const installPresentation: OperationPresentation = operationPresentation({
  imperative: "install",
  past: "Installed",
  gerund: "Installing",
});

export const syncPresentation: OperationPresentation = operationPresentation({
  imperative: "sync",
  past: "Synced",
  gerund: "Syncing",
});

/** Where a project's extensions live, as a reason names them. */
const PROJECT_ROOT = "/home/dev/work/platform-services";

const artifact = (
  name: string,
  change: JobStepArtifact["change"],
  options?: {
    readonly version?: string;
    readonly previousVersion?: string;
    readonly fileCount?: number;
    readonly agents?: ReadonlyArray<string>;
  },
): JobStepArtifact => ({
  path: `${PROJECT_ROOT}/agent_extensions/${name.split("/").at(-1) ?? name}`,
  scope: "project",
  change,
  ...(options?.version === undefined ? {} : { version: options.version }),
  ...(options?.previousVersion === undefined ? {} : { previousVersion: options.previousVersion }),
  ...(options?.fileCount === undefined ? {} : { fileCount: options.fileCount }),
  ...(options?.agents === undefined ? {} : { agents: options.agents }),
});

const AGENTS = ["claude-code", "codex", "grok-cli", "opencode"];

/** A unit that changed as planned, with the agents it reached. */
const changed = (
  name: string,
  version: string,
  previousVersion: string,
): ResolvedUnit<unknown> => ({
  id: name,
  label: name,
  state: "committed",
  artifact: artifact(name, "updated", {
    version,
    previousVersion,
    fileCount: 6,
    agents: AGENTS,
  }),
});

/**
 * A unit that failed. Its reason is the producer's own sentence, long enough
 * that no cell at any supported width holds it, and its suggestion is the
 * route that unit admits.
 */
const failed = (
  name: string,
  installedVersion: string,
  failure: StepFailure,
): ResolvedUnit<unknown> => ({
  id: name,
  label: name,
  state: "failed",
  disposition: "restored",
  message: `${failure.detail} (${failure.category})`,
  error: failure,
  artifact: artifact(name, "updated", { previousVersion: installedVersion }),
});

const registryTimeout = (name: string): StepFailure =>
  new StepFailure({
    category: "timeout",
    detail: `The registry did not answer within 30s while resolving ${name}. The request was retried three times and the workspace was left as it was.`,
    suggestions: [
      { description: "Check the registry's status", url: "https://status.example.com/registry" },
    ],
  });

const integrityMismatch = (name: string): StepFailure =>
  new StepFailure({
    category: "conflict",
    detail: `The archive AXM downloaded for ${name} does not match the integrity the lockfile records. Nothing was written to ${PROJECT_ROOT}/agent_extensions, and the installed version is still in place.`,
    suggestions: [
      {
        description: "Resolve the source again, then update",
        cmd: `axm update ${name} --refresh`,
      },
    ],
  });

const projectionDenied = (name: string, path: string): StepFailure =>
  new StepFailure({
    category: "forbidden",
    detail: `AXM could not write ${path}: the directory is read-only. The extension was not projected into any agent, and ${name} still resolves to the version already installed.`,
  });

/** Thirteen units, as a project-wide update settles them. */
const partialUpdateUnits: ReadonlyArray<ResolvedUnit<unknown>> = [
  changed("@acme/skills/improve-whatever", "1.0.2", "1.0.1"),
  changed("@acme/skills/spot-spew", "0.2.0", "0.1.9"),
  changed("@acme/skills/devops-docs", "0.5.1", "0.5.0"),
  changed("@acme/skills/okf", "0.1.9", "0.1.8"),
  changed("@acme/skills/research", "1.2.0", "1.1.3"),
  failed(
    "@acme/knowledge/agent-engineering",
    "0.9.4",
    registryTimeout("@acme/knowledge/agent-engineering"),
  ),
  failed(
    "@acme/knowledge/product-engineering",
    "2.3.0",
    registryTimeout("@acme/knowledge/product-engineering"),
  ),
  failed("@acme/packs/field-notes", "1.0.0", integrityMismatch("@acme/packs/field-notes")),
  failed(
    "@acme-enterprise/knowledge/effect-v4",
    "0.4.2",
    integrityMismatch("@acme-enterprise/knowledge/effect-v4"),
  ),
  failed(
    "@acme/subagents/work-management",
    "0.3.1",
    projectionDenied("@acme/subagents/work-management", `${PROJECT_ROOT}/.claude/agents`),
  ),
  failed(
    "@acme/rules/typescript",
    "3.1.0",
    projectionDenied("@acme/rules/typescript", `${PROJECT_ROOT}/.codex/rules`),
  ),
  failed("@acme/skills/incident-review", "2.0.0", registryTimeout("@acme/skills/incident-review")),
  {
    id: "@acme/hooks/pre-commit",
    label: "@acme/hooks/pre-commit",
    state: "unchanged",
    artifact: artifact("@acme/hooks/pre-commit", "unchanged", { version: "1.0.3", agents: AGENTS }),
  },
];

/**
 * A project-wide update that applied five of thirteen units and failed seven,
 * with one already current. Every failed unit rolled its own closure back, so
 * the operation left the workspace coherent and the reader needs the reasons
 * to decide what to do next.
 */
export const partialUpdate: OperationResolution<unknown> = makeOperationResolution({
  name: "Update extensions",
  description: Option.none(),
  mode: "apply",
  presentation: updatePresentation,
  atomicity: { declared: "closure-atomic", applied: "closure-atomic" },
  units: partialUpdateUnits,
});

/**
 * The release-age evidence the same run carries: the exemption that let a
 * newer release of `@acme/packs/field-notes` in, for a unit that then failed.
 * The emit boundary prints it beside the result, so a fixture that holds both
 * shows whether the callout agrees with the row it describes.
 */
export const partialUpdateReleaseAge = {
  holdbacks: [],
  releaseAgeBypasses: [
    {
      reason: "minimum-release-age",
      target: "@acme/packs/field-notes",
      dependencyPath: ["@acme/packs/field-notes"],
      candidateVersion: "1.0.0",
      publishedAt: "2026-09-21T16:44:17.865Z",
      eligibleAt: "2026-09-22T16:44:17.865Z",
      minimumReleaseAgeSeconds: 86_400,
      bypassCause: "exclude",
      exemptionScope: "project",
    },
  ],
} as const;

/**
 * An install that failed outright and rolled every closure back: one unit
 * failed on a dependency it could not resolve, and the two behind it were
 * never tried because the operation stopped.
 */
export const failedRolledBackInstall: OperationResolution<unknown> = makeOperationResolution({
  name: "Install extensions",
  description: Option.none(),
  mode: "apply",
  presentation: installPresentation,
  atomicity: { declared: "closure-atomic", applied: "closure-atomic" },
  units: [
    {
      id: "@acme/packs/review-kit",
      label: "@acme/packs/review-kit",
      state: "rolled-back",
      disposition: "restored",
      message: "The pack's members were written and then removed again when a later member failed.",
      artifact: artifact("@acme/packs/review-kit", "created", { version: "2.1.0" }),
    },
    {
      id: "@acme-enterprise/subagents/incident-commander",
      label: "@acme-enterprise/subagents/incident-commander",
      state: "failed",
      disposition: "restored",
      message:
        "The registry has no version of @acme-enterprise/subagents/incident-commander that satisfies >=2.0.0, which @acme/packs/review-kit requires. Nothing was installed. (not_found)",
      error: new StepFailure({
        category: "not_found",
        detail:
          "The registry has no version of @acme-enterprise/subagents/incident-commander that satisfies >=2.0.0, which @acme/packs/review-kit requires. Nothing was installed.",
        suggestions: [
          {
            description: "Install the pack at a version whose members resolve",
            cmd: "axm install @acme/packs/review-kit@1.9.0",
          },
        ],
      }),
      artifact: artifact("@acme-enterprise/subagents/incident-commander", "created"),
    },
    {
      id: "@acme/skills/incident-review",
      label: "@acme/skills/incident-review",
      state: "planned",
      artifact: artifact("@acme/skills/incident-review", "created", { version: "2.0.0" }),
    },
    {
      id: "@acme/knowledge/runbooks",
      label: "@acme/knowledge/runbooks",
      state: "planned",
      artifact: artifact("@acme/knowledge/runbooks", "created", { version: "5.2.0" }),
    },
  ],
  failure: new StepFailure({
    category: "not_found",
    detail: "One extension could not be resolved, so the install was rolled back.",
  }),
});

/**
 * A sync blocked before it changed anything: two units are held by a
 * condition a person has to resolve, and the rest were never reached.
 */
export const blockedSync: OperationResolution<unknown> = makeOperationResolution({
  name: "Sync workspace",
  description: Option.none(),
  mode: "apply",
  presentation: syncPresentation,
  atomicity: { declared: "closure-atomic", applied: "closure-atomic" },
  units: [
    {
      id: "@acme-enterprise/knowledge/effect-v4",
      label: "@acme-enterprise/knowledge/effect-v4",
      state: "blocked",
      disposition: "untouched",
      message:
        "The workspace pins @acme-enterprise/knowledge/effect-v4 to 0.4.2 while the pack @acme/packs/field-notes requires ^0.5.0. Two settings ask for versions that cannot both hold, so AXM changed nothing.",
      error: new StepFailure({
        category: "conflict",
        detail:
          "The workspace pins @acme-enterprise/knowledge/effect-v4 to 0.4.2 while the pack @acme/packs/field-notes requires ^0.5.0. Two settings ask for versions that cannot both hold, so AXM changed nothing.",
      }),
      blocking: {
        class: "precondition-unmet",
        subject: "@acme-enterprise/knowledge/effect-v4",
        phase: "validation",
        detail: "Two settings ask for versions of one extension that cannot both hold.",
        reference: "pinned-version-conflict",
      },
      artifact: artifact("@acme-enterprise/knowledge/effect-v4", "updated", {
        previousVersion: "0.4.2",
      }),
    },
    {
      id: "@acme/packs/field-notes",
      label: "@acme/packs/field-notes",
      state: "blocked",
      disposition: "untouched",
      message:
        "This pack waits on @acme-enterprise/knowledge/effect-v4, which is blocked by a version conflict.",
      blocking: {
        class: "dependency-failed",
        subject: "@acme/packs/field-notes",
        phase: "validation",
        detail: "A member of this pack is blocked.",
        reference: "@acme-enterprise/knowledge/effect-v4",
      },
      artifact: artifact("@acme/packs/field-notes", "updated", { previousVersion: "1.0.0" }),
    },
    {
      id: "@acme/skills/research",
      label: "@acme/skills/research",
      state: "planned",
      artifact: artifact("@acme/skills/research", "updated", { previousVersion: "1.1.3" }),
    },
  ],
});

// ---------------------------------------------------------------------------
// The live sequence: one recorded event log, cut at four moments
// ---------------------------------------------------------------------------

const STARTED_AT = 1_000;

/** The units the live update runs, in plan order. */
const liveUnits = partialUpdateUnits.filter((unit) => unit.state !== "unchanged");

const unitId = (unit: ResolvedUnit<unknown>): string => `extension:${unit.label}`;

const started = (unit: ResolvedUnit<unknown>, index: number, seq: number): OperationEvent => ({
  _tag: "UnitStarted",
  seq,
  atMs: STARTED_AT + 200 + index * 900,
  unitId: unitId(unit),
  label: unit.label,
  index,
  total: liveUnits.length,
});

const resolved = (unit: ResolvedUnit<unknown>, index: number, seq: number): OperationEvent => ({
  _tag: "UnitResolved",
  seq,
  atMs: STARTED_AT + 800 + index * 900,
  unitId: unitId(unit),
  label: unit.label,
  state: unit.state,
  index,
  total: liveUnits.length,
});

/**
 * The whole update as a recorded event log: each unit starts, runs, and
 * settles in plan order, so a frame cut anywhere in it is a real moment of
 * one operation rather than an assembled state.
 */
export const liveUpdateLog: ReadonlyArray<OperationEvent> = [
  {
    _tag: "OperationStarted",
    seq: 1,
    atMs: STARTED_AT,
    operationId: "update-1",
    name: "Updating",
    mode: "apply",
  },
  { _tag: "PhaseStarted", seq: 2, atMs: STARTED_AT + 1, phase: "apply" },
  ...liveUnits.flatMap((unit, index): ReadonlyArray<OperationEvent> => [
    started(unit, index, 3 + index * 3),
    {
      _tag: "UnitProgress",
      seq: 4 + index * 3,
      atMs: STARTED_AT + 500 + index * 900,
      unitId: unitId(unit),
      done: 96_000,
      total: 192_000,
      unit: "bytes",
    },
    resolved(unit, index, 5 + index * 3),
  ]),
];

/** The plan the live update streams: the same rows its result ledger settles. */
export const liveUpdatePlan: LivePlan = {
  title: "Updating",
  aside: [{ text: "in this project" }, { text: `agents: ${AGENTS.join(", ")}` }],
  columns: [
    { header: "Extension", role: "name" },
    { header: "Version", role: "fixed", priority: "optional" },
  ],
  rows: liveUnits.map((unit) => ({
    id: unitId(unit),
    plannedMark: "update" as const,
    plannedStatus: "update",
    cells: [unit.label, unit.artifact?.previousVersion ?? "-"],
  })),
  hint: "--verbose for details",
};

/** Events up to and including the unit at `index`, by the phase it reached. */
export const liveUpdateThrough = (
  index: number,
  phase: "started" | "settled",
): ReadonlyArray<OperationEvent> =>
  liveUpdateLog.slice(0, 2 + index * 3 + (phase === "started" ? 2 : 3));

/** The wall clock each cut frame is painted at. */
export const liveUpdateNowMs = (index: number): number => STARTED_AT + 700 + index * 900;
