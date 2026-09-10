/**
 * Identity deprecation vocabulary carried by resolved extension references.
 *
 * A registry-resolved ref commits to the deprecation evidence captured at
 * resolution time, so the view lives with the extension identity vocabulary.
 * Publisher-management composites (transitions, management views) stay in
 * `@agentxm/registry-protocol`.
 *
 * @experimental This API is unstable and may change without notice.
 */

import * as Schema from "effect/Schema";
import { DateTimeUtcSchema } from "../date-time.js";
import { ExtensionFqnSchema } from "./common.js";

const DeprecationMessageSchema = Schema.String.check(
  Schema.isMinLength(1),
  Schema.isMaxLength(500),
).annotate({
  identifier: "DeprecationMessage",
  description: "Concise publisher guidance for consumers of a deprecated extension.",
});

export const DeprecationReplacementSchema = Schema.Union([
  Schema.Struct({
    status: Schema.Literal("available"),
    fqn: ExtensionFqnSchema,
  }),
  Schema.Struct({
    status: Schema.Literal("unavailable"),
    fqn: Schema.optional(ExtensionFqnSchema),
  }),
]).annotate({
  identifier: "DeprecationReplacement",
  description: "Authorization-safe current availability of a recorded replacement identity.",
});

export const DeprecationViewSchema = Schema.Union([
  Schema.Struct({
    deprecatedAt: DateTimeUtcSchema,
    message: DeprecationMessageSchema,
    replacement: Schema.optional(DeprecationReplacementSchema),
  }),
  Schema.Struct({
    deprecatedAt: DateTimeUtcSchema,
    message: Schema.optional(DeprecationMessageSchema),
    replacement: DeprecationReplacementSchema,
  }),
]).annotate({
  identifier: "DeprecationView",
  description: "Canonical authorization-safe identity deprecation guidance.",
});

export type DeprecationReplacement = typeof DeprecationReplacementSchema.Type;
export type DeprecationView = typeof DeprecationViewSchema.Type;
