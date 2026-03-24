import * as Effect from "effect/Effect";

import { handleError } from "./handle-error.js";
import { withGracefulShutdown } from "./graceful-shutdown.js";
import { resolveFormatFromArgv } from "./resolve-format.js";

export const runCliMain = async (
  execute: (args: ReadonlyArray<string>) => Effect.Effect<void, unknown, never>,
  options?: {
    readonly args?: ReadonlyArray<string> | undefined;
  },
): Promise<void> => {
  const args = options?.args ?? process.argv.slice(2);
  const format = resolveFormatFromArgv(args);

  try {
    await Effect.runPromise(withGracefulShutdown(execute(args)));
  } catch (error) {
    handleError(error, format);
  }
};
