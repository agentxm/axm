import * as Schema from "effect/Schema";

const RunnableAxmCommandPattern = /`?axm\s/;
const AxmCommandPattern = /^axm\s/;
const ShellGroupingMetacharPattern = /[()]/;

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
  .check(
    Schema.makeFilter((suggestion) =>
      suggestion.cmd !== undefined &&
      AxmCommandPattern.test(suggestion.cmd) &&
      ShellGroupingMetacharPattern.test(suggestion.cmd)
        ? { path: ["cmd"], issue: "axm command suggestions must be shell-runnable" }
        : undefined,
    ),
  )
  .annotate({
    identifier: "SuggestedAction",
    title: "SuggestedAction",
    description: "Suggested follow-up. Optional shell command or URL.",
  });

export type SuggestedAction = typeof SuggestedActionSchema.Type;
