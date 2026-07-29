import type { ExtensionType } from "../extensions/common.js";
import { toExtensionTypePlural } from "../extensions/common.js";
import type { ExtensionRef } from "../extensions/index.js";
import { makeAppError, type AppError } from "../app-error/index.js";
import * as Effect from "effect/Effect";
import type {
  CommandLockEntry,
  FilesLockEntry,
  HookLockEntry,
  KnowledgeLockEntry,
  Lockfile,
  McpServerLockEntry,
  PackLockEntry,
  RuleLockEntry,
  SkillLockEntry,
  SubagentLockEntry,
} from "../lockfile/index.js";
import { lockEntryToSourceParams, printSourceParams } from "../sources/index.js";
import {
  TRUST_STATE_VERSION,
  type ExtensionTrustRecord,
  type WorkspaceTrustState,
} from "./schema.js";

type LeafLockEntry =
  | SkillLockEntry
  | CommandLockEntry
  | McpServerLockEntry
  | SubagentLockEntry
  | FilesLockEntry
  | RuleLockEntry
  | HookLockEntry
  | KnowledgeLockEntry;

const packageContentIdentity = (sourceHash: string | undefined): string | undefined => sourceHash;

export const trustRecordKey = (type: ExtensionType, name: string): string => `${type}:${name}`;

export const trustedRegistryVersion = (
  state: WorkspaceTrustState,
  type: ExtensionType,
  name: string,
): string | undefined => {
  const record = state.records[trustRecordKey(type, name)];
  return record?.authority === "registry" ? record.resolvedVersion : undefined;
};

const refName = (ref: ExtensionRef): string => {
  switch (ref.type) {
    case "skill":
      return ref.skill.name;
    case "command":
      return ref.command.name;
    case "mcp-server":
      return ref.server.name;
    case "subagent":
      return ref.subagent.name;
    case "files":
      return ref.file.name;
    case "rule":
      return ref.rule.name;
    case "hook":
      return ref.hook.name;
    case "knowledge":
      return ref.knowledge.name;
    case "pack":
      return ref.pack.name;
  }
};

const registryRefIdentity = (
  ref: Extract<ExtensionRef, { readonly refType: "registry" }>,
): string => `${ref.owner}/${toExtensionTypePlural(ref.type)}/${ref.name}`;

export const trustedRegistryVersionForRef = (
  state: WorkspaceTrustState,
  ref: ExtensionRef,
): string | undefined => {
  if (ref.refType !== "registry") return undefined;
  const record = state.records[trustRecordKey(ref.type, refName(ref))];
  if (
    record?.authority !== "registry" ||
    record.sourceIdentity !== registryRefIdentity(ref) ||
    record.publisherBindingId !== ref.publisherBindingId
  ) {
    return undefined;
  }
  return record.resolvedVersion;
};

/**
 * A frozen Registry handle epoch cannot be crossed implicitly. Changing to a
 * different source identity is an explicit install transition; reusing the
 * same identity with a different publisher epoch is a supply-chain conflict.
 */
export const validateRefTrustTransition = (
  state: WorkspaceTrustState,
  ref: ExtensionRef,
): Effect.Effect<void, AppError> => {
  if (ref.refType !== "registry") return Effect.void;
  const name = refName(ref);
  const record = state.records[trustRecordKey(ref.type, name)];
  if (
    record?.authority === "registry" &&
    record.sourceIdentity === registryRefIdentity(ref) &&
    record.publisherBindingId !== undefined &&
    record.publisherBindingId !== ref.publisherBindingId
  ) {
    return Effect.fail(
      makeAppError({
        code: "conflict",
        detail: `Publisher identity changed for ${ref.type} "${name}". Refusing to cross the frozen publisher epoch unattended.`,
        suggestions: [
          {
            description:
              "Verify the new publisher identity, then remove and reinstall the extension explicitly.",
          },
        ],
      }),
    );
  }
  return Effect.void;
};

