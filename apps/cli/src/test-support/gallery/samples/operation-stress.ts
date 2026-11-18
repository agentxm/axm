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

import {
  PROJECT_ROOT,
  aChangedUnit,
  aFailedUnit,
  aFailure,
  aPlannedUnit,
  aUnit,
  anArtifact,
  anOperation,
  anUnchangedUnit,
  installVerb,
  syncVerb,
  updateVerb,
} from "./builders.js";
import type {
  OperationEvent,
  ResolvedUnit,
  StepFailure,
} from "@agentxm/workspace-kernel/operations";

const registryTimeout = (name: string): StepFailure =>
  aFailure({
    category: "timeout",
    detail: `The registry did not answer within 30s while resolving ${name}. The request was retried three times and the workspace was left as it was.`,
    suggestions: [
      { description: "Check the registry's status", url: "https://status.example.com/registry" },
    ],
  });

const integrityMismatch = (name: string): StepFailure =>
  aFailure({
    category: "conflict",
    detail: `The archive AXM downloaded for ${name} does not match the integrity the lockfile records. Nothing was written to ${PROJECT_ROOT}/agent_extensions, and the installed version is still in place.`,
    suggestions: [
      {
        description: "Resolve the source again, then update",
        cmd: `axm update ${name} --reinstall`,
      },
    ],
  });

const projectionDenied = (name: string, path: string): StepFailure =>
  aFailure({
    category: "forbidden",
    detail: `AXM could not write ${path}: the directory is read-only. The extension was not projected into any agent, and ${name} still resolves to the version already installed.`,
  });

/** A unit that failed on `failure`, restored to the version still installed. */
const failed = (name: string, installedVersion: string, failure: StepFailure) =>
  aFailedUnit(name, { installedVersion, failure });

/** Thirteen units, as a project-wide update settles them. */
const partialUpdateUnits: ReadonlyArray<ResolvedUnit<unknown>> = [
  aChangedUnit("@acme/skills/improve-whatever", { version: "1.0.2", previousVersion: "1.0.1" }),
  aChangedUnit("@acme/skills/spot-spew", { version: "0.2.0", previousVersion: "0.1.9" }),
  aChangedUnit("@acme/skills/devops-docs", { version: "0.5.1", previousVersion: "0.5.0" }),
  aChangedUnit("@acme/skills/okf", { version: "0.1.9", previousVersion: "0.1.8" }),
  aChangedUnit("@acme/skills/research", { version: "1.2.0", previousVersion: "1.1.3" }),
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
  anUnchangedUnit("@acme/hooks/pre-commit", "1.0.3"),
];

/**
 * A project-wide update that applied five of thirteen units and failed seven,
 * with one already current. Every failed unit rolled its own closure back, so
 * the operation left the workspace coherent and the reader needs the reasons
 * to decide what to do next.
 */
export const partialUpdate = anOperation({
  name: "Update extensions",
  verb: updateVerb,
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
export const failedRolledBackInstall = anOperation({
  name: "Install extensions",
  verb: installVerb,
  units: [
    aUnit("@acme/packs/review-kit", {
      state: "rolled-back",
      disposition: "restored",
      message: "The pack's members were written and then removed again when a later member failed.",
      artifact: anArtifact("@acme/packs/review-kit", "created", { version: "2.1.0" }),
    }),
    aUnit("@acme-enterprise/subagents/incident-commander", {
      state: "failed",
      disposition: "restored",
      message:
        "The registry has no version of @acme-enterprise/subagents/incident-commander that satisfies >=2.0.0, which @acme/packs/review-kit requires. Nothing was installed. (not_found)",
      error: aFailure({
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
      artifact: anArtifact("@acme-enterprise/subagents/incident-commander", "created"),
    }),
    aPlannedUnit("@acme/skills/incident-review", "created", { version: "2.0.0" }),
    aPlannedUnit("@acme/knowledge/runbooks", "created", { version: "5.2.0" }),
  ],
  failure: aFailure({
    category: "not_found",
    detail: "One extension could not be resolved, so the install was rolled back.",
  }),
});

const versionConflict =
  "The workspace pins @acme-enterprise/knowledge/effect-v4 to 0.4.2 while the pack @acme/packs/field-notes requires ^0.5.0. Two settings ask for versions that cannot both hold, so AXM changed nothing.";

/**
 * A sync blocked before it changed anything: two units are held by a
 * condition a person has to resolve, and the rest were never reached.
 */
export const blockedSync = anOperation({
  name: "Sync workspace",
  verb: syncVerb,
  units: [
    aUnit("@acme-enterprise/knowledge/effect-v4", {
      state: "blocked",
      disposition: "untouched",
      message: versionConflict,
      error: aFailure({ category: "conflict", detail: versionConflict }),
      blocking: {
        class: "precondition-unmet",
        subject: "@acme-enterprise/knowledge/effect-v4",
        phase: "validation",
        detail: "Two settings ask for versions of one extension that cannot both hold.",
        reference: "pinned-version-conflict",
      },
      artifact: anArtifact("@acme-enterprise/knowledge/effect-v4", "updated", {
        previousVersion: "0.4.2",
      }),
    }),
    aUnit("@acme/packs/field-notes", {
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
      artifact: anArtifact("@acme/packs/field-notes", "updated", { previousVersion: "1.0.0" }),
    }),
    aPlannedUnit("@acme/skills/research", "updated", { previousVersion: "1.1.3" }),
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
  // A unit that did not settle as planned states why while the operation is
  // still running, so the live row carries the reason its result row will.
  ...(unit.error === undefined
    ? {}
    : { failure: { category: unit.error.category, detail: unit.error.detail } }),
});

/**
 * The whole update as a recorded event log: each unit starts, runs, and
 * settles in plan order, so a frame cut anywhere in it is a real moment of
 * one operation rather than an assembled state.
 */
const liveUpdateLog: ReadonlyArray<OperationEvent> = [
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

/** Events up to and including the unit at `index`, by the phase it reached. */
export const liveUpdateThrough = (
  index: number,
  phase: "started" | "settled",
): ReadonlyArray<OperationEvent> =>
  liveUpdateLog.slice(0, 2 + index * 3 + (phase === "started" ? 2 : 3));

/** The wall clock each cut frame is painted at. */
export const liveUpdateNowMs = (index: number): number => STARTED_AT + 700 + index * 900;

/**
 * The whole update as one playable recording: the live log, then the
 * operation settling partially once the last unit resolves.
 */
export const liveUpdateRecording: ReadonlyArray<OperationEvent> = [
  ...liveUpdateLog,
  {
    _tag: "OperationSettled",
    seq: liveUpdateLog.length + 1,
    atMs: (liveUpdateLog.at(-1)?.atMs ?? STARTED_AT) + 300,
    outcome: "partial",
  },
];
