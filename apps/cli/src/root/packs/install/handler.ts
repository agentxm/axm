/**
 * `axm packs install`.
 */

import * as Effect from "effect/Effect";
import * as Option from "effect/Option";

import { isNonInteractiveOptional } from "../../../cli-flags/index.js";
import { handleWorkspaceInstall } from "../../install/workspace-install-handler.js";
import { runInstallCommand } from "../../shared/install-command.js";

export interface InstallPackFlags {
  readonly force: boolean;
  readonly preview: boolean;
}

export interface PackInstallHandlerArgs {
  readonly source: Option.Option<string>;
}

export const handleInstallPack = (args: PackInstallHandlerArgs, flags: InstallPackFlags) =>
  Effect.gen(function* () {
    if (Option.isNone(args.source)) {
      return yield* handleWorkspaceInstall({
        command: "packs.install",
        type: Option.some("pack"),
        planName: "Install packs",
        planDescription: Option.some("Install configured packs"),
        flags,
      });
    }

    const nonInteractive = yield* isNonInteractiveOptional;
    return yield* runInstallCommand({
      command: "packs.install",
      preview: flags.preview,
      force: flags.force,
      request: {
        type: Option.some("pack"),
        subject: { kind: "source", source: args.source.value },
        names: [],
        all: false,
        reinstall: flags.force,
        localName: Option.none(),
        env: [],
        nonInteractive,
        planName: "Install packs",
        planDescription: Option.none(),
      },
      recoveryCommand: ["packs", "install"],
      recoveryLocators: [args.source.value],
      suggestions: [{ description: "Inspect installed packs", cmd: "axm packs list" }],
      noOpMessage: "No packs installed.",
    });
  });
