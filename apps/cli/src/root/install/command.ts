import { withParameterDefault, withParameterDescription } from "../../cli-parameters.js";
/** Root and per-type install commands over one shared grammar. */

import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import { Argument, Command, Flag } from "effect/cli";

import {
  installableExtensionTypes,
  type InstallableExtensionType,
} from "@agentxm/extension-model/unstable/extensions/installable-types";
import { installSelectorsFor } from "@agentxm/workspace-features/lifecycle";

import { agentFlag, ignoreReleaseAgeFlag, replaceUnrecordedFlag } from "../../cli-flags/index.js";
import { scopeFlag } from "../../cli-flags/scope-flag.js";
import { withArgvTracking } from "../../cli-runtime/index.js";
import { parseHookConfiguration } from "../hooks/configuration-input.js";
import { LearnMore, formatLearnMore } from "../../formatter.js";
import {
  withProjectionOutputPosture,
  withReleaseAgePosture,
  withRuntime,
  withWorkspace,
} from "../../runtime.js";
import { extensionTypePresentation } from "../extension-type-presentation.js";
import {
  previewCapabilityFlag,
  previewableCapabilities,
  withCommandCapabilities,
} from "../shared/command-capabilities.js";
import {
  handleInstall,
  type InstallHandlerArgs,
  validateInstallArgsBeforeWorkspace,
} from "./handler.js";
import {
  canAskUndetectedAgents,
  chooseUndetectedAgents,
  firstUseWorkspace,
  observeFirstInstallAgents,
  setUpFirstUse,
  undetectedAgentsRefusal,
} from "../shared/first-use.js";
import type { FirstInstall } from "../shared/install-command.js";

const sourceArgument = () =>
  Argument.String("source").pipe(withParameterDescription("Registry FQN, Git locator, or path"));

const selectorFlag = (type: InstallableExtensionType) => {
  const { selectorFlag, noun } = extensionTypePresentation(type);
  return Flag.String(selectorFlag).pipe(
    withParameterDescription(`Select ${noun.article} ${noun.singular} by name or glob`),
    Flag.atLeast(0),
  );
};

const allFlag = Flag.Boolean("all").pipe(
  withParameterDescription("Select everything the source offers"),
  withParameterDefault(false),
);

const commonConfig = () => ({
  source: sourceArgument(),
  scope: scopeFlag,
  agent: agentFlag.pipe(
    withParameterDescription("Configure an agent on first install; repeat for each agent"),
  ),
  all: allFlag,
  preview: previewCapabilityFlag(),
  ignoreReleaseAge: ignoreReleaseAgeFlag,
  replaceUnrecorded: replaceUnrecordedFlag,
});

const mcpConfig = {
  bind: Flag.String("bind").pipe(
    withParameterDescription(
      "Bind one input as INPUT_ID=VALUE; repeating an INPUT_ID appends in order",
    ),
    Flag.atLeast(0),
  ),
  bindEnv: Flag.String("bind-env").pipe(
    withParameterDescription("Bind selected INPUT_ID=ENV_NAME without reading the environment"),
    Flag.atLeast(0),
  ),
  distribution: Flag.String("distribution").pipe(
    withParameterDescription("Distribution ID to select when the manifest offers several"),
    Flag.optional,
  ),
  nativeOauth: Flag.Boolean("native-oauth").pipe(
    withParameterDescription("Use the native MCP host's OAuth; excludes an Authorization header"),
    withParameterDefault(false),
  ),
  as: Flag.String("as").pipe(
    withParameterDescription("Install one MCP server using this local name"),
    Flag.optional,
  ),
};

const installCapabilities = previewableCapabilities("workspace", {
  inputs: "explicit-or-interactive-selection",
  trust: ["publisher-change"],
});

const finishCommand = <Name extends string, Input, ContextInput, E, R>(
  command: Command.Command<Name, Input, ContextInput, E, R>,
  type?: InstallableExtensionType,
) =>
  command.pipe(
    withCommandCapabilities(installCapabilities),
    Command.withDescription(
      type === undefined
        ? "Install extensions from a registry, Git, or path source"
        : `Install ${extensionTypePresentation(type).noun.plural} from a registry, Git, or path source`,
    ),
    Command.withExamples([
      {
        command:
          type === undefined
            ? "axm install ./extensions --skill review --rule safe-shell"
            : `axm ${extensionTypePresentation(type).route} install ./extensions --${extensionTypePresentation(type).selectorFlag} example`,
        description: "Install an explicit selection from one source locator",
      },
      {
        command:
          type === undefined
            ? "axm install ./extensions --all"
            : `axm ${extensionTypePresentation(type).route} install ./extensions --all`,
        description: "Install everything the source offers without prompting",
      },
    ]),
  );

