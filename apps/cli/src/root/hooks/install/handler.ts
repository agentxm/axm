/**
 * `axm hooks install`.
 */

import * as Effect from "effect/Effect";
import * as Option from "effect/Option";

import { isNonInteractiveOptional } from "../../../cli-flags/index.js";
import { runInstallCommand } from "../../shared/install-command.js";

export interface InstallHookHandlerArgs {
  readonly source: string;
}

export const handleInstallHook = (
  args: InstallHookHandlerArgs,
  flags: { readonly force: boolean; readonly preview: boolean },
) =>
  Effect.gen(function* () {
    const nonInteractive = yield* isNonInteractiveOptional;
    return yield* runInstallCommand({
      command: "hooks.install",
      preview: flags.preview,
      force: flags.force,
      request: {
        type: Option.some("hook"),
        subject: { kind: "source", source: args.source },
        names: [],
        all: false,
        reinstall: flags.force,
        localName: Option.none(),
        env: [],
        nonInteractive,
        planName: "Install hooks",
        planDescription: Option.none(),
      },
      recoveryCommand: ["hooks", "install"],
      recoveryLocators: [args.source],
      suggestions: [{ description: "Inspect installed hooks packages", cmd: "axm hooks list" }],
      noOpMessage: "No hooks packages installed.",
    });
  });
