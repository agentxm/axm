/**
 * `axm knowledge install`.
 */

import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import { Argument, Command } from "effect/unstable/cli";

import { withArgvTracking } from "../../../cli-runtime/index.js";
import { ignoreReleaseAgeFlag, isNonInteractiveOptional } from "../../../cli-flags/index.js";
import { withReleaseAgePosture, withRuntime, withWorkspace } from "../../../runtime.js";
import { handleWorkspaceInstall } from "../../install/workspace-install-handler.js";
import {
  previewableCapabilities,
  withCommandCapabilities,
} from "../../shared/command-capabilities.js";
import { runInstallCommand } from "../../shared/install-command.js";
import { mutationFlags, scopeConfig } from "../flags.js";

export interface KnowledgeInstallHandlerArgs {
  readonly source: Option.Option<string>;
  readonly preview: boolean;
}

export const handleKnowledgeInstall = (args: KnowledgeInstallHandlerArgs) =>
  Effect.gen(function* () {
    if (Option.isNone(args.source)) {
      return yield* handleWorkspaceInstall({
        command: "knowledge.install",
        type: Option.some("knowledge"),
        planName: "Install Knowledge",
        planDescription: Option.some("Install configured Knowledge bundles"),
        flags: { preview: args.preview },
      });
    }

    const nonInteractive = yield* isNonInteractiveOptional;
    return yield* runInstallCommand({
      command: "knowledge.install",
      preview: args.preview,
      force: false,
      request: {
        type: Option.some("knowledge"),
        subject: { kind: "source", source: args.source.value },
        names: [],
        all: false,
        reinstall: false,
        localName: Option.none(),
        env: [],
        nonInteractive,
        planName: "Install Knowledge",
        planDescription: Option.none(),
      },
      recoveryCommand: ["knowledge", "install"],
      recoveryLocators: [args.source.value],
      suggestions: [{ description: "Browse installed Knowledge", cmd: "axm knowledge list" }],
    });
  });

const installConfig = {
  source: Argument.string("source").pipe(
    Argument.withDescription("Knowledge source (@owner/knowledge/name, path, URL, or git locator)"),
    Argument.optional,
  ),
  ...scopeConfig,
  ...mutationFlags,
  ignoreReleaseAge: ignoreReleaseAgeFlag,
} as const;

export const installCommand = Command.make(
  "install",
  installConfig,
  ({ source, scope, preview, ignoreReleaseAge }) =>
    handleKnowledgeInstall({ source, preview }).pipe(
      withReleaseAgePosture(ignoreReleaseAge),
      withWorkspace(scope),
      withRuntime("knowledge install"),
    ),
).pipe(
  withArgvTracking(installConfig),
  withCommandCapabilities(previewableCapabilities("workspace", { trust: ["publisher-change"] })),
  Command.withDescription("Install or restore Knowledge bundles"),
  Command.withExamples([
    {
      command: "axm knowledge install @acme/knowledge/platform",
      description: "Install a Knowledge bundle from the registry",
    },
  ]),
);
