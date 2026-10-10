import { withParameterDefault, withParameterDescription } from "../../cli-parameters.js";
/** Root and per-type install commands generated from one grammar definition. */

import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import { Argument, Command, Flag } from "effect/cli";

import { extensionTypeToPlural } from "@agentxm/extension-model/unstable/extensions";
import {
  installableExtensionTypes,
  type InstallableExtensionType,
} from "@agentxm/extension-model/unstable/extensions/installable-types";
import {
  type InstallExtensionSelectors,
  installSelectorsFor,
} from "@agentxm/workspace-features/lifecycle";

import { agentFlag, ignoreReleaseAgeFlag } from "../../cli-flags/index.js";
import { scopeFlag } from "../../cli-flags/scope-flag.js";
import { withArgvTracking } from "../../cli-runtime/index.js";
import { parseHookConfiguration } from "../hooks/configuration-input.js";
import { LearnMore, formatLearnMore } from "../../formatter.js";
import {
  canAskUndetectedAgents,
  chooseUndetectedAgents,
  observeFirstInstallAgents,
  undetectedAgentsRefusal,
  withReleaseAgePosture,
  withRuntime,
  withWorkspace,
} from "../../runtime.js";
import { EXTENSION_TYPE_PRESENTATION } from "../extension-type-presentation.js";
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

const sourceArgument = () =>
  Argument.String("source").pipe(withParameterDescription("Registry FQN, Git locator, or path"));

