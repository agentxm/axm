import { withInspectionReadView } from "../read-view.js";
/**
 * What one configured pack's desired, accepted, and canonical state is.
 *
 * A pack is inspected by the identity the workspace configured, not by the
 * name a person typed: a requested identity that disagrees with the configured
 * one is a refusal, because answering it would describe a different pack.
 *
 * @experimental This API is unstable and may change without notice.
 */

import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Option from "effect/Option";
import * as Path from "effect/Path";
import * as Ref from "effect/Ref";
import * as Schema from "effect/Schema";

import {
  packMemberRegistrySource,
  packMemberVersionRange,
  formatFqn,
  parseExtensionFqnParts,
  parseSourceQualifiedRegistrySourcePatternParts,
  toExtensionType,
} from "@agentxm/extension-model/unstable/extensions";
import { PackManifestSchema } from "@agentxm/extension-model/unstable/packs/manifest-schema";
import { isWorkspaceSourceLocator } from "@agentxm/extension-model/unstable/sources/workspace";
import { versionSatisfiesRequest } from "@agentxm/extension-model/unstable/version-constraints";
import {
  desiredStateProblemText,
  acceptedCanonicalObservation,
  DesiredStateReader,
  LockfileReader,
  observeDesiredCanonical,
  SettingsReader,
  usableAcceptedCanonicalFrom,
  WorkspaceLocation,
  WorkspaceRecords,
  acceptedRowKey,
  desiredPackageKey,
  isSourcedDesiredExtension,
  desiredMcpSourceKey,
  McpSourceKey,
  type DesiredNodeIdentity,
} from "@agentxm/workspace-kernel/workspace-state";

import { ShowAgentOutcomeSchema, filterShowAgentOutcomes } from "../show/agent-outcomes.js";
import { PackInspectionRefused } from "../errors.js";
import { manifestFilenameForType } from "@agentxm/extension-model/unstable/extensions/common";

/** What the Pack manifest declares for one member: its range, and an explicit Registry endpoint or none when the member inherits the Pack's source. */
const PackMemberDeclarationSchema = Schema.Struct({
  constraint: Schema.String,
  endpoint: Schema.NullOr(Schema.String),
});

/** The source a desired member is bound to: its authority and the canonical fields it is compared by. */
const PackMemberSourceIdentitySchema = Schema.Struct({
  authority: Schema.Literals([
    "workspace",
    "registry",
    "git",
    "http",
    "path",
    "bundled",
    "inline",
  ] as const),
  fqn: Schema.NullOr(Schema.String),
  endpoint: Schema.NullOr(Schema.String),
  locator: Schema.NullOr(Schema.String),
});

/** Why a member has no accepted or authored resolution. */
const PackMemberUnresolvedReasonSchema = Schema.Literals([
  "not-desired",
  "unbound-source",
  "not-accepted",
  "authority-mismatch",
] as const);

const PackMemberResolutionSchema = Schema.Union([
  Schema.Struct({ status: Schema.Literal("accepted") }),
  Schema.Struct({ status: Schema.Literal("authored") }),
  Schema.Struct({
    status: Schema.Literal("unresolved"),
    reason: PackMemberUnresolvedReasonSchema,
  }),
]);

const PackMemberSchema = Schema.Struct({
  fqn: Schema.String,
  declaration: PackMemberDeclarationSchema,
  /** The local names the member is installed or connected under. */
  localNames: Schema.Array(Schema.String),
  sourceIdentity: Schema.NullOr(PackMemberSourceIdentitySchema),
  resolution: PackMemberResolutionSchema,
  version: Schema.NullOr(Schema.String),
  reachability: Schema.NullOr(Schema.Literals(["satisfying", "excluded", "missing"] as const)),
});
type PackMember = typeof PackMemberSchema.Type;

/** The canonical fields of one bound identity; never a lock key or a configured alias. */
const memberSourceIdentity = (
  identity: DesiredNodeIdentity,
): typeof PackMemberSourceIdentitySchema.Type => {
  switch (identity.authority) {
    case "registry":
      return {
        authority: identity.authority,
        fqn: identity.fqn,
        endpoint: identity.registry.endpoint?.href ?? null,
        locator: null,
      };
    case "git":
    case "http":
    case "path":
      return {
        authority: identity.authority,
        fqn: identity.fqn ?? null,
        endpoint: null,
        locator: identity.locator,
      };
    case "workspace":
    case "bundled":
      return { authority: identity.authority, fqn: identity.fqn, endpoint: null, locator: null };
    case "inline":
      return { authority: identity.authority, fqn: null, endpoint: null, locator: identity.name };
  }
};

