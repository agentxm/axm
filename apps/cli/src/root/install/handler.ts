/**
 * `axm install` — the root install route.
 *
 * With no source it reinstalls what the workspace declares; with one it hands
 * the source to the install use case, which reads the type from a registry
 * FQN or detects it by opening a locator.
 */

import * as Effect from "effect/Effect";
import * as Option from "effect/Option";

import { ReleaseAgePosture } from "@agentxm/extension-resolution";
import { recoverySwitch } from "@agentxm/workspace-operations";

import { isNonInteractiveOptional } from "../../cli-flags/index.js";
import { runInstallCommand } from "../shared/install-command.js";
import { handleWorkspaceInstall } from "./workspace-install-handler.js";

export interface RootInstallFlags {
  readonly force: boolean;
  readonly preview: boolean;
}

export interface RootInstallHandlerArgs extends RootInstallFlags {
  readonly source: Option.Option<string>;
}

export const handleInstall = (args: RootInstallHandlerArgs) =>
  Option.match(args.source, {
    onNone: () =>
      handleWorkspaceInstall({
        command: "install",
        type: Option.none(),
        planName: "Install configured extensions",
        planDescription: Option.some("Install configured workspace extensions"),
        flags: { force: args.force, preview: args.preview },
      }),
    onSome: (source) =>
      Effect.gen(function* () {
        const nonInteractive = yield* isNonInteractiveOptional;
        const ignoreReleaseAge = (yield* ReleaseAgePosture) === "ignore";
        return yield* runInstallCommand({
          command: "install",
          preview: args.preview,
          force: args.force,
          request: {
            type: Option.none(),
            subject: { kind: "source", source },
            // A root locator install takes everything the source offers: the
            // person named a place, not a selection inside it.
            names: [],
            all: true,
            reinstall: args.force,
            localName: Option.none(),
            env: [],
            nonInteractive,
            planName: "Install configured extensions",
            planDescription: Option.none(),
          },
          recoveryCommand: ["install"],
          recoveryLocators: [source],
          recoveryArguments: [recoverySwitch("--ignore-release-age", ignoreReleaseAge)],
          suggestions: [{ description: "Inspect workspace facts", cmd: "axm lint" }],
          noOpMessage: "No extensions installed.",
        });
      }),
  });
