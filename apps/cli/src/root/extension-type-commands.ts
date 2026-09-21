/**
 * Per-type command modules, keyed by extension type id.
 *
 * Root help groups its commands from this record rather than a hand-maintained
 * list, so a new row in the extension type table cannot ship a command the root
 * help never lists. The `satisfies Record<ExtensionType, Command.Any>` is
 * load-bearing in both directions: a new type without an entry is a missing
 * key, and an entry for something that is not an extension type is an excess
 * property.
 *
 * The record is `as const` so each value keeps its concrete command type — the
 * derived array below stays a union of those types, which is what lets
 * `Command.withSubcommands` keep inferring the error and service channels.
 */

import type * as CliCommand from "effect/unstable/cli/Command";

import { extensionTypes, type ExtensionType } from "@agentxm/extension-model/unstable/extensions";

import { hooksCommand } from "./hooks/_hooks.js";
import { knowledgeCommand } from "./knowledge/_knowledge.js";
import { mcpsCommand } from "./mcps/_mcps.js";
import { packsCommand } from "./packs/_packs.js";
import { rulesCommand } from "./rules/_rules.js";
import { skillsCommand } from "./skills/_skills.js";
import { subagentsCommand } from "./subagents/_subagents.js";

export const EXTENSION_TYPE_COMMANDS = {
  skill: skillsCommand,
  "mcp-server": mcpsCommand,
  subagent: subagentsCommand,
  rule: rulesCommand,
  hook: hooksCommand,
  knowledge: knowledgeCommand,
  pack: packsCommand,
} as const satisfies Record<ExtensionType, CliCommand.Command.Any>;

/**
 * Every type command, in extension type table order. Root help names one type
 * namespace per catalog row, so the catalog decides both membership and order.
 */
export const extensionTypeCommands = extensionTypes.map((type) => EXTENSION_TYPE_COMMANDS[type]);
