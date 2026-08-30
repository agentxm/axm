import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import * as Result from "effect/Result";
import * as Schema from "effect/Schema";
import { Argument, Command, Flag } from "effect/unstable/cli";

import { makeAppError, type AppError } from "@agentxm/extension-management/unstable/app-error";
import { CliRenderer } from "@agentxm/extension-management/unstable/cli-renderer";
import { withArgvTracking } from "@agentxm/extension-management/unstable/cli-runtime";
import {
  ExtensionFqnSchema,
  formatFqn,
  parseFqn,
  toExtensionTypePlural,
} from "@agentxm/extension-model/unstable/extensions";
import { fqnInvalidErrorToAppError } from "@agentxm/extension-management/unstable/app-error/conversions";
import {
  deprecateExtension,
  getExtensionDeprecation,
  undeprecateExtension,
  unyankExtensionVersion,
  yankAvailableExtensionVersions,
  yankExtensionVersion,
  type RegistryExtensionReference,
  type RegistryExtensionVersionReference,
  type YankCategory,
} from "@agentxm/extension-management/unstable/registry";
import {
  DeprecationTransitionSchema,
  type DeprecationReplacementIntent,
  type DeprecationTransition,
} from "@agentxm/registry-protocol/unstable/registry";
import { VersionSchema } from "@agentxm/extension-model/unstable/version-constraints";

import { makeOperationResolution } from "@agentxm/extension-management/unstable/plan";

import { withRuntime } from "../../runtime.js";
import { emitOperationResolution } from "../../operation-output.js";
import { runWithStepUp } from "../step-up.js";

const categoryValues = ["broken", "security", "accidental", "other"] as const;
const decodeVersion = Schema.decodeUnknownResult(VersionSchema);

export const LifecycleTransitionOutputSchema = DeprecationTransitionSchema.annotate({
  identifier: "LifecycleTransitionOutput",
});

const parseExtensionReference = (
  input: string,
): Effect.Effect<RegistryExtensionReference, AppError> =>
  Effect.gen(function* () {
    const parsed = yield* Effect.fromResult(
      Result.mapError(parseFqn(input), fqnInvalidErrorToAppError),
    );
    return {
      owner: parsed.owner,
      type: toExtensionTypePlural(parsed.type),
      name: parsed.name,
    };
  });

const parseExtensionFqn = (input: string) =>
  Effect.gen(function* () {
    const parsed = yield* Effect.fromResult(
      Result.mapError(parseFqn(input), fqnInvalidErrorToAppError),
    );
    return yield* Schema.decodeUnknownEffect(ExtensionFqnSchema)(formatFqn(parsed)).pipe(
      Effect.mapError(() =>
        makeAppError({ code: "validation", detail: `Invalid fully qualified name: ${input}` }),
      ),
    );
  });

const parseExactVersionReference = (
  input: string,
): Effect.Effect<RegistryExtensionVersionReference, AppError> =>
  Effect.gen(function* () {
    const lastSlash = input.lastIndexOf("/");
    const versionAt = lastSlash < 0 ? -1 : input.indexOf("@", lastSlash + 1);
    if (versionAt < 0) {
      return yield* makeAppError({
        code: "validation",
        detail: `Expected an exact version in ${input}`,
        suggestions: [{ description: "Use @owner/<plural-type>/name@1.2.3." }],
      });
    }

    const ref = yield* parseExtensionReference(input.slice(0, versionAt));
    const decodedVersion = decodeVersion(input.slice(versionAt + 1));
    if (Result.isFailure(decodedVersion)) {
      return yield* makeAppError({
        code: "validation",
        detail: `Expected an exact semantic version in ${input}`,
        cause: decodedVersion.failure,
      });
    }
    return { ...ref, version: decodedVersion.success };
  });

