import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import type { ExtensionType } from "@agentxm/extension-model/unstable/extensions";
import {
  SettingsReader,
  SettingsWriter,
  settingsEntries,
  WorkspaceMutations,
  type DesiredExtensionNode,
  type Settings,
} from "@agentxm/workspace-state";
import { WorkspaceSyncFailed } from "./errors.js";

/** A command's explicit change to intent; reconciliation itself supplies none. */
export type DesiredStateChange =
  | {
      readonly kind: "activation";
      readonly type: ExtensionType;
      readonly name: string;
      readonly enabled: boolean;
    }
  | { readonly kind: "remove"; readonly type: ExtensionType; readonly name: string };

const activatedSettings = (
  settings: Settings,
  change: Extract<DesiredStateChange, { readonly kind: "activation" }>,
  node: DesiredExtensionNode,
): Settings => {
  if (change.type === "mcp-server") {
    const accessor = settingsEntries["mcp-server"];
    const current = accessor.entry(settings, change.name);
    if (Option.isSome(current))
      return accessor.set(settings, change.name, { ...current.value, enabled: change.enabled });
    if (node.authority === "inline") return settings;
    return accessor.set(settings, change.name, {
      kind: "sourced",
      source: node.source,
      enabled: change.enabled,
      env: {},
    });
  }
  const accessor = settingsEntries[change.type];
  const current = accessor.entry(settings, change.name);
  if (Option.isSome(current))
    return accessor.set(settings, change.name, { ...current.value, enabled: change.enabled });
  if (node.authority === "inline") return settings;
  return accessor.set(settings, change.name, { source: node.source, enabled: change.enabled });
};

/** Evaluate proposed intent without writing settings, locks, or package content. */
export const proposeDesiredState = (changes: ReadonlyArray<DesiredStateChange>) =>
  Effect.gen(function* () {
    const ws = yield* WorkspaceMutations;
    const reader = yield* SettingsReader;
    const before = yield* ws.getDesiredStateGraph();
    const original = yield* reader.settings;
    let settings = original;
    for (const change of changes) {
      if (change.kind === "remove") {
        settings = settingsEntries[change.type].remove(settings, change.name);
        continue;
      }
      const node = before.nodes.find(
        (entry) => entry.type === change.type && entry.name === change.name,
      );
      if (node === undefined) {
        return yield* new WorkspaceSyncFailed({
          category: "not_found",
          detail: `Desired ${change.type} "${change.name}" was not found`,
        });
      }
      settings = activatedSettings(settings, change, node);
    }
    const after = yield* ws.getDesiredStateGraph({ settings });
    return { before, after, settings, changes };
  });

/** Publish only the entries the command explicitly changed. */
export const publishDesiredState = (proposal: {
  readonly settings: Settings;
  readonly changes: ReadonlyArray<DesiredStateChange>;
}) =>
  Effect.gen(function* () {
    const writer = yield* SettingsWriter;
    for (const change of proposal.changes) {
      if (change.kind === "remove") {
        yield* writer.removeEntry(change.type, change.name);
      } else if (change.type === "mcp-server") {
        const entry = settingsEntries["mcp-server"].entry(proposal.settings, change.name);
        if (Option.isSome(entry)) yield* writer.setEntry("mcp-server", change.name, entry.value);
      } else {
        const entry = settingsEntries[change.type].entry(proposal.settings, change.name);
        if (Option.isSome(entry)) yield* writer.setEntry(change.type, change.name, entry.value);
      }
    }
  });

export type DesiredStateProposal = Effect.Success<ReturnType<typeof proposeDesiredState>>;
