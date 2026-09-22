import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import { Argument, Command, Flag } from "effect/unstable/cli";

import { emitResult, headlineDoc, successDoc } from "../../screen/index.js";
import { withArgvTracking } from "../../cli-runtime/index.js";
import {
  directWriteCapabilities,
  withCommandCapabilities,
  type CommandCapabilities,
} from "../shared/command-capabilities.js";
import type { YankCategory } from "@agentxm/registry-client";
import {
  ArchivePublishedExtension,
  DeprecatePublishedExtension,
  RegistryTransitionSchema,
  RetirePublishedVersion,
  type RegistryTransition,
} from "@agentxm/workspace/publishing";
import {
  ArchivalTransitionSchema,
  type ArchivalTransition,
  DeprecationTransitionSchema,
  type DeprecationTransition,
} from "@agentxm/registry-protocol/unstable/registry";
import { publishFailureToAppError } from "../../feature-errors.js";

import { withRuntime } from "../../runtime.js";
import { withLiveOperation } from "../../operation-lifecycle.js";

const categoryValues = ["broken", "security", "accidental", "other"] as const;

export const LifecycleTransitionOutputSchema = DeprecationTransitionSchema.annotate({
  identifier: "LifecycleTransitionOutput",
});

export const ArchivalTransitionOutputSchema = ArchivalTransitionSchema.annotate({
  identifier: "ArchivalTransitionOutput",
});

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
    readonly notice: Option.Option<string>;
  }) {
    const category = Option.getOrUndefined(input.category);
    const notice = Option.getOrUndefined(input.notice);
    yield* emitRegistryTransition(
      yield* withLiveOperation(
        { command: "yank", name: `Yank ${input.ref}`, mode: "apply" },
        RetirePublishedVersion.yank({
          ref: input.ref,
          allVersions: input.allVersions,
          ...(category === undefined ? {} : { category }),
          ...(notice === undefined ? {} : { notice }),
        }),
      ),
    );
  },
  Effect.mapError(publishFailureToAppError),
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
  Effect.mapError(publishFailureToAppError),
  Effect.asVoid,
);

const emitDeprecationTransition = (transition: DeprecationTransition) =>
  emitResult(transition, LifecycleTransitionOutputSchema, () => {
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
  });

export const handleDeprecate = Effect.fn("Deprecate.handle")(
  function* (input: {
    readonly ref: string;
    readonly message: Option.Option<string>;
    readonly replacement: Option.Option<string>;
    readonly clearMessage: boolean;
    readonly clearReplacement: boolean;
  }) {
    const written = yield* withLiveOperation(
      { command: "deprecate", name: `Deprecate ${input.ref}`, mode: "apply" },
      DeprecatePublishedExtension.deprecate(input),
    );
    yield* emitDeprecationTransition(written.transition);
  },
  Effect.mapError(publishFailureToAppError),
  Effect.asVoid,
);

export const handleUndeprecate = Effect.fn("Undeprecate.handle")(
  function* (ref: string) {
    const written = yield* withLiveOperation(
      { command: "undeprecate", name: `Restore ${ref}`, mode: "apply" },
      DeprecatePublishedExtension.undeprecate(ref),
    );
    yield* emitDeprecationTransition(written.transition);
  },
  Effect.mapError(publishFailureToAppError),
  Effect.asVoid,
);

const emitArchivalTransition = (transition: ArchivalTransition) =>
  emitResult(transition, ArchivalTransitionOutputSchema, () => {
    const verb =
      transition.disposition === "created"
        ? "Archived"
        : transition.disposition === "edited"
          ? "Updated archive reason for"
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
      ...(transition.after?.reason === undefined
        ? []
        : headlineDoc("info", `Reason: ${transition.after.reason}`)),
    ];
  });

export const handleArchive = Effect.fn("Archive.handle")(
  function* (input: { readonly ref: string; readonly reason: Option.Option<string> }) {
    const written = yield* withLiveOperation(
      { command: "archive", name: `Archive ${input.ref}`, mode: "apply" },
      ArchivePublishedExtension.archive(input),
    );
    yield* emitArchivalTransition(written.transition);
  },
  Effect.mapError(publishFailureToAppError),
  Effect.asVoid,
);

