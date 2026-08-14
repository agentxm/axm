import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Path from "effect/Path";
import * as Result from "effect/Result";
import * as Schema from "effect/Schema";
import * as semver from "semver";
import {
  parseExtensionFqnParts,
  toExtensionTypePlural,
  type ExtensionType,
} from "../extensions/index.js";
import { HookManifestSchema } from "../hooks/index.js";
import { KnowledgeManifestSchema } from "../knowledge/index.js";
import { McpServerManifestSchema } from "../mcps/index.js";
import { PackManifestSchema } from "../packs/index.js";
import { RuleManifestSchema } from "../rules/index.js";
import { SkillManifestSchema } from "../skills/index.js";
import { SubagentManifestSchema } from "../subagents/index.js";
import type { PackLockEntry, SkillLockEntry } from "../lockfile/index.js";
import { lockEntryToSourceParams, printSourceParams } from "../sources/index.js";
import type { DesiredExtensionNode } from "./desired-state-graph.js";

export type CanonicalObservationStatus =
  | "not-applicable"
  | "missing"
  | "missing-resolution"
  | "constraint-mismatch"
  | "wrong-origin"
  | "corrupt"
  | "incomplete"
  | "locally-modified"
  | "usable";

export interface CanonicalObservation {
  readonly type: ExtensionType;
  readonly name: string;
  readonly status: CanonicalObservationStatus;
  readonly path?: string;
  readonly contentIdentity?: string;
}

interface ObserveCanonicalArgs {
  readonly baseDir: string;
  readonly desired: DesiredExtensionNode;
  readonly accepted: AcceptedExtensionResolution | undefined;
}

export type AcceptedExtensionResolution = SkillLockEntry | PackLockEntry;

const MANIFEST_CONTRACTS = {
  skill: { filename: "skill.json", schema: SkillManifestSchema },
  "mcp-server": { filename: "mcp.json", schema: McpServerManifestSchema },
  subagent: { filename: "subagent.json", schema: SubagentManifestSchema },
  rule: { filename: "rule.json", schema: RuleManifestSchema },
  hook: { filename: "hook.json", schema: HookManifestSchema },
  knowledge: { filename: "knowledge.json", schema: KnowledgeManifestSchema },
  pack: { filename: "pack.json", schema: PackManifestSchema },
} as const satisfies Record<
  ExtensionType,
  { readonly filename: string; readonly schema: Schema.Top }
>;

export const canonicalPathForAcceptedExtension = (
  path: Path.Path,
  baseDir: string,
  desired: DesiredExtensionNode,
  accepted: AcceptedExtensionResolution | undefined,
): string | undefined => {
  if (desired.source === "inline") return undefined;
  if (desired.identity.startsWith("workspace:") || accepted?.type === "registry") {
    const identity = desired.identity.startsWith("workspace:")
      ? desired.identity.slice("workspace:".length)
      : desired.identity;
    const parsed = parseExtensionFqnParts(identity);
    if (parsed === undefined || parsed.type !== desired.type) return undefined;
    return path.join(
      baseDir,
      ".axm",
      "extensions",
      parsed.owner,
      toExtensionTypePlural(parsed.type),
      parsed.name,
    );
  }
  return path.join(
    baseDir,
    ".axm",
    "extensions",
    "external",
    toExtensionTypePlural(desired.type),
    desired.name,
  );
};

const hasRequiredPayload = (
  fs: FileSystem.FileSystem,
  path: Path.Path,
  root: string,
  type: ExtensionType,
  name: string,
) => {
  switch (type) {
    case "skill":
      return Effect.map(
        Effect.all(
          [fs.exists(path.join(root, "SKILL.md")), fs.exists(path.join(root, "src", "SKILL.md"))],
          { concurrency: "unbounded" },
        ),
        (exists) => exists.some(Boolean),
      );
    case "subagent":
      return fs.exists(path.join(root, "src", `${name}.md`));
    case "rule":
    case "hook":
    case "knowledge":
      return fs.exists(path.join(root, "src"));
    case "mcp-server":
    case "pack":
      return Effect.succeed(true);
  }
};

