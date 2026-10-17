import * as Result from "effect/Result";
import type { AgentOutputObservation } from "./agent-output-observation.js";

export type NativeOutputConcern =
  | { readonly kind: "broken-link"; readonly path: string; readonly target: string }
  | { readonly kind: "unreadable"; readonly path: string; readonly reason: string }
  | {
      readonly kind: "collision";
      readonly path: string;
      readonly otherPath: string;
      readonly entryName: string;
      readonly extensionType: "skill" | "subagent";
      readonly agentIds: ReadonlyArray<string>;
    };

const named = (output: AgentOutputObservation) =>
  output.extensionType === "skill" || output.extensionType === "subagent";

const entryPath = (output: AgentOutputObservation): string =>
  output.nativeEntry !== undefined && Result.isSuccess(output.nativeEntry)
    ? output.nativeEntry.success.entryPath
    : output.path;

const usable = (output: AgentOutputObservation): boolean => {
  // Prospective setup outputs have no observed entry yet.
  if (output.nativeEntry === undefined) return true;
  return (
    Result.isSuccess(output.nativeEntry) &&
    output.nativeEntry.success.kind !== "absent" &&
    output.nativeEntry.success.referentPath !== undefined
  );
};

/** One physical link is one concern, regardless of how many agents read it. */
export const classifyNativeOutputHealth = (
  outputs: ReadonlyArray<AgentOutputObservation>,
): ReadonlyArray<NativeOutputConcern> => {
  const concerns = new Map<string, NativeOutputConcern>();
  for (const output of outputs) {
    if (!named(output) || output.nativeEntry === undefined) continue;
    const resolution = output.nativeEntry;
    if (Result.isFailure(resolution)) {
      concerns.set(output.path, {
        kind: "unreadable",
        path: output.path,
        reason: resolution.failure.reason,
      });
      continue;
    }
    const entry = resolution.success;
    if (
      entry.kind === "symlink" &&
      entry.referentPath === undefined &&
      entry.linkTarget !== undefined
    ) {
      concerns.set(entry.entryPath, {
        kind: "broken-link",
        path: entry.entryPath,
        target: entry.linkTarget,
      });
    }
  }
  return [...concerns.values()].sort((left, right) => left.path.localeCompare(right.path));
};

/** Compare usable or prospective project entries with usable user entries. */
export const classifyNativeOutputCollisions = (
  project: ReadonlyArray<AgentOutputObservation>,
  user: ReadonlyArray<AgentOutputObservation>,
  configuredAgentIds: ReadonlySet<string>,
): ReadonlyArray<NativeOutputConcern> => {
  const concerns = new Map<string, Extract<NativeOutputConcern, { readonly kind: "collision" }>>();
  for (const output of project) {
    if (
      (output.extensionType !== "skill" && output.extensionType !== "subagent") ||
      !usable(output)
    )
      continue;
    for (const other of user) {
      if (
        other.extensionType !== output.extensionType ||
        other.entryName !== output.entryName ||
        !usable(other)
      )
        continue;
      const path = entryPath(output);
      const otherPath = entryPath(other);
      if (path === otherPath) continue;
      const agentIds = output.claimantAgentIds.filter(
        (id) => configuredAgentIds.has(id) && other.claimantAgentIds.includes(id),
      );
      if (agentIds.length === 0) continue;
      const key = JSON.stringify([output.extensionType, path, otherPath]);
      const previous = concerns.get(key);
      concerns.set(key, {
        kind: "collision",
        path,
        otherPath,
        entryName: output.entryName,
        extensionType: output.extensionType,
        agentIds: [...new Set([...(previous?.agentIds ?? []), ...agentIds])].sort(),
      });
    }
  }
  return [...concerns.values()].sort(
    (left, right) =>
      left.path.localeCompare(right.path) || left.otherPath.localeCompare(right.otherPath),
  );
};
