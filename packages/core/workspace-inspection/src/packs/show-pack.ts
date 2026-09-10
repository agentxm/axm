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
  formatFqn,
  parseExtensionFqnParts,
  parseSourceQualifiedRegistrySourcePatternParts,
  toExtensionType,
} from "@agentxm/extension-model/unstable/extensions";
import {
  PACK_MANIFEST_FILENAME,
  PackManifestSchema,
} from "@agentxm/extension-model/unstable/packs/manifest-schema";
import { isWorkspaceSourceLocator } from "@agentxm/extension-model/unstable/sources/workspace";
import {
  acceptedCanonicalObservation,
  DesiredStateReader,
  LockfileReader,
  SettingsReader,
  WorkspaceLocation,
  WorkspaceMutations,
} from "@agentxm/workspace-state";

import { PackInspectionRefused } from "../errors.js";

const PackMemberSchema = Schema.Struct({
  fqn: Schema.String,
  constraint: Schema.NullOr(Schema.String),
  version: Schema.NullOr(Schema.String),
  source: Schema.NullOr(Schema.String),
  reachability: Schema.NullOr(Schema.Literals(["satisfying", "excluded", "missing"] as const)),
});

export const PackShowResultSchema = Schema.Struct({
  scope: Schema.Literals(["project", "user"] as const),
  pack: Schema.String,
  sourceAuthority: Schema.String,
  canonicalPath: Schema.String,
  manifestVersion: Schema.String,
  acceptedResolution: Schema.String,
  canonicalStatus: Schema.String,
  desiredDependencies: Schema.Array(PackMemberSchema),
  problems: Schema.Array(Schema.String),
});
export type PackShowResult = typeof PackShowResultSchema.Type;

const configuredSource = (entry: string | { readonly source: string }): string =>
  typeof entry === "string" ? entry : entry.source;

const stripLocatorPrefix = (value: string): string =>
  value.replace(/^workspace:/u, "").replace(/^registry:/u, "");

export interface ShowPackRequest {
  /** A configured pack name, or a fully qualified pack identity. */
  readonly target: string;
}

export const ShowPack = {
  query: Effect.fn("ShowPack.query")(function* (request: ShowPackRequest) {
    const location = yield* WorkspaceLocation;
    const settings = yield* SettingsReader;
    const lockfile = yield* LockfileReader;
    const desiredState = yield* DesiredStateReader;
    const workspace = yield* WorkspaceMutations;
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
      workspace,
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
    const manifestPath = path.join(canonicalPath.value, PACK_MANIFEST_FILENAME);
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
    const normalizedPackFqn = packFqn.replace(/^workspace:/u, "");
    const desiredDependencies = Object.entries(manifest.dependencies).map(([fqn, constraint]) => {
      const node = graph.nodes.find(
        (candidate) =>
          stripLocatorPrefix(candidate.identity) === fqn &&
          candidate.origins.some(
            (origin) =>
              origin.type === "pack" &&
              origin.pack.replace(/^workspace:/u, "") === normalizedPackFqn,
          ),
      );
      return {
        fqn,
        constraint,
        version: null,
        source: node?.source ?? null,
        reachability: node === undefined ? ("missing" as const) : ("satisfying" as const),
      };
    });
    return {
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
      problems: graph.problems.map((problem) =>
        "detail" in problem ? `${problem.type}: ${problem.detail}` : problem.type,
      ),
    } satisfies PackShowResult;
  }),
};
