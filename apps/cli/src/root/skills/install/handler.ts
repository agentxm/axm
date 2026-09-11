/**
 * `axm skills install`.
 *
 * Three routes with one shape: reinstall what the workspace declares, install
 * from a source, or recover the official skill the executable carries. The
 * flag combinations that make no sense are refused here, before a workspace
 * is even opened, because they are a grammar mistake rather than a decision.
 */

import * as Effect from "effect/Effect";
import * as Option from "effect/Option";

import { publicRecoveryValue, recoveryOption, recoverySwitch } from "@agentxm/workspace-operations";

import { makeAppError } from "../../../app-error/index.js";
import { isNonInteractiveOptional } from "../../../cli-flags/index.js";
import { runInstallCommand } from "../../shared/install-command.js";
import { handleWorkspaceInstall } from "../../install/workspace-install-handler.js";

export interface InstallHandlerArgs {
  readonly source: Option.Option<string>;
  readonly skills: ReadonlyArray<string>;
  readonly all: boolean;
  readonly bundled?: boolean;
}

export interface InstallSkillFlags {
  readonly force: boolean;
  readonly preview: boolean;
}

const validateWorkspaceInstallArgs = (args: InstallHandlerArgs) =>
  Effect.gen(function* () {
    if (args.all) {
      return yield* makeAppError({
        code: "usage",
        detail: "The --all flag requires a source for skills install",
        recover: "Install all skills from a source, or omit `--all`",
        cmd: "axm skills install <source> --all",
      });
    }
    if (args.skills.length > 0) {
      return yield* makeAppError({
        code: "usage",
        detail: "The --skill flag requires a source for skills install",
        recover: "Install a named skill from a source, or omit `--skill`",
        cmd: "axm skills install <source> --skill <name>",
      });
    }
  });

const validateBundledInstallArgs = (args: InstallHandlerArgs) =>
  Effect.gen(function* () {
    if (Option.isNone(args.source) || args.source.value !== "@agentxm/skills/axm") {
      return yield* makeAppError({
        code: "usage",
        detail: "The --bundled flag is restricted to @agentxm/skills/axm",
        recover: "Install the bundled official AXM skill",
        cmd: "axm skills install @agentxm/skills/axm --bundled",
      });
    }
    if (args.all || args.skills.length > 0) {
      return yield* makeAppError({
        code: "usage",
        detail: "The --bundled flag cannot be combined with --all or --skill",
        recover: "Remove the source-selection flags and install the bundled AXM skill directly",
      });
    }
  });

/** The `--bundled` grammar is checked before a workspace is opened. */
export const validateInstallArgsBeforeWorkspace = (args: InstallHandlerArgs) =>
  args.bundled === true ? validateBundledInstallArgs(args) : Effect.void;

export const handleInstall = (args: InstallHandlerArgs, flags: InstallSkillFlags) =>
  Effect.gen(function* () {
    if (args.bundled === true) {
      yield* validateBundledInstallArgs(args);
      const nonInteractive = yield* isNonInteractiveOptional;
      return yield* runInstallCommand({
        command: "skills.install",
        preview: flags.preview,
        force: flags.force,
        request: {
          type: Option.some("skill"),
          subject: { kind: "bundled" },
          names: [],
          all: false,
          reinstall: flags.force,
          localName: Option.none(),
          env: [],
          nonInteractive,
          planName: "Install bundled AXM skill",
          planDescription: Option.some("Install the embedded compatible official AXM skill"),
        },
        recoveryCommand: ["skills", "install"],
        recoveryLocators: ["@agentxm/skills/axm"],
        recoveryArguments: [recoverySwitch("--bundled", true)],
        suggestions: [{ description: "Inspect workspace facts", cmd: "axm lint" }],
        noOpMessage: "No skills installed.",
      });
    }

    if (Option.isNone(args.source)) {
      yield* validateWorkspaceInstallArgs(args);
      return yield* handleWorkspaceInstall({
        command: "skills.install",
        type: Option.some("skill"),
        planName: "Install configured skills",
        planDescription: Option.some("Install configured skills"),
        flags,
      });
    }

    const nonInteractive = yield* isNonInteractiveOptional;
    return yield* runInstallCommand({
      command: "skills.install",
      preview: flags.preview,
      force: flags.force,
      request: {
        type: Option.some("skill"),
        subject: { kind: "source", source: args.source.value },
        names: args.skills,
        all: args.all,
        reinstall: flags.force,
        localName: Option.none(),
        env: [],
        nonInteractive,
        planName: "Install skills",
        planDescription: Option.none(),
      },
      recoveryCommand: ["skills", "install"],
      recoveryLocators: [args.source.value],
      recoveryArguments: [
        recoverySwitch("--all", args.all),
        ...args.skills.map((skill) => recoveryOption("--skill", publicRecoveryValue(skill))),
      ],
      suggestions: [{ description: "Inspect installed skills", cmd: "axm skills list" }],
      noOpMessage: "No skills installed.",
    });
  });
