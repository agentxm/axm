import * as Schema from "effect/Schema";
import { RelativePathSchema } from "../utils/path-types.js";

/** Ephemeral result of one Rule or Hook projection reconciliation. */
export const MaterializedFileTargetSchema = Schema.Struct({
  target: RelativePathSchema,
  mode: Schema.Literals(["sync-once", "sync-always", "managed-region"]),
  region: Schema.optional(Schema.NonEmptyString),
});

export type MaterializedFileTarget = typeof MaterializedFileTargetSchema.Type;
