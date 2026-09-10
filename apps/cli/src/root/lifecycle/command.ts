import { humanVerificationFlags, withHumanVerificationOptions } from "../../cli-flags/index.js";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import { Argument, Command, Flag } from "effect/unstable/cli";

import { Screen, headlineDoc, successDoc } from "../../screen/index.js";
import { withArgvTracking } from "../../cli-runtime/index.js";
import {
  directWriteCapabilities,
  withCommandCapabilities,
  type CommandCapabilities,
} from "../shared/command-capabilities.js";
import type { YankCategory } from "@agentxm/registry-client";
import {
  DeprecatePublishedExtension,
  RegistryTransitionSchema,
  RetirePublishedVersion,
  type RegistryTransition,
} from "@agentxm/extension-publish";
import {
  DeprecationTransitionSchema,
  type DeprecationTransition,
} from "@agentxm/registry-protocol/unstable/registry";
import { publishFailureToAppError } from "../../feature-errors.js";

import { withRuntime } from "../../runtime.js";
import { HumanVerificationOptions, isNonInteractive, jsonFlag } from "../../cli-flags/index.js";

const categoryValues = ["broken", "security", "accidental", "other"] as const;

export const LifecycleTransitionOutputSchema = DeprecationTransitionSchema.annotate({
  identifier: "LifecycleTransitionOutput",
});

/** The invocation's human-verification inputs, as the capability reads them. */
const verificationOptions = Effect.gen(function* () {
  const { stepUpRequest, waitForHuman } = yield* HumanVerificationOptions;
  const unattended = (yield* isNonInteractive) || Option.getOrElse(yield* jsonFlag, () => false);
  return {
    ...(Option.isNone(stepUpRequest) ? {} : { resumeReference: stepUpRequest.value }),
    ...(Option.isNone(waitForHuman) ? {} : { waitForHumanSeconds: waitForHuman.value }),
    unattended,
  };
});

/**
 * Render one Registry transition. It is a remote effect: the document says so
 * rather than claiming an atomicity or a rollback the CLI cannot deliver.
 */
const emitRegistryTransition = (transition: RegistryTransition) =>
  Effect.gen(function* () {
    const screen = yield* Screen;
    if (yield* screen.document(transition, RegistryTransitionSchema)) return;
    yield* screen.result(successDoc(transition.message));
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
      yield* RetirePublishedVersion.yank({
        ref: input.ref,
        allVersions: input.allVersions,
        ...(category === undefined ? {} : { category }),
        ...(notice === undefined ? {} : { notice }),
        verification: yield* verificationOptions,
      }),
    );
  },
  Effect.mapError(publishFailureToAppError),
  Effect.asVoid,
);

export const handleUnyank = Effect.fn("Unyank.handle")(
  function* (ref: string) {
    yield* emitRegistryTransition(
      yield* RetirePublishedVersion.unyank(ref, yield* verificationOptions),
    );
  },
  Effect.mapError(publishFailureToAppError),
  Effect.asVoid,
);

const emitDeprecationTransition = (transition: DeprecationTransition) =>
  Effect.gen(function* () {
    const screen = yield* Screen;
    if (yield* screen.document(transition, LifecycleTransitionOutputSchema)) return;
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
    yield* screen.result(successDoc(`${verb} ${transition.target}.`));
    if (transition.after?.message !== undefined) {
      yield* screen.note(headlineDoc("info", `Message: ${transition.after.message}`));
    }
    if (transition.after?.replacement !== undefined) {
      const replacement = transition.after.replacement;
      yield* screen.note(
        headlineDoc(
          "info",
          replacement.status === "available"
            ? `Replacement: ${replacement.fqn}`
            : replacement.fqn === undefined
              ? "Replacement: unavailable or not visible"
              : `Replacement: ${replacement.fqn} (unavailable)`,
        ),
      );
    }
  });

export const handleDeprecate = Effect.fn("Deprecate.handle")(
  function* (input: {
    readonly ref: string;
    readonly message: Option.Option<string>;
    readonly replacement: Option.Option<string>;
    readonly clearMessage: boolean;
    readonly clearReplacement: boolean;
  }) {
    const written = yield* DeprecatePublishedExtension.deprecate(input);
    yield* emitDeprecationTransition(written.transition);
  },
  Effect.mapError(publishFailureToAppError),
  Effect.asVoid,
);

export const handleUndeprecate = Effect.fn("Undeprecate.handle")(
  function* (ref: string) {
    const written = yield* DeprecatePublishedExtension.undeprecate(ref);
    yield* emitDeprecationTransition(written.transition);
  },
  Effect.mapError(publishFailureToAppError),
  Effect.asVoid,
);

const yankConfig = {
  ...humanVerificationFlags,
  ref: Argument.string("extension").pipe(
    Argument.withDescription("Exact version ref, or an extension FQN with --all-versions"),
  ),
  allVersions: Flag.boolean("all-versions").pipe(
    Flag.withDescription("Atomically yank all versions currently available"),
    Flag.withDefault(false),
  ),
  category: Flag.choice("category", categoryValues).pipe(
    Flag.withDescription("Public yank category"),
    Flag.optional,
  ),
  notice: Flag.string("notice").pipe(
    Flag.withDescription("Safe public yank notice (maximum 500 characters)"),
    Flag.optional,
  ),
} as const;

const exactRefConfig = {
  ...humanVerificationFlags,
  ref: Argument.string("extension").pipe(
    Argument.withDescription("Exact extension version ref (@owner/<plural-type>/name@1.2.3)"),
  ),
} as const;

const deprecateConfig = {
  ref: Argument.string("extension").pipe(
    Argument.withDescription("Extension FQN (@owner/<plural-type>/name)"),
  ),
  message: Flag.string("message").pipe(
    Flag.withDescription("Concise publisher migration guidance (maximum 500 characters)"),
    Flag.optional,
  ),
  replacement: Flag.string("replacement").pipe(
    Flag.withDescription("Replacement extension FQN"),
    Flag.optional,
  ),
  clearMessage: Flag.boolean("clear-message").pipe(
    Flag.withDescription("Remove the current publisher message"),
    Flag.withDefault(false),
  ),
  clearReplacement: Flag.boolean("clear-replacement").pipe(
    Flag.withDescription("Remove the current replacement relationship"),
    Flag.withDefault(false),
  ),
} as const;

const extensionRefConfig = {
  ref: Argument.string("extension").pipe(
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
  withHumanVerificationOptions,
  withArgvTracking(yankConfig),
  withCommandCapabilities(directWriteCapabilities("registry")),
  Command.withDescription("Exclude extension versions from fresh resolution"),
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
  withHumanVerificationOptions,
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
