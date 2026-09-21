import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import type { ExtensionType } from "@agentxm/extension-model/unstable/extensions";
import {
  SettingsReader,
  SettingsWriter,
  settingsEntries,
  DesiredStateReader,
  type Settings,
} from "../desired-state/index.js";
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

/**
 * Record an activation preference without inventing acquisition intent.
 *
 * The typed accessor owns the decision: an entry that already exists keeps
 * whatever it declares — a source and its range, or an inline MCP definition —
 * and only its activation moves. When no entry exists yet, the extension
 * reached the workspace through a Pack, so the preference is written as a
 * configuration-only entry, leaving the Pack the sole owner of the member's
 * source and version constraint.
 */
const activatedSettings = (
  settings: Settings,
  change: Extract<DesiredStateChange, { readonly kind: "activation" }>,
): Settings => settingsEntries[change.type].setActivation(settings, change.name, change.enabled);

/** Evaluate proposed intent without writing settings, locks, or package content. */
export const proposeDesiredState = (changes: ReadonlyArray<DesiredStateChange>) =>
  Effect.gen(function* () {
    const desiredState = yield* DesiredStateReader;
    const reader = yield* SettingsReader;
    const before = yield* desiredState.graph();
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
      settings = activatedSettings(settings, change);
    }
    const after = yield* desiredState.graph({ settings });
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
