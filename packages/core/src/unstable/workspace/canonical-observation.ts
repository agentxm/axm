import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Path from "effect/Path";
import * as Result from "effect/Result";
import * as Schema from "effect/Schema";
import * as semver from "semver";
import {
  computePackageContentHash,
  parseExtensionFqnParts,
  toExtensionTypePlural,
  type ExtensionType,
} from "../extensions/index.js";
import { HookManifestSchema } from "../hooks/index.js";
import { KnowledgeManifestSchema } from "../knowledge/index.js";
import { McpServerManifestSchema } from "../mcps/index.js";
import { PackManifestSchema } from "../packs/index.js";
import { RuleManifestSchema } from "../rules/index.js";
import { computeSkillSourceHash, SkillManifestSchema } from "../skills/index.js";
import { computeLegacySkillSourceHash } from "../skills/operations/source-hash.js";
import { SubagentManifestSchema } from "../subagents/index.js";
import type { ExtensionTrustRecord } from "../trust/index.js";
import type { DesiredExtensionNode } from "./desired-state-graph.js";

export type CanonicalObservationStatus =
  | "not-applicable"
  | "missing"
  | "missing-trust"
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
  readonly trust: ExtensionTrustRecord | undefined;
}

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

export const canonicalPathForTrustedExtension = (
  path: Path.Path,
  baseDir: string,
  desired: DesiredExtensionNode,
  trust: ExtensionTrustRecord,
): string | undefined => {
  if (trust.authority === "inline") return undefined;
  if (trust.authority === "registry" || trust.authority === "workspace") {
    const identity =
      trust.authority === "workspace"
        ? trust.sourceIdentity.slice("workspace:".length)
        : trust.sourceIdentity;
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

const computeObservedContentIdentity = (
  fs: FileSystem.FileSystem,
  path: Path.Path,
  root: string,
  type: ExtensionType,
  trust: ExtensionTrustRecord,
) =>
  Effect.gen(function* () {
    switch (type) {
      case "skill": {
        if (trust.authority === "registry" || trust.authority === "workspace") {
          return yield* computePackageContentHash(root);
        }
        const src = path.join(root, "src");
        const hashRoot = (yield* fs.exists(src)) ? src : root;
        return yield* computeSkillSourceHash(hashRoot);
      }
      case "subagent":
      case "mcp-server":
      case "rule":
      case "hook":
      case "knowledge":
      case "pack":
        return yield* computePackageContentHash(root);
    }
  });

export const observeCanonicalExtension = ({
  baseDir,
  desired,
  trust,
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
    if (trust === undefined) {
      return {
        type: desired.type,
        name: desired.name,
        status: "missing-trust",
      };
    }
    if (trust.sourceIdentity !== desired.identity) {
      return {
        type: desired.type,
        name: desired.name,
        status: "wrong-origin",
      };
    }
    if (
      desired.constraints.length > 0 &&
      (trust.resolvedVersion === undefined ||
        desired.constraints.some(
          (constraint) => !semver.satisfies(trust.resolvedVersion ?? "", constraint),
        ))
    ) {
      return {
        type: desired.type,
        name: desired.name,
        status: "constraint-mismatch",
      };
    }

    const root = canonicalPathForTrustedExtension(path, baseDir, desired, trust);
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

    const contentIdentity = yield* computeObservedContentIdentity(
      fs,
      path,
      root,
      desired.type,
      trust,
    ).pipe(Effect.result);
    if (Result.isFailure(contentIdentity)) {
      return { type: desired.type, name: desired.name, status: "corrupt", path: root };
    }
    const observedIdentity = contentIdentity.success;
    if (trust.contentIdentity === undefined) {
      return {
        type: desired.type,
        name: desired.name,
        status: "wrong-origin",
        path: root,
        contentIdentity: observedIdentity,
      };
    }
    if (trust.contentIdentity !== observedIdentity) {
      if (
        desired.type === "skill" &&
        trust.authority !== "registry" &&
        trust.authority !== "workspace"
      ) {
        const src = path.join(root, "src");
        const hashRoot = (yield* fs.exists(src).pipe(Effect.orElseSucceed(() => false)))
          ? src
          : root;
        const legacyIdentity = yield* computeLegacySkillSourceHash(hashRoot).pipe(Effect.result);
        if (Result.isSuccess(legacyIdentity) && trust.contentIdentity === legacyIdentity.success) {
          return {
            type: desired.type,
            name: desired.name,
            status: "usable",
            path: root,
            contentIdentity: observedIdentity,
          };
        }
      }
      return {
        type: desired.type,
        name: desired.name,
        status: "locally-modified",
        path: root,
        contentIdentity: observedIdentity,
      };
    }
    return {
      type: desired.type,
      name: desired.name,
      status: "usable",
      path: root,
      contentIdentity: observedIdentity,
    };
  });
