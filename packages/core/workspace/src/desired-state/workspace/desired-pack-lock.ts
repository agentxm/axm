import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import * as Result from "effect/Result";
import * as Schema from "effect/Schema";
import { parseExtensionFqnParts } from "@agentxm/extension-model/unstable/extensions";
import type { Lockfile } from "../lockfile/schema.js";
import { observeAcceptedResolution } from "./canonical-observation.js";
import { lockEntries } from "./entry-accessors.js";
import { computePackManifestContentIdentity } from "./pack-manifest-content-identity.js";
import { PackManifestSchema } from "@agentxm/extension-model/unstable/packs/manifest-schema";
import type {
  DesiredStateGraph,
  DesiredStateProblem,
  ProspectivePackRef,
} from "./desired-state-graph.js";
import type { WorkspaceLayout } from "./layout.js";
import type { PackManifestsPort } from "./pack-manifests.js";
import { desiredPackageKey } from "./desired-identity.js";

interface ValidateDesiredPackLockArgs {
  readonly manifests: PackManifestsPort;
  readonly graph: DesiredStateGraph;
  readonly lockfile: Lockfile;
  readonly layout: WorkspaceLayout;
  readonly prospectivePacks?: ReadonlyArray<ProspectivePackRef>;
}

const decodeManifest = Schema.decodeUnknownSync(PackManifestSchema, {
  onExcessProperty: "error",
});

/** What validating the accepted Pack state found. */
export interface DesiredPackLockValidation {
  readonly problems: ReadonlyArray<DesiredStateProblem>;
  /** Fully qualified names of the Packs whose accepted state cannot authorize their manifest. */
  readonly invalidPacks: ReadonlySet<string>;
}

/**
 * Authorize enabled external Pack manifests against their accepted lock row.
 * Workspace-authored Pack manifests are desired authority and need no lock
 * row. The result names the Packs the builder must exclude; the builder, not
 * this validation, derives the graph without their routes.
 */
export const validateDesiredPackLock = ({
  manifests,
  graph,
  lockfile,
  layout,
  prospectivePacks = [],
}: ValidateDesiredPackLockArgs): Effect.Effect<DesiredPackLockValidation, never> =>
  Effect.gen(function* () {
    const problems: DesiredStateProblem[] = [];
    const invalidPacks = new Set<string>();

    for (const node of graph.nodes) {
      if (node.type !== "pack" || !node.enabled || node.identity.authority === "workspace") {
        continue;
      }
      const packFqn = desiredPackageKey(node.identity);
      const identity = parseExtensionFqnParts(packFqn);
      // A prospective Pack is the proposal a planner evaluates: its manifest
      // supersedes whatever is accepted today, so the accepted row does not
      // judge it and its routes count in the proposed graph.
      if (
        identity !== undefined &&
        prospectivePacks.some(
          (ref) => ref.owner === identity.owner && ref.pack.name === identity.name,
        )
      ) {
        continue;
      }

      const entry = Option.getOrUndefined(lockEntries.pack.entry(lockfile, node.name));
      // The canonical observation's own judgment: a missing, foreign-origin, or
      // constraint-violating accepted resolution cannot authorize the manifest.
      const unusable = observeAcceptedResolution(node, entry);
      if (
        Option.isSome(unusable) ||
        entry === undefined ||
        identity === undefined ||
        identity.type !== "pack"
      ) {
        problems.push({
          type: "pack-resolution-unavailable",
          pack: packFqn,
          detail: "The configured external Pack has no matching accepted resolution.",
        });
        invalidPacks.add(packFqn);
        continue;
      }

      const document = manifests.locate({
        owner: identity.owner,
        name: identity.name,
        sourceFamily:
          entry.source.type === "registry"
            ? "registry"
            : entry.source.type === "path"
              ? "path"
              : "git",
        relativeTo: layout.workspaceRoot,
        workspace: { layout },
      });
      const manifestPath = document.path;
      const observedManifest = yield* Effect.gen(function* () {
        const contents = yield* document.contents;
        if (contents === undefined) return undefined;
        const decoded = Result.try({
          try: () => decodeManifest(JSON.parse(contents)),
          catch: () => undefined,
        });
        return Result.isSuccess(decoded) ? decoded.success : undefined;
      });
      const observedContentIdentity =
        observedManifest === undefined
          ? undefined
          : computePackManifestContentIdentity(observedManifest);
      if (
        observedManifest === undefined ||
        observedContentIdentity !== entry.manifestContentIdentity
      ) {
        problems.push({
          type: "pack-manifest-content-mismatch",
          pack: packFqn,
          path: manifestPath,
          status: observedManifest === undefined ? "missing" : "changed",
          acceptedVersion: entry.manifestVersion,
          acceptedContentIdentity: entry.manifestContentIdentity,
          ...(observedManifest === undefined || observedContentIdentity === undefined
            ? {}
            : {
                observedVersion: observedManifest.version,
                observedContentIdentity,
              }),
        });
        invalidPacks.add(packFqn);
      }
    }

    return { problems, invalidPacks };
  });
