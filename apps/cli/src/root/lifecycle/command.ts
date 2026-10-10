import { registryFlag } from "../../cli-flags/index.js";
import { withParameterDefault, withParameterDescription } from "../../cli-parameters.js";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import { Argument, Command, Flag } from "effect/cli";

import { emitResult, headlineDoc, successDoc } from "../../screen/index.js";
import { withArgvTracking } from "../../cli-runtime/index.js";
import {
  directWriteCapabilities,
  withCommandCapabilities,
  type CommandCapabilities,
} from "../shared/command-capabilities.js";
import type { YankCategory } from "@agentxm/registry-client";
import {
  DeprecationReasons,
  type DeprecationReason,
} from "@agentxm/extension-model/unstable/extensions/deprecation";
import {
  ArchivePublishedExtension,
  DeprecatePublishedExtension,
  RegistryTransitionSchema,
  registryTransition,
  RetirePublishedVersion,
  type RegistryTransition,
} from "@agentxm/workspace-features/publishing";
import {
  type ArchivalTransition,
  type DeprecationTransition,
} from "@agentxm/registry-protocol/unstable/registry";
import { failureToAppError } from "../../app-error/conversions.js";

import { withRuntime } from "../../runtime.js";
import { withLiveOperation } from "../../operation-lifecycle.js";

const categoryValues = ["broken", "security", "accidental", "other"] as const;

/**
 * Render one Registry transition. It is a remote effect: the document says so
 * rather than claiming an atomicity or a rollback the CLI cannot deliver.
 */
const emitRegistryTransition = (transition: RegistryTransition) =>
  Effect.gen(function* () {
    yield* emitResult(transition, RegistryTransitionSchema, () => successDoc(transition.message));
  });

export const handleYank = Effect.fn("Yank.handle")(
  function* (input: {
    readonly ref: string;
    readonly allVersions: boolean;
    readonly category: Option.Option<YankCategory>;
    readonly message: Option.Option<string>;
  }) {
    const category = Option.getOrUndefined(input.category);
    const message = Option.getOrUndefined(input.message);
    yield* emitRegistryTransition(
      yield* withLiveOperation(
        { command: "yank", name: `Yank ${input.ref}`, mode: "apply" },
        RetirePublishedVersion.yank({
          ref: input.ref,
          allVersions: input.allVersions,
          ...(category === undefined ? {} : { category }),
          ...(message === undefined ? {} : { message }),
        }),
      ),
    );
  },
  Effect.mapError(failureToAppError),
  Effect.asVoid,
);

export const handleUnyank = Effect.fn("Unyank.handle")(
  function* (ref: string) {
    yield* emitRegistryTransition(
      yield* withLiveOperation(
        { command: "unyank", name: `Restore ${ref}`, mode: "apply" },
        RetirePublishedVersion.unyank(ref),
      ),
    );
  },
  Effect.mapError(failureToAppError),
  Effect.asVoid,
);

const emitDeprecationTransition = (
  action: "deprecate" | "undeprecate",
  registry: string,
  transition: DeprecationTransition,
) =>
  emitResult(
    registryTransition({
      action,
      registry,
      fqn: transition.target,
      before: transition.before,
      after: transition.after,
      disposition: transition.disposition === "unchanged" ? "already-current" : "changed",
      revision: transition.revision,
      message:
        transition.disposition === "unchanged"
          ? `Guidance for ${transition.target} is already current.`
          : `Updated guidance for ${transition.target}.`,
    }),
    RegistryTransitionSchema,
    () => {
      const verb =
        transition.disposition === "created"
          ? "Deprecated"
          : transition.disposition === "edited"
            ? "Updated deprecation for"
            : transition.disposition === "restored"
              ? "Restored"
              : transition.after === null
                ? "Already active"
                : "Deprecation already current for";
      const replacement = transition.after?.replacement;
      return [
        ...successDoc(`${verb} ${transition.target}.`),
        ...headlineDoc(
          "info",
          `State: ${transition.before === null ? "active" : "deprecated"} to ${transition.after === null ? "active" : "deprecated"}`,
        ),
        ...headlineDoc("info", `Revision: ${transition.revision}`),
        ...(transition.after === null
          ? []
          : headlineDoc("info", `Reason: ${transition.after.reason}`)),
        ...(transition.after?.message === undefined
          ? []
          : headlineDoc("info", `Message: ${transition.after.message}`)),
        ...(replacement === undefined
          ? []
          : headlineDoc(
              "info",
              replacement.status === "available"
                ? `Replacement: ${replacement.fqn}`
                : replacement.fqn === undefined
                  ? "Replacement: unavailable or not visible"
                  : `Replacement: ${replacement.fqn} (unavailable)`,
            )),
      ];
    },
  );

