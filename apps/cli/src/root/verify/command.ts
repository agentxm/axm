import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import * as Path from "effect/Path";
import * as Result from "effect/Result";
import * as Schema from "effect/Schema";
import { Argument, CliError, Command, Flag } from "effect/cli";

import {
  isHttpRegistryEndpoint,
  parseRegistryEndpoint,
} from "@agentxm/extension-model/unstable/extensions/registry-endpoint";
import { isSignedIn } from "@agentxm/registry-access/authentication";
import { resolveViewRegistry } from "@agentxm/workspace-features/inspection";
import {
  parseReleaseReference,
  ReleaseVerificationDocumentSchema,
  VerifyPublishedReleases,
  type ReleaseVerificationDocument,
  type ReleaseVerificationRequest,
} from "@agentxm/workspace-features/publishing";
import type { FailureSuggestedAction } from "@agentxm/workspace-kernel/operations";
import { ArchiveIntegritySchema } from "@agentxm/workspace-kernel/workspace-state";

import { makeAppError, type AppError } from "../../app-error/index.js";
import { failureToAppError } from "../../app-error/conversions.js";
import { registryFlag } from "../../cli-flags/index.js";
import { withParameterDescription } from "../../cli-parameters.js";
import { processOutcome, withArgvTracking } from "../../cli-runtime/index.js";
import { ExecutionDirectory, resolveExecutionPath } from "../../execution-directory.js";
import { LearnMore, formatLearnMore } from "../../formatter.js";
import { withLiveOperation } from "../../operation-lifecycle.js";
import { withRuntime } from "../../runtime.js";
import { emitResult } from "../../screen/index.js";
import { signInIfPrivateSuggestion } from "../inspection-errors.js";
import { readOnlyCapabilities, withCommandCapabilities } from "../shared/command-capabilities.js";
import { releaseVerificationDoc } from "./view.js";

type ReferenceSelection = Extract<
  ReleaseVerificationRequest["selection"],
  { readonly mode: "references" }
>;

/**
 * What one invocation selects, decided before any runtime work. A publish
 * result path is kept as given and resolved against the execution directory
 * inside the runtime, so `-C/--directory` applies.
 */
export type VerifySelection =
  ReferenceSelection | { readonly mode: "publish-result"; readonly path: string };

/** The parsed selection inputs of one `axm verify` invocation. */
export interface VerifySelectionArgs {
  readonly extension: ReadonlyArray<string>;
  readonly integrity: Option.Option<string>;
  readonly publishResult: Option.Option<string>;
}

const isArchiveIntegrity = Schema.is(ArchiveIntegritySchema);

const usage = (detail: string): AppError => makeAppError({ code: "usage", detail });

/**
 * Decide what `axm verify` selects. Pure: it reads no file, opens no Registry
 * and needs no service. No selection asks for contextual usage; every other
 * refusal is a usage error naming the offending input.
 */
export const selectReleaseVerification = (
  args: VerifySelectionArgs,
): Effect.Effect<VerifySelection, AppError | CliError.ShowHelp> => {
  const references = args.extension;
  const hasReferences = references.length > 0;
  if (!hasReferences && Option.isNone(args.publishResult) && Option.isNone(args.integrity))
    return Effect.fail(new CliError.ShowHelp({ commandPath: ["axm", "verify"], errors: [] }));
  if (hasReferences && Option.isSome(args.publishResult))
    return Effect.fail(
      usage("Choose exactly one selection: exact release references or --publish-result."),
    );
  if (Option.isSome(args.integrity)) {
    if (Option.isSome(args.publishResult))
      return Effect.fail(
        usage("--integrity applies to one exact reference; a publish result supplies its own."),
      );
    if (references.length !== 1)
      return Effect.fail(
        usage(
          `--integrity requires exactly one exact reference; ${String(references.length)} given.`,
        ),
      );
    if (!isArchiveIntegrity(args.integrity.value))
      return Effect.fail(
        usage(
          `Expected --integrity as one SHA-512 SRI value (sha512- and a 64-byte base64 digest), not ${args.integrity.value}.`,
        ),
      );
  }
  if (Option.isSome(args.publishResult))
    return Effect.succeed({ mode: "publish-result", path: args.publishResult.value });
  const parsed: Array<ReferenceSelection["references"][number]> = [];
  for (const input of references) {
    const reference = parseReleaseReference(input);
    if (Result.isFailure(reference)) return Effect.fail(usage(reference.failure.detail));
    parsed.push(reference.success);
  }
  return Effect.succeed({ mode: "references", references: parsed, integrity: args.integrity });
};

