import * as Schema from "effect/Schema";

import {
  CommandSnapshotSchema,
  type BenchmarkMode,
  type BenchmarkOperation,
  type BenchmarkFlagClassification,
  type CommandSnapshot,
} from "./model.js";

export const parseCommandSnapshot = Schema.decodeUnknownSync(CommandSnapshotSchema, {
  onExcessProperty: "error",
});

export const operationId = (route: ReadonlyArray<string>): string =>
  route.length === 0 ? "(root)" : route.join(" ");

/**
 * Capability modes are authoritative effect switches. These additional parsed
 * flags change the evidence or output and therefore require separate samples.
 * Other inputs remain in the snapshot so a changed flag surface is visible.
 */
const observationModes = new Set([
  "details",
  "plain",
  "staged",
  "render",
  "raw",
  "detected",
  "available",
  "outdated",
  "deprecated",
  "bundled",
  "fuzzy",
  "include-index-backlinks",
  "include-dependencies",
  "all-versions",
]);

const dimensions: Readonly<Record<string, ReadonlyArray<string>>> = {
  scope: ["scope", "directory"],
  source: [
    "source",
    "registry",
    "path",
    "source-agent",
    "lock",
    "ecosystem",
    "package-version",
    "include-path",
    "exclude-path",
  ],
  selection: [
    "agent",
    "all",
    "as",
    "available",
    "detected",
    "exclude",
    "extension",
    "fixture",
    "hook",
    "implementation",
    "knowledge",
    "mcp-server",
    "name",
    "owner",
    "pack",
    "package",
    "rule",
    "skill",
    "subagent",
    "type",
    "bundle",
  ],
  query: [
    "field",
    "property",
    "metadata",
    "lifecycle",
    "tag",
    "kind",
    "status",
    "limit",
    "cursor",
    "depth",
    "include-index-backlinks",
    "fuzzy",
  ],
  output: [
    "format",
    "render",
    "raw",
    "plain",
    "passages",
    "passage-length",
    "verbose",
    "debug",
    "quiet",
    "json",
  ],
  view: ["staged"],
  state: [
    "clear-message",
    "clear-replacement",
    "enable",
    "backfill",
    "reinstall",
    "gitignore",
    "include-dependencies",
    "all-versions",
    "bundled",
  ],
};
const policies = new Set([
  "accept-warnings",
  "accept-execution-changes",
  "replace-unrecorded",
  "ignore-release-age",
  "discard-modified",
  "fail-on-change",
  "strict",
  "if-revision",
  "review-sha256",
]);
const interactions = new Set([
  "yes",
  "non-interactive",
  "device-code",
  "new-account",
  "wait-for-human",
  "restart",
]);
const fixtureInputs = new Set([
  "instructions",
  "description",
  "bind",
  "bind-env",
  "distribution",
  "native-oauth",
  "connection",
  "transport",
  "arg",
  "cwd",
  "header-env",
  "command",
  "url",
  "env",
  "header",
  "title",
  "configuration",
  "runtime",
  "protocol",
  "event",
  "matcher",
  "file",
  "resource",
  "visibility",
  "category",
  "message",
  "reason",
  "replacement",
  "expires",
  "permission",
]);

const classifyFlag = (
  flag: CommandSnapshot["globalFlags"][number],
  modes: ReadonlyArray<BenchmarkMode>,
): BenchmarkFlagClassification => {
  const base = {
    name: flag.name,
    rationale: flag.description ?? `Parameter ${flag.name}`,
    choices: flag.choices ?? [],
  };
  if (modes.some((mode) => mode.flags.includes(`--${flag.name}`)))
    return { ...base, category: "mode", dimension: "operation" };
  if (policies.has(flag.name))
    return { ...base, category: "policy", dimension: "failure-and-authorization" };
  if (interactions.has(flag.name))
    return { ...base, category: "interaction", dimension: "interaction" };
  for (const [dimension, names] of Object.entries(dimensions))
    if (names.includes(flag.name)) return { ...base, category: "dimension", dimension };
  if (fixtureInputs.has(flag.name))
    return { ...base, category: "fixture-input", dimension: "configuration" };
  return { ...base, category: "unclassified", dimension: "unclassified" };
};

