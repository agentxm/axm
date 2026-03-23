import * as Option from "effect/Option";
import { extractFlags } from "../../../cli-flags/index.js";
import { run } from "../../../runtime/index.js";
import { handlePublishPack } from "./handler.js";

export interface PublishPackCommandArgs {
  pack: string;
  registry: string | undefined;
  "include-dependencies": boolean;
}

export const publishPackCommand = {
  handler: async (argv: PublishPackCommandArgs & Record<string, unknown>) => {
    await run(
      handlePublishPack({
        pack: argv.pack,
        registry: Option.fromUndefinedOr(argv.registry),
        includeDependencies: argv["include-dependencies"],
      }),
      {
        flags: extractFlags(argv),
        workspace: {
          scope: "project",
          agents: Option.none(),
        },
        command: "packs publish",
      },
    );
  },
};
