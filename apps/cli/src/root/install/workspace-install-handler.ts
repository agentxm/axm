/**
 * `axm install` and `axm <type> install` with no source: bring the workspace
 * to the state its settings already describe.
 *
 * Every type command routes here when the person named no source, so the
 * command words a confirmation-recovery line reproduces are derived from the
 * type rather than repeated at each call site.
 */

import * as Effect from "effect/Effect";
import * as Option from "effect/Option";

import { ReleaseAgePosture } from "@agentxm/extension-resolution";
import type { InstallableExtensionType } from "@agentxm/extension-model/unstable/extensions/installable-types";
import { recoverySwitch } from "@agentxm/workspace-operations";

import { isNonInteractiveOptional } from "../../cli-flags/index.js";
import { runInstallCommand } from "../shared/install-command.js";

export type WorkspaceInstallableType = InstallableExtensionType;

const configuredInstallCommand = (
  type: Option.Option<WorkspaceInstallableType>,
): ReadonlyArray<string> =>
  Option.match(type, {
    onNone: () => ["install"],
    onSome: (value) => {
      switch (value) {
        case "skill":
          return ["skills", "install"];
        case "mcp-server":
          return ["mcps", "install"];
        case "subagent":
          return ["subagents", "install"];
        case "rule":
          return ["rules", "install"];
        case "hook":
          return ["hooks", "install"];
        case "knowledge":
          return ["knowledge", "install"];
        case "pack":
          return ["packs", "install"];
      }
    },
  });

export interface WorkspaceInstallFlags {
  readonly preview: boolean;
  readonly force?: boolean;
}

export interface WorkspaceInstallHandlerArgs {
  readonly command: string;
  readonly type: Option.Option<WorkspaceInstallableType>;
  readonly planName: string;
  readonly planDescription: Option.Option<string>;
  readonly flags: WorkspaceInstallFlags;
}

/** Install every enabled configured entry, or every one of a single type. */
export const handleWorkspaceInstall = (args: WorkspaceInstallHandlerArgs) =>
  Effect.gen(function* () {
    const nonInteractive = yield* isNonInteractiveOptional;
    const ignoreReleaseAge = (yield* ReleaseAgePosture) === "ignore";
    return yield* runInstallCommand({
      command: args.command,
      preview: args.flags.preview,
      force: args.flags.force === true,
      request: {
        type: args.type,
        subject: { kind: "configured" },
        names: [],
        all: false,
        reinstall: args.flags.force === true,
        localName: Option.none(),
        env: [],
        nonInteractive,
        planName: args.planName,
        planDescription: args.planDescription,
      },
      recoveryCommand: configuredInstallCommand(args.type),
      recoveryLocators: [],
      recoveryArguments: [recoverySwitch("--ignore-release-age", ignoreReleaseAge)],
      suggestions: [{ description: "Inspect workspace facts", cmd: "axm lint" }],
      noOpMessage: "No configured extensions.",
    });
  });
