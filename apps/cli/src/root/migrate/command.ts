import * as Effect from "effect/Effect";
import { Argument, Command, Flag } from "effect/unstable/cli";

import { MigrateDeprecated } from "@agentxm/workspace/lifecycle";
import { deriveOperationOutcome } from "@agentxm/workspace/transitions/planning";
import { scopeFlag } from "../../cli-flags/scope-flag.js";
import {
  withArgvTracking,
  setCommandSemanticProperties,
  summarizeCommandOutcome,
} from "../../cli-runtime/index.js";
import { failureToAppError } from "../../app-error/conversions.js";
import { emitOperationResolution, operationResolutionSummary } from "../../operation-output.js";
import { withOperationLifecycle } from "../../operation-lifecycle.js";
import { withRuntime, withWorkspace } from "../../runtime.js";
import { withCommandCapabilities } from "../shared/command-capabilities.js";
import { makePublicPositionalPlanInvocation } from "../shared/confirmation-recovery.js";

const config = {
  fqn: Argument.String("extension").pipe(
    Argument.withDescription("Installed deprecated Registry extension FQN"),
  ),
  scope: scopeFlag.pipe(Flag.withDescription("Project (default) or user workspace")),
  dryRun: Flag.Boolean("dry-run").pipe(
    Flag.withDescription("Preview the complete migration without changing the workspace"),
    Flag.withDefault(false),
  ),
} as const;

const handleMigrate = (fqn: string, dryRun: boolean) =>
  withOperationLifecycle(
    { command: "migrate", mode: dryRun ? "preview" : "apply", planName: `Migrate ${fqn}` },
    Effect.gen(function* () {
      const candidate = yield* MigrateDeprecated.prepare(fqn).pipe(
        Effect.mapError(failureToAppError),
      );
      const { execution, recovery } = yield* makePublicPositionalPlanInvocation(
        { preview: dryRun },
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

export const migrateCommand = Command.make("migrate", config, ({ fqn, scope, dryRun }) =>
  handleMigrate(fqn, dryRun).pipe(withWorkspace(scope), withRuntime("migrate")),
).pipe(
  withArgvTracking(config),
  withCommandCapabilities({
    preview: false,
    preapproval: null,
    trust: [],
    inputs: "explicit",
    effect: "workspace",
    modes: [{ flag: "--dry-run", effect: "none" }],
  }),
  Command.withDescription("Replace a superseded extension or remove an obsolete one"),
  Command.withExamples([
    { command: "axm migrate @acme/skills/review --dry-run", description: "Preview migration" },
    { command: "axm migrate @acme/skills/review", description: "Apply migration" },
  ]),
);
