import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import { Argument } from "effect/unstable/cli";

import { makeAppError } from "@agentxm/client-core/unstable/app-error";
import { buildInstallOperation } from "@agentxm/client-core/unstable/extensions";
import { KnowledgeManager } from "@agentxm/client-core/unstable/knowledge";
import type { JobStepResult, PlannedJobStep } from "@agentxm/client-core/unstable/plan";
import {
  makeConfiguredReleaseAgeEvaluation,
  resolveConfiguredKnowledge,
  WorkspaceMutations,
} from "@agentxm/client-core/unstable/workspace";

import { emitAppliedPlanOutcome } from "../shared/applied-plan-output.js";
import { emitNoOpOutcome } from "../shared/no-op-output.js";
import { previewOrApplyLocalPlan } from "../shared/local-plan.js";
import { mutationFlags, scopeConfig } from "./flags.js";

const KNOWLEDGE_SETTINGS_PATH = ".axm/settings.json";

export const activationConfig = {
  name: Argument.string("name").pipe(Argument.withDescription("Configured knowledge bundle name")),
  ...scopeConfig,
  preview: mutationFlags.preview,
} as const;

export const setKnowledgeEnabled = Effect.fn("Knowledge.setEnabled")(function* (
  name: string,
  enabled: boolean,
  preview: boolean,
) {
  const ws = yield* WorkspaceMutations;
  const configured = yield* ws.getConfiguredKnowledgeEntries();
  const entry = configured[name];
  if (entry === undefined) {
    return yield* makeAppError({
      code: "not_found",
      detail: `Knowledge bundle "${name}" is not configured`,
    });
  }
  const manager = yield* KnowledgeManager;
  const verb = enabled ? "Enable" : "Disable";
  if (entry.enabled === enabled) {
    yield* emitNoOpOutcome(enabled ? "knowledge.enable" : "knowledge.disable", {
      planName: `${verb} knowledge bundle`,
      planDescription: `${verb} ${name}`,
      message: `Knowledge bundle "${name}" is already ${enabled ? "enabled" : "disabled"}`,
    });
    return;
  }

  const step: PlannedJobStep = enabled
    ? buildInstallOperation(manager, {
        ...(yield* resolveConfiguredKnowledge(
          name,
          entry.source,
          yield* makeConfiguredReleaseAgeEvaluation("enforce"),
        )),
        message: `Enabled knowledge bundle ${name}`,
        buildArtifact: () =>
          Effect.succeed({
            path: KNOWLEDGE_SETTINGS_PATH,
            scope: ws.scope,
            change: "updated",
            targets: [{ path: KNOWLEDGE_SETTINGS_PATH, change: "updated" }],
          }),
      })
    : {
        label: name,
        readiness: "ready",
        run: manager
          .runTransaction({
            transition: Effect.gen(function* () {
              yield* ws.updateKnowledgeEntry(name, (current) => ({
                ...current,
                enabled: false,
              }));
              yield* manager.materializeDeactivate({
                target: { type: "knowledge", name },
              });
            }),
            validate: () => Effect.void,
          })
          .pipe(
            Effect.as({
              result: "success",
              message: `Disabled knowledge bundle ${name}`,
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
    {
      preview,
      displayApplied: false,
      configuredAgentOperations: [{ extensionType: "knowledge", name, targetEnabled: enabled }],
    },
  );
  yield* emitAppliedPlanOutcome({
    command: enabled ? "knowledge.enable" : "knowledge.disable",
    headline: `${verb}d knowledge bundle ${name}`,
    resolution,
    suggestions: [{ description: "Browse installed Knowledge", cmd: "axm knowledge list" }],
  });
});
