import * as Option from "effect/Option";
import { extractFlags } from "../../../cli-flags/index.js";
import { run } from "../../../runtime/index.js";
import { type WorkspaceScope, resolveWorkspaceScope } from "../../../workspace/scope.js";
import { handleRename } from "./handler.js";

export interface RenameCommandArgs {
  "old-name": string;
  "new-name": string;
  scope: WorkspaceScope;
}

export const renameCommand = {
  handler: async (argv: RenameCommandArgs & Record<string, unknown>) => {
    const scope = resolveWorkspaceScope(argv.scope);
    await run(
      handleRename({
        oldName: argv["old-name"],
        newName: argv["new-name"],
      }),
      {
        flags: extractFlags(argv),
        workspace: {
          scope,
          agents: Option.none(),
        },
        command: "skills rename",
      },
    );
  },
};