export const handleDeprecate = Effect.fn("Deprecate.handle")(
  function* (input: {
    readonly ref: string;
    readonly reason: Option.Option<DeprecationReason>;
    readonly message: Option.Option<string>;
    readonly replacement: Option.Option<string>;
    readonly clearMessage: boolean;
    readonly clearReplacement: boolean;
  }) {
    const written = yield* withLiveOperation(
      { command: "deprecate", name: `Deprecate ${input.ref}`, mode: "apply" },
      DeprecatePublishedExtension.deprecate(input),
    );
    yield* emitDeprecationTransition("deprecate", written.registry, written.transition);
  },
  Effect.mapError(failureToAppError),
  Effect.asVoid,
);

export const handleUndeprecate = Effect.fn("Undeprecate.handle")(
  function* (ref: string) {
    const written = yield* withLiveOperation(
      { command: "undeprecate", name: `Restore ${ref}`, mode: "apply" },
      DeprecatePublishedExtension.undeprecate(ref),
    );
    yield* emitDeprecationTransition("undeprecate", written.registry, written.transition);
  },
  Effect.mapError(failureToAppError),
  Effect.asVoid,
);

const emitArchivalTransition = (
  action: "archive" | "unarchive",
  registry: string,
  transition: ArchivalTransition,
) =>
  emitResult(
    registryTransition({
      action,
      registry,
      fqn: transition.target,
      before: transition.before,
      after: transition.after,
      disposition: transition.disposition === "unchanged" ? "already-current" : "changed",
      revision: transition.revision,
      message:
        transition.disposition === "unchanged"
          ? `${transition.target} is already current.`
          : `Updated archival of ${transition.target}.`,
    }),
    RegistryTransitionSchema,
    () => {
      const verb =
        transition.disposition === "created"
          ? "Archived"
          : transition.disposition === "edited"
            ? "Updated archive message for"
            : transition.disposition === "restored"
              ? "Unarchived"
              : transition.after === null
                ? "Already active"
                : "Already archived";
      return [
        ...successDoc(`${verb} ${transition.target}.`),
        ...headlineDoc(
          "info",
          `State: ${transition.before === null ? "active" : "archived"} to ${transition.after === null ? "active" : "archived"}`,
        ),
        ...headlineDoc("info", `Revision: ${transition.revision}`),
        ...(transition.after?.message === undefined
          ? []
          : headlineDoc("info", `Message: ${transition.after.message}`)),
      ];
    },
  );

export const handleArchive = Effect.fn("Archive.handle")(
  function* (input: {
    readonly ref: string;
    readonly message: Option.Option<string>;
    readonly clearMessage: boolean;
  }) {
    const written = yield* withLiveOperation(
      { command: "archive", name: `Archive ${input.ref}`, mode: "apply" },
      ArchivePublishedExtension.archive(input),
    );
    yield* emitArchivalTransition("archive", written.registry, written.transition);
  },
  Effect.mapError(failureToAppError),
  Effect.asVoid,
);

export const handleUnarchive = Effect.fn("Unarchive.handle")(
  function* (ref: string) {
    const written = yield* withLiveOperation(
      { command: "unarchive", name: `Unarchive ${ref}`, mode: "apply" },
      ArchivePublishedExtension.unarchive(ref),
    );
    yield* emitArchivalTransition("unarchive", written.registry, written.transition);
  },
  Effect.mapError(failureToAppError),
  Effect.asVoid,
);

const yankConfig = {
  registry: registryFlag,
  ref: Argument.String("extension").pipe(
    withParameterDescription("Exact version ref, or an extension FQN with --all-versions"),
  ),
  allVersions: Flag.Boolean("all-versions").pipe(
    withParameterDescription("Atomically yank all versions currently available"),
    withParameterDefault(false),
  ),
  category: Flag.Literals("category", categoryValues).pipe(
    withParameterDescription("Public yank category"),
    Flag.optional,
  ),
  message: Flag.String("message").pipe(
    withParameterDescription("Public yank message up to 500 characters"),
    Flag.optional,
  ),
} as const;

const exactRefConfig = {
  registry: registryFlag,
  ref: Argument.String("extension").pipe(
    withParameterDescription("Extension FQN in @owner/<plural-type>/<name>@version form"),
  ),
} as const;

const deprecateConfig = {
  registry: registryFlag,
  ref: Argument.String("extension").pipe(
    withParameterDescription("Extension FQN in @owner/<plural-type>/<name> form"),
  ),
  reason: Flag.Literals("reason", DeprecationReasons).pipe(
    withParameterDescription("Why the extension is deprecated"),
    Flag.optional,
  ),
  message: Flag.String("message").pipe(
    withParameterDescription(
      "Publisher notes up to 500 characters; required when --reason is obsolete or other",
    ),
    Flag.optional,
  ),
  replacement: Flag.String("replacement").pipe(
    withParameterDescription("Replacement extension FQN"),
    Flag.optional,
  ),
  clearMessage: Flag.Boolean("clear-message").pipe(
    withParameterDescription("Remove the current publisher message"),
    withParameterDefault(false),
  ),
  clearReplacement: Flag.Boolean("clear-replacement").pipe(
    withParameterDescription("Remove the current replacement relationship"),
    withParameterDefault(false),
  ),
} as const;

