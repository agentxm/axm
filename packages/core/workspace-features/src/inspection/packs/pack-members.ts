import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Option from "effect/Option";
import * as Path from "effect/Path";
import * as Schema from "effect/Schema";
import {
  packMemberRegistrySource,
  packMemberVersionRange,
} from "@agentxm/extension-model/unstable/extensions";
import { PackManifestSchema } from "@agentxm/extension-model/unstable/packs/manifest-schema";
import { versionSatisfiesRequest } from "@agentxm/extension-model/unstable/version-constraints";
import {
  LockfileReader,
  observeDesiredCanonical,
  usableAcceptedCanonicalFrom,
  acceptedRowKey,
  desiredPackageKey,
  isSourcedDesiredExtension,
  desiredMcpSourceKey,
  McpSourceKey,
  type DesiredNodeIdentity,
  type DesiredStateGraph,
} from "@agentxm/workspace-kernel/workspace-state";
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
  "conflicted-source",
] as const);

const PackMemberResolutionSchema = Schema.Union([
  Schema.Struct({ status: Schema.Literal("accepted") }),
  Schema.Struct({ status: Schema.Literal("authored") }),
  Schema.Struct({
    status: Schema.Literal("unresolved"),
    reason: PackMemberUnresolvedReasonSchema,
  }),
]);

export const PackMemberEvidenceSchema = Schema.Struct({
  fqn: Schema.String,
  declaration: PackMemberDeclarationSchema,
  /** The local names the member is installed or connected under. */
  localNames: Schema.Array(Schema.String),
  sourceIdentity: Schema.NullOr(PackMemberSourceIdentitySchema),
  resolution: PackMemberResolutionSchema,
  version: Schema.NullOr(Schema.String),
  reachability: Schema.NullOr(Schema.Literals(["satisfying", "excluded", "missing"] as const)),
});
type PackMember = typeof PackMemberEvidenceSchema.Type;

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

export const inspectPackMembers = Effect.fn("Inspection.packMembers")(function* (args: {
  readonly root: string;
  readonly packFqn: string;
  readonly graph: DesiredStateGraph;
}) {
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const lockfile = yield* LockfileReader;
  const graph = args.graph;
  const packFqn = args.packFqn;
  const manifest = yield* fs
    .readFileString(path.join(args.root, "pack.json"))
    .pipe(Effect.flatMap(Schema.decodeUnknownEffect(Schema.fromJsonString(PackManifestSchema))));
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
          const contender =
            declaredSource === undefined ||
            !graph.packMembership.some(
              (membership) => membership.pack === packFqn && membership.routes === "active",
            )
              ? undefined
              : graph.problems
                  .flatMap((problem) =>
                    problem.type === "projection-collision" ? problem.identities : [],
                  )
                  .find(
                    (identity) =>
                      identity.authority === "registry" &&
                      identity.fqn === fqn &&
                      identity.registry.endpoint?.href === declaredSource.url.href,
                  );
          return {
            fqn,
            declaration: authored,
            localNames: [],
            sourceIdentity: contender === undefined ? null : memberSourceIdentity(contender),
            resolution: {
              status: "unresolved",
              reason: contender === undefined ? "not-desired" : "conflicted-source",
            },
            version: null,
            reachability: contender === undefined ? "missing" : null,
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
  return desiredDependencies;
});
