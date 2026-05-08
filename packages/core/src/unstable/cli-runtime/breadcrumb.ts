import * as Schema from "effect/Schema";

export const BreadcrumbSchema = Schema.Struct({
  task: Schema.String,
  description: Schema.String,
  command: Schema.optional(Schema.Array(Schema.String)),
  cmd: Schema.optional(Schema.String),
}).annotate({
  identifier: "Breadcrumb",
  title: "Breadcrumb",
  description: "Suggested follow-up task for CLI output. May include a runnable command.",
});

export type Breadcrumb = typeof BreadcrumbSchema.Type;