const leafTrustRecord = (
  extensionType: Exclude<ExtensionType, "pack">,
  name: string,
  entry: LeafLockEntry,
): ExtensionTrustRecord => {
  if (entry.type === "inline") {
    return {
      extensionType,
      name,
      authority: "inline",
      sourceIdentity: "inline",
    };
  }

  const base = {
    extensionType,
    name,
    authority: entry.type,
    sourceIdentity:
      entry.type === "registry"
        ? `${entry.owner}/${toExtensionTypePlural(extensionType)}/${entry.name}`
        : printSourceParams(lockEntryToSourceParams(entry)),
  } satisfies Pick<ExtensionTrustRecord, "extensionType" | "name" | "authority" | "sourceIdentity">;

  switch (entry.type) {
    case "registry": {
      const contentIdentity = packageContentIdentity(entry.sourceHash);
      return {
        ...base,
        sourceName: entry.sourceName,
        resolvedVersion: entry.resolvedVersion,
        publisherBindingId: entry.publisherBindingId,
        integrity: entry.integrity,
        ...(contentIdentity === undefined ? {} : { contentIdentity }),
      };
    }
    case "workspace":
      return {
        ...base,
        resolvedVersion: entry.version,
        contentIdentity: entry.sourceHash,
      };
    case "github":
    case "gitlab":
    case "bitbucket":
    case "azurerepos":
    case "git": {
      const contentIdentity = packageContentIdentity(entry.sourceHash);
      return {
        ...base,
        ...(entry.gitTreeHash === undefined ? {} : { immutableRevision: entry.gitTreeHash }),
        ...(contentIdentity === undefined ? {} : { contentIdentity }),
      };
    }
    case "local": {
      const contentIdentity = packageContentIdentity(entry.sourceHash);
      return {
        ...base,
        ...(contentIdentity === undefined ? {} : { contentIdentity }),
      };
    }
  }
};

const packTrustRecord = (name: string, entry: PackLockEntry): ExtensionTrustRecord => {
  const sourceIdentity = `${entry.owner}/packs/${entry.name}`;
  return entry.type === "registry"
    ? {
        extensionType: "pack",
        name,
        authority: "registry",
        sourceIdentity,
        sourceName: entry.sourceName,
        resolvedVersion: entry.resolvedVersion,
        publisherBindingId: entry.publisherBindingId,
        integrity: entry.integrity,
        ...(entry.sourceHash === undefined ? {} : { contentIdentity: entry.sourceHash }),
      }
    : {
        extensionType: "pack",
        name,
        authority: "workspace",
        sourceIdentity: `workspace:${sourceIdentity}`,
        resolvedVersion: entry.version,
        contentIdentity: entry.sourceHash,
      };
};

const addLeafRecords = (
  records: Record<string, ExtensionTrustRecord>,
  extensionType: Exclude<ExtensionType, "pack">,
  entries: Readonly<Record<string, LeafLockEntry>> | undefined,
): void => {
  for (const [name, entry] of Object.entries(entries ?? {})) {
    records[trustRecordKey(extensionType, name)] = leafTrustRecord(extensionType, name, entry);
  }
};

export const trustStateFromLockfile = (lockfile: Lockfile): WorkspaceTrustState => {
  const records: Record<string, ExtensionTrustRecord> = {};
  addLeafRecords(records, "skill", lockfile.skills);
  addLeafRecords(records, "command", lockfile.commands);
  addLeafRecords(records, "mcp-server", lockfile.mcpServers);
  addLeafRecords(records, "subagent", lockfile.subagents);
  addLeafRecords(records, "files", lockfile.files);
  addLeafRecords(records, "rule", lockfile.rules);
  addLeafRecords(records, "hook", lockfile.hooks);
  addLeafRecords(records, "knowledge", lockfile.knowledge);
  for (const [name, entry] of Object.entries(lockfile.packs ?? {})) {
    records[trustRecordKey("pack", name)] = packTrustRecord(name, entry);
  }
  return { trustStateVersion: TRUST_STATE_VERSION, records };
};