export const handleUnarchive = Effect.fn("Unarchive.handle")(
  function* (ref: string) {
    const written = yield* withLiveOperation(
      { command: "unarchive", name: `Unarchive ${ref}`, mode: "apply" },
      ArchivePublishedExtension.unarchive(ref),
    );
    yield* emitArchivalTransition(written.transition);
  },
  Effect.mapError(publishFailureToAppError),
  Effect.asVoid,
);

const yankConfig = {
  ref: Argument.String("extension").pipe(
    Argument.withDescription("Exact version ref, or an extension FQN with --all-versions"),
  ),
  allVersions: Flag.Boolean("all-versions").pipe(
    Flag.withDescription("Atomically yank all versions currently available"),
    Flag.withDefault(false),
  ),
  category: Flag.Literals("category", categoryValues).pipe(
    Flag.withDescription("Public yank category"),
    Flag.optional,
  ),
  notice: Flag.String("notice").pipe(
    Flag.withDescription("Safe public yank notice (maximum 500 characters)"),
    Flag.optional,
  ),
} as const;

const exactRefConfig = {
  ref: Argument.String("extension").pipe(
    Argument.withDescription("Exact extension version ref (@owner/<plural-type>/name@1.2.3)"),
  ),
} as const;

const deprecateConfig = {
  ref: Argument.String("extension").pipe(
    Argument.withDescription("Extension FQN (@owner/<plural-type>/name)"),
  ),
  message: Flag.String("message").pipe(
    Flag.withDescription("Concise publisher migration guidance (maximum 500 characters)"),
    Flag.optional,
  ),
  replacement: Flag.String("replacement").pipe(
    Flag.withDescription("Replacement extension FQN"),
    Flag.optional,
  ),
  clearMessage: Flag.Boolean("clear-message").pipe(
    Flag.withDescription("Remove the current publisher message"),
    Flag.withDefault(false),
  ),
  clearReplacement: Flag.Boolean("clear-replacement").pipe(
    Flag.withDescription("Remove the current replacement relationship"),
    Flag.withDefault(false),
  ),
} as const;

const archiveConfig = {
  ref: Argument.String("extension").pipe(
    Argument.withDescription("Extension FQN (@owner/<plural-type>/name)"),
  ),
  reason: Flag.String("reason").pipe(
    Flag.withDescription("Concise public archival reason (maximum 500 characters)"),
    Flag.optional,
  ),
} as const;

const extensionRefConfig = {
  ref: Argument.String("extension").pipe(
    Argument.withDescription("Extension FQN (@owner/<plural-type>/name)"),
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
  handleYank(input).pipe(withRuntime("yank")),
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

export const unyankCommand = Command.make("unyank", exactRefConfig, ({ ref }) =>
  handleUnyank(ref).pipe(withRuntime("unyank")),
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
  handleDeprecate(input).pipe(withRuntime("deprecate")),
).pipe(
  withArgvTracking(deprecateConfig),
  withCommandCapabilities(deprecateCapabilities),
  Command.withDescription("Create or edit warning-only extension deprecation guidance"),
  Command.withShortDescription("Warn consumers that an extension is deprecated"),
  Command.withExamples([
    {
      command:
        'axm deprecate @acme/skills/code-review --replacement @acme/skills/reviewer --message "Move review workflows"',
      description: "Deprecate with structured replacement guidance",
    },
  ]),
);

export const undeprecateCommand = Command.make("undeprecate", extensionRefConfig, ({ ref }) =>
  handleUndeprecate(ref).pipe(withRuntime("undeprecate")),
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
  handleArchive(input).pipe(withRuntime("archive")),
).pipe(
  withArgvTracking(archiveConfig),
  withCommandCapabilities(directWriteCapabilities("registry")),
  Command.withDescription("Block new releases while retaining historical resolution"),
  Command.withShortDescription("Block new releases; history keeps resolving"),
  Command.withExamples([
    {
      command: 'axm archive @acme/skills/code-review --reason "No longer maintained"',
      description: "Archive an extension identity",
    },
  ]),
);

export const unarchiveCommand = Command.make("unarchive", extensionRefConfig, ({ ref }) =>
  handleUnarchive(ref).pipe(withRuntime("unarchive")),
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
