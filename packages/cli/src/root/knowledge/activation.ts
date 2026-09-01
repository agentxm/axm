import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import { Argument } from "effect/unstable/cli";

import { makeAppError } from "@agentxm/extension-management/unstable/app-error";
import { buildInstallOperation } from "@agentxm/extension-management/unstable/extensions";
import { KnowledgeManager } from "@agentxm/extension-management/unstable/knowledge";
import type { JobStepResult, PlannedJobStep } from "@agentxm/extension-management/unstable/plan";
import { operationPresentation } from "@agentxm/extension-management/unstable/plan";
import {
  makeConfiguredReleaseAgeEvaluation,
  resolveConfiguredKnowledge,
  WorkspaceMutations,
} from "@agentxm/extension-management/unstable/workspace";

import { emitOperationResolution } from "../../operation-output.js";
import { emitNoOpOutcome } from "../shared/no-op-output.js";
import { previewOrApplyLocalPlan } from "../shared/local-plan.js";
import { withOperationLifecycle } from "../shared/operation-lifecycle.js";
import { workspaceSettingsPath } from "../shared/workspace-display-paths.js";
import { mutationFlags, scopeConfig } from "./flags.js";
import {
  failureToStepFailure,
  toAppError,
} from "@agentxm/extension-management/unstable/app-error/conversions";

export const activationConfig = {
  name: Argument.string("name").pipe(Argument.withDescription("Configured knowledge bundle name")),
  ...scopeConfig,
  preview: mutationFlags.preview,
} as const;

export const setKnowledgeEnabled = (name: string, enabled: boolean, preview: boolean) =>
  withOperationLifecycle(
    {
      command: enabled ? "knowledge.enable" : "knowledge.disable",
      mode: preview ? "preview" : "apply",
      planName: `${enabled ? "Enable" : "Disable"} knowledge bundle`,
    },
    setKnowledgeEnabledBody(name, enabled, preview),
  );

const setKnowledgeEnabledBody = Effect.fn("Knowledge.setEnabled")(function* (
  name: string,
  enabled: boolean,
  preview: boolean,
) {
  const ws = yield* WorkspaceMutations;
  const configured = yield* ws.getConfiguredKnowledgeEntries().pipe(Effect.mapError(toAppError));
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
            path: workspaceSettingsPath(ws.scope),
            scope: ws.scope,
            change: "updated",
            targets: [{ path: workspaceSettingsPath(ws.scope), change: "updated" }],
          }),
      })
    : {
        label: name,
        readiness: "ready",
        run: manager
          .runTransaction({
            transition: Effect.gen(function* () {
              yield* ws
                .updateKnowledgeEntry(name, (current) => ({
                  ...current,
                  enabled: false,
                }))
                .pipe(Effect.mapError(toAppError));
              yield* manager.materializeDeactivate({
                target: { type: "knowledge", name },
              });
            }),
            validate: () => Effect.void,
          })
          .pipe(
            Effect.mapError(failureToStepFailure),
            Effect.as({
              result: "success",
              message: `Disabled knowledge bundle ${name}`,
              artifact: {
                path: workspaceSettingsPath(ws.scope),
                scope: ws.scope,
                change: "updated",
                targets: [{ path: workspaceSettingsPath(ws.scope), change: "updated" }],
              },
            } satisfies JobStepResult),
          ),
      };
  const resolution = yield* previewOrApplyLocalPlan(
    {
      _tag: "Plan",
      name: `${verb} knowledge bundle`,
      description: Option.some(`${verb} ${name}`),
      presentation: operationPresentation(
        enabled
          ? { imperative: "enable", past: "Enabled", gerund: "Enabling" }
          : { imperative: "disable", past: "Disabled", gerund: "Disabling" },
        "knowledge",
      ),
      jobs: [{ concurrency: 1, steps: [step] }],
    },
    {
      preview,
      configuredAgentOperations: [
        { extensionType: "knowledge", name, plannedState: enabled ? "enabled" : "disabled" },
      ],
    },
  );
  yield* emitOperationResolution(enabled ? "knowledge.enable" : "knowledge.disable", resolution, {
    suggestions: [{ description: "Browse installed Knowledge", cmd: "axm knowledge list" }],
  });
});