const emitLifecycleOutput = (input: {
  readonly command: "yank" | "unyank" | "deprecate" | "undeprecate";
  readonly planName: string;
  readonly extension: string;
  readonly message: string;
  readonly warnings?: ReadonlyArray<string>;
  readonly version?: string;
}) =>
  emitOperationResolution(
    input.command,
    makeOperationResolution({
      name: input.planName,
      description: Option.none(),
      mode: "apply",
      atomicity: { declared: "closure-atomic", applied: "closure-atomic" },
      units: [
        {
          id: input.extension,
          label: input.extension,
          state: "committed",
          message: input.message,
          ...(input.warnings === undefined ? {} : { warnings: input.warnings }),
          artifact: {
            path: input.extension,
            scope: "user",
            change: "updated",
            ...(input.version === undefined ? {} : { version: input.version }),
          },
        },
      ],
    }),
    { message: input.message },
  );

export const handleYank = (input: {
  readonly ref: string;
  readonly allVersions: boolean;
  readonly category: Option.Option<YankCategory>;
  readonly notice: Option.Option<string>;
}) =>
  Effect.gen(function* () {
    const category = Option.getOrUndefined(input.category);
    const notice = Option.getOrUndefined(input.notice);

    if (input.allVersions) {
      const ref = yield* parseExtensionReference(input.ref);
      const result = yield* runWithStepUp(
        (stepUpRequestId) =>
          yankAvailableExtensionVersions(
            ref,
            {
              ...(category === undefined ? {} : { category }),
              ...(notice === undefined ? {} : { notice }),
            },
            stepUpRequestId === undefined ? undefined : { stepUpRequestId },
          ),
        {
          initial: `Updating ${input.ref}`,
          success: `Updated ${input.ref}`,
          failure: `Failed to update ${input.ref}`,
          cancelled: `Cancelled update for ${input.ref}`,
          waiting: `Waiting for verification to update ${input.ref}`,
          authorized: `Authorized update for ${input.ref}`,
        },
      );
      const extension = `${ref.owner}/${ref.type}/${ref.name}`;
      yield* emitLifecycleOutput({
        command: "yank",
        planName: "Yank available extension versions",
        extension,
        message: `Yanked ${result.value.affectedVersions.length} available version${result.value.affectedVersions.length === 1 ? "" : "s"} of ${extension}. Future versions are unaffected.`,
      });
      return;
    }

    const ref = yield* parseExactVersionReference(input.ref);
    yield* runWithStepUp(
      (stepUpRequestId) =>
        yankExtensionVersion(
          ref,
          {
            ...(category === undefined ? {} : { category }),
            ...(notice === undefined ? {} : { notice }),
          },
          stepUpRequestId === undefined ? undefined : { stepUpRequestId },
        ),
      {
        initial: `Updating ${input.ref}`,
        success: `Updated ${input.ref}`,
        failure: `Failed to update ${input.ref}`,
        cancelled: `Cancelled update for ${input.ref}`,
        waiting: `Waiting for verification to update ${input.ref}`,
        authorized: `Authorized update for ${input.ref}`,
      },
    );
    yield* emitLifecycleOutput({
      command: "yank",
      planName: "Yank extension version",
      extension: input.ref,
      version: ref.version,
      message: `Yanked ${input.ref}. Exact installs remain available with a warning.`,
    });
  });

export const handleUnyank = (input: string) =>
  Effect.gen(function* () {
    const ref = yield* parseExactVersionReference(input);
    yield* runWithStepUp(
      (stepUpRequestId) =>
        unyankExtensionVersion(
          ref,
          stepUpRequestId === undefined ? undefined : { stepUpRequestId },
        ),
      {
        initial: `Updating ${input}`,
        success: `Updated ${input}`,
        failure: `Failed to update ${input}`,
        cancelled: `Cancelled update for ${input}`,
        waiting: `Waiting for verification to update ${input}`,
        authorized: `Authorized update for ${input}`,
      },
    );
    yield* emitLifecycleOutput({
      command: "unyank",
      planName: "Un-yank extension version",
      extension: input,
      version: ref.version,
      message: `Restored ${input} to fresh resolution.`,
    });
  });

