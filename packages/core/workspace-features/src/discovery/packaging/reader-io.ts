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

export const parseJsonOptional = (content: string, context: string) =>
  Effect.gen(function* () {
    const result = yield* Effect.try({
      try: (): unknown => JSON.parse(content),
      catch: () => ({ _tag: "JsonParseError" as const }),
    }).pipe(Effect.option);

    if (Option.isNone(result)) {
      yield* Effect.logWarning(`Malformed JSON in ${context}, skipping`);
      return Option.none<unknown>();
    }

    return Option.some(result.value);
  });
