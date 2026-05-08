import * as Schema from "effect/Schema";

export const BreadcrumbSchema = Schema.Struct({
  task: Schema.String,
  description: Schema.String,
  command: Schema.optional(Schema.Array(Schema.String)),
  cmd: Schema.optional(Schema.String),
})
  .check(
    Schema.makeFilter((crumb) =>
      crumb.command !== undefined || crumb.cmd !== undefined
        ? undefined
        : "Expected breadcrumb command or cmd",
    ),
  )
  .annotate({
    identifier: "Breadcrumb",
    title: "Breadcrumb",
    description: "Suggested follow-up task for CLI output.",
  });

export type Breadcrumb = typeof BreadcrumbSchema.Type;
