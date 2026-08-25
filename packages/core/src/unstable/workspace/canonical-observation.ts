import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Path from "effect/Path";
import * as Result from "effect/Result";
import * as Schema from "effect/Schema";
import * as semver from "semver";
import {
  computeMaterializedTreeIntegrity,
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
import type {
  HookLockEntry,
  KnowledgeLockEntry,
  McpServerLockEntry,
  PackLockEntry,
  RuleLockEntry,
  SkillLockEntry,
  SubagentLockEntry,
} from "../lockfile/index.js";
import { lockEntryToSourceParams, printSourceParams } from "../sources/index.js";
import {
  collectDesiredConstraintContributors,
  type DesiredConstraintContributor,
  type DesiredExtensionNode,
} from "./desired-state-graph.js";
import type { WorkspaceLayout } from "./layout.js";
import {
  computeExtensionPathsForLayout,
  extensionPathSourceFromLockEntry,
} from "../extensions/extension-paths.js";

export type CanonicalObservationStatus =
  | "not-applicable"
  | "missing"
  | "missing-resolution"
  | "constraint-mismatch"
  | "wrong-origin"
  | "corrupt"
  | "incomplete"
  | "locally-modified"
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
  if (desired.source === "inline") return undefined;
  if (desired.identity.startsWith("bundled:")) {
    return layout.scope === "project"
      ? path.join(layout.acquiredRoot, "agentxm", "@agentxm", "skills", desired.name)
      : path.join(layout.canonicalRoot, "agentxm", "@agentxm", "skills", desired.name);
  }
  if (desired.identity.startsWith("workspace:")) {
    if (layout.scope === "project")
      return path.join(layout.authoredRoot(desired.type), desired.name);
    const parsed = parseExtensionFqnParts(desired.identity.slice("workspace:".length));
    return parsed === undefined
      ? undefined
      : path.join(
          layout.canonicalRoot,
          parsed.owner,
          toExtensionTypePlural(desired.type),
          desired.name,
        );
  }
  if (accepted === undefined) return undefined;
  const source = extensionPathSourceFromLockEntry(accepted);
  return computeExtensionPathsForLayout(
    path.join,
    layout,
    source,
    toExtensionTypePlural(desired.type),
    accepted.workspaceName,
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
  readonly path: Path.Path;
  readonly desired: DesiredExtensionNode;
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
    constraints: collectDesiredConstraintContributors(args.path, args.desired.origins),
  },
  ...(args.acceptedVersion === undefined ? {} : { acceptedVersion: args.acceptedVersion }),
  ...(args.observedVersion === undefined ? {} : { observedVersion: args.observedVersion }),
});

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
    if (desired.type === "mcp-server" && desired.source === "inline") {
      return {
        type: desired.type,
        name: desired.name,
        status: "not-applicable",
      };
    }
    const workspaceAuthored = desired.identity.startsWith("workspace:");
    const bundled = desired.identity.startsWith("bundled:");
    if (!workspaceAuthored && !bundled && accepted === undefined) {
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
      !bundled &&
      acceptedIdentity !== desired.identity &&
      acceptedIdentity !== desired.source
    ) {
      return {
        type: desired.type,
        name: desired.name,
        status: "wrong-origin",
      };
    }
    const acceptedConstraintMismatch =
      !workspaceAuthored &&
      desired.constraints.length > 0 &&
      (accepted?.type !== "registry" ||
        desired.constraints.some(
          (constraint) => !semver.satisfies(accepted.resolvedVersion, constraint),
        ));
    const acceptedVersion = accepted?.type === "registry" ? accepted.resolvedVersion : undefined;

    const root = canonicalPathForAcceptedExtension(path, layout, desired, accepted);
    if (root === undefined) {
      if (acceptedConstraintMismatch) {
        return constraintMismatchObservation({
          path,
          desired,
          ...(acceptedVersion === undefined ? {} : { acceptedVersion }),
        });
      }
      return {
        type: desired.type,
        name: desired.name,
        status: "wrong-origin",
      };
    }
    const exists = yield* fs.exists(root).pipe(Effect.orElseSucceed(() => false));
    if (!exists) {
      if (acceptedConstraintMismatch) {
        return constraintMismatchObservation({
          path,
          desired,
          canonicalPath: root,
          ...(acceptedVersion === undefined ? {} : { acceptedVersion }),
        });
      }
      return { type: desired.type, name: desired.name, status: "missing", path: root };
    }

    const contract = MANIFEST_CONTRACTS[desired.type];
    const manifestPath = path.join(root, contract.filename);
    const manifestExists = yield* fs.exists(manifestPath).pipe(Effect.orElseSucceed(() => false));
    let manifestVersion: string | undefined;
    {
      if (!manifestExists) {
        if (acceptedConstraintMismatch) {
          return constraintMismatchObservation({
            path,
            desired,
            canonicalPath: root,
            ...(acceptedVersion === undefined ? {} : { acceptedVersion }),
          });
        }
        return { type: desired.type, name: desired.name, status: "incomplete", path: root };
      }
      const raw = yield* fs.readFileString(manifestPath).pipe(Effect.result);
      if (Result.isFailure(raw)) {
        if (acceptedConstraintMismatch) {
          return constraintMismatchObservation({
            path,
            desired,
            canonicalPath: root,
            ...(acceptedVersion === undefined ? {} : { acceptedVersion }),
          });
        }
        return { type: desired.type, name: desired.name, status: "corrupt", path: root };
      }
      const parsed = parseJson(raw.success);
      if (parsed === undefined) {
        if (acceptedConstraintMismatch) {
          return constraintMismatchObservation({
            path,
            desired,
            canonicalPath: root,
            ...(acceptedVersion === undefined ? {} : { acceptedVersion }),
          });
        }
        return { type: desired.type, name: desired.name, status: "corrupt", path: root };
      }
      const decoded = Schema.decodeUnknownResult(contract.schema)(parsed);
      if (Result.isFailure(decoded)) {
        if (acceptedConstraintMismatch) {
          return constraintMismatchObservation({
            path,
            desired,
            canonicalPath: root,
            ...(acceptedVersion === undefined ? {} : { acceptedVersion }),
          });
        }
        return { type: desired.type, name: desired.name, status: "corrupt", path: root };
      }
      const expectedOwner = bundled
        ? "@agentxm"
        : workspaceAuthored
          ? layout.owner
          : accepted?.type === "registry"
            ? accepted.owner
            : accepted?.packageOwner;
      const expectedName = bundled
        ? desired.name
        : workspaceAuthored
          ? desired.name
          : accepted?.type === "registry"
            ? accepted.name
            : accepted?.packageName;
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
      desired.constraints.length > 0 &&
      (acceptedConstraintMismatch ||
        (workspaceAuthored &&
          (manifestVersion === undefined ||
            desired.constraints.some(
              (constraint) => !semver.satisfies(manifestVersion, constraint),
            ))))
    ) {
      return constraintMismatchObservation({
        path,
        desired,
        canonicalPath: root,
        ...(acceptedVersion === undefined ? {} : { acceptedVersion }),
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
