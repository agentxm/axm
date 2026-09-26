/** Root and per-type install commands generated from one grammar definition. */

import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import { Argument, Command, Flag } from "effect/unstable/cli";

import {
  extensionTypeSentenceLabels,
  extensionTypeToPlural,
} from "@agentxm/extension-model/unstable/extensions";
import type { InstallableExtensionType } from "@agentxm/extension-model/unstable/extensions/installable-types";
import type { InstallExtensionSelectors } from "@agentxm/workspace/lifecycle";
import { installSourceArgumentDescription } from "@agentxm/workspace/lifecycle";

import { ignoreReleaseAgeFlag, reinstallFlag } from "../../cli-flags/index.js";
import { scopeFlag } from "../../cli-flags/scope-flag.js";
import { withArgvTracking } from "../../cli-runtime/index.js";
import { LearnMore, formatLearnMore } from "../../formatter.js";
import { withReleaseAgePosture, withRuntime, withWorkspace } from "../../runtime.js";
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

const sourceArgument = (type?: InstallableExtensionType) =>
  Argument.String("source").pipe(
    Argument.withDescription(
      type === undefined
        ? 'Registry FQN (@owner/<plural-type>/<name>[@version]), self-describing Git locator, or path locator; hosted shorthand uses a final @revision, and shorthand revisions cannot contain "/"'
        : installSourceArgumentDescription(type),
    ),
    Argument.optional,
  );

const selectorFlag = (type: InstallableExtensionType) => {
  return Flag.String(EXTENSION_TYPE_PRESENTATION[type].selectorFlag).pipe(
    Flag.withDescription(
      `Select a ${extensionTypeSentenceLabels[type].toLowerCase()} by name or glob; repeatable`,
    ),
    Flag.atLeast(0),
  );
};

const allFlag = Flag.Boolean("all").pipe(
  Flag.withDescription("Install every matching extension without prompting"),
  Flag.withDefault(false),
);

const commonConfig = (type?: InstallableExtensionType) => ({
  source: sourceArgument(type),
  scope: scopeFlag.pipe(
    Flag.withDescription("Install to project (default) or user-level configuration"),
  ),
  all: allFlag,
  force: reinstallFlag.pipe(Flag.withDescription("Reinstall extensions that already exist")),
  preview: previewCapabilityFlag("Show what would be installed without making changes"),
  ignoreReleaseAge: ignoreReleaseAgeFlag,
});

const mcpConfig = {
  env: Flag.String("env").pipe(
    Flag.withAlias("e"),
    Flag.withDescription("Provide an MCP input value as KEY=VALUE; repeatable"),
    Flag.atLeast(0),
  ),
  as: Flag.String("as").pipe(
    Flag.withDescription("Install one MCP server using this local name"),
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
        ? "Install extensions from Registry, Git, or path sources, or reinstall configured sources"
        : `Reinstall all configured ${extensionTypeToPlural[type]} from their sources, or install ${extensionTypeToPlural[type]} from a source`,
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
        description: "Install every matching extension without prompting",
      },
    ]),
  );

interface ParsedTypedInstall {
  readonly source: Option.Option<string>;
  readonly scope: "project" | "user";
  readonly all: boolean;
  readonly force: boolean;
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
    Effect.andThen(
      handleInstall(args).pipe(withReleaseAgePosture(ignoreReleaseAge), withWorkspace(scope)),
    ),
    withRuntime(runtimeName),
  );

const runTypedInstall = (
  type: InstallableExtensionType,
  parsed: ParsedTypedInstall,
  selection: ReadonlyArray<string>,
) => {
  const args: InstallHandlerArgs = {
    type: Option.some(type),
    source: parsed.source,
    selectors: selectorsFor(type, selection),
    all: parsed.all,
    force: parsed.force,
    preview: parsed.preview,
    env: [],
    localName: Option.none(),
    bundled: false,
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
    const common = commonConfig(type);
    const config = {
      source: common.source,
      scope: common.scope,
      mcp: selectorFlag(type),
      all: common.all,
      force: common.force,
      preview: common.preview,
      ...mcpConfig,
      ignoreReleaseAge: common.ignoreReleaseAge,
    } as const;
    return finishCommand(
      Command.make("install", config, (parsed) => {
        const args: InstallHandlerArgs = {
          type: Option.some(type),
          source: parsed.source,
          selectors: selectorsFor(type, parsed.mcp),
          all: parsed.all,
          force: parsed.force,
          preview: parsed.preview,
          env: parsed.env,
          localName: parsed.as,
          bundled: false,
        };
        return executeInstall(args, parsed.scope, parsed.ignoreReleaseAge, "mcps install");
      }).pipe(withArgvTracking(config)),
      type,
    );
  }
  if (type === "skill") {
    const common = commonConfig(type);
    const config = {
      source: common.source,
      scope: common.scope,
      skill: selectorFlag(type),
      all: common.all,
      force: common.force,
      preview: common.preview,
      bundled: Flag.Boolean("bundled").pipe(
        Flag.withDescription("Install the embedded official AXM skill without Registry access"),
        Flag.withDefault(false),
      ),
      ignoreReleaseAge: common.ignoreReleaseAge,
    } as const;
    return finishCommand(
      Command.make("install", config, (parsed) => {
        const args: InstallHandlerArgs = {
          type: Option.some(type),
          source: parsed.source,
          selectors: selectorsFor(type, parsed.skill),
          all: parsed.all,
          force: parsed.force,
          preview: parsed.preview,
          env: [],
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
      const common = commonConfig(type);
      const config = {
        source: common.source,
        scope: common.scope,
        subagent: selectorFlag(type),
        all: common.all,
        force: common.force,
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
      const common = commonConfig(type);
      const config = {
        source: common.source,
        scope: common.scope,
        rule: selectorFlag(type),
        all: common.all,
        force: common.force,
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
      const common = commonConfig(type);
      const config = {
        source: common.source,
        scope: common.scope,
        hook: selectorFlag(type),
        all: common.all,
        force: common.force,
        preview: common.preview,
        ignoreReleaseAge: common.ignoreReleaseAge,
      } as const;
      return finishCommand(
        Command.make("install", config, (parsed) =>
          runTypedInstall(type, parsed, parsed.hook),
        ).pipe(withArgvTracking(config)),
        type,
      );
    }
    case "knowledge": {
      const common = commonConfig(type);
      const config = {
        source: common.source,
        scope: common.scope,
        knowledge: selectorFlag(type),
        all: common.all,
        force: common.force,
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
      const common = commonConfig(type);
      const config = {
        source: common.source,
        scope: common.scope,
        pack: selectorFlag(type),
        all: common.all,
        force: common.force,
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
  ...mcpConfig,
} as const;

export const installCommand = finishCommand(
  Command.make("install", installConfig, (parsed) => {
    const args: InstallHandlerArgs = {
      type: Option.none(),
      source: parsed.source,
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
      force: parsed.force,
      preview: parsed.preview,
      env: parsed.env,
      localName: parsed.as,
      bundled: false,
    };
    return executeInstall(args, parsed.scope, parsed.ignoreReleaseAge, "install");
  }).pipe(withArgvTracking(installConfig)),
).pipe(
  Command.withExamples([
    { command: "axm install", description: "Reinstall all configured extensions" },
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
      ["axm help getting-started", "How to set up and configure AXM"],
      ["axm help basic-usage", "How to use AXM"],
      ["axm help workspace-state", "How locators and accepted resolutions differ"],
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
