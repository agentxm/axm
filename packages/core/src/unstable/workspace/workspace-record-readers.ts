/**
 * Workspace record readers.
 *
 * Centralizes the mutation facade's record projection over `WorkspaceReadModel`
 * subject rows.
 */

import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import type * as Path from "effect/Path";
import type { AppError } from "../app-error/index.js";
import {
  parseFullyQualifiedNameParts,
  type ExtensionName,
  type InstallableExtensionType,
} from "../extensions/index.js";
import { createDefaultSettings } from "../settings/index.js";
import { expandGlob } from "../utils/index.js";
import type { LockfileReadError, SettingsReadError } from "./context/errors.js";
import type { ScopedWorkspaceReadModel } from "./context/context.js";
import { deriveSourceMetaFromLockType } from "./source-metadata.js";
import type { WorkspaceRecordRow, PackagingKind } from "./workspace-record-types.js";

type WorkspaceManagedExtensionType = InstallableExtensionType;

type ReadScopedContext = <A>(
  f: (scoped: ScopedWorkspaceReadModel) => Effect.Effect<A, SettingsReadError | LockfileReadError>,
) => Effect.Effect<A, AppError>;

export interface WorkspaceRecordReaders {
  readonly getWorkspaceRecordRows: (
    type: WorkspaceManagedExtensionType,
  ) => Effect.Effect<ReadonlyArray<WorkspaceRecordRow>, AppError>;
}

