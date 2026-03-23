import { run } from "../../../runtime/index.js";
import { extractFlags } from "../../../cli-flags/index.js";
import { handleLogin } from "./handler.js";

export type LoginCommandArgs = Record<string, never>;

export const makeLoginEffect = () => handleLogin();

export const loginCommand = {
  handler: async (argv: LoginCommandArgs & Record<string, unknown>) => {
    await run(makeLoginEffect(), { flags: extractFlags(argv), command: "auth login" });
  },
};
