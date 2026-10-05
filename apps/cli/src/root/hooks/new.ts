import * as Option from "effect/Option";
import { Argument, Command, Flag } from "effect/cli";

import {
  decodeExtensionNameSync,
  type ExtensionName,
} from "@agentxm/extension-model/unstable/extensions";
import type {
  HookImplementation,
  HookRuntime,
} from "@agentxm/extension-model/unstable/hooks/manifest-schema";
import { DEFAULT_WORKSPACE_SCOPE } from "@agentxm/extension-model/unstable/workspace-scope";

import { withArgvTracking } from "../../cli-runtime/index.js";
import { withRuntime, withWorkspace } from "../../runtime.js";
import {
  previewCapabilityFlag,
  previewableCapabilities,
  withCommandCapabilities,
} from "../shared/command-capabilities.js";
import { runCreateExtensionCommand } from "../shared/create-extension-command.js";

const HOOK_RUNTIMES = ["bash", "node", "python"] as const satisfies readonly HookRuntime[];
const HOOK_PROTOCOLS = [
  "claude-code",
  "codex",
  "cursor",
  "gemini-cli",
  "qwen-code",
  "qoder",
  "codebuddy",
  "augment",
  "devin",
] as const satisfies readonly HookImplementation["protocol"][];

export interface HooksNewHandlerArgs {
  readonly name: ExtensionName;
  readonly owner: Option.Option<string>;
  readonly runtime: HookRuntime;
  readonly protocol: HookImplementation["protocol"];
  readonly event: string;
  readonly matcher: Option.Option<string>;
  readonly preview: boolean;
}

export const handleHooksNew = (args: HooksNewHandlerArgs) =>
  runCreateExtensionCommand({
    command: "hooks.new",
    preview: args.preview,
    request: {
      type: "hook",
      name: args.name,
      owner: args.owner,
      runtime: args.runtime,
      protocol: args.protocol,
      event: args.event,
      matcher: args.matcher,
    },
    suggestions: (candidate) => [
      { description: `Edit \`${candidate.entryPath}\` to implement the hook` },
    ],
  });

const newConfig = {
  name: Argument.String("name").pipe(Argument.withDescription("Name of the hook (without owner)")),
  owner: Flag.String("owner").pipe(
    Flag.withDescription(
      "Owner to create under; recorded as the workspace owner when none is set (e.g., @acme)",
    ),
    Flag.optional,
  ),
  runtime: Flag.Literals("runtime", HOOK_RUNTIMES).pipe(
    Flag.withDescription("Interpreter family for the entrypoint"),
    Flag.withDefault("node" as const),
  ),
  protocol: Flag.Literals("protocol", HOOK_PROTOCOLS).pipe(
    Flag.withDescription("Native host protocol implemented by this example"),
    Flag.withDefault("claude-code" as const),
  ),
  event: Flag.String("event").pipe(
    Flag.withDescription("Exact native event name, such as SessionStart or sessionStart"),
    Flag.withDefault("SessionStart"),
  ),
  matcher: Flag.String("matcher").pipe(
    Flag.withDescription("Native matcher supported by the selected protocol and event"),
    Flag.optional,
  ),
  preview: previewCapabilityFlag("Show what files would be created without creating them"),
} as const;

export const newCommand = Command.make(
  "new",
  newConfig,
  ({ name, owner, runtime, protocol, event, matcher, preview }) =>
    handleHooksNew({
      name: decodeExtensionNameSync(name),
      owner,
      runtime,
      protocol,
      event,
      matcher,
      preview,
    }).pipe(withWorkspace(DEFAULT_WORKSPACE_SCOPE), withRuntime("hooks new")),
).pipe(
  withArgvTracking(newConfig),
  withCommandCapabilities(previewableCapabilities("authored-source")),
  Command.withDescription(
    "Create an inactive project-workspace native hook with executable example fixtures",
  ),
  Command.withExamples([
    { command: "axm hooks new tool-audit", description: "Scaffold a new hook" },
    {
      command: "axm hooks new tool-audit --protocol claude-code --event PostToolUse --matcher Bash",
      description: "Bind to a specific event and tool matcher",
    },
    {
      command: "axm hooks new tool-audit --owner @acme --runtime python",
      description: "Create under a specific owner with a Python entrypoint",
    },
  ]),
);
