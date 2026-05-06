import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import * as Schema from "effect/Schema";
import { Argument, Command, Flag } from "effect/unstable/cli";

import { makeAppError } from "@agentxm/client-core/unstable/app-error";
import { CliRenderer } from "@agentxm/client-core/unstable/cli-renderer";
import { previewFlag } from "@agentxm/client-core/unstable/cli-flags";
import { withArgvTracking } from "@agentxm/client-core/unstable/cli-runtime";
import { parseFqn } from "@agentxm/client-core/unstable/extensions";
import { DEFAULT_WORKSPACE_SCOPE } from "@agentxm/client-core/unstable/workspace";

import { withRuntime, withWorkspace } from "../../runtime.js";
import {
  bumpManifestVersion,
  type BumpManifestVersionResult,
  type VersionableExtensionType,
  type VersionBump,
} from "./extension-version.js";

export interface VersionHandlerArgs {
  readonly type: VersionableExtensionType;
  readonly handle: string;
  readonly bump: string;
  readonly targetVersion: Option.Option<string>;
  readonly preview: boolean;
}

const VersionResultSchema = Schema.Struct({
  handle: Schema.String,
  type: Schema.String,
  manifestPath: Schema.String,
  from: Schema.String,
  to: Schema.String,
  written: Schema.Boolean,
});

const VersionDocumentFields = {
  result: VersionResultSchema,
} satisfies Schema.Struct.Fields;

const toVersionDocument = (result: BumpManifestVersionResult) => ({
  handle: result.fqn,
  type: result.type,
  manifestPath: result.manifestPath,
  from: result.from,
  to: result.to,
  written: result.written,
});

const parseBump = (bump: string) => {
  switch (bump) {
    case "patch":
    case "minor":
    case "major":
    case "prerelease":
    case "set":
      return Effect.succeed<VersionBump | "set">(bump);
    default:
      return makeAppError({
        code: "VERSION_BUMP_INVALID",
        what: `Invalid version bump: ${bump}`,
        details: ["Supported bumps: patch, minor, major, prerelease, set"],
      });
  }
};

export const handleVersion = (args: VersionHandlerArgs) =>
  Effect.gen(function* () {
    const bump = yield* parseBump(args.bump);

    if (bump === "set" && Option.isNone(args.targetVersion)) {
      return yield* makeAppError({
        code: "VERSION_SET_TARGET_MISSING",
        what: "`set` requires an exact semver version",
        howToFix: `Run \`axm ${args.type === "command" ? "commands" : "skills"} version ${args.handle} set 1.2.3\`.`,
      });
    }

    if (bump !== "set" && Option.isSome(args.targetVersion)) {
      return yield* makeAppError({
        code: "VERSION_TARGET_UNEXPECTED",
        what: `Version target is only valid with "set", got ${bump}`,
      });
    }

    const targetVersion = Option.getOrUndefined(args.targetVersion);
    const result = yield* bumpManifestVersion({
      fqn: args.handle,
      type: args.type,
      bump,
      ...(targetVersion === undefined ? {} : { targetVersion }),
      preview: args.preview,
    });

    const renderer = yield* CliRenderer;
    if (
      yield* renderer.document(
        `${args.type === "command" ? "commands" : "skills"}.version`,
        { result: toVersionDocument(result) },
        VersionDocumentFields,
      )
    ) {
      return;
    }
    yield* renderer.raw(`${result.from} -> ${result.to}\n`);
  });

const makeVersionCommand = (type: VersionableExtensionType) => {
  const plural = type === "command" ? "commands" : "skills";
  const versionConfig = {
    handle: Argument.string("handle").pipe(
      Argument.withDescription(`Fully-qualified ${type} handle (@owner/${plural}/name)`),
    ),
    bump: Argument.string("bump").pipe(Argument.withDescription("Version bump rule or set")),
    targetVersion: Argument.string("version").pipe(
      Argument.withDescription("Exact semver version for set"),
      Argument.optional,
    ),
    preview: previewFlag.pipe(Flag.withDescription("Print the bump without writing")),
  } as const;

  return Command.make("version", versionConfig, ({ handle, bump, targetVersion, preview }) =>
    handleVersion({ type, handle, bump, targetVersion, preview }).pipe(
      withWorkspace(DEFAULT_WORKSPACE_SCOPE),
      withRuntime(`${plural} version`),
    ),
  ).pipe(
    withArgvTracking(versionConfig),
    Command.withDescription(`Bump a managed ${type} manifest version`),
    Command.withExamples([
      {
        command: `axm ${plural} version @acme/${plural}/my-${type} patch`,
        description: "Bump the patch version",
      },
      {
        command: `axm ${plural} version @acme/${plural}/my-${type} set 1.2.3`,
        description: "Set an exact version",
      },
    ]),
  );
};

export const commandsVersionCommand = makeVersionCommand("command");
export const skillsVersionCommand = makeVersionCommand("skill");

export interface RootVersionHandlerArgs {
  readonly handle: string;
  readonly bump: string;
  readonly targetVersion: Option.Option<string>;
  readonly preview: boolean;
}

const inferVersionableType = (handle: string) =>
  Effect.gen(function* () {
    const fqn = yield* parseFqn(handle);
    if (fqn.type !== "command" && fqn.type !== "skill") {
      return yield* makeAppError({
        code: "INVALID_EXTENSION_TYPE",
        what: `Versioning is only supported for skills and commands, got ${handle}`,
        howToFix: "Use a handle like `@owner/skills/name` or `@owner/commands/name`.",
      });
    }
    return fqn.type satisfies VersionableExtensionType;
  });

export const handleRootVersion = (args: RootVersionHandlerArgs) =>
  Effect.gen(function* () {
    const type = yield* inferVersionableType(args.handle);
    return yield* handleVersion({ ...args, type });
  });

const rootVersionConfig = {
  handle: Argument.string("handle").pipe(
    Argument.withDescription(
      "Fully-qualified extension handle (@owner/skills/name or @owner/commands/name)",
    ),
  ),
  bump: Argument.string("bump").pipe(Argument.withDescription("Version bump rule or set")),
  targetVersion: Argument.string("version").pipe(
    Argument.withDescription("Exact semver version for set"),
    Argument.optional,
  ),
  preview: previewFlag.pipe(Flag.withDescription("Print the bump without writing")),
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
  Command.withDescription("Bump a managed skill or command manifest version"),
  Command.withExamples([
    {
      command: "axm version @acme/commands/my-cmd patch",
      description: "Bump a command's patch version",
    },
    {
      command: "axm version @acme/skills/code-review minor",
      description: "Bump a skill's minor version",
    },
    {
      command: "axm version @acme/skills/code-review set 1.2.3",
      description: "Set an exact version",
    },
  ]),
);