/**
 * Signing in may change an answer only for an HTTP Registry the caller is
 * signed out of, and only when the Registry returned no metadata for a
 * selected extension: it hides what the caller may not see behind absence.
 */
const unavailableExtensionSuggestions = Effect.fnUntraced(function* (
  document: ReleaseVerificationDocument,
) {
  const unavailable = document.releases.some(
    (release) => release.presence.finding === "extension-unavailable",
  );
  const endpoint = parseRegistryEndpoint(document.registry.endpoint);
  if (!unavailable || Result.isFailure(endpoint) || !isHttpRegistryEndpoint(endpoint.success))
    return [];
  // The Registry that answered, addressed as view addresses it, decides
  // whether ambient credentials applied; a selection failure offers nothing.
  const target = yield* Effect.result(resolveViewRegistry(Option.some(endpoint.success.href)));
  if (Result.isFailure(target)) return [];
  const signedIn = yield* isSignedIn(endpoint.success, target.success.defaultEndpoint);
  return signedIn ? [] : [signInIfPrivateSuggestion];
});

/**
 * Verify the selected releases inside one live query, then emit the completed
 * result outside it. A negative or incomplete verification is a completed
 * result that is not ok; a failure that leaves no evidence keeps its error.
 */
export const handleVerify = Effect.fn("Verify.handle")(function* (input: {
  readonly registry: Option.Option<string>;
  readonly selection: VerifySelection;
}) {
  const selection: ReleaseVerificationRequest["selection"] =
    input.selection.mode === "publish-result"
      ? {
          mode: "publish-result",
          path: resolveExecutionPath(
            yield* Path.Path,
            yield* ExecutionDirectory,
            input.selection.path,
          ),
        }
      : input.selection;
  const document = yield* withLiveOperation(
    { name: "Verify published releases", mode: "query" },
    VerifyPublishedReleases.verify({ registry: input.registry, selection }).pipe(
      Effect.mapError(failureToAppError),
    ),
    (verified) => ({
      mode: "query",
      outcome: "completed",
      exitCode: verified.verdict.ok ? 0 : 1,
    }),
  );
  const exitCode = document.verdict.ok ? 0 : 1;
  const suggestions: ReadonlyArray<FailureSuggestedAction> =
    yield* unavailableExtensionSuggestions(document);
  yield* emitResult(
    document,
    ReleaseVerificationDocumentSchema,
    () => releaseVerificationDoc(document, suggestions),
    {
      completion: { mode: "query", outcome: "completed", exitCode },
      ...(suggestions.length === 0 ? {} : { suggestions }),
    },
  );
  return processOutcome(exitCode);
});

const verifyConfig = {
  extension: Argument.String("extension").pipe(
    withParameterDescription("Exact release in @owner/<plural-type>/<name>@<version> form"),
    Argument.atLeast(0),
  ),
  integrity: Flag.String("integrity").pipe(
    withParameterDescription("Expected SHA-512 SRI integrity of the one selected release"),
    Flag.optional,
  ),
  publishResult: Flag.String("publish-result").pipe(
    withParameterDescription(
      "Saved axm publish --json result, verified in its recorded Registry unless --registry",
    ),
    Flag.optional,
  ),
  registry: registryFlag,
} as const;

const EXAMPLE_INTEGRITY =
  "sha512-AayA7dZvjjWgu8W0ypIl6/MwRxMSqy0+JhStKyKL5L+5snqgRxPqmQ2grXeWGnNm8x2xeMIIQevwE3PAU0BgxA==";

export const verifyCommand = Command.make("verify", verifyConfig, (args) =>
  Effect.gen(function* () {
    const selection = yield* selectReleaseVerification(args);
    return yield* handleVerify({ registry: args.registry, selection }).pipe(
      withRuntime({ registry: args.registry }),
    );
  }),
).pipe(
  withArgvTracking(verifyConfig),
  withCommandCapabilities(readOnlyCapabilities()),
  Command.withDescription(
    "Verify that exact published releases are present, intended, and have matching archives",
  ),
  Command.withShortDescription("Verify published releases in a Registry"),
  Command.withExamples([
    {
      command: "axm verify @acme/skills/code-review@1.2.3",
      description: "Verify presence and archive integrity of one release",
    },
    {
      command: `axm verify @acme/skills/code-review@1.2.3 --integrity ${EXAMPLE_INTEGRITY}`,
      description: "Also compare the recorded integrity with the one you expect",
    },
    {
      command: "axm verify --publish-result publish.json --json",
      description: "Verify the admitted set of a saved axm publish --json result",
    },
  ]),
  Command.annotate(
    LearnMore,
    formatLearnMore([
      ["axm help publish", "Read what verification establishes, Registry selection and exit codes"],
    ]),
  ),
);
