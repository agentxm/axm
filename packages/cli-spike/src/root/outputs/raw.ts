import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import * as Schema from "effect/Schema";
import { Argument, Command } from "effect/unstable/cli";

import { CliRenderer } from "@axm.sh/core/unstable/cli-renderer";
import { withArgvTracking } from "@axm.sh/core/unstable/cli-runtime";

import { annotateCommandMeta, spikeCommandMeta } from "../../command-meta.js";
import { emitDataResult } from "../../json-output.js";
import { withRuntime } from "../../runtime.js";

const RawOutputSchema = Schema.Struct({
  content: Schema.String,
  lines: Schema.Array(Schema.String),
});

const rawConfig = {
  content: Argument.string("content").pipe(
    Argument.withDescription("Raw text to emit"),
    Argument.optional,
  ),
} as const;

const commandMeta = spikeCommandMeta("outputs raw", { json: true });

const defaultContent = ["Name: axm-spike", "Version: 0.0.1", "Pets: Mochi, Pickles, Juniper"].join(
  "\n",
);

const handleRaw = (args: { readonly content: Option.Option<string> }) =>
  Effect.gen(function* () {
    const renderer = yield* CliRenderer;
    const content = Option.getOrElse(args.content, () => defaultContent);
    const data = {
      content,
      lines: content.split("\n"),
    };

    if (yield* emitDataResult("outputs.raw", data, RawOutputSchema)) {
      return;
    }

    yield* renderer.raw(content);
  });

export const rawCommand = Command.make("raw", rawConfig, ({ content }) =>
  handleRaw({ content }).pipe(withRuntime(commandMeta)),
).pipe(
  withArgvTracking(rawConfig),
  annotateCommandMeta(commandMeta),
  Command.withDescription("Render raw text with a structured JSON fallback"),
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
      description: "Inspect the JSON document for the raw output",
    },
  ]),
);
