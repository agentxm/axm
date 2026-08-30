import * as Schema from "effect/Schema";

const AxmCommandPattern = /^axm\s+\S/;
const ShellCompositionPattern = /(?:&&|\|\||[;&|<>`(){}]|\$\(|\$\{)/;

const hasControlCharacter = (value: string): boolean =>
  Array.from(value).some((character) => {
    const codePoint = character.codePointAt(0);
    return codePoint !== undefined && (codePoint <= 0x1f || codePoint === 0x7f);
  });

/**
 * Whether a command-bearing suggestion is one inert AXM invocation.
 *
 * This is deliberately more conservative than a shell parser. Suggested
 * commands are display data, not execution authority, and accepting shell
 * composition here would make copy/paste turn untrusted Registry data into a
 * second command.
 */
export const isSafeSuggestedAxmCommand = (command: string): boolean =>
  AxmCommandPattern.test(command) &&
  !hasControlCharacter(command) &&
  !ShellCompositionPattern.test(command);

/** Retain an action's explanation and URL while removing an unsafe command. */
export const sanitizeSuggestedAction = (suggestion: SuggestedAction): SuggestedAction =>
  suggestion.cmd === undefined || isSafeSuggestedAxmCommand(suggestion.cmd)
    ? suggestion
    : {
        description: suggestion.description,
        ...(suggestion.url === undefined ? {} : { url: suggestion.url }),
      };

export const SuggestedActionSchema = Schema.Struct({
  description: Schema.String,
  cmd: Schema.optional(Schema.String),
  url: Schema.optional(Schema.String),
})
  .check(
    Schema.makeFilter((suggestion) =>
      suggestion.cmd !== undefined && !isSafeSuggestedAxmCommand(suggestion.cmd)
        ? {
            path: ["cmd"],
            issue: "suggested commands must be one AXM invocation without shell composition",
          }
        : undefined,
    ),
  )
  .annotate({
    identifier: "SuggestedAction",
    title: "SuggestedAction",
    description: "Suggested follow-up. Optional inert AXM command or URL.",
  });

export type SuggestedAction = typeof SuggestedActionSchema.Type;