const archiveConfig = {
  registry: registryFlag,
  clearMessage: Flag.Boolean("clear-message").pipe(
    withParameterDescription("Remove the current publisher message"),
    withParameterDefault(false),
  ),
  ref: Argument.String("extension").pipe(
    withParameterDescription("Extension FQN in @owner/<plural-type>/<name> form"),
  ),
  message: Flag.String("message").pipe(
    withParameterDescription("Public archival message up to 500 characters; omit to preserve it"),
    Flag.optional,
  ),
} as const;

const extensionRefConfig = {
  registry: registryFlag,
  ref: Argument.String("extension").pipe(
    withParameterDescription("Extension FQN in @owner/<plural-type>/<name> form"),
  ),
} as const;

/**
 * Deprecate reads the current deprecation, then writes the merged guidance;
 * the invocation's effect is the Registry write it always attempts.
 */
const deprecateCapabilities: CommandCapabilities = {
  preview: false,
  preapproval: null,
  trust: [],
  inputs: "explicit",
  effect: "registry",
};

export const yankCommand = Command.make("yank", yankConfig, (input) =>
  handleYank(input).pipe(withRuntime("yank", { registry: input.registry })),
).pipe(
  withArgvTracking(yankConfig),
  withCommandCapabilities(directWriteCapabilities("registry")),
  Command.withDescription("Exclude extension versions from fresh resolution"),
  Command.withShortDescription("Exclude a version from fresh resolution"),
  Command.withExamples([
    { command: "axm yank @acme/skills/code-review@1.2.3", description: "Yank one version" },
    {
      command: "axm yank @acme/skills/code-review --all-versions",
      description: "Atomically yank the current available-version snapshot",
    },
  ]),
);

export const unyankCommand = Command.make("unyank", exactRefConfig, ({ ref, registry }) =>
  handleUnyank(ref).pipe(withRuntime("unyank", { registry })),
).pipe(
  withArgvTracking(exactRefConfig),
  withCommandCapabilities(directWriteCapabilities("registry")),
  Command.withDescription("Restore one exact version to fresh resolution"),
  Command.withExamples([
    {
      command: "axm unyank @acme/skills/code-review@1.2.3",
      description: "Restore one yanked version",
    },
  ]),
);

export const deprecateCommand = Command.make("deprecate", deprecateConfig, (input) =>
  handleDeprecate(input).pipe(withRuntime("deprecate", { registry: input.registry })),
).pipe(
  withArgvTracking(deprecateConfig),
  withCommandCapabilities(deprecateCapabilities),
  Command.withDescription("Create or edit warning-only extension deprecation guidance"),
  Command.withShortDescription("Warn consumers that an extension is deprecated"),
  Command.withExamples([
    {
      command:
        'axm deprecate @acme/skills/code-review --reason superseded --replacement @acme/skills/reviewer --message "Move review workflows"',
      description: "Deprecate with structured replacement guidance",
    },
  ]),
);

export const undeprecateCommand = Command.make(
  "undeprecate",
  extensionRefConfig,
  ({ ref, registry }) => handleUndeprecate(ref).pipe(withRuntime("undeprecate", { registry })),
).pipe(
  withArgvTracking(extensionRefConfig),
  withCommandCapabilities(directWriteCapabilities("registry")),
  Command.withDescription("Restore a deprecated extension identity"),
  Command.withExamples([
    {
      command: "axm undeprecate @acme/skills/code-review",
      description: "Restore the identity to active lifecycle state",
    },
  ]),
);

export const archiveCommand = Command.make("archive", archiveConfig, (input) =>
  handleArchive(input).pipe(withRuntime("archive", { registry: input.registry })),
).pipe(
  withArgvTracking(archiveConfig),
  withCommandCapabilities(directWriteCapabilities("registry")),
  Command.withDescription("Block new releases while retaining historical resolution"),
  Command.withShortDescription("Block new releases; history keeps resolving"),
  Command.withExamples([
    {
      command: 'axm archive --message "No longer maintained" @acme/skills/code-review',
      description: "Archive an extension identity",
    },
  ]),
);

export const unarchiveCommand = Command.make("unarchive", extensionRefConfig, ({ ref, registry }) =>
  handleUnarchive(ref).pipe(withRuntime("unarchive", { registry })),
).pipe(
  withArgvTracking(extensionRefConfig),
  withCommandCapabilities(directWriteCapabilities("registry")),
  Command.withDescription("Restore publication for an archived extension identity"),
  Command.withExamples([
    {
      command: "axm unarchive @acme/skills/code-review",
      description: "Restore an archived extension identity",
    },
  ]),
);
