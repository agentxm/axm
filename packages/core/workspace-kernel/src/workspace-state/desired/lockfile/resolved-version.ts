import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";
import { VersionSchema } from "@agentxm/extension-model/unstable/version-constraints";
import { LockfileResolvedVersionInvalid } from "./errors.js";

const decodeVersion = Schema.decodeUnknownEffect(VersionSchema);

export const validateExactResolvedVersion = (field: string, value: string) =>
  decodeVersion(value).pipe(
    Effect.asVoid,
    Effect.mapError((cause) => new LockfileResolvedVersionInvalid({ field, value, cause })),
  );
