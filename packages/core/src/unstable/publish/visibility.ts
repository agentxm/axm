/**
 * Authoritative visibility resolved for a publish operation.
 *
 * @experimental This API is unstable and may change without notice.
 */

import * as Schema from "effect/Schema";

const PublishVisibilityValueSchema = Schema.Literals(["public", "private"]);

export const PublishVisibilitySchema = Schema.Union([
  Schema.Struct({
    value: PublishVisibilityValueSchema,
    disposition: Schema.Literal("establish"),
    source: Schema.Literals(["explicit", "account", "platform"]),
  }),
  Schema.Struct({
    value: PublishVisibilityValueSchema,
    disposition: Schema.Literal("preserve"),
    source: Schema.Literal("existing"),
  }),
]).annotate({
  identifier: "PublishVisibility",
  title: "Publish Visibility",
  description:
    "Complete operation-time visibility resolved for a proposed or completed publication.",
});

/** @experimental */
export type PublishVisibility = Schema.Schema.Type<typeof PublishVisibilitySchema>;
