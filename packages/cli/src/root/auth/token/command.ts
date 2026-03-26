import { Command } from "effect/unstable/cli";

import { withRuntime } from "../../../runtime.js";
import { withArgvTracking } from "@axm.sh/core/unstable/cli-runtime";
import { handleToken } from "./handler.js";

const tokenConfig = {} as const;

export const tokenCommand = Command.make("token", tokenConfig, () =>
  withRuntime(handleToken(), { command: "auth token" }),
).pipe(
  withArgvTracking(tokenConfig),
  Command.withDescription("Output current auth token to stdout"),
  Command.withExamples([
    { command: "axm token", description: "Output current auth token to stdout" },
  ]),
);
