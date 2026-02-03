/**
 * Remove command yargs definition - wires handler to `axm skills remove`.
 *
 * @experimental This API is unstable and may change without notice.
 */

import { Effect } from "effect";
import type { CommandModule } from "yargs";
import { handleRemove } from "./handler.js";

// biome-ignore lint/complexity/noBannedTypes: {} is the yargs convention for no parent args
export const removeCommand: CommandModule<{}, {}> = {
  command: "remove",
  describe: "Remove installed skills (placeholder)",
  builder: (yargs) => yargs,
  handler: async () => {
    await Effect.runPromise(handleRemove());
  },
};
