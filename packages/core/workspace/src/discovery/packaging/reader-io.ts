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
export const decodeAgentExtensions = Effect.fn("packaging.decodeAgentExtensions")(function* (
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
