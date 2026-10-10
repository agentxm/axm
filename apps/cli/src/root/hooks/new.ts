import { creationOwnerFlag } from "../../cli-flags/owner-handle.js";
import { HOOK_PROTOCOLS } from "./protocols.js";
import { withParameterDefault, withParameterDescription } from "../../cli-parameters.js";
import { descriptionFlag } from "../../cli-flags/index.js";
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

export interface HooksNewHandlerArgs {
  readonly name: ExtensionName;
  readonly owner: Option.Option<string>;
  readonly runtime: HookRuntime;
  readonly protocol: HookImplementation["protocol"];
  readonly event: string;
  readonly matcher: Option.Option<string>;
  readonly description?: Option.Option<string>;
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
      description: args.description ?? Option.none(),
    },
    suggestions: (candidate) => [
      { description: `Edit \`${candidate.entryPath}\` to implement the hook` },
    ],
  });

const newConfig = {
  name: Argument.String("name").pipe(
    withParameterDescription("Name of the hook extension to create, without owner"),
  ),
  owner: creationOwnerFlag,
  runtime: Flag.Literals("runtime", HOOK_RUNTIMES).pipe(
    withParameterDescription("Interpreter family for the entrypoint"),
    withParameterDefault("node" as const),
  ),
  protocol: Flag.Literals("protocol", HOOK_PROTOCOLS).pipe(
    withParameterDescription("Native host protocol implemented by this example"),
    withParameterDefault("claude-code" as const),
  ),
  event: Flag.String("event").pipe(
    withParameterDescription("Exact native event name, such as SessionStart or sessionStart"),
    withParameterDefault("SessionStart"),
  ),
  matcher: Flag.String("matcher").pipe(
    withParameterDescription("Native matcher supported by the selected protocol and event"),
    Flag.optional,
  ),
  description: descriptionFlag,
  preview: previewCapabilityFlag(),
} as const;

export const newCommand = Command.make(
  "new",
  newConfig,
  ({ name, owner, runtime, protocol, event, matcher, description, preview }) =>
    handleHooksNew({
      name: decodeExtensionNameSync(name),
      owner,
      runtime,
      protocol,
      event,
      matcher,
      description,
      preview,
    }).pipe(withWorkspace(DEFAULT_WORKSPACE_SCOPE), withRuntime("hooks new")),
).pipe(
  withArgvTracking(newConfig),
  withCommandCapabilities(previewableCapabilities("authored-source")),
  Command.withDescription(
    "Create an inactive hook extension with example fixtures in the project-workspace",
  ),
  Command.withExamples([
    { command: "axm hooks new tool-audit", description: "Scaffold a new hook extension" },
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
