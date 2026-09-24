/**
 * Presentation of Effect CLI's built-in output.
 *
 * `--help`, `--version`, a parent command invoked without a subcommand, and
 * the help shown for a usage error all reach the process as strings on the
 * console the application provides. AXM's formatter makes each of them a
 * machine document (see `formatter.ts`); this module reads that document back
 * and presents it through the Screen, so the styling and width of built-in
 * output are the Screen's per-stream decisions like every other document's.
 * Machine mode writes the document as it was formatted. Console text that is
 * not a formatter document is not a built-in and passes through as written.
 */

import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import type { CliError } from "effect/unstable/cli";

import { appErrorDoc, makeAppError } from "./app-error/index.js";
import { decodeFormatterDocument, type OutputFormat } from "./cli-runtime/index.js";
import { commandHelpDoc } from "./root/help/command-help-view.js";
import { Screen, type OutputWriteFailed } from "./screen/index.js";

export const presentBuiltInOutput = (
  output: string,
  options: {
    /** The parser's help request, when the invocation ended in one. */
    readonly helpRequest: CliError.ShowHelp | undefined;
    readonly format: OutputFormat;
  },
): Effect.Effect<void, OutputWriteFailed, Screen> =>
  Effect.gen(function* () {
    if (output.length === 0) return;
    const screen = yield* Screen;
    const usageError = options.helpRequest !== undefined && options.helpRequest.errors.length > 0;
    const document = decodeFormatterDocument(output);

    if (options.format === "json") {
      // The usage error's machine envelope is the error handler's; the help
      // document it was shown with has no machine channel.
      if (!usageError) yield* screen.result([{ _tag: "raw", content: output }]);
      return;
    }

    if (Option.isNone(document)) {
      return yield* (usageError ? screen.note : screen.result)([{ _tag: "raw", content: output }]);
    }

    switch (document.value.type) {
      case "version":
        return yield* screen.result([{ _tag: "raw", content: `${document.value.version}\n` }]);
      case "help": {
        const doc = commandHelpDoc(document.value);
        if (options.helpRequest === undefined || !usageError) return yield* screen.result(doc);

        // A usage error narrates the help, then the error the way every
        // other usage error is painted.
        yield* screen.note(doc);
        yield* screen.note(
          appErrorDoc(
            makeAppError({
              code: "usage",
              detail: options.helpRequest.errors.map((error) => error.message).join("; "),
            }),
          ),
        );
      }
    }
  });
