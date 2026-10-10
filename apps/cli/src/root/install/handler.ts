/** The one install handler behind root and generated per-type commands. */

import * as Effect from "effect/Effect";
import * as Option from "effect/Option";

import { ConfigurableAgentIdSchema } from "@agentxm/extension-model/unstable/extensions/common";
import * as Schema from "effect/Schema";
import { SettingsReader } from "@agentxm/workspace-kernel/workspace-state";

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
import { runInstallCommand, type FirstInstall } from "../shared/install-command.js";

export interface InstallHandlerArgs {
  readonly agents?: ReadonlyArray<string>;
  readonly type: Option.Option<InstallableExtensionType>;
  readonly source: Option.Option<string>;
  readonly selectors: InstallExtensionSelectors;
  readonly all: boolean;
  readonly preview: boolean;
  readonly bind: ReadonlyArray<string>;
  readonly bindEnv: ReadonlyArray<string>;
  readonly distributionId?: string;
  readonly nativeOauth?: boolean;
  readonly configuration?: import("@agentxm/extension-model/unstable/hooks/manifest-schema").HookConfigurationValues;
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
    const agents = yield* Effect.forEach(args.agents ?? [], (agent) =>
      Effect.gen(function* () {
        if (!Schema.is(ConfigurableAgentIdSchema)(agent)) {
          return yield* makeAppError({
            code: "usage",
            detail: `Unknown coding agent: ${agent}`,
            recover: "Choose a coding agent from the supported catalog",
          });
        }
        return agent;
      }),
    );
    if (Option.isNone(args.source)) {
      return yield* makeAppError({
        code: "usage",
        detail: "An install source is required",
        recover: "Supply a source, synchronize configured state, or acquire it again",
        suggestions: [
          { description: "Realize configured state", cmd: "axm sync" },
          { description: "Acquire configured extensions again", cmd: "axm update --reinstall" },
        ],
      });
    }
    const selected = selectedEntries(args.selectors);
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
    return agents;
  });

/** Reject grammar mistakes before workspace acquisition can mask the usage error. */
export const validateInstallArgsBeforeWorkspace = validateGrammar;

export const handleInstall = <R = never>(
  args: InstallHandlerArgs,
  firstInstall?: FirstInstall<R>,
) =>
  Effect.gen(function* () {
    yield* validateGrammar(args);
    const requestedAgents = args.agents ?? [];
    // A first install has no membership to disagree with: the agents it names
    // establish the workspace.
    if (requestedAgents.length > 0 && firstInstall === undefined) {
      const configured = yield* (yield* SettingsReader).configuredAgents;
      const missing = requestedAgents.filter((agent) => !configured.includes(agent));
      if (missing.length > 0 || configured.some((agent) => !requestedAgents.includes(agent))) {
        return yield* makeAppError({
          code: "usage",
          detail:
            "--agent initializes workspace destinations; this workspace already has a different configured agent set",
          recover:
            missing.length > 0
              ? `Configure the missing workspace agents (${missing.join(", ")}) before installing, then omit --agent`
              : "Omit --agent to install for the configured workspace agents",
        });
      }
    }
    if (Option.isNone(args.source)) {
      return yield* makeAppError({ code: "usage", detail: "An install source is required" });
    }

    const nonInteractive = !(yield* (yield* Screen).canAsk);
    const ignoreReleaseAge = (yield* ReleaseAgePosture) === "ignore";
    const source = args.source.value;
    const command = commandSegments(args.type);
    const selected = selectedEntries(args.selectors);
    return yield* runInstallCommand({
      command: command.join("."),
      preview: args.preview,
      request: {
        type: args.type,
        subject: args.bundled ? { kind: "bundled" } : { kind: "source", source },
        selectors: args.selectors,
        all: args.all,

        localName: args.localName,
        bind: args.bind,
        bindEnv: args.bindEnv,
        ...(args.distributionId === undefined ? {} : { distributionId: args.distributionId }),
        ...(args.nativeOauth === undefined ? {} : { nativeOauth: args.nativeOauth }),
        ...(args.configuration === undefined ? {} : { configuration: args.configuration }),
        nonInteractive,
        planName: Option.isSome(args.type)
          ? `Install ${extensionTypeToPlural[args.type.value]}`
          : "Install extensions",
        planDescription: Option.none(),
      },
      recoveryCommand: command,
      recoveryLocators: [source],
      recoveryArguments: [
        ...requestedAgents.map((agent) => recoveryOption("--agent", publicRecoveryValue(agent))),
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
      ...(firstInstall === undefined ? {} : { firstInstall }),
    });
  });
