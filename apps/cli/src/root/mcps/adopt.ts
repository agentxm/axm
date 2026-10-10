import { withParameterDescription } from "../../cli-parameters.js";
import * as Effect from "effect/Effect";
import { Command, Flag } from "effect/cli";

import { AdoptMcpServers } from "@agentxm/workspace-features/configuration";
import {
  publicRecoveryValue,
  recoveryOption,
  type OperationResolution,
} from "@agentxm/workspace-kernel/operations";

import { scopeFlag } from "../../cli-flags/scope-flag.js";
import { withArgvTracking } from "../../cli-runtime/index.js";
import { failureToAppError } from "../../app-error/conversions.js";
import { emitOperationResolution } from "../../operation-output.js";
import { EXTENSION_TYPE_PRESENTATION } from "../extension-type-presentation.js";
import { withRuntime, withWorkspace } from "../../runtime.js";
import {
  previewCapabilityFlag,
  previewableCapabilities,
  withCommandCapabilities,
} from "../shared/command-capabilities.js";
import { makeConfirmationRecovery, makePlanInvocation } from "../shared/confirmation-recovery.js";
import { withOperationLifecycle } from "../../operation-lifecycle.js";

export interface McpsAdoptArgs {
  readonly name?: ReadonlyArray<string>;
  readonly preview: boolean;
}

const adoptedCount = (resolution: OperationResolution<unknown>, candidateCount: number): number => {
  const adoptionUnit = resolution.units.find((unit) => unit.label.startsWith("Adopt "));
  return adoptionUnit?.state === "committed" ? candidateCount : 0;
};

export const handleMcpsAdopt = (args: McpsAdoptArgs) =>
  withOperationLifecycle(
    {
      command: "mcps.adopt",
      mode: args.preview ? "preview" : "apply",
      planName: "Adopt MCP servers",
    },
    handleMcpsAdoptBody(args),
  );

const handleMcpsAdoptBody = Effect.fn("Mcps.adopt")(function* (args: McpsAdoptArgs) {
  const candidate = yield* AdoptMcpServers.prepare(args.name ?? []).pipe(
    Effect.mapError(failureToAppError),
  );
  const preflight = candidate.preflight;

  const { execution, recovery } = yield* makePlanInvocation(
    { preview: args.preview },
    makeConfirmationRecovery(
      ["mcps", "adopt"],
      (args.name ?? []).map((name) => recoveryOption("--name", publicRecoveryValue(name))),
    ),
  );
  const resolution = yield* AdoptMcpServers.previewOrApply(candidate, execution).pipe(
    Effect.mapError(failureToAppError),
  );
  const appliedCount = adoptedCount(resolution, preflight.candidates.length);
  const suggestions = [
    EXTENSION_TYPE_PRESENTATION["mcp-server"].inspect,
    ...(appliedCount === 1
      ? [{ description: "Undo", cmd: `axm mcps uninstall ${preflight.candidates[0]?.name ?? ""}` }]
      : []),
  ];
  yield* emitOperationResolution(resolution, {
    recovery,
    suggestions,
    ...(preflight.candidates.length === 0 && preflight.conflicts.length === 0
      ? { message: "No unmanaged MCP servers adopted." }
      : {}),
    adoptions: {
      adopted: appliedCount,
      skipped: preflight.skipped.length,
      conflicting: preflight.conflicts.length,
    },
  });
});

const adoptConfig = {
  name: Flag.String("name").pipe(
    Flag.atLeast(0),
    withParameterDescription(
      "Select native names; any selected blocker prevents adoption of the batch",
    ),
  ),
  scope: scopeFlag,
  preview: previewCapabilityFlag(),
} as const;

export const adoptCommand = Command.make("adopt", adoptConfig, ({ scope, preview, name }) =>
  handleMcpsAdopt({ preview, name }).pipe(
    Effect.scoped,
    withWorkspace(scope),
    withRuntime("mcps adopt"),
  ),
).pipe(
  withArgvTracking(adoptConfig),
  withCommandCapabilities(previewableCapabilities("workspace")),
  Command.withDescription("Adopt unmanaged MCP servers as inline settings entries"),
  Command.withExamples([
    {
      command: "axm mcps adopt",
      description: "Adopt unmanaged MCP servers from workspace and configured agent MCP configs",
    },
    {
      command: "axm mcps adopt --preview",
      description: "Preview unmanaged MCP server adoption",
    },
  ]),
);
