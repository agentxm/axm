/** The one install handler behind root and generated per-type commands. */

import * as Effect from "effect/Effect";
import * as Option from "effect/Option";

import { extensionTypeToPlural } from "@agentxm/extension-model/unstable/extensions";
import {
  installableExtensionTypes,
  type InstallableExtensionType,
} from "@agentxm/extension-model/unstable/extensions/installable-types";
import {
  type InstallExtensionSelectors,
  installSelectorsFor,
} from "@agentxm/workspace-features/lifecycle";
import { ReleaseAgePosture } from "@agentxm/workspace-kernel/resolution";
import {
  protectedRecoveryValue,
  publicRecoveryValue,
  recoveryOption,
  recoverySwitch,
} from "@agentxm/workspace-kernel/operations";

import { makeAppError } from "../../app-error/index.js";
import { Screen } from "../../screen/index.js";
import { EXTENSION_TYPE_PRESENTATION } from "../extension-type-presentation.js";
import { runInstallCommand } from "../shared/install-command.js";
import { handleWorkspaceInstall } from "./workspace-install-handler.js";

export interface InstallHandlerArgs {
  readonly type: Option.Option<InstallableExtensionType>;
  readonly source: Option.Option<string>;
  readonly selectors: InstallExtensionSelectors;
  readonly all: boolean;
  readonly force: boolean;
  readonly preview: boolean;
  readonly bind: ReadonlyArray<string>;
  readonly bindEnv: ReadonlyArray<string>;
  readonly distributionId?: string;
  readonly nativeOauth?: boolean;
  readonly localName: Option.Option<string>;
  readonly bundled: boolean;
}

const commandSegments = (type: Option.Option<InstallableExtensionType>): ReadonlyArray<string> =>
  Option.match(type, {
    onNone: () => ["install"],
    onSome: (value) => [extensionTypeToPlural[value], "install"],
  });

const selectedEntries = (selectors: InstallExtensionSelectors) =>
  installableExtensionTypes.flatMap((type) =>
    installSelectorsFor(selectors, type).map((name) => ({ type, name })),
  );

const validateGrammar = (args: InstallHandlerArgs) =>
  Effect.gen(function* () {
    const selected = selectedEntries(args.selectors);
    if (Option.isNone(args.source) && (args.all || selected.length > 0)) {
      return yield* makeAppError({
        code: "usage",
        detail: "Selection flags and --all require an install source",
        recover: "Name a source, or omit source-selection flags to reinstall configured extensions",
      });
    }
    if (Option.isSome(args.localName)) {
      const nonMcpSelections = selected.filter(({ type }) => type !== "mcp-server");
      if (Option.isNone(args.source) || nonMcpSelections.length > 0) {
        return yield* makeAppError({
          code: "usage",
          detail: "--as is only valid for an MCP server selected from a source",
        });
      }
    }
    if (
      (args.bind.length > 0 ||
        args.bindEnv.length > 0 ||
        args.distributionId !== undefined ||
        args.nativeOauth === true) &&
      Option.isNone(args.source)
    ) {
      return yield* makeAppError({
        code: "usage",
        detail: "MCP distribution and binding options require an install source",
      });
    }
    if (args.bundled) {
      if (
        Option.getOrUndefined(args.type) !== "skill" ||
        Option.getOrUndefined(args.source) !== "@agentxm/skills/axm"
      ) {
        return yield* makeAppError({
          code: "usage",
          detail: "--bundled is restricted to `axm skills install @agentxm/skills/axm`",
        });
      }
      if (args.all || selected.length > 0) {
        return yield* makeAppError({
          code: "usage",
          detail: "--bundled cannot be combined with selection flags or --all",
        });
      }
    }
  });

/** Reject grammar mistakes before workspace acquisition can mask the usage error. */
export const validateInstallArgsBeforeWorkspace = validateGrammar;

export const handleInstall = (args: InstallHandlerArgs) =>
  Effect.gen(function* () {
    yield* validateGrammar(args);
    if (Option.isNone(args.source) && !args.bundled) {
      return yield* handleWorkspaceInstall({
        command: [...commandSegments(args.type)].join("."),
        type: args.type,
        planName: Option.isSome(args.type)
          ? `Install configured ${extensionTypeToPlural[args.type.value]}`
          : "Install configured extensions",
        planDescription: Option.some("Install configured workspace extensions"),
        flags: { force: args.force, preview: args.preview },
      });
    }

    const nonInteractive = !(yield* (yield* Screen).canAsk);
    const ignoreReleaseAge = (yield* ReleaseAgePosture) === "ignore";
    const source = Option.getOrElse(args.source, () => "@agentxm/skills/axm");
    const command = commandSegments(args.type);
    const selected = selectedEntries(args.selectors);
    return yield* runInstallCommand({
      command: command.join("."),
      preview: args.preview,
      force: args.force,
      request: {
        type: args.type,
        subject: args.bundled ? { kind: "bundled" } : { kind: "source", source },
        selectors: args.selectors,
        all: args.all,
        reinstall: args.force,
        localName: args.localName,
        bind: args.bind,
        bindEnv: args.bindEnv,
        ...(args.distributionId === undefined ? {} : { distributionId: args.distributionId }),
        ...(args.nativeOauth === undefined ? {} : { nativeOauth: args.nativeOauth }),
        nonInteractive,
        planName: Option.isSome(args.type)
          ? `Install ${extensionTypeToPlural[args.type.value]}`
          : "Install extensions",
        planDescription: Option.none(),
      },
      recoveryCommand: command,
      recoveryLocators: [source],
      recoveryArguments: [
        recoverySwitch("--all", args.all),
        recoverySwitch("--bundled", args.bundled),
        recoverySwitch("--ignore-release-age", ignoreReleaseAge),
        ...selected.map(({ type, name }) =>
          recoveryOption(
            `--${EXTENSION_TYPE_PRESENTATION[type].selectorFlag}`,
            publicRecoveryValue(name),
          ),
        ),
        ...Option.match(args.localName, {
          onNone: () => [],
          onSome: (name) => [recoveryOption("--as", publicRecoveryValue(name))],
        }),
        ...args.bind.map(() => recoveryOption("--bind", protectedRecoveryValue())),
        ...args.bindEnv.map(() => recoveryOption("--bind-env", protectedRecoveryValue())),
        ...(args.distributionId === undefined
          ? []
          : [recoveryOption("--distribution", publicRecoveryValue(args.distributionId))]),
        recoverySwitch("--native-oauth", args.nativeOauth === true),
      ],
      suggestions: [{ description: "Inspect workspace facts", cmd: "axm lint" }],
      noOpMessage: "No extensions installed.",
    });
  });
