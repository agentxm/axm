import * as Schema from "effect/Schema";

const RunnableAxmCommandPattern = /`?axm\s/;

export const BreadcrumbSchema = Schema.Struct({
  description: Schema.String,
  cmd: Schema.optional(Schema.String),
  url: Schema.optional(Schema.String),
})
  .check(
    Schema.makeFilter((breadcrumb) =>
      RunnableAxmCommandPattern.test(breadcrumb.description) && breadcrumb.cmd === undefined
        ? { path: ["cmd"], issue: "`cmd` is required when description mentions an axm command" }
        : undefined,
    ),
  )
  .annotate({
    identifier: "Breadcrumb",
    title: "Breadcrumb",
    description: "Suggested follow-up. Optional shell command or URL.",
  });

export type Breadcrumb = typeof BreadcrumbSchema.Type;
