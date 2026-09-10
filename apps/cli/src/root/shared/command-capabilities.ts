/**
 * Command interaction capabilities.
 *
 * Every registered command declares, beside its definition, what it can do
 * without applying, which confirmation it can approve in advance, which
 * interactive-only trust conditions it can meet, how it resolves its inputs,
 * and what persistent state it touches. The declaration is attached through
 * the command annotation mechanism, so the command tree carries it and a
 * static gate can compare every node's declaration with its parsed flags and
 * its executable evidence. Flags that express a capability are built from the
 * narrow builders below, so a command cannot register `--preview` or `--yes`
 * without the declaration that gives the flag its meaning.
 *
 * The declaration states expectations; it is never itself the proof. Purpose
 * fixtures in the executable specifications demonstrate the effects.
 */

import * as ServiceMap from "effect/Context";
import { Command, Flag } from "effect/unstable/cli";

import { previewFlag, yesFlag } from "../../cli-flags/index.js";

/** The persistent state an applying invocation can change. */
export type CommandEffect =
  | "none"
  | "workspace"
  | "authored-source"
  | "registry"
  | "credentials"
  | "installation"
  | "application-state";

/** How a command obtains the inputs an assessment or apply needs. */
export type CommandInputResolution =
  "none" | "explicit" | "explicit-or-documented-defaults" | "explicit-or-interactive-selection";

/** An interactive-only trust condition a route can meet while applying. */
export type CommandTrustCondition = "publisher-change";

/** An executable mode a flag switches a command into. */
export interface CommandMode {
  readonly flag: string;
  readonly effect: CommandEffect;
}

export interface CommandCapabilities {
  /** The command assesses its intended change without applying it under `--preview`. */
  readonly preview: boolean;
  /**
   * The one documented confirmation `--yes` approves in advance, or `null`
   * when the command confirms nothing that can be approved in advance.
   */
  readonly preapproval: { readonly purpose: string } | null;
  /** Trust conditions the command can meet; each requires interactive approval. */
  readonly trust: ReadonlyArray<CommandTrustCondition>;
  readonly inputs: CommandInputResolution;
  /** The persistent state the default invocation changes when it applies. */
  readonly effect: CommandEffect;
  /** Flags that switch the default invocation into a different effect. */
  readonly modes?: ReadonlyArray<CommandMode>;
}

/**
 * The annotation every registered command carries. Reading a command with no
 * declaration yields `undefined`, which the architecture gate treats as an
 * unclassified route.
 */
export const CommandCapabilitiesAnnotation: ServiceMap.Reference<CommandCapabilities | undefined> =
  ServiceMap.Reference<CommandCapabilities | undefined>("axm/command-capabilities", {
    defaultValue: () => undefined,
  });

export const withCommandCapabilities =
  (capabilities: CommandCapabilities) =>
  <Name extends string, Input, ContextInput, E, R>(
    self: Command.Command<Name, Input, ContextInput, E, R>,
  ): Command.Command<Name, Input, ContextInput, E, R> =>
    Command.annotate(self, CommandCapabilitiesAnnotation, capabilities);

export const readCommandCapabilities = (
  command: Command.Command.Any,
): CommandCapabilities | undefined =>
  ServiceMap.get(command.annotations, CommandCapabilitiesAnnotation);

/** A node that only groups subcommands and executes nothing itself. */
export const groupCapabilities: CommandCapabilities = {
  preview: false,
  preapproval: null,
  trust: [],
  inputs: "none",
  effect: "none",
};

/** A command that reports or queries and changes no persistent state. */
export const readOnlyCapabilities = (
  inputs: CommandInputResolution = "explicit",
): CommandCapabilities => ({
  preview: false,
  preapproval: null,
  trust: [],
  inputs,
  effect: "none",
});

/** A command that changes state directly without an assessment mode. */
export const directWriteCapabilities = (
  effect: Exclude<CommandEffect, "none">,
  options: {
    readonly inputs?: CommandInputResolution;
    readonly modes?: ReadonlyArray<CommandMode>;
  } = {},
): CommandCapabilities => ({
  preview: false,
  preapproval: null,
  trust: [],
  inputs: options.inputs ?? "explicit",
  effect,
  ...(options.modes === undefined ? {} : { modes: options.modes }),
});

/** A command that assesses under `--preview` and confirms nothing in advance. */
export const previewableCapabilities = (
  effect: Exclude<CommandEffect, "none">,
  options: {
    readonly inputs?: CommandInputResolution;
    readonly trust?: ReadonlyArray<CommandTrustCondition>;
  } = {},
): CommandCapabilities => ({
  preview: true,
  preapproval: null,
  trust: options.trust ?? [],
  inputs: options.inputs ?? "explicit",
  effect,
});

/**
 * The assessment flag for a command whose capabilities declare preview. The
 * description may be specialized; the spelling is fixed.
 */
export const previewCapabilityFlag = (description?: string) =>
  description === undefined ? previewFlag : previewFlag.pipe(Flag.withDescription(description));

/**
 * The preapproval flag for a command whose capabilities declare a
 * preapprovable confirmation. Its description names that confirmation, so
 * help states the purpose the flag serves on this command.
 */
export const preapprovalCapabilityFlag = (capabilities: {
  readonly preapproval: { readonly purpose: string };
}) => yesFlag.pipe(Flag.withDescription(capabilities.preapproval.purpose));

export interface RegisteredCommandCapabilities {
  readonly path: ReadonlyArray<string>;
  readonly command: Command.Command.Any;
  readonly capabilities: CommandCapabilities | undefined;
}

/** Every registered command with its declaration, walked from the given root. */
export const registeredCommandCapabilities = (
  command: Command.Command.Any,
  path: ReadonlyArray<string> = [],
): ReadonlyArray<RegisteredCommandCapabilities> => [
  { path, command, capabilities: readCommandCapabilities(command) },
  ...command.subcommands.flatMap((group) =>
    group.commands.flatMap((child) => registeredCommandCapabilities(child, [...path, child.name])),
  ),
];
