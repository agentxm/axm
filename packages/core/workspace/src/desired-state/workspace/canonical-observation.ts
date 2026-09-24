import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Option from "effect/Option";
import * as Path from "effect/Path";
import * as Result from "effect/Result";
import * as Schema from "effect/Schema";
import * as semver from "semver";
import { computeMaterializedTreeIntegrity } from "./materialized-tree.js";
import {
  toExtensionTypePlural,
  type ExtensionType,
} from "@agentxm/extension-model/unstable/extensions";
import { HookManifestSchema } from "@agentxm/extension-model/unstable/hooks/manifest-schema";
import { KnowledgeManifestSchema } from "@agentxm/extension-model/unstable/knowledge";
import { McpServerManifestSchema } from "@agentxm/extension-model/unstable/mcps/manifest-schema";
import { PackManifestSchema } from "@agentxm/extension-model/unstable/packs/manifest-schema";
import { RuleManifestSchema } from "@agentxm/extension-model/unstable/rules/manifest-schema";
import { parseSkillMd } from "@agentxm/extension-content";
import { SkillManifestSchema } from "@agentxm/extension-model/unstable/skills/manifest-schema";
import { SubagentManifestSchema } from "@agentxm/extension-model/unstable/subagents/manifest-schema";
import type {
  HookLockEntry,
  KnowledgeLockEntry,
  McpServerLockEntry,
  PackLockEntry,
  RuleLockEntry,
  SkillLockEntry,
  SubagentLockEntry,
} from "../lockfile/index.js";
import { printSourceParams } from "@agentxm/extension-model/unstable/sources/printer";
import {
  lockEntryMatchesSourceLocator,
  lockEntryToSourceParams,
} from "./lock-entry-to-source-params.js";
import {
  collectDesiredConstraintContributors,
  type DesiredConstraintContributor,
  type DesiredExtensionNode,
} from "./desired-state-graph.js";
import type { WorkspaceLayout } from "./layout.js";
import {
  computeExtensionPathsForLayout,
  extensionPathSourceFromLockEntry,
} from "./extension-paths.js";
import { mcpResolutionKey } from "./mcp-source-identity.js";

export type CanonicalObservationStatus =
  | "not-applicable"
  | "missing"
  | "missing-resolution"
  | "constraint-mismatch"
  | "wrong-origin"
  | "corrupt"
  | "incomplete"
  | "materialization-mismatch"
  | "usable";

export type CanonicalConstraintContributor = DesiredConstraintContributor;

interface CanonicalObservationBase {
  readonly type: ExtensionType;
  readonly name: string;
  readonly path?: string;
  readonly contentIdentity?: string;
}

export interface CanonicalConstraintMismatchObservation extends CanonicalObservationBase {
  readonly status: "constraint-mismatch";
  readonly authority: {
    readonly source: "desired-state-graph";
    readonly identity: string;
    readonly locator: string;
    readonly constraints: ReadonlyArray<CanonicalConstraintContributor>;
  };
  readonly acceptedVersion?: string;
  readonly observedVersion?: string;
}

export type CanonicalObservation =
  | CanonicalConstraintMismatchObservation
  | (CanonicalObservationBase & {
      readonly status: Exclude<CanonicalObservationStatus, "constraint-mismatch">;
    });

interface ObserveCanonicalArgs {
  readonly layout: WorkspaceLayout;
  readonly desired: DesiredExtensionNode;
  readonly accepted: AcceptedExtensionResolution | undefined;
}

export type AcceptedExtensionResolution =
  | SkillLockEntry
  | McpServerLockEntry
  | SubagentLockEntry
  | RuleLockEntry
  | HookLockEntry
  | KnowledgeLockEntry
  | PackLockEntry;

const isRegistryResolution = (
  entry: AcceptedExtensionResolution,
): entry is Extract<
  AcceptedExtensionResolution,
  { readonly source: { readonly type: "registry" } }
