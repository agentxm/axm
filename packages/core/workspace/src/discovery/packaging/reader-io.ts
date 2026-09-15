/**
 * Shared reader I/O helpers for package-compatibility discovery.
 *
 * @experimental This API is unstable and may change without notice.
 */

import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Option from "effect/Option";
import * as Schema from "effect/Schema";
import { AxmPackageMetaSchema } from "@agentxm/registry-client";
import { PackageUrlSchema } from "@agentxm/extension-model/unstable/packaging/package-url";

export const decodePurl = Schema.decodeUnknownSync(PackageUrlSchema);

export const decodeAxmMeta = Schema.decodeUnknownResult(AxmPackageMetaSchema);

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
