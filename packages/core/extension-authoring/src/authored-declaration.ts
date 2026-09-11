/**
 * How a workspace declares that it authors a package, for every extension
 * type.
 *
 * Creating, forking, adopting, and importing all answer the same three
 * questions — is this name already declared, what activation does it carry,
 * and what accepted external resolution does becoming authored retire — and
 * every one of them answers it per type. Deciding it once here is what keeps
 * the four use cases from repeating a seven-way table each, and what makes a
 * new extension type a compile error in one place instead of four.
 *
 * @experimental This API is unstable and may change without notice.
 */

import * as Effect from "effect/Effect";
import * as Option from "effect/Option";

import type { ExtensionType } from "@agentxm/extension-model/unstable/extensions";
import {
  type WorkspaceLockfileMutationFailure,
  type WorkspaceMutationsService,
  type WorkspaceSettingsMutationFailure,
  type WorkspaceSettingsReadFailure,
  type WorkspaceStateMutationFailure,
} from "@agentxm/workspace-state";

/** What the workspace currently declares about one name of one type. */
export interface AuthoredDeclarationState {
  /** Whether any entry of this type carries this name. */
  readonly configured: boolean;
  /** The activation the existing entry carries, or none when undeclared. */
  readonly enabled: Option.Option<boolean>;
  /** The source the entry names, or none when undeclared or sourceless. */
  readonly source: Option.Option<string>;
  /**
   * Connection inputs an existing MCP declaration carries. Empty for every
   * other type, which declares no inputs.
   */
  readonly env: Readonly<Record<string, string>>;
}

/** Reading and writing one workspace declaration. */
export interface AuthoredDeclaration {
  readonly read: Effect.Effect<AuthoredDeclarationState, WorkspaceSettingsReadFailure>;
  /** Declare the name as workspace-authored with the given activation. */
  readonly declare: (args: {
    readonly enabled: boolean;
    /** Inputs to preserve on an MCP declaration; ignored by other types. */
    readonly env?: Readonly<Record<string, string>>;
  }) => Effect.Effect<void, WorkspaceSettingsMutationFailure>;
  /**
   * Retire the accepted external resolution the name held before the
   * workspace took authorship of it.
   */
  readonly retireExternalResolution: Effect.Effect<
    void,
    WorkspaceLockfileMutationFailure | WorkspaceStateMutationFailure
  >;
}

const WORKSPACE_SOURCE = "workspace";

const entrySource = (entry: unknown): Option.Option<string> => {
  if (typeof entry === "string") return Option.some(entry);
  if (typeof entry !== "object" || entry === null || !("source" in entry)) return Option.none();
  return typeof entry.source === "string" ? Option.some(entry.source) : Option.none();
};

const state = (
  entry: { readonly enabled?: boolean } | string | undefined,
  env: Readonly<Record<string, string>> = {},
): AuthoredDeclarationState => ({
  configured: entry !== undefined,
  enabled:
    entry === undefined
      ? Option.none()
      : Option.some(typeof entry === "string" ? true : (entry.enabled ?? true)),
  source: entrySource(entry),
  env,
});

/** The declaration surface for one extension type and name. */
export const authoredDeclaration = (
  ws: WorkspaceMutationsService,
  type: ExtensionType,
  name: string,
): AuthoredDeclaration => {
  switch (type) {
    case "skill":
      return {
        read: ws.getConfiguredSkillEntries().pipe(Effect.map((entries) => state(entries[name]))),
        declare: ({ enabled }) => ws.setSkillEntry(name, { source: WORKSPACE_SOURCE, enabled }),
        retireExternalResolution: ws.removeSkillLock(name),
      };
    case "subagent":
      return {
        read: ws.getConfiguredSubagentEntries().pipe(Effect.map((entries) => state(entries[name]))),
        declare: ({ enabled }) => ws.setSubagentEntry(name, { source: WORKSPACE_SOURCE, enabled }),
        retireExternalResolution: ws.removeSubagentLock(name),
      };
    case "rule":
      return {
        read: ws.getConfiguredRuleEntries().pipe(Effect.map((entries) => state(entries[name]))),
        declare: ({ enabled }) => ws.setRuleEntry(name, { source: WORKSPACE_SOURCE, enabled }),
        retireExternalResolution: ws.removeRuleLock(name),
      };
    case "hook":
      return {
        read: ws.getConfiguredHookEntries().pipe(Effect.map((entries) => state(entries[name]))),
        declare: ({ enabled }) => ws.setHookEntry(name, { source: WORKSPACE_SOURCE, enabled }),
        retireExternalResolution: ws.removeHookLock(name),
      };
    case "knowledge":
      return {
        read: ws
          .getConfiguredKnowledgeEntries()
          .pipe(Effect.map((entries) => state(entries[name]))),
        declare: ({ enabled }) => ws.setKnowledgeEntry(name, { source: WORKSPACE_SOURCE, enabled }),
        retireExternalResolution: ws.removeKnowledgeLock(name),
      };
    case "pack":
      return {
        read: ws.getConfiguredPackEntries().pipe(Effect.map((entries) => state(entries[name]))),
        declare: ({ enabled }) => ws.setPackEntry(name, { source: WORKSPACE_SOURCE, enabled }),
        retireExternalResolution: ws.removePackLock(name),
      };
    case "mcp-server":
      return {
        read: ws
          .getConfiguredMcpServerEntries()
          .pipe(Effect.map((entries) => state(entries[name], entries[name]?.env ?? {}))),
        declare: ({ enabled, env }) =>
          ws.setMcpServerEntry(name, { source: WORKSPACE_SOURCE, enabled, env: env ?? {} }),
        // Resolve the old connection before its workspace declaration replaces
        // it, preserving any resolution still shared by another connection.
        retireExternalResolution: ws.removeMcpServer(name),
      };
  }
};
