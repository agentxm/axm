/**
 * `axm rules install`.
 */

import * as Effect from "effect/Effect";
import * as Option from "effect/Option";

import { isNonInteractiveOptional } from "../../../cli-flags/index.js";
import { runInstallCommand } from "../../shared/install-command.js";

export interface InstallRuleHandlerArgs {
  readonly source: string;
}

export const handleInstallRule = (
  args: InstallRuleHandlerArgs,
  flags: { readonly force: boolean; readonly preview: boolean },
) =>
  Effect.gen(function* () {
    const nonInteractive = yield* isNonInteractiveOptional;
    return yield* runInstallCommand({
      command: "rules.install",
      preview: flags.preview,
      force: flags.force,
      request: {
        type: Option.some("rule"),
        subject: { kind: "source", source: args.source },
        names: [],
        all: false,
        reinstall: flags.force,
        localName: Option.none(),
        env: [],
        nonInteractive,
        planName: "Install rules",
        planDescription: Option.none(),
      },
      recoveryCommand: ["rules", "install"],
      recoveryLocators: [args.source],
      suggestions: [{ description: "Inspect installed rules", cmd: "axm rules list" }],
      noOpMessage: "No rules installed.",
    });
  });
