import { withParameterDescription } from "../../cli-parameters.js";
import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";
import { VersionSchema } from "@agentxm/extension-model/unstable/version-constraints";
import * as Result from "effect/Result";
import { Argument, Command } from "effect/cli";

import {
  ChangeAuthoredVersion,
  changeAuthoredVersionPlanName,
  type AuthoredVersionChange,
} from "@agentxm/workspace-features/authoring";
import { extensionTypeToPlural, parseFqn } from "@agentxm/extension-model/unstable/extensions";
import { DEFAULT_WORKSPACE_SCOPE } from "@agentxm/extension-model/unstable/workspace-scope";

import { makeAppError } from "../../app-error/index.js";
import { failureToAppError, toAppError } from "../../app-error/conversions.js";
import { withArgvTracking } from "../../cli-runtime/index.js";
import { emitOperationResolution } from "../../operation-output.js";
import { withRuntime, withWorkspace } from "../../runtime.js";
import {
  previewCapabilityFlag,
  previewableCapabilities,
  withCommandCapabilities,
} from "../shared/command-capabilities.js";
import { makePlanInvocation } from "../shared/confirmation-recovery.js";
import { withOperationLifecycle } from "../../operation-lifecycle.js";
import { isVersionableType, versionableTypes } from "./versionable-types.js";

export interface RootVersionHandlerArgs {
  readonly handle: string;
  readonly bump: string;
  readonly preview: boolean;
}

const VersionBumpSchema = Schema.Union([
  Schema.Literals(["major", "minor", "patch", "prerelease"]),
  VersionSchema,
]);

/** CLI grammar has one slot for a relative rule or an exact semantic version. */
const parseChange = (
  bump: string,
  handle: string,
): Effect.Effect<AuthoredVersionChange, ReturnType<typeof makeAppError>> => {
  if (bump === "patch" || bump === "minor" || bump === "major" || bump === "prerelease") {
    return Effect.succeed<AuthoredVersionChange>({ _tag: "Increment", rule: bump });
  }
  const version = Schema.decodeUnknownResult(VersionSchema)(bump);
  if (Result.isSuccess(version))
    return Effect.succeed<AuthoredVersionChange>({ _tag: "Exact", version: version.success });
  return makeAppError({
    code: "usage",
    detail: `Expected major, minor, patch, prerelease, or an exact semver version; got ${bump}`,
    suggestions: [
      { description: `Review the version syntax for ${handle}.`, cmd: "axm version --help" },
    ],
  });
};

const handleRootVersionBody = Effect.fn("Version.handleRoot")(function* (
  args: RootVersionHandlerArgs,
) {
  yield* inferVersionableType(args.handle);
  const change = yield* parseChange(args.bump, args.handle);
  const candidate = yield* ChangeAuthoredVersion.prepare({
    fqn: args.handle,
    change,
  }).pipe(Effect.mapError(failureToAppError));

  const { execution, recovery } = yield* makePlanInvocation(
    { preview: args.preview },
    { command: [], arguments: [] },
  );
  const resolution = yield* ChangeAuthoredVersion.previewOrApply(candidate, execution).pipe(
    Effect.mapError(failureToAppError),
  );
  yield* emitOperationResolution(resolution, { recovery });
});

const supportedHandleHints = versionableTypes
  .map((type) => `\`@owner/${extensionTypeToPlural[type]}/name\``)
  .join(", ");

const inferVersionableType = (handle: string) =>
  Effect.gen(function* () {
    const fqn = yield* Effect.fromResult(Result.mapError(parseFqn(handle), toAppError));
    if (!isVersionableType(fqn.type)) {
      return yield* makeAppError({
        code: "validation",
        detail: `Versioning is not supported for ${extensionTypeToPlural[fqn.type]}, got ${handle}`,
        suggestions: [{ description: `Use a handle like ${supportedHandleHints}.` }],
      });
    }
    return fqn.type;
  });

export const handleRootVersion = (args: RootVersionHandlerArgs) =>
  withOperationLifecycle(
    {
      command: "version",
      mode: args.preview ? "preview" : "apply",
      planName: changeAuthoredVersionPlanName,
    },
    handleRootVersionBody(args),
  );

const rootVersionConfig = {
  handle: Argument.String("extension").pipe(
    withParameterDescription("Extension FQN in @owner/<plural-type>/<name> form"),
  ),
  bump: Argument.String("bump").pipe(
    Argument.withSchema(VersionBumpSchema),
    withParameterDescription("major, minor, patch, prerelease, or an exact semver version"),
  ),
  preview: previewCapabilityFlag(),
} as const;

export const versionCommand = Command.make(
  "version",
  rootVersionConfig,
  ({ handle, bump, preview }) =>
    handleRootVersion({ handle, bump, preview }).pipe(
      withWorkspace(DEFAULT_WORKSPACE_SCOPE),
      withRuntime("version"),
    ),
).pipe(
  withArgvTracking(rootVersionConfig),
  withCommandCapabilities(previewableCapabilities("authored-source")),
  Command.withDescription("Bump a project-workspace extension manifest version"),
  Command.withShortDescription("Bump an extension manifest version"),
  Command.withExamples([
    {
      command: "axm version @acme/hooks/block-secrets patch",
      description: "Bump a hook extension's patch version",
    },
    {
      command: "axm version @acme/skills/code-review minor",
      description: "Bump a skill's minor version",
    },
    {
      command: "axm version @acme/subagents/researcher patch",
      description: "Bump a subagent's patch version",
    },
    {
      command: "axm version @acme/mcps/my-server minor",
      description: "Bump an MCP server's minor version",
    },
    {
      command: "axm version @acme/packs/frontend-tools 1.2.3",
      description: "Set an exact pack version",
    },
  ]),
);
