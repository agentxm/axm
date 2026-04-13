import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Path from "effect/Path";
import {
  extensionTypeSentenceLabels,
  toInstallableExtensionTypePlural,
  type InstallableExtensionType,
} from "../../extensions/index.js";
import { readSettingsOrDefault } from "../../settings/index.js";
import { Workspace } from "../service-interface.js";
import {
  resolveConfiguredCommand,
  resolveConfiguredMcpServer,
  resolveConfiguredPack,
  resolveConfiguredSkill,
  resolveConfiguredSubagent,
  toConfiguredEntryFailureReason,
  withConfiguredEntryResolutionTimeout,
  type ConfiguredEntryFailureReason,
} from "../configured-entry-resolution/index.js";
import type { SettingsEntryBlocker } from "./types.js";

const noSettingsEntryBlockers: ReadonlyArray<SettingsEntryBlocker> = [];

const sortByName = <T extends { readonly name: string }>(
  items: ReadonlyArray<T>,
): ReadonlyArray<T> => [...items].sort((left, right) => left.name.localeCompare(right.name));

const blockerMessage = (
  reason: ConfiguredEntryFailureReason,
  type: InstallableExtensionType,
  name: string,
  source: string,
): string => {
  const typeLabel = extensionTypeSentenceLabels[type];
  switch (reason) {
    case "entry-malformed":
      return `The ${typeLabel} entry "${name}" has a malformed source.`;
    case "source-not-found":
      return `No ${typeLabel} named "${name}" was found at "${source}".`;
    case "source-multiple-matches":
      return `The source "${source}" matches more than one ${typeLabel}.`;
    case "source-resolution-failed":
      return `Could not resolve the source for ${typeLabel} "${name}".`;
    case "source-timeout":
      return `Timed out while checking the ${typeLabel} "${source}".`;
  }
};

const blockerHint = (
  reason: ConfiguredEntryFailureReason,
  type: InstallableExtensionType,
  name: string,
): string => {
  const typePlural = toInstallableExtensionTypePlural(type);
  switch (reason) {
    case "entry-malformed":
      return `Use a name like "@owner/${typePlural}/name".`;
    case "source-not-found":
      return `Check that the source points to the correct extension, or remove "${name}" from settings.json.`;
    case "source-multiple-matches":
      return `Narrow the source for "${name}" in settings.json so it identifies exactly one extension.`;
    case "source-resolution-failed":
      return `Check the source for ${extensionTypeSentenceLabels[type]} "${name}" in settings.json.`;
    case "source-timeout":
      return `Check that the source is reachable, then run \`axm doctor\` again.`;
  }
};

interface ConfiguredEntryToCheck {
  readonly type: InstallableExtensionType;
  readonly name: string;
  readonly source: string;
}

const buildConfiguredExtensionEntries = () =>
  Effect.gen(function* () {
    const ws = yield* Workspace;
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const settings = yield* readSettingsOrDefault(ws.path).pipe(
      Effect.provideService(Path.Path, path),
      Effect.provideService(FileSystem.FileSystem, fs),
    );

    const entries: ReadonlyArray<ConfiguredEntryToCheck> = [
      ...Object.entries(settings.skills ?? {}).map(([name, entry]) => ({
        type: "skill" as const,
        name,
        source: entry.source,
      })),
      ...Object.entries(settings.commands ?? {}).map(([name, entry]) => ({
        type: "command" as const,
        name,
        source: entry.source,
      })),
      ...Object.entries(settings.subagents ?? {}).map(([name, entry]) => ({
        type: "subagent" as const,
        name,
        source: entry.source,
      })),
      ...Object.entries(settings.mcpServers ?? {}).map(([name, entry]) => ({
        type: "mcp-server" as const,
        name,
        source: entry.source,
      })),
      ...Object.entries(settings.packs ?? {}).map(([name, entry]) => ({
        type: "pack" as const,
        name,
        source: entry.source,
      })),
    ];

    return sortByName(entries);
  });

const checkConfiguredEntry = (entry: ConfiguredEntryToCheck) =>
  Effect.gen(function* () {
    switch (entry.type) {
      case "skill":
        yield* resolveConfiguredSkill(entry.name, entry.source);
        return;
      case "command":
        yield* resolveConfiguredCommand(entry.name, entry.source);
        return;
      case "subagent":
        yield* resolveConfiguredSubagent(entry.name, entry.source);
        return;
      case "mcp-server":
        yield* resolveConfiguredMcpServer(entry.name, entry.source);
        return;
      case "pack":
        yield* resolveConfiguredPack(entry.name, entry.source);
        return;
    }
  });

const blockerForEntry = (
  entry: ConfiguredEntryToCheck,
  reason: ConfiguredEntryFailureReason,
): ReadonlyArray<SettingsEntryBlocker> => [
  {
    reason,
    subject: { kind: "extension", ref: `${entry.type}:${entry.name}` },
    message: blockerMessage(reason, entry.type, entry.name, entry.source),
    hint: blockerHint(reason, entry.type, entry.name),
  },
];

const entryBlockersFromConfigured = () =>
  Effect.gen(function* () {
    const entries = yield* buildConfiguredExtensionEntries();

    const blockers = yield* Effect.forEach(
      entries,
      (entry) =>
        checkConfiguredEntry(entry).pipe(
          withConfiguredEntryResolutionTimeout(entry.source),
          Effect.as(noSettingsEntryBlockers),
          Effect.catch((error) =>
            Effect.succeed(blockerForEntry(entry, toConfiguredEntryFailureReason(error))),
          ),
        ),
      { concurrency: "unbounded" },
    ).pipe(
      Effect.map(
        (items): ReadonlyArray<SettingsEntryBlocker> =>
          items.flatMap((entryBlockers) => entryBlockers),
      ),
    );

    return blockers;
  });

export const detectSettingsEntryBlockers = () => entryBlockersFromConfigured();