const selectorFlag = (type: InstallableExtensionType) => {
  return Flag.String(EXTENSION_TYPE_PRESENTATION[type].selectorFlag).pipe(
    withParameterDescription(
      `Select ${EXTENSION_TYPE_PRESENTATION[type].noun.article} ${EXTENSION_TYPE_PRESENTATION[type].noun.singular} by name or glob`,
    ),
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

const selectorsFor = (
  type: InstallableExtensionType,
  selection: ReadonlyArray<string>,
): InstallExtensionSelectors => {
  switch (type) {
    case "skill":
      return { skill: selection };
    case "mcp-server":
      return { "mcp-server": selection };
    case "subagent":
      return { subagent: selection };
    case "rule":
      return { rule: selection };
    case "hook":
      return { hook: selection };
    case "knowledge":
      return { knowledge: selection };
    case "pack":
      return { pack: selection };
  }
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
        : `Install ${EXTENSION_TYPE_PRESENTATION[type].noun.plural} from a registry, Git, or path source`,
    ),
    Command.withExamples([
      {
        command:
          type === undefined
            ? "axm install ./extensions --skill review --rule safe-shell"
            : `axm ${extensionTypeToPlural[type]} install ./extensions --${EXTENSION_TYPE_PRESENTATION[type].selectorFlag} example`,
        description: "Install an explicit selection from one source locator",
      },
      {
        command:
          type === undefined
            ? "axm install ./extensions --all"
            : `axm ${extensionTypeToPlural[type]} install ./extensions --all`,
        description: "Install everything the source offers without prompting",
      },
    ]),
  );

interface ParsedTypedInstall {
  readonly source: string;
  readonly agent: ReadonlyArray<string>;
  readonly scope: "project" | "user";
  readonly all: boolean;
  readonly preview: boolean;
  readonly ignoreReleaseAge: boolean;
}

const executeInstall = (
  args: InstallHandlerArgs,
  scope: "project" | "user",
  ignoreReleaseAge: boolean,
  runtimeName: string,
) =>
  validateInstallArgsBeforeWorkspace(args).pipe(
    Effect.flatMap((agents) =>
      Effect.gen(function* () {
        const install = handleInstall(args).pipe(withReleaseAgePosture(ignoreReleaseAge));
        const established = (known: typeof agents) =>
          install.pipe(
            withWorkspace({ scope, initialSettings: { agents: known, instructionFiles: false } }),
          );
        // Named agents settle the question, and the bundled skill has nothing
        // to select, so neither waits for a selection.
        if (agents.length > 0 || args.bundled) return yield* established(agents);
        const observed = yield* observeFirstInstallAgents(scope);
        if (observed._tag === "Established") return yield* established(agents);
        if (observed._tag === "Detected") return yield* established(observed.agents);
        if (!(yield* canAskUndetectedAgents)) {
          return yield* undetectedAgentsRefusal(
            !args.all &&
              installableExtensionTypes.every(
                (type) => installSelectorsFor(args.selectors, type).length === 0,
              ),
          );
        }
        // No agents are known and a question can open: select in the
        // uninitialized scope, then ask, then install for the agents chosen.
        return yield* handleInstall(args, {
          scope,
          agents: chooseUndetectedAgents(observed.detections),
        }).pipe(
          withReleaseAgePosture(ignoreReleaseAge),
          withWorkspace({ scope, allowUninitialized: true }),
        );
      }),
    ),
    withRuntime(runtimeName),
  );

const runTypedInstall = (
  type: InstallableExtensionType,
  parsed: ParsedTypedInstall,
  selection: ReadonlyArray<string>,
  configuration?: import("@agentxm/extension-model/unstable/hooks/manifest-schema").HookConfigurationValues,
) => {
  const args: InstallHandlerArgs = {
    type: Option.some(type),
    source: Option.some(parsed.source),
    agents: parsed.agent,
    selectors: selectorsFor(type, selection),
    all: parsed.all,

    preview: parsed.preview,
    bind: [],
    bindEnv: [],
    localName: Option.none(),
    bundled: false,
    ...(configuration === undefined ? {} : { configuration }),
  };
  return executeInstall(
    args,
    parsed.scope,
    parsed.ignoreReleaseAge,
    `${extensionTypeToPlural[type]} install`,
  );
};

export const makePerTypeInstallCommand = (type: InstallableExtensionType) => {
  if (type === "mcp-server") {
    const common = commonConfig();
    const config = {
      source: common.source,
      agent: common.agent,
      scope: common.scope,
      mcp: selectorFlag(type),
      all: common.all,
      preview: common.preview,
      ...mcpConfig,
      ignoreReleaseAge: common.ignoreReleaseAge,
    } as const;
    return finishCommand(
      Command.make("install", config, (parsed) => {
        const args: InstallHandlerArgs = {
          type: Option.some(type),
          source: Option.some(parsed.source),
          agents: parsed.agent,
          selectors: selectorsFor(type, parsed.mcp),
          all: parsed.all,

          preview: parsed.preview,
          bind: parsed.bind,
          bindEnv: parsed.bindEnv,
          ...(Option.isSome(parsed.distribution)
            ? { distributionId: parsed.distribution.value }
            : {}),
          nativeOauth: parsed.nativeOauth,
          localName: parsed.as,
          bundled: false,
        };
        return executeInstall(args, parsed.scope, parsed.ignoreReleaseAge, "mcps install");
      }).pipe(withArgvTracking(config)),
      type,
    );
  }
  if (type === "skill") {
    const common = commonConfig();
    const config = {
      source: common.source,
      agent: common.agent,
      scope: common.scope,
      skill: selectorFlag(type),
      all: common.all,
      preview: common.preview,
      bundled: Flag.Boolean("bundled").pipe(
        withParameterDescription("Install the embedded official AXM skill without registry access"),
        withParameterDefault(false),
      ),
      ignoreReleaseAge: common.ignoreReleaseAge,
    } as const;
    return finishCommand(
      Command.make("install", config, (parsed) => {
        const args: InstallHandlerArgs = {
          type: Option.some(type),
          source: Option.some(parsed.source),
          agents: parsed.agent,
          selectors: selectorsFor(type, parsed.skill),
          all: parsed.all,

          preview: parsed.preview,
          bind: [],
          bindEnv: [],
          localName: Option.none(),
          bundled: parsed.bundled,
        };
        return executeInstall(args, parsed.scope, parsed.ignoreReleaseAge, "skills install");
      }).pipe(withArgvTracking(config)),
      type,
    );
  }
  switch (type) {
    case "subagent": {
      const common = commonConfig();
      const config = {
        source: common.source,
        agent: common.agent,
        scope: common.scope,
        subagent: selectorFlag(type),
        all: common.all,
        preview: common.preview,
        ignoreReleaseAge: common.ignoreReleaseAge,
      } as const;
      return finishCommand(
        Command.make("install", config, (parsed) =>
          runTypedInstall(type, parsed, parsed.subagent),
        ).pipe(withArgvTracking(config)),
        type,
      );
    }
    case "rule": {
      const common = commonConfig();
      const config = {
        source: common.source,
        agent: common.agent,
        scope: common.scope,
        rule: selectorFlag(type),
        all: common.all,
        preview: common.preview,
        ignoreReleaseAge: common.ignoreReleaseAge,
      } as const;
      return finishCommand(
        Command.make("install", config, (parsed) =>
          runTypedInstall(type, parsed, parsed.rule),
        ).pipe(withArgvTracking(config)),
        type,
      );
    }
    case "hook": {
      const common = commonConfig();
      const config = {
        source: common.source,
        agent: common.agent,
        scope: common.scope,
        hook: selectorFlag(type),
        configuration: Flag.String("configuration").pipe(
          Flag.optional,
          withParameterDescription(
            "Consumer values as a JSON object; {env: NAME} references a secret",
          ),
        ),
        all: common.all,
        preview: common.preview,
        ignoreReleaseAge: common.ignoreReleaseAge,
      } as const;
      return finishCommand(
        Command.make("install", config, (parsed) =>
          Option.isNone(parsed.configuration)
            ? runTypedInstall(type, parsed, parsed.hook)
            : parseHookConfiguration(parsed.configuration.value).pipe(
                Effect.flatMap((values) => runTypedInstall(type, parsed, parsed.hook, values)),
              ),
        ).pipe(withArgvTracking(config)),
        type,
      );
    }
    case "knowledge": {
      const common = commonConfig();
      const config = {
        source: common.source,
        agent: common.agent,
        scope: common.scope,
        knowledge: selectorFlag(type),
        all: common.all,
        preview: common.preview,
        ignoreReleaseAge: common.ignoreReleaseAge,
      } as const;
      return finishCommand(
        Command.make("install", config, (parsed) =>
          runTypedInstall(type, parsed, parsed.knowledge),
        ).pipe(withArgvTracking(config)),
        type,
      );
    }
    case "pack": {
      const common = commonConfig();
      const config = {
        source: common.source,
        agent: common.agent,
        scope: common.scope,
        pack: selectorFlag(type),
        all: common.all,
        preview: common.preview,
        ignoreReleaseAge: common.ignoreReleaseAge,
      } as const;
      return finishCommand(
        Command.make("install", config, (parsed) =>
          runTypedInstall(type, parsed, parsed.pack),
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
    return executeInstall(args, parsed.scope, parsed.ignoreReleaseAge, "install");
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
