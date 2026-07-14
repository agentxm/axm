import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import * as Result from "effect/Result";
import * as Schema from "effect/Schema";
import { Argument, Command, Flag } from "effect/unstable/cli";

import {
  AuthClient,
  AuthLoginInteraction,
  RegistryUrl,
  resolveRequiredToken,
} from "@agentxm/client-core/unstable/auth";
import {
  errAuthRequired,
  makeAppError,
  type AppError,
} from "@agentxm/client-core/unstable/app-error";
import { jsonFlag } from "@agentxm/client-core/unstable/cli-flags";
import { CliRenderer } from "@agentxm/client-core/unstable/cli-renderer";
import { withArgvTracking } from "@agentxm/client-core/unstable/cli-runtime";
import {
  fqnInvalidErrorToAppError,
  parseFqn,
  toExtensionTypePlural,
} from "@agentxm/client-core/unstable/extensions";
import {
  deprecateExtension,
  undeprecateExtension,
  unyankExtensionVersion,
  yankAvailableExtensionVersions,
  yankExtensionVersion,
  type RegistryExtensionReference,
  type RegistryExtensionVersionReference,
  type YankCategory,
} from "@agentxm/client-core/unstable/registry";
import { VersionSchema } from "@agentxm/client-core/unstable/version-constraints";

import { withAuthRuntime } from "../../runtime.js";
import { emitPlanResolutionResult } from "../../json-output.js";

const categoryValues = ["broken", "security", "accidental", "other"] as const;
const decodeVersion = Schema.decodeUnknownResult(VersionSchema);

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

