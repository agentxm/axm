import { withParameterDefault, withParameterDescription } from "../../cli-parameters.js";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import { Argument, Command, Flag } from "effect/cli";

import {
  ImportNativeExtension,
  importNativeExtensionPlanName,
  type NativeMcpCandidate,
} from "@agentxm/workspace-features/authoring";
import {
  AdoptMcpServers,
  type McpAdoptionPreflight,
} from "@agentxm/workspace-features/configuration";
import {
  publicRecoveryValue,
  recoveryPositional,
  recoverySwitch,
} from "@agentxm/workspace-kernel/operations";

import { Screen } from "../../screen/index.js";
import { withArgvTracking } from "../../cli-runtime/index.js";
import { failureToAppError } from "../../app-error/conversions.js";
import { emitOperationResolution } from "../../operation-output.js";
import { withRuntime, withWorkspace } from "../../runtime.js";
import {
  previewCapabilityFlag,
  previewableCapabilities,
  withCommandCapabilities,
} from "../shared/command-capabilities.js";
import { makeConfirmationRecovery, makePlanInvocation } from "../shared/confirmation-recovery.js";
import { withOperationLifecycle } from "../../operation-lifecycle.js";

export interface McpsImportArgs {
  readonly name: string;
  readonly target: string;
  readonly enable: boolean;
  readonly preview: boolean;
}

/** Adapt discovered native definitions to the authoring feature's conversion decision. */
const discoveryFrom = (preflight: McpAdoptionPreflight) => ({
  candidates: preflight.candidates.map((candidate): NativeMcpCandidate => ({
    name: candidate.name,
    remote:
      candidate.definition.transport !== "stdio"
        ? Option.some({
            transport: candidate.definition.transport,
            url: candidate.definition.url,
            headers: candidate.definition.headers ?? {},
          })
        : Option.none(),
    ...(candidate.auth === undefined ? {} : { auth: candidate.auth }),
    entries: candidate.adoptions,
  })),
  conflicts: preflight.conflicts.map((finding) => finding.name),
});

export const handleMcpsImport = (args: McpsImportArgs) =>
  withOperationLifecycle(
    {
      command: "mcps.import",
      mode: args.preview ? "preview" : "apply",
      planName: importNativeExtensionPlanName("mcp-server"),
    },
    handleMcpsImportBody(args),
  );

const handleMcpsImportBody = Effect.fn("Mcps.import")(function* (args: McpsImportArgs) {
  const discovered = yield* AdoptMcpServers.prepare([args.name]).pipe(
    Effect.mapError(failureToAppError),
  );
  const nonInteractive = !(yield* (yield* Screen).canAsk);
  const candidate = yield* ImportNativeExtension.prepare({
    type: "mcp-server",
    target: args.target,
    enable: args.enable,
    nonInteractive,
    discovery: discoveryFrom(discovered.preflight),
  }).pipe(Effect.mapError(failureToAppError));
  const { execution, recovery } = yield* makePlanInvocation(
    { preview: args.preview },
    makeConfirmationRecovery(
      ["mcps", "import"],
      [
        recoverySwitch("--enable", args.enable),
        recoveryPositional(publicRecoveryValue(args.name)),
        recoveryPositional(publicRecoveryValue(args.target)),
      ],
    ),
  );
  const resolution = yield* ImportNativeExtension.previewOrApply(candidate, execution).pipe(
    Effect.mapError(failureToAppError),
  );
  yield* emitOperationResolution(resolution, { recovery });
});

const importConfig = {
  name: Argument.String("name").pipe(withParameterDescription("Native MCP server name to convert")),
  target: Argument.String("extension").pipe(
    withParameterDescription("Fully qualified extension name, such as @owner/mcps/name"),
  ),
  enable: Flag.Boolean("enable").pipe(
    withParameterDescription("Enable and materialize the imported MCP package"),
    withParameterDefault(false),
  ),
  preview: previewCapabilityFlag(),
} as const;

export const importCommand = Command.make("import", importConfig, (args) =>
  handleMcpsImport(args).pipe(Effect.scoped, withWorkspace("project"), withRuntime("mcps import")),
).pipe(
  withArgvTracking(importConfig),
  withCommandCapabilities(previewableCapabilities("authored-source")),
  Command.withDescription("Convert one native MCP server into a project-workspace MCP package"),
  Command.withExamples([
    {
      command: "axm mcps import context @me/mcps/context --preview",
      description: "Preview conversion of one named native server",
    },
    {
      command: "axm mcps import context @me/mcps/context --enable",
      description: "Convert and enable the named native server",
    },
  ]),
);
