import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import { Argument } from "effect/unstable/cli";

import { makeAppError } from "@agentxm/client-core/unstable/app-error";
import { KnowledgeManager } from "@agentxm/client-core/unstable/knowledge";
import type { JobStepResult, PlannedJobStep } from "@agentxm/client-core/unstable/plan";
import { WorkspaceMutations } from "@agentxm/client-core/unstable/workspace";

import { emitAppliedPlanOutcome } from "../shared/applied-plan-output.js";
import { previewOrApplyLocalPlan } from "../shared/local-plan.js";
import { scopeConfig } from "./flags.js";

const KNOWLEDGE_SETTINGS_PATH = ".axm/settings.json";

export const activationConfig = {
  name: Argument.string("name").pipe(Argument.withDescription("Configured knowledge bundle name")),
  ...scopeConfig,
} as const;

export const setKnowledgeEnabled = Effect.fn("Knowledge.setEnabled")(function* (
  name: string,
  enabled: boolean,
) {
  const ws = yield* WorkspaceMutations;
  const configured = yield* ws.getConfiguredKnowledgeEntries();
  if (configured[name] === undefined) {
    return yield* makeAppError({
      code: "not_found",
      detail: `Knowledge bundle "${name}" is not configured`,
    });
  }
  const manager = yield* KnowledgeManager;
  const verb = enabled ? "Enable" : "Disable";
  const step: PlannedJobStep = {
    label: name,
    readiness: "ready",
    run: ws
      .updateKnowledgeEntry(name, (entry) => ({ ...entry, enabled }))
      .pipe(
        Effect.andThen(manager.refreshCatalog()),
        Effect.as({
          result: "success",
          message: `${verb}d knowledge bundle ${name}`,
          artifact: {
            path: KNOWLEDGE_SETTINGS_PATH,
            scope: ws.scope,
            change: "updated",
            targets: [{ path: KNOWLEDGE_SETTINGS_PATH, change: "updated" }],
          },
        } satisfies JobStepResult),
      ),
  };
  const resolution = yield* previewOrApplyLocalPlan(
    {
      _tag: "Plan",
      name: `${verb} knowledge bundle`,
      description: Option.some(`${verb} ${name}`),
      jobs: [{ concurrency: 1, steps: [step] }],
    },
    { preview: false, displayApplied: false },
  );
  yield* emitAppliedPlanOutcome({
    command: enabled ? "knowledge.enable" : "knowledge.disable",
    headline: `${verb}d knowledge bundle ${name}`,
    resolution,
    suggestions: [{ description: "Browse installed Knowledge", cmd: "axm knowledge list" }],
  });
});
