import * as Option from "effect/Option";
import { extractFlags } from "../../../cli-flags/index.js";
import { run } from "../../../runtime/index.js";
import { handlePublish } from "./handler.js";

export interface PublishCommandArgs {
  extensions: string[];
  registry: string | undefined;
}

export const publishCommand = {
  handler: async (argv: PublishCommandArgs & Record<string, unknown>) => {
    await run(
      handlePublish({
        extensions: argv.extensions,
        registry: Option.fromUndefinedOr(argv.registry),
      }),
      {
        flags: extractFlags(argv),
        workspace: {
          scope: "project",
          agents: Option.none<readonly string[]>(),
        },
        command: "skills publish",
      },
    );
  },
};
