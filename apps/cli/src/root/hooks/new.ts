import * as Option from "effect/Option";
import { Argument, Command, Flag } from "effect/unstable/cli";

import {
  decodeExtensionNameSync,
  type ExtensionName,
} from "@agentxm/extension-model/unstable/extensions";
import type {
  HookEvent,
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
const HOOK_EVENTS = [
  "tool.pre",
  "tool.post",
  "prompt.submit",
  "session.start",
  "turn.end",
  "subagent.stop",
  "compaction.pre",
] as const satisfies readonly HookEvent[];

export interface HooksNewHandlerArgs {
  readonly name: ExtensionName;
  readonly owner: Option.Option<string>;
  readonly runtime: HookRuntime;
  readonly event: HookEvent;
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
      event: args.event,
      matcher: args.matcher,
    },
    suggestions: (candidate) => [
      { description: `Edit \`${candidate.entryPath}\` to implement the hook` },
    ],
  });

const newConfig = {
  name: Argument.string("name").pipe(Argument.withDescription("Name of the hook (without owner)")),
  owner: Flag.string("owner").pipe(
    Flag.withDescription(
      "Owner to create under; recorded as the workspace owner when none is set (e.g., @acme)",
    ),
    Flag.optional,
  ),
  runtime: Flag.choice("runtime", HOOK_RUNTIMES).pipe(
    Flag.withDescription("Interpreter family for the entrypoint"),
    Flag.withDefault("bash" as const),
  ),
  event: Flag.choice("event", HOOK_EVENTS).pipe(
    Flag.withDescription("Canonical hook event to bind to"),
    Flag.withDefault("tool.pre" as const),
  ),
  matcher: Flag.string("matcher").pipe(
    Flag.withDescription("Raw native matcher for tool.pre/tool.post (e.g., Write|Edit)"),
    Flag.optional,
  ),
  preview: previewCapabilityFlag("Show what files would be created without creating them"),
} as const;

export const newCommand = Command.make(
  "new",
  newConfig,
  ({ name, owner, runtime, event, matcher, preview }) =>
    handleHooksNew({
      name: decodeExtensionNameSync(name),
      owner,
      runtime,
      event,
      matcher,
      preview,
    }).pipe(withWorkspace(DEFAULT_WORKSPACE_SCOPE), withRuntime("hooks new")),
).pipe(
  withArgvTracking(newConfig),
  withCommandCapabilities(previewableCapabilities("authored-source")),
  Command.withDescription("Create a new hook in the project-workspace authoring root"),
  Command.withExamples([
    { command: "axm hooks new tool-audit", description: "Scaffold a new hook" },
    {
      command: "axm hooks new tool-audit --event tool.post --matcher Bash",
      description: "Bind to a specific event and tool matcher",
    },
    {
      command: "axm hooks new tool-audit --owner @acme --runtime python",
      description: "Create under a specific owner with a Python entrypoint",
    },
  ]),
);
