import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Path from "effect/Path";
import * as Option from "effect/Option";
import * as Schema from "effect/Schema";
import { Argument, Command, Flag } from "effect/unstable/cli";
import { makeAppError } from "@agentxm/extension-management/unstable/app-error";
import { CliRenderer, type DetailView } from "@agentxm/extension-management/unstable/cli-renderer";
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
import { acceptedCanonicalObservation, WorkspaceMutations } from "@agentxm/workspace-state";
import { withArgvTracking } from "@agentxm/extension-management/unstable/cli-runtime";
import { scopeFlag } from "../../cli-flags.js";
import { withRuntime, withWorkspace } from "../../runtime.js";

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

type PackShowResult = Schema.Schema.Type<typeof PackShowResultSchema>;

const ShowDetail = {
  fields: {
    scope: { label: "Scope" },
    pack: { label: "Pack" },
    sourceAuthority: { label: "Source authority" },
    canonicalPath: { label: "Canonical path" },
    manifestVersion: { label: "Manifest version" },
    acceptedResolution: { label: "Resolution" },
    canonicalStatus: { label: "Canonical" },
    desiredCount: { label: "Desired members" },
    problems: {
      label: "Problems",
      render: (items) => (items.length === 0 ? "none" : items.join("; ")),
    },
  },
} as const satisfies DetailView<
  Omit<PackShowResult, "desiredDependencies"> & {
    readonly desiredCount: number;
  }
>;

const configuredSource = (entry: string | { readonly source: string }): string =>
  typeof entry === "string" ? entry : entry.source;

export const handlePacksShow = Effect.fn("PacksShow.handle")(function* (target: string) {
  const ws = yield* WorkspaceMutations;
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const renderer = yield* CliRenderer;
  const requested = parseExtensionFqnParts(target);
  if (requested !== undefined && requested.type !== "pack") {
    return yield* makeAppError({
      code: "validation",
      detail: `Expected a pack identity: ${target}`,
    });
  }
  const name = requested?.name ?? target;
  const entry = (yield* ws.getConfiguredPackEntries())[name];
  if (entry === undefined) {
    return yield* makeAppError({
      code: "not_found",
      detail: `Configured pack "${name}" not found`,
    });
  }
  const source = configuredSource(entry);
  const parsedRegistrySource = isWorkspaceSourceLocator(source)
    ? undefined
    : parseSourceQualifiedRegistrySourcePatternParts(source);
  const parsedSource = isWorkspaceSourceLocator(source)
    ? ws.layout.owner === undefined
      ? undefined
      : parseExtensionFqnParts(`${ws.layout.owner}/packs/${name}`)
    : parsedRegistrySource?.type === "packs" && parsedRegistrySource.name !== undefined
      ? {
          owner: parsedRegistrySource.owner,
          type: toExtensionType(parsedRegistrySource.type),
          name: parsedRegistrySource.name,
        }
      : undefined;
  if (parsedSource === undefined && isWorkspaceSourceLocator(source)) {
    return yield* makeAppError({
      code: "validation",
      detail: `Configured workspace pack "${name}" requires a workspace owner`,
    });
  }
  if (parsedSource === undefined) {
    return yield* makeAppError({
      code: "validation",
      detail: `Configured pack source is not a valid pack identity: ${source}`,
    });
  }
  const sourceFqn = formatFqn(parsedSource);
  if (
    requested !== undefined &&
    (requested.owner !== parsedSource.owner || requested.name !== parsedSource.name)
  ) {
    return yield* makeAppError({
      code: "conflict",
      detail: `Requested pack does not match configured identity ${sourceFqn}`,
    });
  }
  const canonical = yield* acceptedCanonicalObservation({ workspace: ws, type: "pack", name });
  const canonicalPath = Option.flatMap(canonical, (state) =>
    Option.fromUndefinedOr(state.observation.path),
  );
  if (Option.isNone(canonicalPath)) {
    return yield* makeAppError({
      code: "not_found",
      detail: `Canonical pack "${sourceFqn}" is unavailable`,
    });
  }
  const manifestPath = path.join(canonicalPath.value, PACK_MANIFEST_FILENAME);
  const raw = yield* fs.readFileString(manifestPath).pipe(
    Effect.mapError((cause) =>
      makeAppError({
        code: "not_found",
        detail: `Pack manifest unavailable at ${manifestPath}`,
        cause,
      }),
    ),
  );
  const json = yield* Effect.try({
    try: (): unknown => JSON.parse(raw),
    catch: (cause) =>
      makeAppError({
        code: "validation",
        detail: `Malformed pack manifest at ${manifestPath}`,
        cause,
      }),
  });
  const manifest = yield* Schema.decodeUnknownEffect(PackManifestSchema)(json).pipe(
    Effect.mapError((cause) =>
      makeAppError({
        code: "validation",
        detail: `Invalid pack manifest at ${manifestPath}`,
        cause,
      }),
    ),
  );
  const locked = yield* ws.getLockedPack(name);
  const packFqn = sourceFqn;
  const sourceAuthority = isWorkspaceSourceLocator(source) ? "workspace" : "registry";
  const graph = yield* ws.getDesiredStateGraph();
  const normalizedPackFqn = packFqn.replace(/^workspace:/u, "");
  const desiredDependencies = Object.entries(manifest.dependencies).map(([fqn, constraint]) => {
    const node = graph.nodes.find(
      (candidate) =>
        candidate.identity.replace(/^workspace:/u, "").replace(/^registry:/u, "") === fqn &&
        candidate.origins.some(
          (origin) =>
            origin.type === "pack" && origin.pack.replace(/^workspace:/u, "") === normalizedPackFqn,
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
  const canonicalStatus = Option.isSome(canonical) ? canonical.value.observation.status : "missing";
  const acceptedResolution =
    sourceAuthority === "workspace" ? "authored" : Option.isSome(locked) ? "accepted" : "missing";
  const problems = graph.problems.map((problem) =>
    "detail" in problem ? `${problem.type}: ${problem.detail}` : problem.type,
  );
  const fqn = packFqn;
  const result: PackShowResult = {
    scope: ws.scope,
    pack: fqn,
    sourceAuthority,
    canonicalPath: manifestPath,
    manifestVersion: manifest.version,
    acceptedResolution,
    canonicalStatus,
    desiredDependencies,
    problems,
  };
  if (yield* renderer.result(result, PackShowResultSchema)) return;
  yield* renderer.detail(
    {
      pack: result.pack,
      sourceAuthority: result.sourceAuthority,
      canonicalPath: result.canonicalPath,
      manifestVersion: result.manifestVersion,
      acceptedResolution: result.acceptedResolution,
      canonicalStatus: result.canonicalStatus,
      desiredCount: result.desiredDependencies.length,
      problems: result.problems,
    },
    ShowDetail,
    `Pack ${fqn}`,
  );
});

const showConfig = {
  target: Argument.string("extension").pipe(
    Argument.withDescription("Configured pack name or fully qualified identity"),
  ),
  scope: scopeFlag.pipe(Flag.withDescription("Inspect project (default) or user-level pack state")),
} as const;

export const showCommand = Command.make("show", showConfig, ({ target, scope }) =>
  handlePacksShow(target).pipe(withWorkspace(scope), withRuntime("packs show")),
).pipe(
  withArgvTracking(showConfig),
  Command.withDescription("Inspect desired, accepted, and canonical pack state"),
  Command.withExamples([
    {
      command: "axm packs show my-pack",
      description: "Inspect a configured pack by name",
    },
    {
      command: "axm packs show @acme/packs/my-pack --json",
      description: "Emit structured pack state",
    },
  ]),
);