export const benchmarkOperations = (snapshot: CommandSnapshot): ReadonlyArray<BenchmarkOperation> =>
  snapshot.entries.map((entry) => {
    const modes = new Map<string, BenchmarkMode>();
    const add = (mode: BenchmarkMode): void => {
      modes.set(mode.id, mode);
    };
    add({
      id: "default",
      kind: "operation",
      flags: [],
      arguments: [],
      effect: entry.capabilities.effect,
    });
    add({ id: "help", kind: "help", flags: ["--help"], arguments: [], effect: "none" });
    add({
      id: "json",
      kind: "operation",
      flags: ["--json"],
      arguments: [],
      effect: entry.capabilities.effect,
    });
    add({
      id: "help-json",
      kind: "help",
      flags: ["--help", "--json"],
      arguments: [],
      effect: "none",
    });
    if (entry.capabilities.preview)
      add({
        id: "preview",
        kind: "operation",
        flags: ["--preview"],
        arguments: [],
        effect: "none",
      });
    for (const mode of entry.capabilities.modes)
      add({
        id: mode.flag.replace(/^--/u, ""),
        kind: "operation",
        flags: [mode.flag],
        arguments: [],
        effect: mode.effect,
      });
    for (const flag of entry.flags) {
      if (observationModes.has(flag.name))
        add({
          id: flag.name,
          kind: "operation",
          flags: [`--${flag.name}`],
          arguments: [],
          effect: entry.capabilities.effect,
        });
    }
    if (entry.flags.some((flag) => flag.name === "gitignore"))
      add({
        id: "no-gitignore",
        kind: "operation",
        flags: ["--no-gitignore"],
        arguments: [],
        effect: entry.capabilities.effect,
      });
    if (entry.path.length === 0)
      add({ id: "version", kind: "version", flags: ["--version"], arguments: [], effect: "none" });
    if (operationId(entry.path) === "help") {
      for (const topic of snapshot.helpTopics) {
        add({
          id: `topic:${topic.name}`,
          kind: "topic",
          flags: [],
          arguments: [topic.name],
          effect: "none",
          format: topic.kind,
        });
        add({
          id: `topic-json:${topic.name}`,
          kind: "topic",
          flags: ["--json"],
          arguments: [topic.name],
          effect: "none",
          format: topic.kind,
        });
      }
    }
    return {
      id: operationId(entry.path),
      route: entry.path,
      aliases: entry.aliases,
      effect: entry.capabilities.effect,
      inputs: entry.capabilities.inputs,
      description: entry.description,
      childCount: entry.childCount,
      groupOnly: entry.groupOnly,
      ownFlags: entry.flags.map((flag) => flag.name).sort(),
      flagClassifications: [...entry.flags, ...snapshot.globalFlags].map((flag) =>
        classifyFlag(flag, [...modes.values()]),
      ),
      arguments: entry.arguments,
      modes: [...modes.values()],
    };
  });

/** A changed registration requires reconciliation, even if its route is stable. */
export const compareCommandInventories = (
  baseline: CommandSnapshot,
  candidate: CommandSnapshot,
): ReadonlyArray<string> => {
  const before = new Map(baseline.entries.map((entry) => [operationId(entry.path), entry]));
  const after = new Map(candidate.entries.map((entry) => [operationId(entry.path), entry]));
  const changes: string[] = [];
  for (const [id, entry] of after) {
    const previous = before.get(id);
    if (previous === undefined) changes.push(`added operation: ${id}`);
    else if (JSON.stringify(previous) !== JSON.stringify(entry))
      changes.push(`changed registration: ${id}`);
  }
  for (const id of before.keys()) if (!after.has(id)) changes.push(`removed operation: ${id}`);
  if (JSON.stringify(baseline.helpTopics) !== JSON.stringify(candidate.helpTopics))
    changes.push("changed help topic inventory");
  if (JSON.stringify(baseline.globalFlags) !== JSON.stringify(candidate.globalFlags))
    changes.push("changed global flag inventory");
  return changes;
};
