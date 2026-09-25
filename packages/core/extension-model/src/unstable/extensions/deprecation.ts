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
  description: "Optional publisher notes for consumers of a deprecated extension.",
});

export const DeprecationReasons = ["superseded", "obsolete", "unmaintained", "other"] as const;

export const DeprecationReasonSchema = Schema.Literals(DeprecationReasons).annotate({
  identifier: "DeprecationReason",
  description: "The publisher's structured reason for deprecating an extension.",
});

export type DeprecationReason = typeof DeprecationReasonSchema.Type;

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
    reason: Schema.Literal("superseded"),
    message: Schema.optional(DeprecationMessageSchema),
    replacement: DeprecationReplacementSchema,
  }),
  Schema.Struct({
    deprecatedAt: DateTimeUtcSchema,
    reason: Schema.Literal("obsolete"),
    message: DeprecationMessageSchema,
    replacement: Schema.optional(Schema.Never),
  }),
  Schema.Struct({
    deprecatedAt: DateTimeUtcSchema,
    reason: Schema.Literal("unmaintained"),
    message: Schema.optional(DeprecationMessageSchema),
    replacement: Schema.optional(DeprecationReplacementSchema),
  }),
  Schema.Struct({
    deprecatedAt: DateTimeUtcSchema,
    reason: Schema.Literal("other"),
    message: DeprecationMessageSchema,
    replacement: Schema.optional(DeprecationReplacementSchema),
  }),
]).annotate({
  identifier: "DeprecationView",
  description: "Canonical authorization-safe identity deprecation guidance.",
});

export type DeprecationReplacement = typeof DeprecationReplacementSchema.Type;
export type DeprecationView = typeof DeprecationViewSchema.Type;
