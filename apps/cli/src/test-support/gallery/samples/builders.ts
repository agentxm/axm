/**
 * Builders for the operation records gallery fixtures paint.
 *
 * A fixture states only what its scenario is about, and the builder fills in
 * everything else with values a real workspace would hold: a project path, the
 * agents a unit reached, the version an update moved from. Each builder
 * returns the kernel's own record type, so a fixture built from them is passed
 * to the real view unchanged.
 *
 * ```ts
 * const units = [
 *   aChangedUnit("@acme/skills/okf", { version: "0.1.9", previousVersion: "0.1.8" }),
 *   aFailedUnit("@acme/rules/typescript", {
 *     installedVersion: "3.1.0",
 *     failure: aFailure({ category: "timeout", detail: "The registry did not answer." }),
 *   }),
 * ];
 * const resolution = anOperation({ verb: updateVerb, units });
 * ```
 */

import * as Option from "effect/Option";

import {
  StepFailure,
  makeOperationResolution,
  operationPresentation,
  type JobStepArtifact,
  type OperationResolution,
  type ResolvedUnit,
} from "@agentxm/workspace-kernel/operations";

type Verb = Parameters<typeof operationPresentation>[0];
type FailureFields = ConstructorParameters<typeof StepFailure>[0];
type Unit = ResolvedUnit<unknown>;

export const updateVerb: Verb = { imperative: "update", past: "Updated", gerund: "Updating" };
export const installVerb: Verb = { imperative: "install", past: "Installed", gerund: "Installing" };
export const syncVerb: Verb = { imperative: "sync", past: "Synced", gerund: "Syncing" };

/** Where a sample project's extensions live, as a reason names them. */
export const PROJECT_ROOT = "/home/dev/work/platform-services";

/** The agents a sample unit reaches. */
const SAMPLE_AGENTS: ReadonlyArray<string> = ["claude-code", "codex", "grok-cli", "opencode"];

interface ArtifactFacts {
  readonly version?: string;
  readonly previousVersion?: string;
  readonly fileCount?: number;
  readonly agents?: ReadonlyArray<string>;
}

/** What a unit wrote or would write: its extension directory under the sample project. */
export const anArtifact = (
  name: string,
  change: JobStepArtifact["change"],
  facts: ArtifactFacts = {},
): JobStepArtifact => ({
  path: `${PROJECT_ROOT}/agent_extensions/${name.split("/").at(-1) ?? name}`,
  scope: "project",
  change,
  ...(facts.version === undefined ? {} : { version: facts.version }),
  ...(facts.previousVersion === undefined ? {} : { previousVersion: facts.previousVersion }),
  ...(facts.fileCount === undefined ? {} : { fileCount: facts.fileCount }),
  ...(facts.agents === undefined ? {} : { agents: facts.agents }),
});

/** A failure a producer reported: its category, its sentence, and the routes it suggests. */
export const aFailure = (fields: FailureFields): StepFailure => new StepFailure(fields);

/** Any unit, named once: its identity and label are the name. */
export const aUnit = (name: string, fields: Omit<Unit, "id" | "label">): Unit => ({
  id: name,
  label: name,
  ...fields,
});

/** A unit that changed as planned, with the agents it reached. */
export const aChangedUnit = (
  name: string,
  facts: { readonly version: string; readonly previousVersion: string },
): Unit =>
  aUnit(name, {
    state: "committed",
    artifact: anArtifact(name, "updated", { ...facts, fileCount: 6, agents: SAMPLE_AGENTS }),
  });

/** A unit already at the version asked for. */
export const anUnchangedUnit = (name: string, version: string): Unit =>
  aUnit(name, {
    state: "unchanged",
    artifact: anArtifact(name, "unchanged", { version, agents: SAMPLE_AGENTS }),
  });

/** A unit that failed and was restored to the version still installed. */
export const aFailedUnit = (
  name: string,
  facts: { readonly installedVersion: string; readonly failure: StepFailure },
): Unit =>
  aUnit(name, {
    state: "failed",
    disposition: "restored",
    message: `${facts.failure.detail} (${facts.failure.category})`,
    error: facts.failure,
    artifact: anArtifact(name, "updated", { previousVersion: facts.installedVersion }),
  });

/** A unit the operation stopped before. */
export const aPlannedUnit = (
  name: string,
  change: JobStepArtifact["change"],
  facts: ArtifactFacts = {},
): Unit => aUnit(name, { state: "planned", artifact: anArtifact(name, change, facts) });

/** An apply-mode, closure-atomic operation over `units`, as every sample is. */
export const anOperation = (spec: {
  readonly name: string;
  readonly verb: Verb;
  readonly units: ReadonlyArray<Unit>;
  readonly failure?: StepFailure;
}): OperationResolution<unknown> =>
  makeOperationResolution({
    name: spec.name,
    description: Option.none(),
    mode: "apply",
    presentation: operationPresentation(spec.verb),
    atomicity: { declared: "closure-atomic", applied: "closure-atomic" },
    units: spec.units,
    ...(spec.failure === undefined ? {} : { failure: spec.failure }),
  });
