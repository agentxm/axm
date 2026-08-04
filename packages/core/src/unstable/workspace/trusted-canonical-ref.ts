import { pathToFileURL } from "node:url";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Option from "effect/Option";
import * as Path from "effect/Path";
import * as Schema from "effect/Schema";
import { makeAppError, type AppError } from "../app-error/index.js";
import {
  ExtensionNameSchema,
  SourceHashSchema,
  parseExtensionFqnParts,
  type ExtensionRef,
} from "../extensions/index.js";
import { resolveSource } from "../source-resolution/index.js";
import type { Source } from "../sources/index.js";
import type { ExtensionTrustRecord } from "../trust/index.js";
import { trustRecordKey } from "../trust/index.js";
import { VersionSchema } from "../version-constraints/version-constraints.js";
import { observeCanonicalExtension } from "./canonical-observation.js";
import type { CanonicalObservation } from "./canonical-observation.js";
import { WorkspaceMutations, type WorkspaceMutationsService } from "./service-interface.js";
import type { DesiredExtensionNode } from "./desired-state-graph.js";
import type { WorkspaceScope } from "./scope.js";
import { canonicalPathForTrustedExtension } from "./canonical-observation.js";

interface TrustedCanonicalRefArgs {
  readonly baseDir: string;
  readonly scope: WorkspaceScope;
  readonly desired: DesiredExtensionNode;
  readonly trust: ExtensionTrustRecord;
}

interface UsableTrustedCanonicalRefArgs {
  readonly workspace: WorkspaceMutationsService;
  readonly type: DesiredExtensionNode["type"];
  readonly name: string;
}

export interface UsableTrustedCanonical {
  readonly desired: DesiredExtensionNode;
  readonly trust: ExtensionTrustRecord;
  readonly observation: CanonicalObservation & { readonly status: "usable"; readonly path: string };
  readonly ref: ExtensionRef;
}

export interface TrustedCanonicalObservation {
  readonly desired: DesiredExtensionNode;
  readonly trust: ExtensionTrustRecord;
  readonly observation: CanonicalObservation;
}

export interface UsableTrustedCanonicalObservation {
  readonly desired: DesiredExtensionNode;
  readonly trust: ExtensionTrustRecord;
  readonly observation: CanonicalObservation & {
    readonly status: "usable";
    readonly path: string;
  };
}

const invalidTrust = (desired: DesiredExtensionNode, detail: string) =>
  makeAppError({
    code: "validation",
    detail: `Cannot reconstruct trusted ${desired.type} "${desired.name}": ${detail}`,
  });

const decodedName = (desired: DesiredExtensionNode) =>
  Schema.decodeUnknownEffect(ExtensionNameSchema)(desired.name).pipe(
    Effect.mapError(() => invalidTrust(desired, "the configured name is invalid")),
  );

const registryDetails = (
  desired: DesiredExtensionNode,
  trust: ExtensionTrustRecord,
  source: Extract<Source, { readonly type: "registry" }>,
) =>
  Effect.gen(function* () {
    const parsed = parseExtensionFqnParts(trust.sourceIdentity);
    if (parsed === undefined || parsed.type !== desired.type) {
      return yield* invalidTrust(desired, "the Registry identity is invalid");
    }
    if (trust.resolvedVersion === undefined || trust.publisherBindingId === undefined) {
      return yield* invalidTrust(
        desired,
        "the Registry trust baseline is missing its version or publisher epoch",
      );
    }
    const version = yield* Schema.decodeUnknownEffect(VersionSchema)(trust.resolvedVersion).pipe(
      Effect.mapError(() => invalidTrust(desired, "the trusted version is invalid")),
    );
    return {
      refType: "registry" as const,
      source,
      owner: parsed.owner,
      publisherBindingId: trust.publisherBindingId,
      name: parsed.name,
      version,
      integrity: Option.fromUndefinedOr(trust.integrity),
      packages: [],
    };
  });

const workspaceDetails = (
  desired: DesiredExtensionNode,
  trust: ExtensionTrustRecord,
  source: Extract<Source, { readonly type: "workspace" }>,
  root: string,
  scope: WorkspaceScope,
) =>
  Effect.gen(function* () {
    const identity = trust.sourceIdentity.startsWith("workspace:")
      ? trust.sourceIdentity.slice("workspace:".length)
      : trust.sourceIdentity;
    const parsed = parseExtensionFqnParts(identity);
    if (
      parsed === undefined ||
      parsed.type !== desired.type ||
      trust.resolvedVersion === undefined ||
      trust.contentIdentity === undefined
    ) {
      return yield* invalidTrust(desired, "the workspace trust baseline is incomplete");
    }
    const version = yield* Schema.decodeUnknownEffect(VersionSchema)(trust.resolvedVersion).pipe(
      Effect.mapError(() => invalidTrust(desired, "the trusted version is invalid")),
    );
    const sourceHash = yield* Schema.decodeUnknownEffect(SourceHashSchema)(
      trust.contentIdentity,
    ).pipe(Effect.mapError(() => invalidTrust(desired, "the trusted content identity is invalid")));
    return {
      refType: "workspace" as const,
      source,
      owner: parsed.owner,
      name: parsed.name,
      version,
      sourceHash,
      scope,
      location: root,
    };
  });

const externalDetails = (
  desired: DesiredExtensionNode,
  trust: ExtensionTrustRecord,
  source: Exclude<Source, { readonly type: "registry" | "workspace" }>,
  root: string,
) => {
  if (source.type === "local") {
    return Effect.succeed({
      refType: "local" as const,
      source,
      location: pathToFileURL(root).href,
    });
  }
  return Effect.succeed({
    refType: "git-hosted" as const,
    source,
    location: pathToFileURL(root).href,
    gitTreeSha: Option.fromUndefinedOr(trust.immutableRevision),
  });
};