export const makeWorkspaceRecordReaders = (args: {
  readonly baseDir: string;
  readonly path: Path.Path;
  readonly readScopedContext: ReadScopedContext;
}): WorkspaceRecordReaders => {
  const packagingKindForSource = (
    type: WorkspaceManagedExtensionType,
    source: string,
  ): PackagingKind => {
    if (type === "pack") return "native";
    if (type === "skill") {
      return source.includes("/skills/") || source.startsWith("@") ? "native" : "non-native";
    }
    return source.includes("/") && source.startsWith("@") ? "native" : "non-native";
  };

  const packagingKindForResolved = (
    resolved: Option.Option<{ readonly lockEntry: { readonly type: string } }>,
    type: WorkspaceManagedExtensionType,
    source: string,
  ): PackagingKind =>
    Option.match(resolved, {
      onNone: () => packagingKindForSource(type, source),
      onSome: (row) => deriveSourceMetaFromLockType(row.lockEntry.type).packagingKind,
    });

  const isIgnoredName = (patterns: ReadonlyArray<string>, name: string): boolean =>
    patterns.some((pattern) => expandGlob(pattern, [name]).length > 0);

  const resolvedRowToImplicit = (
    type: WorkspaceManagedExtensionType,
    row: { readonly name: string; readonly lockEntry: { readonly type: string } },
  ): Option.Option<WorkspaceRecordRow> =>
    deriveSourceMetaFromLockType(row.lockEntry.type).packagingKind === "native"
      ? Option.some({
          type,
          name: row.name,
          source: Option.none(),
          enabled: true,
          packagingKind: "native",
          lifecycle: "implicit",
        })
      : Option.none();

  const packMemberNames = (
    packs: ReadonlyArray<{
      readonly lockEntry: {
        readonly resolvedSkills?: Readonly<Record<string, unknown>>;
        readonly resolvedCommands?: Readonly<Record<string, unknown>>;
        readonly resolvedMcpServers?: Readonly<Record<string, unknown>>;
        readonly resolvedSubagents?: Readonly<Record<string, unknown>>;
      };
    }>,
    key: "resolvedSkills" | "resolvedCommands" | "resolvedMcpServers" | "resolvedSubagents",
  ): ReadonlyArray<ExtensionName> => {
    const names: Array<ExtensionName> = [];
    for (const pack of packs) {
      const resolved = pack.lockEntry[key] ?? {};
      for (const fqn of Object.keys(resolved)) {
        const parsed = parseFullyQualifiedNameParts(fqn);
        if (parsed !== undefined) names.push(parsed.name);
      }
    }
    return [...new Set(names)].sort();
  };

  const packMemberToImplicit = (
    type: WorkspaceManagedExtensionType,
    name: string,
  ): WorkspaceRecordRow => ({
    type,
    name,
    source: Option.none(),
    enabled: true,
    packagingKind: "native",
    lifecycle: "implicit",
  });

  const installedRowToWorkspaceRecordRow = <
    TDeclared extends {
      readonly entry: { readonly source: string; readonly enabled?: boolean };
    },
    TPackMember,
  >(
    type: WorkspaceManagedExtensionType,
    row: {
      readonly key: { readonly name: string };
      readonly installationOrigin:
        | { readonly _tag: "direct"; readonly declared: TDeclared }
        | { readonly _tag: "pack-member"; readonly member: TPackMember };
      readonly activation: "enabled" | "disabled";
      readonly resolved: Option.Option<{ readonly lockEntry: { readonly type: string } }>;
    },
  ): WorkspaceRecordRow => {
    if (row.installationOrigin._tag === "direct") {
      const source = row.installationOrigin.declared.entry.source;
      return {
        type,
        name: row.key.name,
        source,
        enabled: row.activation === "enabled",
        packagingKind: packagingKindForResolved(row.resolved, type, source),
        lifecycle: "configured",
      };
    }

    return packMemberToImplicit(type, row.key.name);
  };

  const unmanagedRowToWorkspaceRecordRow = (
    type: WorkspaceManagedExtensionType,
    row: {
      readonly key: { readonly name: string };
      readonly actual: { readonly contentRoot?: string | null };
    },
  ): WorkspaceRecordRow => ({
    type,
    name: row.key.name,
    source: Option.none(),
    enabled: true,
    packagingKind: type === "pack" ? "native" : "non-native",
    locations:
      typeof row.actual.contentRoot === "string"
        ? [args.path.relative(args.baseDir, row.actual.contentRoot)]
        : [],
    lifecycle: "unmanaged",
  });

  type ResolvedWorkspaceRecordInput = {
    readonly name: string;
    readonly keyName?: string;
    readonly lockEntry: { readonly type: string };
  };

  type UnmanagedWorkspaceRecordInput = {
    readonly key: { readonly name: string };
    readonly actual: { readonly contentRoot?: string | null };
  };

  const collectWorkspaceRecordRows = <
    TDeclared extends {
      readonly entry: { readonly source: string; readonly enabled?: boolean };
    },
    TPackMember,
  >(input: {
    readonly type: WorkspaceManagedExtensionType;
    readonly installed: ReadonlyArray<{
      readonly key: { readonly name: string };
      readonly installationOrigin:
        | { readonly _tag: "direct"; readonly declared: TDeclared }
        | { readonly _tag: "pack-member"; readonly member: TPackMember };
      readonly activation: "enabled" | "disabled";
      readonly resolved: Option.Option<{ readonly lockEntry: { readonly type: string } }>;
    }>;
    readonly resolved: Option.Option<ReadonlyArray<ResolvedWorkspaceRecordInput>>;
    readonly unmanaged: ReadonlyArray<UnmanagedWorkspaceRecordInput>;
    readonly ignored: ReadonlyArray<string>;
    readonly packMemberNames?: ReadonlyArray<ExtensionName>;
  }): ReadonlyArray<WorkspaceRecordRow> => {
    const claimed = new Set<string>(input.installed.map((row) => row.key.name));
    const directImplicit = Option.getOrElse(input.resolved, () => [])
      .filter((row) => !claimed.has(row.name))
      .map((row) => ({ ...row, name: row.keyName ?? row.name }))
      .filter((row) => !claimed.has(row.name) && !isIgnoredName(input.ignored, row.name))
      .flatMap((row) => Option.getOrElse(resolvedRowToImplicit(input.type, row), () => []));
    const packImplicit = (input.packMemberNames ?? [])
      .filter((name) => !claimed.has(name) && !isIgnoredName(input.ignored, name))
      .map((name) => packMemberToImplicit(input.type, name));

    return [
      ...input.installed.map((row) => installedRowToWorkspaceRecordRow(input.type, row)),
      ...directImplicit,
      ...packImplicit,
      ...input.unmanaged
        .filter((row) => !isIgnoredName(input.ignored, row.key.name))
        .map((row) => unmanagedRowToWorkspaceRecordRow(input.type, row)),
    ];
  };

  const getWorkspaceRecordRows = (type: WorkspaceManagedExtensionType) =>
    args.readScopedContext((scoped) =>
      Effect.gen(function* () {
        switch (type) {
          case "skill": {
            const settings = yield* scoped.state.settings;
            const installed = yield* scoped.skills.installed;
            const resolved = yield* scoped.skills.resolved;
            const unmanaged = yield* scoped.skills.unmanaged;
            const ignored =
              Option.getOrElse(settings, () => createDefaultSettings()).ignored?.skills ?? [];
            return collectWorkspaceRecordRows({ type, installed, resolved, unmanaged, ignored });
          }
          case "command": {
            const settings = yield* scoped.state.settings;
            const installed = yield* scoped.commands.installed;
            const resolved = yield* scoped.commands.resolved;
            const packs = yield* scoped.packs.resolved;
            const unmanaged = yield* scoped.commands.unmanaged;
            const ignored =
              Option.getOrElse(settings, () => createDefaultSettings()).ignored?.commands ?? [];
            return collectWorkspaceRecordRows({
              type,
              installed,
              resolved,
              unmanaged,
              ignored,
              packMemberNames: packMemberNames(
                Option.getOrElse(packs, () => []),
                "resolvedCommands",
              ),
            });
          }
          case "mcp-server": {
            const settings = yield* scoped.state.settings;
            const installed = yield* scoped.mcpServers.installed;
            const resolved = yield* scoped.mcpServers.resolved;
            const unmanaged = yield* scoped.mcpServers.unmanaged;
            const ignored =
              Option.getOrElse(settings, () => createDefaultSettings()).ignored?.mcpServers ?? [];
            return collectWorkspaceRecordRows({ type, installed, resolved, unmanaged, ignored });
          }
          case "pack": {
            const settings = yield* scoped.state.settings;
            const installed = yield* scoped.packs.installed;
            const resolved = yield* scoped.packs.resolved;
            const unmanaged = yield* scoped.packs.unmanaged;
            const ignored =
              Option.getOrElse(settings, () => createDefaultSettings()).ignored?.packs ?? [];
            return collectWorkspaceRecordRows({ type, installed, resolved, unmanaged, ignored });
          }
          case "subagent": {
            const settings = yield* scoped.state.settings;
            const installed = yield* scoped.subagents.installed;
            const resolved = yield* scoped.subagents.resolved;
            const packs = yield* scoped.packs.resolved;
            const unmanaged = yield* scoped.subagents.unmanaged;
            const ignored =
              Option.getOrElse(settings, () => createDefaultSettings()).ignored?.subagents ?? [];
            return collectWorkspaceRecordRows({
              type,
              installed,
              resolved,
              unmanaged,
              ignored,
              packMemberNames: packMemberNames(
                Option.getOrElse(packs, () => []),
                "resolvedSubagents",
              ),
            });
          }
        }
      }),
    );

  return { getWorkspaceRecordRows };
};
