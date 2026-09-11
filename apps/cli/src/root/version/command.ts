import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import * as Result from "effect/Result";
import { Argument, Command } from "effect/unstable/cli";

import {
  ChangeAuthoredVersion,
  changeAuthoredVersionPlanName,
  type AuthoredVersionChange,
} from "@agentxm/extension-authoring";
import {
  extensionTypeSentenceLabels,
  extensionTypeToPlural,
  parseFqn,
} from "@agentxm/extension-model/unstable/extensions";
import { DEFAULT_WORKSPACE_SCOPE } from "@agentxm/extension-model/unstable/workspace-scope";
import { operationPresentation } from "@agentxm/workspace-operations";

import { makeAppError } from "../../app-error/index.js";
import { fqnInvalidErrorToAppError } from "../../app-error/conversions.js";
import { withArgvTracking } from "../../cli-runtime/index.js";
import { authoringFailureToAppError } from "../../feature-errors.js";
import { emitOperationResolution } from "../../operation-output.js";
import { withRuntime, withWorkspace } from "../../runtime.js";
import { Screen, headlineDoc, successDoc } from "../../screen/index.js";
import { Verbosity } from "../../cli-flags/index.js";
import {
  previewCapabilityFlag,
  previewableCapabilities,
  withCommandCapabilities,
} from "../shared/command-capabilities.js";
import { makePlanExecution } from "../shared/confirmation-recovery.js";
import { withOperationLifecycle } from "../../operation-lifecycle.js";
import {
  isVersionableType,
  versionableTypes,
  type VersionableExtensionType,
} from "./versionable-types.js";

export interface VersionHandlerArgs {
  readonly type: VersionableExtensionType;
  readonly handle: string;
  readonly bump: string;
  readonly targetVersion: Option.Option<string>;
  readonly preview: boolean;
}

/**
 * Turn the bump word and the optional exact version into the change the
 * feature takes. An unknown word, a `set` without a version, and a version
 * passed to a relative bump are argument grammar this route refuses before a
 * request exists.
 */
const parseChange = (
  bump: string,
  handle: string,
  targetVersion: Option.Option<string>,
): Effect.Effect<AuthoredVersionChange, ReturnType<typeof makeAppError>> => {
  if (bump === "set") {
    return Option.match(targetVersion, {
      onNone: () =>
        makeAppError({
          code: "usage",
          detail: "`set` requires an exact semver version",
          suggestions: [
            {
              description: "Set an exact semver version.",
              cmd: `axm version ${handle} set 1.2.3`,
            },
          ],
        }),
      onSome: (version) => Effect.succeed<AuthoredVersionChange>({ _tag: "Exact", version }),
    });
  }
  if (bump !== "patch" && bump !== "minor" && bump !== "major" && bump !== "prerelease") {
    return makeAppError({ code: "validation", detail: `Invalid version bump: ${bump}` });
  }
  if (Option.isSome(targetVersion)) {
    return makeAppError({
      code: "usage",
      detail: `Version target is only valid with "set", got ${bump}`,
      suggestions: [
        {
          description: "Run the requested bump without an exact version argument.",
          cmd: `axm version ${handle} ${bump}`,
        },
      ],
    });
  }
  return Effect.succeed<AuthoredVersionChange>({ _tag: "Increment", rule: bump });
};

const versionPresentation = (type: VersionableExtensionType) =>
  operationPresentation({ imperative: "update", past: "Updated", gerund: "Updating" }, type);

export const handleVersion = (args: VersionHandlerArgs) =>
  withOperationLifecycle(
    {
      command: "version",
      mode: args.preview ? "preview" : "apply",
      planName: changeAuthoredVersionPlanName,
      presentation: versionPresentation(args.type),
    },
    handleVersionBody(args),
  );

const handleVersionBody = Effect.fn("Version.handle")(function* (args: VersionHandlerArgs) {
  const change = yield* parseChange(args.bump, args.handle, args.targetVersion);
  const candidate = yield* ChangeAuthoredVersion.prepare({
    fqn: args.handle,
    change,
  }).pipe(Effect.mapError(authoringFailureToAppError));

  const execution = yield* makePlanExecution(
    { preview: args.preview },
    { command: [], arguments: [] },
  );
  const resolution = yield* ChangeAuthoredVersion.previewOrApply(candidate, execution).pipe(
    Effect.mapError(authoringFailureToAppError),
  );
  const { emitted } = yield* emitOperationResolution("version", resolution);

  // The preview display is the planning-time render this command owns.
  if (args.preview && !emitted) {
    const screen = yield* Screen;
    const verbosity = yield* Verbosity;
    const message = `Would update ${extensionTypeSentenceLabels[candidate.type]} ${candidate.fqn} ${candidate.from} -> ${candidate.to}`;
    if (verbosity.level === "quiet") {
      yield* screen.result(successDoc(message));
      return;
    }
    yield* screen.note(headlineDoc("info", `${message}\n  -> ${candidate.manifestPath}`));
  }
});

export interface RootVersionHandlerArgs {
  readonly handle: string;
  readonly bump: string;
  readonly targetVersion: Option.Option<string>;
  readonly preview: boolean;
}

const supportedHandleHints = versionableTypes
  .map((type) => `\`@owner/${extensionTypeToPlural[type]}/name\``)
  .join(", ");

const inferVersionableType = (handle: string) =>
  Effect.gen(function* () {
    const fqn = yield* Effect.fromResult(
      Result.mapError(parseFqn(handle), fqnInvalidErrorToAppError),
    );
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

const handleRootVersionBody = Effect.fn("Version.handleRoot")(function* (
  args: RootVersionHandlerArgs,
) {
  const type = yield* inferVersionableType(args.handle);
  return yield* handleVersion({ ...args, type });
});

const supportedTypePluralPattern = versionableTypes
  .map((type) => extensionTypeToPlural[type])
  .join("|");

const rootVersionConfig = {
  handle: Argument.string("extension").pipe(
    Argument.withDescription(
      `Fully-qualified extension handle (@owner/<${supportedTypePluralPattern}>/name)`,
    ),
  ),
  bump: Argument.string("bump").pipe(Argument.withDescription("Version bump rule or set")),
  targetVersion: Argument.string("version").pipe(
    Argument.withDescription("Exact semver version for set"),
    Argument.optional,
  ),
  preview: previewCapabilityFlag("Print the bump without writing"),
} as const;

export const versionCommand = Command.make(
  "version",
  rootVersionConfig,
  ({ handle, bump, targetVersion, preview }) =>
    handleRootVersion({ handle, bump, targetVersion, preview }).pipe(
      withWorkspace(DEFAULT_WORKSPACE_SCOPE),
      withRuntime("version"),
    ),
).pipe(
  withArgvTracking(rootVersionConfig),
  withCommandCapabilities(previewableCapabilities("authored-source")),
  Command.withDescription("Bump a project-workspace extension manifest version"),
  Command.withExamples([
    {
      command: "axm version @acme/hooks/block-secrets patch",
      description: "Bump a hook's patch version",
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
      command: "axm version @acme/packs/frontend-tools set 1.2.3",
      description: "Set an exact pack version",
    },
  ]),
);
