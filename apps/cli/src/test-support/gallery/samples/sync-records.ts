import * as Effect from "effect/Effect";
import * as Option from "effect/Option";

import {
  makeOperationResolution,
  operationPresentation,
  type JobStepArtifact,
  type Plan,
} from "@agentxm/workspace/transitions/planning";

const syncPresentation = operationPresentation({
  imperative: "sync",
  past: "Synced",
  gerund: "Syncing",
});

const updatePresentation = operationPresentation({
  imperative: "update",
  past: "Updated",
  gerund: "Updating",
});

const uninstallPresentation = operationPresentation({
  imperative: "uninstall",
  past: "Uninstalled",
  gerund: "Uninstalling",
});

const artifact = (
  path: string,
  change: JobStepArtifact["change"],
  version: string,
  options?: {
    readonly previousVersion?: string;
    readonly fileCount?: number;
    readonly agents?: ReadonlyArray<string>;
  },
): JobStepArtifact => ({
  path,
  scope: "project",
  change,
  version,
  ...(options?.previousVersion === undefined ? {} : { previousVersion: options.previousVersion }),
  ...(options?.fileCount === undefined ? {} : { fileCount: options.fileCount }),
  ...(options?.agents === undefined ? {} : { agents: options.agents }),
});

const planned = (label: string, value: JobStepArtifact) => ({
  readiness: "ready" as const,
  key: label,
  label,
  artifact: value,
  run: Effect.succeed({
    result: "success" as const,
    message: `${label} complete`,
    artifact: value,
  }),
});

const unchanged = Array.from({ length: 12 }, (_, index) => {
  const label = `@acme/skills/current-${String(index + 1)}`;
  return planned(
    label,
    artifact(`agent_extensions/current-${String(index + 1)}`, "unchanged", "1.0.0"),
  );
});

/** The real plan input behind the mixed sync gallery frame. */
export const mixedSyncPlan: Plan = {
  _tag: "Plan",
  name: "Sync workspace",
  description: Option.none(),
  presentation: syncPresentation,
  jobs: [
    {
      concurrency: 1,
      steps: [
        planned("@acme/skills/standup", artifact("agent_extensions/standup", "created", "0.4.2")),
        planned("github", artifact("agent_extensions/github", "created", "", { fileCount: 2 })),
        planned(
          "@acme/skills/triage",
          artifact("agent_extensions/triage", "updated", "2.0.1", {
            previousVersion: "1.9.4",
          }),
        ),
        planned(
          "@legacy/skills/changelog",
          artifact("agent_extensions/changelog", "removed", "0.3.0"),
        ),
        ...unchanged,
      ],
    },
  ],
};

export const syncNoOp = makeOperationResolution({
  name: "Sync workspace",
  description: Option.none(),
  mode: "apply",
  presentation: syncPresentation,
  atomicity: { declared: "closure-atomic", applied: "closure-atomic" },
  units: [],
});

export const updateNoOp = makeOperationResolution({
  name: "Update extensions",
  description: Option.none(),
  mode: "apply",
  presentation: updatePresentation,
  atomicity: { declared: "closure-atomic", applied: "closure-atomic" },
  units: [],
});

const reviewKit = artifact("agent_extensions/review-kit", "removed", "2.1.0");
const reviewer = artifact("agent_extensions/reviewer", "removed", "0.9.0", { fileCount: 1 });
const kept = artifact("agent_extensions/code-review", "unchanged", "1.4.0");

export const uninstallWithRetainedReference = makeOperationResolution({
  name: "Uninstall extensions",
  description: Option.none(),
  mode: "apply",
  presentation: uninstallPresentation,
  atomicity: { declared: "closure-atomic", applied: "closure-atomic" },
  units: [
    { id: "review-kit", label: "@acme/packs/review-kit", state: "committed", artifact: reviewKit },
    {
      id: "reviewer",
      label: "@acme/subagents/reviewer",
      state: "committed",
      artifact: {
        ...reviewer,
        references: [{ path: "AGENTS.md", state: "retained", reason: "prose AXM did not write" }],
      },
    },
    { id: "code-review", label: "@acme/skills/code-review", state: "unchanged", artifact: kept },
  ],
});

const triage = artifact("agent_extensions/triage", "updated", "2.0.1", {
  previousVersion: "1.9.4",
  fileCount: 8,
  agents: ["claude-code", "codex", "cursor"],
});

export const verboseUpdate = makeOperationResolution({
  name: "Update extensions",
  description: Option.none(),
  mode: "apply",
  presentation: updatePresentation,
  atomicity: { declared: "closure-atomic", applied: "closure-atomic" },
  units: [
    {
      id: "triage",
      label: "@acme/skills/triage",
      state: "committed",
      artifact: triage,
      agentOutcomes: [
        {
          extensionType: "skill",
          name: "triage",
          agentId: "claude-code",
          outcome: "projected",
          reasonCode: "projected",
          reason: "Projected successfully.",
          path: ".claude/skills/triage",
        },
        {
          extensionType: "skill",
          name: "triage",
          agentId: "codex",
          outcome: "projected",
          reasonCode: "projected",
          reason: "Projected successfully.",
          path: ".agents/skills/triage",
        },
        {
          extensionType: "skill",
          name: "triage",
          agentId: "cursor",
          outcome: "blocked",
          reasonCode: "scope-unsupported",
          reason: "skills are unavailable at project scope",
        },
      ],
    },
  ],
});
