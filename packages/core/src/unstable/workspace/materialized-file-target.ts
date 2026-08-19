import * as Schema from "effect/Schema";
import { RelativePathSchema } from "../utils/path-types.js";

/**
 * Ephemeral result of one Rule or Hook projection reconciliation. This is the
 * extensibility axis for placement and materialization mode; grammar-level
 * changes belong to the managed-file ownership contract referenced by
 * `projection/marker-grammar.ts`.
 */
export const MaterializedFileTargetSchema = Schema.Struct({
  target: RelativePathSchema,
  mode: Schema.Literals(["sync-once", "sync-always", "managed-region"]),
  region: Schema.optional(Schema.NonEmptyString),
});

export type MaterializedFileTarget = typeof MaterializedFileTargetSchema.Type;
