import { withParameterDescription } from "../../cli-parameters.js";
import * as Effect from "effect/Effect";
import { Argument, Command } from "effect/cli";

import { MigrateDeprecated } from "@agentxm/workspace-features/lifecycle";
import { deriveOperationOutcome } from "@agentxm/workspace-kernel/operations";
import { ignoreReleaseAgeFlag, previewFlag } from "../../cli-flags/index.js";
import { scopeFlag } from "../../cli-flags/scope-flag.js";
import {
  withArgvTracking,
  setCommandSemanticProperties,
  summarizeCommandOutcome,
} from "../../cli-runtime/index.js";
import { failureToAppError } from "../../app-error/conversions.js";
import { emitOperationResolution, operationResolutionSummary } from "../../operation-output.js";
import { withOperationLifecycle } from "../../operation-lifecycle.js";
import { withReleaseAgePosture, withRuntime, withWorkspace } from "../../runtime.js";
import { withCommandCapabilities } from "../shared/command-capabilities.js";
import { makePublicPositionalPlanInvocation } from "../shared/confirmation-recovery.js";

const config = {
  fqn: Argument.String("extension").pipe(
    withParameterDescription("Installed deprecated registry extension FQN"),
  ),
  scope: scopeFlag,
  preview: previewFlag,
  ignoreReleaseAge: ignoreReleaseAgeFlag,
} as const;

const handleMigrate = (fqn: string, preview: boolean) =>
  withOperationLifecycle(
    { command: "migrate", mode: preview ? "preview" : "apply", planName: `Migrate ${fqn}` },
    Effect.gen(function* () {
      const candidate = yield* MigrateDeprecated.prepare(fqn).pipe(
        Effect.mapError(failureToAppError),
      );
      const { execution, recovery } = yield* makePublicPositionalPlanInvocation(
        { preview },
        ["migrate"],
        [fqn],
      );
      const resolution = yield* MigrateDeprecated.previewOrApply(candidate, execution).pipe(
        Effect.mapError(failureToAppError),
      );
      yield* setCommandSemanticProperties(
        summarizeCommandOutcome(operationResolutionSummary(resolution, { sourceKind: "registry" })),
      );
      if (deriveOperationOutcome(resolution) !== "no-op") {
        yield* emitOperationResolution(resolution, { recovery });
      }
    }),
  );

export const migrateCommand = Command.make(
  "migrate",
  config,
  ({ fqn, scope, preview, ignoreReleaseAge }) =>
    handleMigrate(fqn, preview).pipe(
      withReleaseAgePosture(ignoreReleaseAge),
      withWorkspace(scope),
      withRuntime("migrate"),
    ),
).pipe(
  withArgvTracking(config),
  withCommandCapabilities({
    preview: true,
    preapproval: null,
    trust: [],
    inputs: "explicit",
    effect: "workspace",
  }),
  Command.withDescription("Replace a superseded extension or remove an obsolete one"),
  Command.withExamples([
    { command: "axm migrate @acme/skills/review --preview", description: "Preview migration" },
    { command: "axm migrate @acme/skills/review", description: "Apply migration" },
  ]),
);