export const PackShowResultSchema = Schema.Struct({
  scope: Schema.Literals(["project", "user"] as const),
  pack: Schema.String,
  sourceAuthority: Schema.String,
  canonicalPath: Schema.String,
  manifestVersion: Schema.String,
  acceptedResolution: Schema.String,
  canonicalStatus: Schema.String,
  desiredDependencies: Schema.Array(PackMemberSchema),
  agentOutcomes: Schema.Array(ShowAgentOutcomeSchema),
  problems: Schema.Array(Schema.String),
});
export type PackShowResult = typeof PackShowResultSchema.Type;

const configuredSource = (entry: string | { readonly source: string }): string =>
  typeof entry === "string" ? entry : entry.source;

export interface ShowPackRequest {
  /** A configured pack name, or a fully qualified pack identity. */
  readonly target: string;
  readonly agents?: ReadonlyArray<string>;
}

export const ShowPack = {
  query: Effect.fn("ShowPack.query")(function* (request: ShowPackRequest) {
    const location = yield* WorkspaceLocation;
    const settings = yield* SettingsReader;
    const lockfile = yield* LockfileReader;
    const desiredState = yield* DesiredStateReader;
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;

    const requested = parseExtensionFqnParts(request.target);
    if (requested !== undefined && requested.type !== "pack") {
      return yield* new PackInspectionRefused({
        reason: "not-a-pack-identity",
        detail: `Expected a pack identity: ${request.target}`,
      });
    }
    const name = requested?.name ?? request.target;
    const entry = (yield* settings.entries("pack"))[name];
    if (entry === undefined) {
      return yield* new PackInspectionRefused({
        reason: "not-configured",
        detail: `Configured pack "${name}" not found`,
      });
    }
    const source = configuredSource(entry);
    const layout = yield* Ref.get(location.layout);
    const registrySource = isWorkspaceSourceLocator(source)
      ? undefined
      : parseSourceQualifiedRegistrySourcePatternParts(source);
    const parsedSource = isWorkspaceSourceLocator(source)
      ? layout.owner === undefined
        ? undefined
        : parseExtensionFqnParts(`${layout.owner}/packs/${name}`)
      : registrySource?.type === "packs" && registrySource.name !== undefined
        ? {
            owner: registrySource.owner,
            type: toExtensionType(registrySource.type),
            name: registrySource.name,
          }
        : undefined;
    if (parsedSource === undefined && isWorkspaceSourceLocator(source)) {
      return yield* new PackInspectionRefused({
        reason: "owner-required",
        detail: `Configured workspace pack "${name}" requires a workspace owner`,
      });
    }
    if (parsedSource === undefined) {
      return yield* new PackInspectionRefused({
        reason: "not-a-pack-identity",
        detail: `Configured pack source is not a valid pack identity: ${source}`,
      });
    }
    const packFqn = formatFqn(parsedSource);
    if (
      requested !== undefined &&
      (requested.owner !== parsedSource.owner || requested.name !== parsedSource.name)
    ) {
      return yield* new PackInspectionRefused({
        reason: "identity-mismatch",
        detail: `Requested pack does not match configured identity ${packFqn}`,
      });
    }
    const canonical = yield* acceptedCanonicalObservation({
      type: "pack",
      name,
    });
    const canonicalPath = Option.flatMap(canonical, (state) =>
      Option.fromUndefinedOr(state.observation.path),
    );
    if (Option.isNone(canonicalPath)) {
      return yield* new PackInspectionRefused({
        reason: "canonical-unavailable",
        detail: `Canonical pack "${packFqn}" is unavailable`,
      });
    }
    const manifestPath = path.join(canonicalPath.value, manifestFilenameForType("pack"));
    const raw = yield* fs.readFileString(manifestPath).pipe(
      Effect.mapError(
        (cause) =>
          new PackInspectionRefused({
            reason: "manifest-unavailable",
            detail: `Pack manifest unavailable at ${manifestPath}`,
            cause,
          }),
      ),
    );
    const json = yield* Effect.try({
      try: (): unknown => JSON.parse(raw),
      catch: (cause) =>
        new PackInspectionRefused({
          reason: "manifest-unreadable",
          detail: `Malformed pack manifest at ${manifestPath}`,
          cause,
        }),
    });
    const manifest = yield* Schema.decodeUnknownEffect(PackManifestSchema)(json).pipe(
      Effect.mapError(
        (cause) =>
          new PackInspectionRefused({
            reason: "manifest-unreadable",
            detail: `Invalid pack manifest at ${manifestPath}`,
            cause,
          }),
      ),
    );
    const locked = yield* lockfile.entry("pack", name);
    const graph = yield* desiredState.graph();
    const sourceAuthority = isWorkspaceSourceLocator(source) ? "workspace" : "registry";
    const desiredDependencies = yield* Effect.forEach(
      Object.entries(manifest.dependencies),
      ([fqn, declaration]) =>
        Effect.gen(function* () {
          const constraint = packMemberVersionRange(declaration);
          const declaredSource = packMemberRegistrySource(declaration);
          const authored = {
            constraint,
            endpoint: declaredSource === undefined ? null : declaredSource.url.href,
          };
          const node = graph.nodes.find(
            (candidate) =>
              desiredPackageKey(candidate.identity) === fqn &&
              candidate.origins.some(
                (origin) => origin.type === "pack" && origin.pack.fqn === packFqn,
              ),
          );
          if (node === undefined) {
            return {
              fqn,
              declaration: authored,
              localNames: [],
              sourceIdentity: null,
              resolution: { status: "unresolved", reason: "not-desired" },
              version: null,
              reachability: "missing",
            } satisfies PackMember;
          }
          // The canonical observation judges the member once; this Pack's own
          // range then says whether the judged version is excluded here.
          const canonical = yield* observeDesiredCanonical(node);
          const usable = yield* usableAcceptedCanonicalFrom(canonical);
          const { observation } = canonical;
          const version = Option.match(usable, {
            onNone: () =>
              observation.status === "constraint-mismatch"
                ? (observation.acceptedVersion ?? observation.observedVersion ?? null)
                : null,
            onSome: ({ ref }) =>
              ref.refType === "registry" || ref.refType === "workspace" ? ref.version : null,
          });
          const excluded =
            observation.status === "constraint-mismatch" &&
            (version === null || !versionSatisfiesRequest(version, constraint));
          // Every local connection to one MCP source is a name this member is held under.
          const closure =
            node.type === "mcp-server" && isSourcedDesiredExtension(node)
              ? Option.flatMap(desiredMcpSourceKey(node.identity), (key) =>
                  Option.fromUndefinedOr(
                    graph.mcpSourceClosures.find((candidate) =>
                      McpSourceKey.equals(candidate.key, key),
                    ),
                  ),
                )
              : Option.none();
          const accepted = yield* Option.match(acceptedRowKey(node), {
            onNone: () => Effect.succeed(Option.none()),
            onSome: (key) => lockfile.entry(node.type, key),
          });
          const resolution: PackMember["resolution"] =
            node.identity.authority === "workspace" || node.identity.authority === "bundled"
              ? { status: "authored" }
              : node.identity.authority === "registry" &&
                  node.identity.registry.endpoint === undefined
                ? { status: "unresolved", reason: "unbound-source" }
                : Option.isNone(accepted)
                  ? { status: "unresolved", reason: "not-accepted" }
                  : observation.status === "wrong-origin"
                    ? { status: "unresolved", reason: "authority-mismatch" }
                    : { status: "accepted" };
          return {
            fqn,
            declaration: authored,
            localNames: Option.match(closure, {
              onNone: () => [node.name],
              onSome: ({ localNames }) => localNames,
            }),
            sourceIdentity: memberSourceIdentity(node.identity),
            resolution,
            version,
            reachability: excluded ? "excluded" : "satisfying",
          } satisfies PackMember;
        }),
      { concurrency: 1 },
    );
    const records = yield* WorkspaceRecords;
    const inventory = yield* records.getExtensionInventory("pack", {});
    const outcomes = inventory.items.find((item) => item.name === name)?.agentOutcomes ?? [];
    return {
      agentOutcomes: filterShowAgentOutcomes({
        outcomes,
        requested: request.agents ?? [],
        configured: yield* settings.configuredAgents,
        type: "pack",
        name,
      }),
      scope: location.scope,
      pack: packFqn,
      sourceAuthority,
      canonicalPath: manifestPath,
      manifestVersion: manifest.version,
      acceptedResolution:
        sourceAuthority === "workspace"
          ? "authored"
          : Option.isSome(locked)
            ? "accepted"
            : "missing",
      canonicalStatus: Option.isSome(canonical) ? canonical.value.observation.status : "missing",
      desiredDependencies,
      problems: graph.problems.map(
        (problem) => `${problem.type}: ${desiredStateProblemText(problem)}`,
      ),
    } satisfies PackShowResult;
  }, withInspectionReadView),
};
