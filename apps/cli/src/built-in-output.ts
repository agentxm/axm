/** Present native Effect CLI events through AXM's Screen. */
import * as Effect from "effect/Effect";
import * as Context from "effect/Context";
import type { CliError, CliOutput } from "effect/cli";
import { toJsonHelpDoc, type OutputFormat } from "./cli-runtime/index.js";
import { LearnMore } from "./formatter.js";
import { commandHelpDoc } from "./root/help/command-help-view.js";
import { Screen, type OutputWriteFailed } from "./screen/index.js";

export const presentBuiltInOutput = (
  event: CliOutput.Presenter.Event,
  options: {
    readonly helpRequest: CliError.ShowHelp | undefined;
    readonly format: OutputFormat;
  },
): Effect.Effect<void, OutputWriteFailed, Screen> =>
  Effect.gen(function* () {
    const screen = yield* Screen;
    const usageError =
      event._tag === "InvalidInvocation" ||
      (options.helpRequest !== undefined && options.helpRequest.errors.length > 0);
    const document =
      event._tag === "Version"
        ? { type: "version", name: event.name, version: event.version }
        : toJsonHelpDoc(event.helpDoc, {
            learnMore: Context.get(event.helpDoc.annotations, LearnMore),
          });
    if (options.format === "json") {
      if (!usageError)
        yield* screen.result([{ _tag: "raw", content: `${JSON.stringify(document, null, 2)}\n` }]);
      return;
    }
    if (event._tag === "Version") {
      return yield* screen.result([{ _tag: "raw", content: `${event.version}\n` }]);
    }
    const doc = commandHelpDoc(
      toJsonHelpDoc(event.helpDoc, {
        learnMore: Context.get(event.helpDoc.annotations, LearnMore),
      }),
    );
    yield* (usageError ? screen.note : screen.result)(doc);
  });