export const trustedCanonicalRef = ({
  baseDir,
  scope,
  desired,
  trust,
}: TrustedCanonicalRefArgs): Effect.Effect<
  ExtensionRef,
  AppError,
  WorkspaceMutations | FileSystem.FileSystem | Path.Path
> =>
  Effect.gen(function* () {
    const path = yield* Path.Path;
    const root = canonicalPathForTrustedExtension(path, baseDir, desired, trust);
    if (root === undefined) {
      return yield* invalidTrust(desired, "the canonical location is not applicable");
    }
    const name = yield* decodedName(desired);
    const source = yield* Effect.gen(function* () {
      if (trust.authority !== "registry") {
        return yield* resolveSource(desired.source);
      }
      const parsed = parseExtensionFqnParts(trust.sourceIdentity);
      if (parsed === undefined || parsed.type !== desired.type) {
        return yield* invalidTrust(desired, "the Registry identity is invalid");
      }
      if (trust.sourceName === undefined) {
        return yield* invalidTrust(desired, "the trusted Registry source name is missing");
      }
      const ws = yield* WorkspaceMutations;
      const configured = yield* ws.getConfiguredSourceByName(trust.sourceName);
      if (Option.isNone(configured) || configured.value.type !== "registry") {
        return yield* invalidTrust(
          desired,
          `the trusted Registry source "${trust.sourceName}" is not configured`,
        );
      }
      return {
        type: "registry" as const,
        location: configured.value.location,
        owner: Option.some(parsed.owner),
      };
    });

    const details =
      source.type === "registry"
        ? yield* registryDetails(desired, trust, source)
        : source.type === "workspace"
          ? yield* workspaceDetails(desired, trust, source, root, scope)
          : yield* externalDetails(desired, trust, source, root);

    switch (desired.type) {
      case "skill":
        return {
          type: "skill",
          ...details,
          skill: { name, description: Option.none(), metadata: Option.none() },
        };
      case "command":
        return { type: "command", ...details, command: { name } };
      case "mcp-server":
        return { type: "mcp-server", ...details, server: { name } };
      case "subagent":
        return {
          type: "subagent",
          ...details,
          subagent: { name, description: Option.none() },
        };
      case "files":
        return { type: "files", ...details, file: { name } };
      case "rule":
        return { type: "rule", ...details, rule: { name } };
      case "hook":
        return { type: "hook", ...details, hook: { name } };
      case "knowledge":
        return { type: "knowledge", ...details, knowledge: { name } };
      case "pack": {
        if (details.refType !== "registry" && details.refType !== "workspace") {
          return yield* invalidTrust(desired, "packs cannot use an external source");
        }
        return {
          type: "pack",
          ...details,
          owner: details.owner,
          pack: { name, dependencies: {} },
        };
      }
    }
  });

/**
 * Reconstruct a ref only when desired intent, authoritative trust, and usable
 * canonical content all agree. Optional receipt metadata is deliberately not
 * consulted.
 */
export const trustedCanonicalObservation = ({
  workspace,
  type,
  name,
}: UsableTrustedCanonicalRefArgs): Effect.Effect<
  Option.Option<TrustedCanonicalObservation>,
  AppError,
  FileSystem.FileSystem | Path.Path
> =>
  Effect.gen(function* () {
    const graph = yield* workspace.getDesiredStateGraph();
    const desired = graph.nodes.find((node) => node.type === type && node.name === name);
    if (desired === undefined) return Option.none();

    const trust = (yield* workspace.getTrustState()).records[trustRecordKey(type, name)];
    if (trust === undefined || trust.sourceIdentity !== desired.identity) return Option.none();

    const observation = yield* observeCanonicalExtension({
      baseDir: workspace.baseDir,
      desired,
      trust,
    });
    return Option.some({ desired, trust, observation });
  });

export const usableTrustedCanonicalObservation = (
  args: UsableTrustedCanonicalRefArgs,
): Effect.Effect<
  Option.Option<UsableTrustedCanonicalObservation>,
  AppError,
  FileSystem.FileSystem | Path.Path
> =>
  trustedCanonicalObservation(args).pipe(
    Effect.map(
      Option.flatMap(({ desired, trust, observation }) => {
        if (observation.status !== "usable" || observation.path === undefined) {
          return Option.none();
        }
        return Option.some({
          desired,
          trust,
          observation: {
            ...observation,
            status: "usable",
            path: observation.path,
          },
        });
      }),
    ),
  );

export const usableTrustedCanonical = (
  args: UsableTrustedCanonicalRefArgs,
): Effect.Effect<
  Option.Option<UsableTrustedCanonical>,
  AppError,
  FileSystem.FileSystem | Path.Path
> =>
  Effect.gen(function* () {
    const workspace = args.workspace;
    const canonical = yield* usableTrustedCanonicalObservation(args);
    if (Option.isNone(canonical)) return Option.none();
    const { desired, trust, observation } = canonical.value;

    const ref = yield* trustedCanonicalRef({
      baseDir: workspace.baseDir,
      scope: workspace.scope,
      desired,
      trust,
    }).pipe(Effect.provideService(WorkspaceMutations, workspace));
    return Option.some({
      desired,
      trust,
      observation: { ...observation, status: "usable", path: observation.path },
      ref,
    });
  });

export const usableTrustedCanonicalRef = (
  args: UsableTrustedCanonicalRefArgs,
): Effect.Effect<Option.Option<ExtensionRef>, AppError, FileSystem.FileSystem | Path.Path> =>
  usableTrustedCanonical(args).pipe(Effect.map(Option.map((canonical) => canonical.ref)));
