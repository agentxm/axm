import * as Schema from "effect/Schema";

const RunnableAxmCommandPattern = /`?axm\s/;

export const SuggestedActionSchema = Schema.Struct({
  description: Schema.String,
  cmd: Schema.optional(Schema.String),
  url: Schema.optional(Schema.String),
})
  .check(
    Schema.makeFilter((suggestion) =>
      RunnableAxmCommandPattern.test(suggestion.description) && suggestion.cmd === undefined
        ? { path: ["cmd"], issue: "`cmd` is required when description mentions an axm command" }
        : undefined,
    ),
  )
  .annotate({
    identifier: "SuggestedAction",
    title: "SuggestedAction",
    description: "Suggested follow-up. Optional shell command or URL.",
  });

export type SuggestedAction = typeof SuggestedActionSchema.Type;