interface StepUpRequired {
  readonly authUrl: string;
  readonly doneUrl: string;
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null;

const readString = (record: Record<string, unknown>, key: string) => {
  const value = record[key];
  return typeof value === "string" ? value : null;
};

const readStepUpRequired = (error: AppError): StepUpRequired | null => {
  const body = error.metadata?.response?.body;
  if (!isRecord(body) || readString(body, "code") !== "eotp") return null;
  const authUrl = readString(body, "authUrl");
  const doneUrl = readString(body, "doneUrl");
  return authUrl === null || doneUrl === null ? null : { authUrl, doneUrl };
};

const runWithStepUp = <A, R>(operation: (stepUpToken?: string) => Effect.Effect<A, AppError, R>) =>
  Effect.gen(function* () {
    const initial = yield* Effect.result(operation());
    if (Result.isSuccess(initial)) {
      return { value: initial.success, stepUpCompleted: false };
    }

    const stepUp = readStepUpRequired(initial.failure);
    if (stepUp === null) return yield* initial.failure;

    const registryUrl = yield* RegistryUrl;
    const authClient = yield* AuthClient;
    const interaction = yield* AuthLoginInteraction;
    const renderer = yield* CliRenderer;
    const jsonMode = Option.getOrElse(yield* jsonFlag, () => false);
    const token = yield* resolveRequiredToken(registryUrl, {
      missingTokenError: errAuthRequired("Not authenticated"),
    });

    const opened = yield* interaction.openBrowser(stepUp.authUrl);
    if (!jsonMode) {
      yield* renderer.step(
        opened
          ? "Opening browser to complete step-up authentication..."
          : "Complete step-up authentication in your browser.",
      );
      yield* renderer.step(`Visit: ${stepUp.authUrl}`);
    }

    const proof = yield* authClient.pollStepUpChallenge(token.token, stepUp.doneUrl);
    const value = yield* operation(proof);
    return { value, stepUpCompleted: true };
  });

const emitLifecycleOutput = (input: {
  readonly command: "yank" | "unyank" | "deprecate" | "undeprecate";
  readonly planName: string;
  readonly extension: string;
  readonly message: string;
  readonly warnings?: ReadonlyArray<string>;
  readonly version?: string;
}) =>
  Effect.gen(function* () {
    const renderer = yield* CliRenderer;
    const emitted = yield* emitPlanResolutionResult(input.command, {
      _tag: "ExecutedPlan",
      name: input.planName,
      description: Option.none(),
      jobs: [
        {
          concurrency: 1,
          steps: [
            {
              label: input.extension,
              result: {
                result: "success",
                message: input.message,
                ...(input.warnings === undefined ? {} : { warnings: input.warnings }),
                artifact: {
                  path: input.extension,
                  scope: "user",
                  change: "updated",
                  ...(input.version === undefined ? {} : { version: input.version }),
                },
              },
            },
          ],
        },
      ],
    });
    if (emitted) {
      return;
    }
    yield* renderer.success(input.message);
  });

const handleYank = (input: {
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
      const result = yield* runWithStepUp((stepUpToken) =>
        yankAvailableExtensionVersions(
          ref,
          {
            ...(category === undefined ? {} : { category }),
            ...(notice === undefined ? {} : { notice }),
          },
          stepUpToken === undefined ? undefined : { stepUpToken },
        ),
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
    yield* runWithStepUp((stepUpToken) =>
      yankExtensionVersion(
        ref,
        {
          ...(category === undefined ? {} : { category }),
          ...(notice === undefined ? {} : { notice }),
        },
        stepUpToken === undefined ? undefined : { stepUpToken },
      ),
    );
    yield* emitLifecycleOutput({
      command: "yank",
      planName: "Yank extension version",
      extension: input.ref,
      version: ref.version,
      message: `Yanked ${input.ref}. Exact installs remain available with a warning.`,
    });
  });

const handleUnyank = (input: string) =>
  Effect.gen(function* () {
    const ref = yield* parseExactVersionReference(input);
    yield* runWithStepUp((stepUpToken) =>
      unyankExtensionVersion(ref, stepUpToken === undefined ? undefined : { stepUpToken }),
    );
    yield* emitLifecycleOutput({
      command: "unyank",
      planName: "Un-yank extension version",
      extension: input,
      version: ref.version,
      message: `Restored ${input} to fresh resolution.`,
    });
  });

const handleDeprecate = (input: { readonly ref: string; readonly message: string }) =>
  Effect.gen(function* () {
    const ref = yield* parseExtensionReference(input.ref);
    const message = input.message.trim();
    if (message.length === 0) {
      return yield* makeAppError({
        code: "validation",
        detail: "Deprecation message must not be empty.",
      });
    }
    yield* deprecateExtension(ref, message);
    yield* emitLifecycleOutput({
      command: "deprecate",
      planName: "Deprecate extension",
      extension: input.ref,
      message: `Deprecated ${input.ref}: ${message}`,
      warnings: [message],
    });
  });

const handleUndeprecate = (input: string) =>
  Effect.gen(function* () {
    const ref = yield* parseExtensionReference(input);
    yield* undeprecateExtension(ref);
    yield* emitLifecycleOutput({
      command: "undeprecate",
      planName: "Undeprecate extension",
      extension: input,
      message: `Removed the deprecation warning from ${input}.`,
    });
  });

const yankConfig = {
  ref: Argument.string("extension").pipe(
    Argument.withDescription("Exact version ref, or an extension FQN with --all-versions"),
  ),
  allVersions: Flag.boolean("all-versions").pipe(
    Flag.withDescription("Atomically yank all versions currently available"),
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
  message: Flag.string("message").pipe(Flag.withDescription("Public deprecation warning")),
} as const;

const extensionRefConfig = {
  ref: Argument.string("extension").pipe(
    Argument.withDescription("Extension FQN (@owner/<plural-type>/name)"),
  ),
} as const;

export const yankCommand = Command.make("yank", yankConfig, (input) =>
  handleYank(input).pipe(withAuthRuntime("yank")),
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
  handleUnyank(ref).pipe(withAuthRuntime("unyank")),
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
  handleDeprecate(input).pipe(withAuthRuntime("deprecate")),
).pipe(
  withArgvTracking(deprecateConfig),
  Command.withDescription("Add a warning-only deprecation notice to an extension"),
  Command.withExamples([
    {
      command: 'axm deprecate @acme/skills/code-review --message "Use @acme/skills/reviewer"',
      description: "Warn consumers and suggest a replacement",
    },
  ]),
);

export const undeprecateCommand = Command.make("undeprecate", extensionRefConfig, ({ ref }) =>
  handleUndeprecate(ref).pipe(withAuthRuntime("undeprecate")),
).pipe(
  withArgvTracking(extensionRefConfig),
  Command.withDescription("Remove an extension deprecation notice"),
  Command.withExamples([
    {
      command: "axm undeprecate @acme/skills/code-review",
      description: "Remove the warning-only deprecation marker",
    },
  ]),
);
