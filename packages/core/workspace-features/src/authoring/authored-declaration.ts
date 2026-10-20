import type {
  McpAuth,
  McpBinding,
  McpDistribution,
} from "@agentxm/workspace-kernel/agent-adapters";
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
  type AcceptedResolutionWriterService,
  type DesiredStateWriterService,
  type SettingsReaderService,
  type SettingsWriterService,
  type WorkspaceLockfileMutationFailure,
  type WorkspaceSettingsMutationFailure,
  type WorkspaceSettingsReadFailure,
  type WorkspaceStateMutationFailure,
} from "@agentxm/workspace-kernel/workspace-state";

export interface AuthoredMcpPreferences {
  readonly distribution?: McpDistribution;
  readonly bindings?: ReadonlyArray<McpBinding>;
  readonly auth?: McpAuth;
}

/** What the workspace currently declares about one name of one type. */
interface AuthoredDeclarationState {
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
  readonly mcpPreferences: AuthoredMcpPreferences;
}

/** Reading and writing one workspace declaration. */
export interface AuthoredDeclaration {
  readonly read: Effect.Effect<AuthoredDeclarationState, WorkspaceSettingsReadFailure>;
  /** Declare the name as workspace-authored with the given activation. */
  readonly declare: (args: {
    readonly enabled: boolean;
    /** Inputs to preserve on an MCP declaration; ignored by other types. */
    readonly mcpPreferences?: AuthoredMcpPreferences;
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
  mcpPreferences: AuthoredMcpPreferences = {},
): AuthoredDeclarationState => ({
  configured: entry !== undefined,
  enabled:
    entry === undefined
      ? Option.none()
      : Option.some(typeof entry === "string" ? true : (entry.enabled ?? true)),
  source: entrySource(entry),
  mcpPreferences,
});

/** The declaration surface for one extension type and name. */
export const authoredDeclaration = (
  ports: {
    readonly settings: SettingsReaderService;
    readonly settingsWriter: SettingsWriterService;
    readonly accepted: AcceptedResolutionWriterService;
    readonly desiredStateWriter: DesiredStateWriterService;
  },
  type: ExtensionType,
  name: string,
  options?: { readonly roundTrip?: boolean },
): AuthoredDeclaration => {
  if (type === "mcp-server") {
    return {
      read: ports.settings.entries("mcp-server").pipe(
        Effect.map((entries) =>
          state(entries[name], {
            ...(entries[name]?.distribution === undefined
              ? {}
              : { distribution: entries[name].distribution }),
            ...(entries[name]?.bindings === undefined ? {} : { bindings: entries[name].bindings }),
            ...(entries[name]?.auth === undefined ? {} : { auth: entries[name].auth }),
          }),
        ),
      ),
      declare: ({ enabled, mcpPreferences }) =>
        Effect.gen(function* () {
          const existing = (yield* ports.settings.entries("mcp-server"))[name];
          yield* ports.settingsWriter.setEntry(
            "mcp-server",
            name,
            {
              kind: "sourced",
              source: WORKSPACE_SOURCE,
              enabled,
              ...(existing?.distribution === undefined
                ? {}
                : { distribution: existing.distribution }),
              ...(existing?.bindings === undefined ? {} : { bindings: existing.bindings }),
              ...(existing?.auth === undefined ? {} : { auth: existing.auth }),
              ...mcpPreferences,
            },
            options,
          );
        }),
      // Resolve the old connection before its workspace declaration replaces
      // it, preserving any resolution still shared by another connection.
      retireExternalResolution: ports.desiredStateWriter.undeclare("mcp-server", name),
    };
  }
  return {
    read: ports.settings.entries(type).pipe(Effect.map((entries) => state(entries[name]))),
    declare: ({ enabled }) =>
      ports.settingsWriter.setEntry(type, name, { source: WORKSPACE_SOURCE, enabled }, options),
    retireExternalResolution: ports.accepted.removeAccepted(type, name),
  };
};
