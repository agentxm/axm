import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import { Command, Flag } from "effect/unstable/cli";

import {
  ImportNativeExtension,
  importNativeExtensionPlanName,
  type NativeMcpCandidate,
} from "@agentxm/extension-authoring";
import type { WorkspaceScope } from "@agentxm/extension-model/unstable/workspace-scope";
import { ImportMcpServers, type McpImportPreflight } from "@agentxm/workspace-configuration";
import type { OperationResolution } from "@agentxm/workspace-operations";

import { makeAppError } from "../../app-error/index.js";
import { isNonInteractiveOptional } from "../../cli-flags/index.js";
import { scopeFlag } from "../../cli-flags/scope-flag.js";
import { withArgvTracking } from "../../cli-runtime/index.js";
import {
  authoringFailureToAppError,
  configurationFailureToAppError,
} from "../../feature-errors.js";
import { emitOperationResolution } from "../../operation-output.js";
import { withRuntime, withWorkspace } from "../../runtime.js";
import {
  previewCapabilityFlag,
  previewableCapabilities,
  withCommandCapabilities,
} from "../shared/command-capabilities.js";
import { makeConfirmationRecovery, makePlanExecution } from "../shared/confirmation-recovery.js";
import { withOperationLifecycle } from "../../operation-lifecycle.js";

export interface McpsImportArgs {
  readonly preview: boolean;
  readonly as?: Option.Option<string>;
  readonly enable?: boolean;
  /** The scope selector this invocation carried, for the package route's boundary. */
  readonly scope?: WorkspaceScope;
}

const importedCount = (
  resolution: OperationResolution<unknown>,
  candidateCount: number,
): number => {
  const importUnit = resolution.units.find((unit) => unit.label.startsWith("Import "));
  return importUnit?.state === "committed" ? candidateCount : 0;
};

/**
 * What the configuration feature discovered, in the terms the authoring
 * feature decides over. The adapter answers what shape each native connection
 * has; whether that shape can become a package is the authoring feature's
 * refusal to make.
 */
const discoveryFrom = (preflight: McpImportPreflight) => ({
  candidates: preflight.candidates.map((candidate): NativeMcpCandidate => ({
    name: candidate.name,
    remote:
      candidate.definition.type === "http"
        ? Option.some({
            url: candidate.definition.url,
            headers: candidate.definition.headers,
          })
        : Option.none(),
    env: candidate.env,
    entries: candidate.adoptions,
  })),
  conflicts: preflight.conflicts.map((finding) => finding.name),
});

export const handleMcpsImport = (args: McpsImportArgs) =>
  withOperationLifecycle(
    {
      command: "mcps.import",
      mode: args.preview ? "preview" : "apply",
      planName: Option.isSome(args.as ?? Option.none())
        ? importNativeExtensionPlanName("mcp-server")
        : "Import MCP servers",
    },
    handleMcpsImportBody(args),
  );

const handleMcpsImportBody = Effect.fn("Mcps.import")(function* (args: McpsImportArgs) {
  const packageTarget = args.as ?? Option.none<string>();
  const enablePackage = args.enable ?? false;
  // `--enable` decides the activation of a package only `--as` creates, so the
  // combination is a grammar refusal rather than a request either feature can
  // represent.
  if (enablePackage && Option.isNone(packageTarget)) {
    return yield* makeAppError({
      code: "usage",
      detail: "--enable requires --as <extension>",
    });
  }
  const candidate = yield* ImportMcpServers.prepare().pipe(
    Effect.mapError(configurationFailureToAppError),
  );
  const preflight = candidate.preflight;

  if (Option.isSome(packageTarget)) {
    // Authoring a package is project-workspace work, and `--scope` is this
    // command's grammar, so the refusal names the selector the operator wrote
    // rather than the scaffolding vocabulary the feature refuses in.
    if ((args.scope ?? "project") !== "project") {
      return yield* makeAppError({
        code: "usage",
        detail: "MCP package import is project-workspace only; omit --scope user",
      });
    }
    const nonInteractive = yield* isNonInteractiveOptional;
    const conversion = yield* ImportNativeExtension.prepare({
      type: "mcp-server",
      target: packageTarget.value,
      enable: enablePackage,
      nonInteractive,
      discovery: discoveryFrom(preflight),
    }).pipe(Effect.mapError(authoringFailureToAppError));
    const packageExecution = yield* makePlanExecution(
      { preview: args.preview },
      makeConfirmationRecovery(["mcps", "import"], []),
    );
    const packageResolution = yield* ImportNativeExtension.previewOrApply(
      conversion,
      packageExecution,
    ).pipe(Effect.mapError(authoringFailureToAppError));
    yield* emitOperationResolution("mcps.import", packageResolution);
    return;
  }

  const execution = yield* makePlanExecution(
    { preview: args.preview },
    makeConfirmationRecovery(["mcps", "import"], []),
    [],
  );
  const resolution = yield* ImportMcpServers.previewOrApply(candidate, execution).pipe(
    Effect.mapError(configurationFailureToAppError),
  );
  const appliedCount = importedCount(resolution, preflight.candidates.length);
  const suggestions = [
    { description: "Inspect MCP servers", cmd: "axm mcps list" },
    ...(appliedCount === 1
      ? [{ description: "Undo", cmd: `axm mcps uninstall ${preflight.candidates[0]?.name ?? ""}` }]
      : []),
  ];
  yield* emitOperationResolution("mcps.import", resolution, {
    suggestions,
    ...(preflight.candidates.length === 0 && preflight.conflicts.length === 0
      ? { message: "No unmanaged MCP servers imported." }
      : {}),
    imports: {
      imported: appliedCount,
      skipped: preflight.skipped.length,
      conflicting: preflight.conflicts.length,
    },
  });
});

const importConfig = {
  scope: scopeFlag.pipe(
    Flag.withDescription("Import to project (default) or user-level configuration"),
  ),
  preview: previewCapabilityFlag("Show what would change without applying"),
  as: Flag.string("as").pipe(
    Flag.withDescription("Create one managed MCP package at the target FQN"),
    Flag.optional,
  ),
  enable: Flag.boolean("enable").pipe(
    Flag.withDescription("Enable a package created with --as"),
    Flag.withDefault(false),
  ),
} as const;

export const importCommand = Command.make(
  "import",
  importConfig,
  ({ scope, preview, as, enable }) =>
    handleMcpsImport({ preview, as, enable, scope }).pipe(
      Effect.scoped,
      withWorkspace(scope),
      withRuntime("mcps import"),
    ),
).pipe(
  withArgvTracking(importConfig),
  withCommandCapabilities(previewableCapabilities("workspace")),
  Command.withDescription("Import unmanaged MCP servers as inline settings entries"),
  Command.withExamples([
    {
      command: "axm mcps import",
      description: "Adopt unmanaged MCP servers from workspace and configured agent MCP configs",
    },
    {
      command: "axm mcps import --preview",
      description: "Preview unmanaged MCP server adoption",
    },
    {
      command: "axm mcps import --as @me/mcps/context",
      description: "Convert one losslessly representable native server into an authored package",
    },
  ]),
);
