import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import * as Schema from "effect/Schema";
import { Argument, Command } from "effect/unstable/cli";

import { CliRenderer } from "@agentxm/client-core/unstable/cli-renderer";
import { withArgvTracking } from "@agentxm/client-core/unstable/cli-runtime";

import { withRuntime } from "../../runtime.js";

export const RawOutputDataSchema = Schema.Struct({
  content: Schema.String,
  lines: Schema.Array(Schema.String),
});

export type RawOutputData = typeof RawOutputDataSchema.Type;
const OutputsRawDocumentFields = {
  data: RawOutputDataSchema,
} satisfies Schema.Struct.Fields;

export const OutputsRawOutputSchema = Schema.Struct(OutputsRawDocumentFields);
export type OutputsRawOutput = typeof OutputsRawOutputSchema.Type;

const rawConfig = {
  content: Argument.string("content").pipe(
    Argument.withDescription("Raw text to emit"),
    Argument.optional,
  ),
} as const;

const defaultContent = ["Name: axm-spike", "Version: 0.0.1", "Pets: Mochi, Pickles, Juniper"].join(
  "\n",
);

export const handleRaw = (args: { readonly content: Option.Option<string> }) =>
  Effect.gen(function* () {
    const renderer = yield* CliRenderer;
    const content = Option.getOrElse(args.content, () => defaultContent);
    const data: RawOutputData = {
      content,
      lines: content.split("\n"),
    };

    if (yield* renderer.result({ data }, OutputsRawOutputSchema)) {
      return;
    }

    yield* renderer.raw(content);
  });

export const rawCommand = Command.make("raw", rawConfig, ({ content }) =>
  handleRaw({ content }).pipe(withRuntime("outputs raw")),
).pipe(
  withArgvTracking(rawConfig),
  Command.withDescription("Render raw text. JSON output includes data.content and data.lines."),
  Command.withExamples([
    {
      command: "axm-spike outputs raw",
      description: "Render the default raw text sample",
    },
    {
      command: 'axm-spike outputs raw "build=ok"',
      description: "Render custom raw text",
    },
    {
      command: "axm-spike outputs raw --json",
      description: "Emit { ok, data: { content, lines } }",
    },
  ]),
);
