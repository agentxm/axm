/**
 * `axm mcps install`.
 *
 * A local connection name only means something against a source, so `--as`
 * with no source is a grammar refusal rather than a resolution failure.
 */

import * as Effect from "effect/Effect";
import * as Option from "effect/Option";

import {
  protectedRecoveryValue,
  publicRecoveryValue,
  recoveryOption,
} from "@agentxm/workspace-operations";

import { makeAppError } from "../../../app-error/index.js";
import { isNonInteractiveOptional } from "../../../cli-flags/index.js";
import { handleWorkspaceInstall } from "../../install/workspace-install-handler.js";
import { runInstallCommand } from "../../shared/install-command.js";

export interface InstallMcpServerFlags {
  readonly force: boolean;
  readonly preview: boolean;
}

export interface McpServerInstallHandlerArgs {
  readonly source: Option.Option<string>;
  readonly localName?: Option.Option<string>;
  readonly env: ReadonlyArray<string>;
}

export const handleInstallMcpServer = (
  args: McpServerInstallHandlerArgs,
  flags: InstallMcpServerFlags,
) =>
  Effect.gen(function* () {
    const localName = args.localName ?? Option.none<string>();
    if (Option.isNone(args.source)) {
      if (Option.isSome(localName)) {
        return yield* makeAppError({
          code: "usage",
          detail: "--as requires an MCP server source",
        });
      }
      return yield* handleWorkspaceInstall({
        command: "mcps.install",
        type: Option.some("mcp-server"),
        planName: "Install MCP servers",
        planDescription: Option.some("Install configured MCP servers"),
        flags,
      });
    }

    const nonInteractive = yield* isNonInteractiveOptional;
    return yield* runInstallCommand({
      command: "mcps.install",
      preview: flags.preview,
      force: flags.force,
      request: {
        type: Option.some("mcp-server"),
        subject: { kind: "source", source: args.source.value },
        names: [],
        all: false,
        reinstall: flags.force,
        localName,
        env: args.env,
        nonInteractive,
        planName: "Install MCP servers",
        planDescription: Option.none(),
      },
      recoveryCommand: ["mcps", "install"],
      recoveryLocators: [args.source.value],
      recoveryArguments: [
        ...Option.match(localName, {
          onNone: () => [],
          onSome: (name) => [recoveryOption("--as", publicRecoveryValue(name))],
        }),
        // The values of `--env` are inputs a connection needs, so the recovery
        // line names the flag without reproducing what was passed.
        ...args.env.map(() => recoveryOption("--env", protectedRecoveryValue())),
      ],
      suggestions: [{ description: "Inspect MCP servers", cmd: "axm mcps list" }],
      noOpMessage: "No MCP servers installed.",
    });
  });