interface ParsedTypedInstall {
  readonly source: string;
  readonly selection: ReadonlyArray<string>;
  readonly agent: ReadonlyArray<string>;
  readonly scope: "project" | "user";
  readonly all: boolean;
  readonly preview: boolean;
  readonly ignoreReleaseAge: boolean;
  readonly replaceUnrecorded: boolean;
}

const executeInstall = (
  args: InstallHandlerArgs,
  scope: "project" | "user",
  overrides: { readonly ignoreReleaseAge: boolean; readonly replaceUnrecorded: boolean },
) =>
  validateInstallArgsBeforeWorkspace(args).pipe(
    Effect.flatMap((agents) =>
      Effect.gen(function* () {
        const install = handleInstall(args).pipe(withReleaseAgePosture(overrides.ignoreReleaseAge));
        const observed = yield* observeFirstInstallAgents(scope);
        if (observed._tag === "Established") return yield* install.pipe(withWorkspace(scope));
        // First use asks after the selection: select in the uninitialized
        // scope, establish the workspace, then install into it.
        const afterSelection = <R>(
          establish: FirstInstall<R>["establish"],
          workspace: Parameters<typeof withWorkspace>[0],
        ) =>
          handleInstall(args, { scope, establish }).pipe(
            withReleaseAgePosture(overrides.ignoreReleaseAge),
            withWorkspace(workspace),
          );
        const canAsk = yield* canAskUndetectedAgents;
        if (canAsk && !args.preview) {
          // Setup writes before the install opens its workspace, so the empty
          // initial settings make an unreadable resolution lock refuse first.
          return yield* afterSelection(setUpFirstUse({ scope, agents }), {
            scope,
            allowUninitialized: true,
            initialSettings: {},
          });
        }
        // Nobody can answer setup's questions, or this is a preview: the
        // agents named or found in the project settle the minimal workspace.
        if (agents.length > 0 || observed._tag === "Detected") {
          const known =
            agents.length > 0 || observed._tag !== "Detected" ? agents : observed.agents;
          return yield* install.pipe(
            withWorkspace(firstUseWorkspace(scope, { _tag: "Minimal", agents: known })),
          );
        }
        if (!canAsk) {
          return yield* undetectedAgentsRefusal(
            !args.bundled &&
              !args.all &&
              installableExtensionTypes.every(
                (type) => installSelectorsFor(args.selectors, type).length === 0,
              ),
          );
        }
        return yield* afterSelection(
          Effect.map(chooseUndetectedAgents(observed.detections), (chosen) => ({
            _tag: "Minimal" as const,
            agents: chosen,
          })),
          { scope, allowUninitialized: true },
        );
      }),
    ),
    // First use runs setup before the install, so both read the override.
    withProjectionOutputPosture({ replaceUnrecorded: overrides.replaceUnrecorded }),
    withRuntime(),
  );

/**
 * A typed route's grammar: the root install flags with one selector, keyed
 * `selection` on every route, and the type's own flags after `--preview`.
 */
const typedConfig = <const Extras extends Command.Command.Config>(
  type: InstallableExtensionType,
  extras: Extras,
) => {
  const common = commonConfig();
  return {
    source: common.source,
    agent: common.agent,
    scope: common.scope,
    selection: selectorFlag(type),
    all: common.all,
    preview: common.preview,
    ...extras,
    ignoreReleaseAge: common.ignoreReleaseAge,
    replaceUnrecorded: common.replaceUnrecorded,
  };
};

const typedInstallArgs = (
  type: InstallableExtensionType,
  parsed: ParsedTypedInstall,
): InstallHandlerArgs => ({
  type: Option.some(type),
  source: Option.some(parsed.source),
  agents: parsed.agent,
  selectors: { [type]: parsed.selection },
  all: parsed.all,
  preview: parsed.preview,
  bind: [],
  bindEnv: [],
  localName: Option.none(),
  bundled: false,
});