> => entry.source.type === "registry";

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
  layout: WorkspaceLayout,
  desired: DesiredExtensionNode,
  accepted: AcceptedExtensionResolution | undefined,
): string | undefined => {
  if (desired.source === undefined) return undefined;
  if (desired.identity.startsWith("bundled:")) {
    return path.join(layout.acquiredRoot, "registry", "@agentxm", "skills", desired.name);
  }
  if (desired.identity.startsWith("workspace:")) {
    if (layout.scope === "project")
      return path.join(layout.authoredRoot(desired.type), desired.name);
    return undefined;
  }
  if (accepted === undefined) return undefined;
  const source = extensionPathSourceFromLockEntry(accepted);
  return computeExtensionPathsForLayout(
    path.join,
    layout,
    source,
    toExtensionTypePlural(desired.type),
    accepted.identity.name,
  ).canonicalPath;
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
      return Effect.map(Effect.all([fs.exists(path.join(root, "src", "SKILL.md"))]), (exists) =>
        exists.some(Boolean),
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

const constraintMismatchObservation = (args: {
  readonly desired: DesiredExtensionNode & { readonly source: string };
  readonly canonicalPath?: string;
  readonly acceptedVersion?: string;
  readonly observedVersion?: string;
}): CanonicalConstraintMismatchObservation => ({
  type: args.desired.type,
  name: args.desired.name,
  status: "constraint-mismatch",
  ...(args.canonicalPath === undefined ? {} : { path: args.canonicalPath }),
  authority: {
    source: "desired-state-graph",
    identity: args.desired.identity,
    locator: args.desired.source,
    constraints: collectDesiredConstraintContributors(args.desired.origins),
  },
  ...(args.acceptedVersion === undefined ? {} : { acceptedVersion: args.acceptedVersion }),
  ...(args.observedVersion === undefined ? {} : { observedVersion: args.observedVersion }),
});

const acceptedOriginMatches = (
  desired: DesiredExtensionNode & { readonly source: string },
  accepted: AcceptedExtensionResolution,
): boolean => {
  const acceptedIdentity =
    desired.type === "mcp-server"
      ? mcpResolutionKey(accepted)
      : isRegistryResolution(accepted)
        ? `${accepted.identity.owner}/${toExtensionTypePlural(desired.type)}/${accepted.identity.name}`
        : printSourceParams(lockEntryToSourceParams(accepted));
  return (
    acceptedIdentity === desired.identity ||
    acceptedIdentity === desired.source ||
    lockEntryMatchesSourceLocator(accepted, desired.source)
  );
};

/**
 * Judge the accepted resolution for a desired node before any content is
 * read: whether a node needs one, whether one is recorded, whether it names
 * the desired origin, and whether its version satisfies every desired
 * constraint. `none` means that authority stands and the canonical content
 * decides the rest of the observation. Workspace-authored content has no
 * accepted resolution; its manifest is judged with the content. Activation is
 * not an input: a disabled node is judged exactly like an enabled one.
 */
export const observeAcceptedResolution = (
  desired: DesiredExtensionNode,
  accepted: AcceptedExtensionResolution | undefined,
): Option.Option<CanonicalObservation> => {
  if (desired.source === undefined) {
    return Option.some({ type: desired.type, name: desired.name, status: "not-applicable" });
  }
  if (desired.identity.startsWith("workspace:")) return Option.none();
  const bundled = desired.identity.startsWith("bundled:");
  if (!bundled && accepted === undefined) {
    return Option.some({ type: desired.type, name: desired.name, status: "missing-resolution" });
  }
  if (!bundled && accepted !== undefined && !acceptedOriginMatches(desired, accepted)) {
    return Option.some({ type: desired.type, name: desired.name, status: "wrong-origin" });
  }
  if (
    desired.constraints.length > 0 &&
    (accepted === undefined ||
      !isRegistryResolution(accepted) ||
      desired.constraints.some(
        (constraint) => !semver.satisfies(accepted.resolved.version, constraint),
      ))
  ) {
    return Option.some(
      constraintMismatchObservation({
        desired,
        ...(accepted !== undefined && isRegistryResolution(accepted)
          ? { acceptedVersion: accepted.resolved.version }
          : {}),
      }),
    );
  }
  return Option.none();
};

export const observeCanonicalExtension = ({
  layout,
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
    if (desired.source === undefined) {
      return { type: desired.type, name: desired.name, status: "not-applicable" };
    }
    const judged = observeAcceptedResolution(desired, accepted);
    const root = canonicalPathForAcceptedExtension(path, layout, desired, accepted);
    if (Option.isSome(judged)) {
      return judged.value.status === "constraint-mismatch" && root !== undefined
        ? { ...judged.value, path: root }
        : judged.value;
    }
    const workspaceAuthored = desired.identity.startsWith("workspace:");
    const bundled = desired.identity.startsWith("bundled:");
    if (root === undefined) {
      return { type: desired.type, name: desired.name, status: "wrong-origin" };
    }
    const exists = yield* fs.exists(root).pipe(Effect.orElseSucceed(() => false));
    if (!exists) {
      return { type: desired.type, name: desired.name, status: "missing", path: root };
    }

    if (
      desired.type === "skill" &&
      accepted !== undefined &&
      accepted.identity.owner === undefined
    ) {
      const skillMdPath = path.join(root, "SKILL.md");
      const skillMdExists = yield* fs.exists(skillMdPath).pipe(Effect.orElseSucceed(() => false));
      if (!skillMdExists) {
        return { type: desired.type, name: desired.name, status: "incomplete", path: root };
      }

      const raw = yield* fs.readFileString(skillMdPath).pipe(Effect.result);
      if (Result.isFailure(raw)) {
        return { type: desired.type, name: desired.name, status: "corrupt", path: root };
      }
      if (Option.isNone(parseSkillMd(raw.success, accepted.identity.name))) {
        return { type: desired.type, name: desired.name, status: "corrupt", path: root };
      }

      const observedIntegrity = yield* Effect.result(computeMaterializedTreeIntegrity(root));
      if (
        Result.isFailure(observedIntegrity) ||
        observedIntegrity.success !== accepted.treeIntegrity
      ) {
        return {
          type: desired.type,
          name: desired.name,
          status: "materialization-mismatch",
          path: root,
        };
      }

      return {
        type: desired.type,
        name: desired.name,
        status: "usable",
        path: root,
      };
    }

    const contract = MANIFEST_CONTRACTS[desired.type];
    const manifestPath = path.join(root, contract.filename);
    const manifestExists = yield* fs.exists(manifestPath).pipe(Effect.orElseSucceed(() => false));
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
    const expectedOwner = bundled
      ? "@agentxm"
      : workspaceAuthored
        ? layout.owner
        : accepted?.identity.owner;
    const expectedName = bundled || workspaceAuthored ? desired.name : accepted?.identity.name;
    if (
      typeof parsed !== "object" ||
      parsed === null ||
      !("owner" in parsed) ||
      parsed.owner !== expectedOwner ||
      !("name" in parsed) ||
      parsed.name !== expectedName ||
      !("type" in parsed) ||
      parsed.type !== desired.type
    ) {
      return { type: desired.type, name: desired.name, status: "wrong-origin", path: root };
    }
    const manifestVersion =
      "version" in parsed && typeof parsed.version === "string" ? parsed.version : undefined;

    // Authored content has no accepted version: its manifest is what the
    // desired constraints judge.
    if (
      workspaceAuthored &&
      desired.constraints.length > 0 &&
      (manifestVersion === undefined ||
        desired.constraints.some((constraint) => !semver.satisfies(manifestVersion, constraint)))
    ) {
      return constraintMismatchObservation({
        desired,
        canonicalPath: root,
        ...(manifestVersion === undefined ? {} : { observedVersion: manifestVersion }),
      });
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

    if (!workspaceAuthored && accepted !== undefined) {
      const observedIntegrity = yield* Effect.result(computeMaterializedTreeIntegrity(root));
      if (
        Result.isFailure(observedIntegrity) ||
        observedIntegrity.success !== accepted.treeIntegrity
      ) {
        return {
          type: desired.type,
          name: desired.name,
          status: "materialization-mismatch",
          path: root,
        };
      }
    }

    return {
      type: desired.type,
      name: desired.name,
      status: "usable",
      path: root,
    };
  });
