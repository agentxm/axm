import * as Option from "effect/Option";
import { Flag } from "effect/cli";

import type {
  HookImplementation,
  HookRuntime,
} from "@agentxm/extension-model/unstable/hooks/manifest-schema";

import { withParameterDefault, withParameterDescription } from "../../cli-parameters.js";
import {
  makePerTypeNewCommand,
  runCreateExtensionCommand,
  type NewExtensionArgs,
} from "../shared/create-extension-command.js";
import { HOOK_PROTOCOLS } from "./protocols.js";

const HOOK_RUNTIMES = ["bash", "node", "python"] as const satisfies readonly HookRuntime[];

export const handleHooksNew = (
  args: NewExtensionArgs & {
    readonly runtime: HookRuntime;
    readonly protocol: HookImplementation["protocol"];
    readonly event: string;
    readonly matcher: Option.Option<string>;
  },
) =>
  runCreateExtensionCommand({
    preview: args.preview,
    request: {
      type: "hook",
      name: args.name,
      owner: args.owner,
      runtime: args.runtime,
      protocol: args.protocol,
      event: args.event,
      matcher: args.matcher,
      description: args.description,
    },
    suggestions: (candidate) => [
      { description: `Edit \`${candidate.entryPath}\` to implement the hook` },
    ],
  });

export const newCommand = makePerTypeNewCommand("hook", {
  description: "Create an inactive hook extension with example fixtures in the project-workspace",
  extraConfig: {
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
  },
  examples: [
    {
      command:
        "axm hooks new workspace-baseline --protocol claude-code --event PostToolUse --matcher Bash",
      description: "Bind to a specific event and tool matcher",
    },
    {
      command: "axm hooks new workspace-baseline --runtime python",
      description: "Create with a Python entrypoint",
    },
  ],
  handle: handleHooksNew,
});
