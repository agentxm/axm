import { run } from "../../../runtime/index.js";
import { extractFlags } from "../../../cli-flags/index.js";
import { handleToken } from "./handler.js";

export type TokenCommandArgs = Record<string, never>;

export const makeTokenEffect = () => handleToken();

export const tokenCommand = {
  handler: async (argv: TokenCommandArgs & Record<string, unknown>) => {
    await run(makeTokenEffect(), { flags: extractFlags(argv), command: "auth token" });
  },
};
