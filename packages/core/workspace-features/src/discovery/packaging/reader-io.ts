/**
 * Shared reader I/O helpers for package-compatibility discovery.
 *
 * @experimental This API is unstable and may change without notice.
 */

import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Option from "effect/Option";
import * as Result from "effect/Result";
import * as Schema from "effect/Schema";
import {
  AgentExtensionRecommendationSchema,
  type AgentExtensionRecommendation,
} from "@agentxm/extension-model/unstable/recommendations/agent-extensions";
import { PackageUrlSchema } from "@agentxm/extension-model/unstable/packaging/package-url";
import { envWithDefault, osHomeDirectory } from "@agentxm/host-primitives";
import type { PackageType } from "@agentxm/extension-model/unstable/packaging/package-type";
import type { PackageReader } from "./types.js";

export const decodePurl = Schema.decodeUnknownSync(PackageUrlSchema);

const AgentExtensionsEnvelopeSchema = Schema.Struct({
  $schema: Schema.optionalKey(Schema.String),
  agentExtensions: Schema.Array(Schema.Unknown),
});

const decodeEnvelope = Schema.decodeUnknownResult(AgentExtensionsEnvelopeSchema);
const decodeRecommendation = Schema.decodeUnknownResult(AgentExtensionRecommendationSchema);

/**
 * Decode the portable metadata envelope and each recommendation independently.
 * A malformed envelope is rejected; malformed entries are diagnosed and omitted
 * so valid siblings remain usable.
 */
const decodeAgentExtensions = Effect.fn("packaging.decodeAgentExtensions")(function* (
  input: unknown,
) {
  const envelope = decodeEnvelope(input);
  if (Result.isFailure(envelope)) return envelope;

  const agentExtensions: Array<AgentExtensionRecommendation> = [];
  const invalidIndexes: Array<number> = [];
  for (const [index, entry] of envelope.success.agentExtensions.entries()) {
    const decoded = decodeRecommendation(entry);
    if (Result.isSuccess(decoded)) {
      agentExtensions.push(decoded.success);
    } else {
      invalidIndexes.push(index);
    }
  }

  if (invalidIndexes.length > 0) {
    yield* Effect.logWarning(
      `Ignoring malformed agentExtensions entries at indexes ${invalidIndexes.join(", ")}`,
    );
  }

  return Result.succeed({
    ...(envelope.success.$schema === undefined ? {} : { $schema: envelope.success.$schema }),
    agentExtensions,
  });
});

/**
 * The recommendations a package's metadata carries. Metadata whose envelope
 * does not decode is diagnosed against `context`, the package it was read
 * from, and contributes none.
 */
export const readAgentExtensions = Effect.fn("packaging.readAgentExtensions")(function* (
  input: unknown,
  context: string,
) {
  const decoded = yield* decodeAgentExtensions(input);
  if (Result.isFailure(decoded)) {
    yield* Effect.logWarning(
      `Invalid agentExtensions metadata in ${context}: schema validation failed`,
    );
    return Option.none<ReadonlyArray<AgentExtensionRecommendation>>();
  }
  return Option.some<ReadonlyArray<AgentExtensionRecommendation>>(decoded.success.agentExtensions);
});

/**
 * A package-manager directory: the environment variable that relocates it
 * when set, otherwise `relativePath` below the OS account home.
 */
export const envOrHomePath = (name: string, relativePath: string) =>
  Effect.flatMap(osHomeDirectory, (home) => envWithDefault(name, `${home}/${relativePath}`));

export const readFileOptional = (filePath: string) =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    return yield* fs.readFileString(filePath).pipe(Effect.option);
  });

/** The JSON value of `content`, or `none` when it is not JSON; diagnoses nothing. */
export const parseJson: (content: string) => Option.Option<unknown> = Option.liftThrowable(
  (content: string): unknown => JSON.parse(content),
);

/** Diagnose JSON read from `context` that does not parse. */
export const logMalformedJson = (context: string) =>
  Effect.logWarning(`Malformed JSON in ${context}, skipping`);

export const parseJsonOptional = (content: string, context: string) =>
  Effect.gen(function* () {
    const result = parseJson(content);
    if (Option.isNone(result)) {
      yield* logMalformedJson(context);
      return Option.none<unknown>();
    }
    return result;
  });

/** A directory listing that every package of one read may see; frozen. */
export const sharedListing = (entries: ReadonlyArray<string>): ReadonlyArray<string> =>
  Object.freeze([...entries]);

/**
 * A lookup that evaluates `compute(key)` at most once per key while the lookup
 * is in use. Concurrent callers of one key await the same evaluation, and an
 * evaluation that every caller abandoned is not kept. The evaluation runs in
 * its first caller's context, so it must stay silent: callers log their own
 * diagnostics from the value it returns.
 */
export const sharedPerKey = <A, E, R>(compute: (key: string) => Effect.Effect<A, E, R>) =>
  Effect.sync(() => {
    const evaluations = new Map<string, Effect.Effect<A, E, R>>();
    return (key: string): Effect.Effect<A, E, R> =>
      Effect.gen(function* () {
        const existing = evaluations.get(key);
        if (existing !== undefined) return yield* existing;
        const created = yield* Effect.cached(compute(key));
        const selected = evaluations.get(key) ?? created;
        evaluations.set(key, selected);
        return yield* selected;
      });
  });

/**
 * A reader whose packages share inputs that `prepare` reads once per read.
 * Reading one package on its own opens a read for that package alone.
 */
export const preparedReader = (
  type: PackageType,
  prepare: Effect.Effect<PackageReader["read"]>,
): PackageReader => ({
  type,
  prepare,
  read: (pkg) => Effect.flatMap(prepare, (read) => read(pkg)),
});
