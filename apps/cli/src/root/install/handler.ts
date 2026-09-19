/** The one install handler behind root and generated per-type commands. */

import * as Effect from "effect/Effect";
import * as Option from "effect/Option";

import { extensionTypeToPlural } from "@agentxm/extension-model/unstable/extensions";
import type { InstallableExtensionType } from "@agentxm/extension-model/unstable/extensions/installable-types";
import type { InstallExtensionSelectors } from "@agentxm/workspace/lifecycle";
import { ReleaseAgePosture } from "@agentxm/workspace/resolution";
import {
  publicRecoveryValue,
  recoveryOption,
  recoverySwitch,
} from "@agentxm/workspace/transitions/planning";

import { makeAppError } from "../../app-error/index.js";
import { isNonInteractiveOptional } from "../../cli-flags/index.js";
import { runInstallCommand } from "../shared/install-command.js";
import { handleWorkspaceInstall } from "./workspace-install-handler.js";

export interface InstallHandlerArgs {
  readonly type: Option.Option<InstallableExtensionType>;
  readonly source: Option.Option<string>;
  readonly selectors: InstallExtensionSelectors;
  readonly all: boolean;
  readonly force: boolean;
  readonly preview: boolean;
  readonly env: ReadonlyArray<string>;
  readonly localName: Option.Option<string>;
  readonly bundled: boolean;
}

const commandSegments = (type: Option.Option<InstallableExtensionType>): ReadonlyArray<string> =>
  Option.match(type, {
    onNone: () => ["install"],
    onSome: (value) => [extensionTypeToPlural[value], "install"],
  });

const selectedEntries = (selectors: InstallExtensionSelectors) =>
  Object.entries(selectors).flatMap(([type, names]) =>
    (names ?? []).map((name) => ({ type, name })),
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
    if (args.env.length > 0 && Option.isNone(args.source)) {
      return yield* makeAppError({ code: "usage", detail: "--env requires an install source" });
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

    const nonInteractive = yield* isNonInteractiveOptional;
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
        env: args.env,
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
          recoveryOption(`--${type === "mcp-server" ? "mcp" : type}`, publicRecoveryValue(name)),
        ),
        ...Option.match(args.localName, {
          onNone: () => [],
          onSome: (name) => [recoveryOption("--as", publicRecoveryValue(name))],
        }),
      ],
      suggestions: [{ description: "Inspect workspace facts", cmd: "axm lint" }],
      noOpMessage: "No extensions installed.",
    });
  });