export const makePerTypeInstallCommand = (type: InstallableExtensionType) => {
  const run = (args: InstallHandlerArgs, parsed: ParsedTypedInstall) =>
    executeInstall(args, parsed.scope, parsed);
  switch (type) {
    case "mcp-server": {
      const config = typedConfig(type, mcpConfig);
      return finishCommand(
        Command.make("install", config, (parsed) =>
          run(
            {
              ...typedInstallArgs(type, parsed),
              bind: parsed.bind,
              bindEnv: parsed.bindEnv,
              ...(Option.isSome(parsed.distribution)
                ? { distributionId: parsed.distribution.value }
                : {}),
              nativeOauth: parsed.nativeOauth,
              localName: parsed.as,
            },
            parsed,
          ),
        ).pipe(withArgvTracking(config)),
        type,
      );
    }
    case "skill": {
      const config = typedConfig(type, {
        bundled: Flag.Boolean("bundled").pipe(
          withParameterDescription(
            "Install the embedded official AXM skill without registry access",
          ),
          withParameterDefault(false),
        ),
      });
      return finishCommand(
        Command.make("install", config, (parsed) =>
          run({ ...typedInstallArgs(type, parsed), bundled: parsed.bundled }, parsed),
        ).pipe(withArgvTracking(config)),
        type,
      );
    }
    case "hook": {
      const config = typedConfig(type, {
        configuration: Flag.String("configuration").pipe(
          Flag.optional,
          withParameterDescription(
            "Consumer values as a JSON object; {env: NAME} references a secret",
          ),
        ),
      });
      return finishCommand(
        Command.make("install", config, (parsed) =>
          Option.match(parsed.configuration, {
            onNone: () => run(typedInstallArgs(type, parsed), parsed),
            onSome: (configuration) =>
              parseHookConfiguration(configuration).pipe(
                Effect.flatMap((values) =>
                  run({ ...typedInstallArgs(type, parsed), configuration: values }, parsed),
                ),
              ),
          }),
        ).pipe(withArgvTracking(config)),
        type,
      );
    }
    default: {
      const config = typedConfig(type, {});
      return finishCommand(
        Command.make("install", config, (parsed) =>
          run(typedInstallArgs(type, parsed), parsed),
        ).pipe(withArgvTracking(config)),
        type,
      );
    }
  }
};

const installConfig = {
  ...commonConfig(),
  skill: selectorFlag("skill"),
  subagent: selectorFlag("subagent"),
  rule: selectorFlag("rule"),
  hook: selectorFlag("hook"),
  knowledge: selectorFlag("knowledge"),
  mcp: selectorFlag("mcp-server"),
  pack: selectorFlag("pack"),
} as const;

export const installCommand = finishCommand(
  Command.make("install", installConfig, (parsed) => {
    const args: InstallHandlerArgs = {
      type: Option.none(),
      source: Option.some(parsed.source),
      agents: parsed.agent,
      selectors: {
        skill: parsed.skill,
        subagent: parsed.subagent,
        rule: parsed.rule,
        hook: parsed.hook,
        knowledge: parsed.knowledge,
        "mcp-server": parsed.mcp,
        pack: parsed.pack,
      },
      all: parsed.all,

      preview: parsed.preview,
      bind: [],
      bindEnv: [],
      localName: Option.none(),
      bundled: false,
    };
    return executeInstall(args, parsed.scope, parsed);
  }).pipe(withArgvTracking(installConfig)),
).pipe(
  Command.withExamples([
    {
      command: "axm install @acme/skills/code-review",
      description: "Install a skill by fully qualified registry name",
    },
    {
      command: "axm install github:acme/agent-extensions//tools@v1.0.0",
      description: "Discover and install from a hosted Git locator",
    },
    {
      command: "axm install ./extensions --skill review --rule safe-shell",
      description: "Install explicit per-type selections from a source",
    },
    {
      command: "axm install ./extensions --all",
      description: "Install every extension in a source without prompting",
    },
  ]),
  Command.annotate(
    LearnMore,
    formatLearnMore([
      ["axm help getting-started", "Read setup and configuration guidance"],
      ["axm help basic-usage", "Read everyday extension commands"],
      ["axm help workspace-state", "Understand locators and accepted resolutions"],
    ]),
  ),
  // Root help only: the per-type install commands keep their own descriptions.
  Command.withShortDescription("Install from a registry, Git, or path"),
);

export const skillsInstallCommand = makePerTypeInstallCommand("skill");
export const mcpsInstallCommand = makePerTypeInstallCommand("mcp-server");
export const subagentsInstallCommand = makePerTypeInstallCommand("subagent");
export const rulesInstallCommand = makePerTypeInstallCommand("rule");
export const hooksInstallCommand = makePerTypeInstallCommand("hook");
export const knowledgeInstallCommand = makePerTypeInstallCommand("knowledge");
export const packsInstallCommand = makePerTypeInstallCommand("pack");
