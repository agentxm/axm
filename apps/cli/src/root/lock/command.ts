import * as Effect from "effect/Effect";
import { Command, Flag } from "effect/cli";
import { ExportLock } from "@agentxm/workspace-features/inspection";
import { scopeFlag } from "../../cli-flags/scope-flag.js";
import { withArgvTracking } from "../../cli-runtime/index.js";
import { withParameterDescription } from "../../cli-parameters.js";
import { inspectionFailureToAppError } from "../../feature-errors.js";
import { withRuntime, withWorkspace } from "../../runtime.js";
import { Screen } from "../../screen/index.js";
import {
  groupCapabilities,
  readOnlyCapabilities,
  withCommandCapabilities,
} from "../shared/command-capabilities.js";

const handleLockExport = Effect.fn("Lock.export")(function* () {
  const content = yield* ExportLock.query().pipe(Effect.mapError(inspectionFailureToAppError));
  yield* (yield* Screen).result([{ _tag: "raw", content }]);
});

const exportConfig = {
  scope: scopeFlag,
  format: Flag.Literals("format", ["cyclonedx"]).pipe(
    withParameterDescription("Export format (CycloneDX JSON 1.6)"),
  ),
};

const exportCommand = Command.make("export", exportConfig, ({ scope }) =>
  handleLockExport().pipe(withWorkspace({ scope, allowUninitialized: true }), withRuntime()),
).pipe(
  withArgvTracking(exportConfig),
  withCommandCapabilities(readOnlyCapabilities()),
  Command.withDescription(
    "Export accepted external resolutions as an offline SBOM. Writes CycloneDX JSON directly to stdout; does not claim activation, complete runtime coverage, or authenticity.",
  ),
  Command.withExamples([
    {
      command: "axm lock export --format cyclonedx",
      description: "Export the project's accepted external resolutions",
    },
  ]),
);

export const lockCommand = Command.make("lock").pipe(
  withCommandCapabilities(groupCapabilities),
  Command.withDescription("Inspect accepted external resolutions"),
  Command.withExamples([
    {
      command: "axm lock export --format cyclonedx",
      description: "Export an accepted-resolution inventory",
    },
  ]),
  Command.withSubcommands([exportCommand]),
);