const emitDeprecationTransition = (transition: DeprecationTransition) =>
  Effect.gen(function* () {
    const renderer = yield* CliRenderer;
    if (yield* renderer.result(transition, LifecycleTransitionOutputSchema)) return;
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
    yield* renderer.success(`${verb} ${transition.target}.`);
    if (transition.after?.message !== undefined) {
      yield* renderer.info(`Message: ${transition.after.message}`);
    }
    if (transition.after?.replacement !== undefined) {
      const replacement = transition.after.replacement;
      yield* renderer.info(
        replacement.status === "available"
          ? `Replacement: ${replacement.fqn}`
          : replacement.fqn === undefined
            ? "Replacement: unavailable or not visible"
            : `Replacement: ${replacement.fqn} (unavailable)`,
      );
    }
  });

export const handleDeprecate = (input: {
  readonly ref: string;
  readonly message: Option.Option<string>;
  readonly replacement: Option.Option<string>;
  readonly clearMessage: boolean;
  readonly clearReplacement: boolean;
}) =>
  Effect.gen(function* () {
    const ref = yield* parseExtensionReference(input.ref);
    if (Option.isSome(input.message) && input.clearMessage) {
      return yield* makeAppError({
        code: "validation",
        detail: "--message and --clear-message cannot be combined.",
      });
    }
    if (Option.isSome(input.replacement) && input.clearReplacement) {
      return yield* makeAppError({
        code: "validation",
        detail: "--replacement and --clear-replacement cannot be combined.",
      });
    }
    const renderer = yield* CliRenderer;
    const current = yield* renderer.withSpinner(
      `Reading deprecation for ${input.ref}`,
      () => getExtensionDeprecation(ref),
      { successMessage: `Read deprecation for ${input.ref}` },
    );
    const suppliedMessage = Option.getOrUndefined(input.message)?.trim();
    const message = input.clearMessage
      ? null
      : suppliedMessage === undefined
        ? (current.deprecation?.message ?? null)
        : suppliedMessage.length === 0
          ? null
          : suppliedMessage;
    const replacement: DeprecationReplacementIntent = input.clearReplacement
      ? { kind: "clear" }
      : Option.isSome(input.replacement)
        ? { kind: "set", fqn: yield* parseExtensionFqn(input.replacement.value) }
        : current.deprecation?.replacement === undefined
          ? { kind: "clear" }
          : current.deprecation.replacement.status === "available"
            ? { kind: "set", fqn: current.deprecation.replacement.fqn }
            : { kind: "preserve" };
    if (message === null && replacement.kind === "clear") {
      return yield* makeAppError({
        code: "validation",
        detail: "A deprecation requires a message, a replacement, or both.",
        suggestions: [
          {
            description: "Supply --message or --replacement, or remove the deprecation instead.",
          },
        ],
      });
    }
    const transition = yield* renderer.withSpinner(
      `Deprecating ${input.ref}`,
      () => deprecateExtension(ref, { revision: current.revision, message, replacement }),
      { successMessage: `Deprecated ${input.ref}` },
    );
    yield* emitDeprecationTransition(transition);
  });

export const handleUndeprecate = (input: string) =>
  Effect.gen(function* () {
    const ref = yield* parseExtensionReference(input);
    const renderer = yield* CliRenderer;
    const current = yield* renderer.withSpinner(
      `Reading deprecation for ${input}`,
      () => getExtensionDeprecation(ref),
      { successMessage: `Read deprecation for ${input}` },
    );
    const transition = yield* renderer.withSpinner(
      `Removing deprecation from ${input}`,
      () => undeprecateExtension(ref, current.revision),
      { successMessage: `Removed deprecation from ${input}` },
    );
    yield* emitDeprecationTransition(transition);
  });

const yankConfig = {
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

export const yankCommand = Command.make("yank", yankConfig, (input) =>
  handleYank(input).pipe(withRuntime("yank")),
).pipe(
  withArgvTracking(yankConfig),
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
  withArgvTracking(exactRefConfig),
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
  Command.withDescription("Restore a deprecated extension identity"),
  Command.withExamples([
    {
      command: "axm undeprecate @acme/skills/code-review",
      description: "Restore the identity to active lifecycle state",
    },
  ]),
);