const parseJson = (raw: string): unknown | undefined => {
  try {
    return JSON.parse(raw);
  } catch {
    return undefined;
  }
};

export const observeCanonicalExtension = ({
  baseDir,
  desired,
  accepted,
}: ObserveCanonicalArgs): Effect.Effect<
  CanonicalObservation,
  never,
  FileSystem.FileSystem | Path.Path
> =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    if (desired.type === "mcp-server" && desired.source === "inline") {
      return {
        type: desired.type,
        name: desired.name,
        status: "not-applicable",
      };
    }
    const workspaceAuthored = desired.identity.startsWith("workspace:");
    if (!workspaceAuthored && accepted === undefined) {
      return {
        type: desired.type,
        name: desired.name,
        status: "missing-resolution",
      };
    }
    const acceptedIdentity =
      accepted?.type === "registry"
        ? `${accepted.owner}/${toExtensionTypePlural(desired.type)}/${accepted.name}`
        : accepted === undefined
          ? undefined
          : printSourceParams(lockEntryToSourceParams(accepted));
    if (
      !workspaceAuthored &&
      acceptedIdentity !== desired.identity &&
      acceptedIdentity !== desired.source
    ) {
      return {
        type: desired.type,
        name: desired.name,
        status: "wrong-origin",
      };
    }
    if (
      !workspaceAuthored &&
      desired.constraints.length > 0 &&
      (accepted?.type !== "registry" ||
        desired.constraints.some(
          (constraint) => !semver.satisfies(accepted.resolvedVersion, constraint),
        ))
    ) {
      return {
        type: desired.type,
        name: desired.name,
        status: "constraint-mismatch",
      };
    }

    const root = canonicalPathForAcceptedExtension(path, baseDir, desired, accepted);
    if (root === undefined) {
      return {
        type: desired.type,
        name: desired.name,
        status: "wrong-origin",
      };
    }
    const exists = yield* fs.exists(root).pipe(Effect.orElseSucceed(() => false));
    if (!exists) {
      return { type: desired.type, name: desired.name, status: "missing", path: root };
    }

    const contract = MANIFEST_CONTRACTS[desired.type];
    const manifestPath = path.join(root, contract.filename);
    const manifestExists = yield* fs.exists(manifestPath).pipe(Effect.orElseSucceed(() => false));
    let manifestVersion: string | undefined;
    if (!(desired.type === "skill" && !manifestExists)) {
      if (!manifestExists) {
        return { type: desired.type, name: desired.name, status: "incomplete", path: root };
      }
      const raw = yield* fs.readFileString(manifestPath).pipe(Effect.result);
      if (Result.isFailure(raw)) {
        return { type: desired.type, name: desired.name, status: "corrupt", path: root };
      }
      const parsed = parseJson(raw.success);
      if (parsed === undefined) {
        return { type: desired.type, name: desired.name, status: "corrupt", path: root };
      }
      const decoded = Schema.decodeUnknownResult(contract.schema)(parsed);
      if (Result.isFailure(decoded)) {
        return { type: desired.type, name: desired.name, status: "corrupt", path: root };
      }
      if (
        typeof parsed === "object" &&
        parsed !== null &&
        "version" in parsed &&
        typeof parsed.version === "string"
      ) {
        manifestVersion = parsed.version;
      }
    }

    if (
      workspaceAuthored &&
      desired.constraints.length > 0 &&
      (manifestVersion === undefined ||
        desired.constraints.some((constraint) => !semver.satisfies(manifestVersion, constraint)))
    ) {
      return {
        type: desired.type,
        name: desired.name,
        status: "constraint-mismatch",
        path: root,
      };
    }

    const payloadComplete = yield* hasRequiredPayload(
      fs,
      path,
      root,
      desired.type,
      desired.name,
    ).pipe(Effect.orElseSucceed(() => false));
    if (!payloadComplete) {
      return { type: desired.type, name: desired.name, status: "incomplete", path: root };
    }

    return {
      type: desired.type,
      name: desired.name,
      status: "usable",
      path: root,
    };
  });
