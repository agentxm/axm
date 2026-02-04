/**
 * Remove command yargs definition - wires handler to `axm skills remove`.
 *
 * @experimental This API is unstable and may change without notice.
 */

import * as Effect from "effect/Effect"
import type { CommandModule } from "yargs";
import { handleRemove } from "./handler.js";

export const removeCommand: CommandModule<{}, {}> = {
  command: "remove",
  describe: "Remove installed skills (placeholder)",
  builder: (yargs) => yargs,
  handler: async () => {
    await Effect.runPromise(handleRemove());
  },
};
