/**
 * `axm subagents install`.
 */

import * as Effect from "effect/Effect";
import * as Option from "effect/Option";

import { publicRecoveryValue, recoveryOption, recoverySwitch } from "@agentxm/workspace-operations";

import { makeAppError } from "../../../app-error/index.js";
import { isNonInteractiveOptional } from "../../../cli-flags/index.js";
import { handleWorkspaceInstall } from "../../install/workspace-install-handler.js";
import { runInstallCommand } from "../../shared/install-command.js";

export interface InstallSubagentHandlerArgs {
  readonly source: Option.Option<string>;
  readonly subagents: ReadonlyArray<string>;
  readonly all: boolean;
}

export interface InstallSubagentFlags {
  readonly force: boolean;
  readonly preview: boolean;
}

const validateWorkspaceInstallArgs = (args: InstallSubagentHandlerArgs) =>
  Effect.gen(function* () {
    if (args.all) {
      return yield* makeAppError({
        code: "usage",
        detail: "The --all flag requires a source for subagents install",
        suggestions: [
          {
            description: "Install all subagents from a source, or omit `--all`.",
            cmd: "axm subagents install <source> --all",
          },
        ],
      });
    }
    if (args.subagents.length > 0) {
      return yield* makeAppError({
        code: "usage",
        detail: "The --subagent flag requires a source for subagents install",
        suggestions: [
          {
            description: "Install a named subagent from a source, or omit `--subagent`.",
            cmd: "axm subagents install <source> --subagent <name>",
          },
        ],
      });
    }
  });

export const handleInstall = (args: InstallSubagentHandlerArgs, flags: InstallSubagentFlags) =>
  Effect.gen(function* () {
    if (Option.isNone(args.source)) {
      yield* validateWorkspaceInstallArgs(args);
      return yield* handleWorkspaceInstall({
        command: "subagents.install",
        type: Option.some("subagent"),
        planName: "Install subagents",
        planDescription: Option.some("Install configured subagents"),
        flags,
      });
    }

    const nonInteractive = yield* isNonInteractiveOptional;
    return yield* runInstallCommand({
      command: "subagents.install",
      preview: flags.preview,
      force: flags.force,
      request: {
        type: Option.some("subagent"),
        subject: { kind: "source", source: args.source.value },
        names: args.subagents,
        all: args.all,
        reinstall: flags.force,
        localName: Option.none(),
        env: [],
        nonInteractive,
        planName: "Install subagents",
        planDescription: Option.none(),
      },
      recoveryCommand: ["subagents", "install"],
      recoveryLocators: [args.source.value],
      recoveryArguments: [
        recoverySwitch("--all", args.all),
        ...args.subagents.map((subagent) =>
          recoveryOption("--subagent", publicRecoveryValue(subagent)),
        ),
      ],
      suggestions: [{ description: "Inspect installed subagents", cmd: "axm subagents list" }],
      noOpMessage: "No subagents installed.",
    });
  });
