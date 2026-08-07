import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Path from "effect/Path";
import * as Schema from "effect/Schema";
import { Argument, Command } from "effect/unstable/cli";
import { makeAppError } from "@agentxm/client-core/unstable/app-error";
import { CliRenderer, type DetailView } from "@agentxm/client-core/unstable/cli-renderer";
import {
  computePackageContentHash,
  formatFqn,
  parseExtensionFqnParts,
} from "@agentxm/client-core/unstable/extensions";
import {
  computePackPaths,
  PACK_MANIFEST_FILENAME,
  PackManifestSchema,
} from "@agentxm/client-core/unstable/packs";
import { isWorkspaceSourceLocator } from "@agentxm/client-core/unstable/sources";
import { trustRecordKey } from "@agentxm/client-core/unstable/trust";
import {
  DEFAULT_WORKSPACE_SCOPE,
  WorkspaceMutations,
} from "@agentxm/client-core/unstable/workspace";
import { withArgvTracking } from "@agentxm/client-core/unstable/cli-runtime";
import { withRuntime, withWorkspace } from "../../runtime.js";

const PackMemberSchema = Schema.Struct({
  fqn: Schema.String,
  constraint: Schema.NullOr(Schema.String),
  version: Schema.NullOr(Schema.String),
  source: Schema.NullOr(Schema.String),
});

export const PackShowResultSchema = Schema.Struct({
  pack: Schema.String,
  sourceAuthority: Schema.String,
  canonicalPath: Schema.String,
  manifestVersion: Schema.String,
  trustStatus: Schema.String,
  canonicalStatus: Schema.String,
  desiredDependencies: Schema.Array(PackMemberSchema),
  resolvedDependencies: Schema.Array(PackMemberSchema),
  drift: Schema.Array(Schema.String),
  recoveryAction: Schema.NullOr(Schema.String),
});

type PackShowResult = Schema.Schema.Type<typeof PackShowResultSchema>;

const ShowDetail = {
  fields: {
    pack: { label: "Pack" },
    sourceAuthority: { label: "Source authority" },
    canonicalPath: { label: "Canonical path" },
    manifestVersion: { label: "Manifest version" },
    trustStatus: { label: "Trust" },
    canonicalStatus: { label: "Canonical" },
    desiredCount: { label: "Desired members" },
    resolvedCount: { label: "Resolved members" },
    drift: { label: "Drift", render: (items) => (items.length === 0 ? "none" : items.join("; ")) },
    recoveryAction: { label: "Recovery", render: (value) => value ?? "none" },
  },
} as const satisfies DetailView<
  Omit<PackShowResult, "desiredDependencies" | "resolvedDependencies"> & {
    readonly desiredCount: number;
    readonly resolvedCount: number;
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
  const sourceFqn = isWorkspaceSourceLocator(source)
    ? source.slice("workspace:".length)
    : source.replace(/^registry:/, "").replace(/@[^@/]+$/, "");
  const parsedSource = parseExtensionFqnParts(sourceFqn);
  if (parsedSource === undefined || parsedSource.type !== "pack") {
    return yield* makeAppError({
      code: "validation",
      detail: `Configured pack source is not a valid pack identity: ${source}`,
    });
  }
  if (
    requested !== undefined &&
    (requested.owner !== parsedSource.owner || requested.name !== parsedSource.name)
  ) {
    return yield* makeAppError({
      code: "conflict",
      detail: `Requested pack does not match configured identity ${sourceFqn}`,
    });
  }
  const canonicalPath = computePackPaths(
    path.join,
    ws.baseDir,
    parsedSource.owner,
    parsedSource.name,
  ).canonicalPath;
  const manifestPath = path.join(canonicalPath, PACK_MANIFEST_FILENAME);
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
  const trust = (yield* ws.getTrustState()).records[trustRecordKey("pack", name)];
  const currentContentIdentity = yield* computePackageContentHash(canonicalPath);
  const expectedIdentity = `${isWorkspaceSourceLocator(source) ? "workspace:" : ""}${sourceFqn}`;
  const trustStatus =
    trust === undefined
      ? "missing"
      : trust.sourceIdentity !== expectedIdentity
        ? "wrong-origin"
        : trust.contentIdentity === undefined
          ? "missing-content-baseline"
          : trust.contentIdentity === currentContentIdentity
            ? "trusted"
            : "drifted";
  const locked = yield* ws.getLockedPack(name);
  const receipt =
    locked._tag === "None"
      ? []
      : [
          locked.value.resolvedSkills,
          locked.value.resolvedMcpServers,
          locked.value.resolvedSubagents,
          locked.value.resolvedRules ?? {},
          locked.value.resolvedHooks ?? {},
          locked.value.resolvedKnowledge ?? {},
        ].flatMap((group) =>
          Object.entries(group).map(([fqn, member]) => ({
            fqn,
            constraint: null,
            version: member.version,
            source: "source" in member ? member.source : "registry",
          })),
        );
  const resolvedByFqn = new Map(receipt.map((member) => [member.fqn, member]));
  const desiredDependencies = Object.entries(manifest.dependencies).map(([fqn, constraint]) => ({
    fqn,
    constraint,
    version: resolvedByFqn.get(fqn)?.version ?? null,
    source: resolvedByFqn.get(fqn)?.source ?? null,
  }));
  const desiredNames = new Set(desiredDependencies.map((member) => member.fqn));
  const drift = [
    ...desiredDependencies
      .filter((member) => member.version === null)
      .map((member) => `${member.fqn} is desired but unresolved`),
    ...receipt
      .filter((member) => !desiredNames.has(member.fqn))
      .map((member) => `${member.fqn} is resolved but no longer desired`),
  ];
  if (trustStatus === "drifted") drift.unshift("canonical content differs from trust baseline");
  const fqn = formatFqn({ owner: parsedSource.owner, type: "pack", name: parsedSource.name });
  const result: PackShowResult = {
    pack: fqn,
    sourceAuthority: isWorkspaceSourceLocator(source) ? "workspace" : "registry",
    canonicalPath: manifestPath,
    manifestVersion: manifest.version,
    trustStatus,
    canonicalStatus: trustStatus === "trusted" ? "usable" : "blocked",
    desiredDependencies,
    resolvedDependencies: receipt,
    drift,
    recoveryAction:
      trustStatus === "drifted" && isWorkspaceSourceLocator(source)
        ? `axm packs repair ${fqn} --preview`
        : null,
  };
  if (yield* renderer.result(result, PackShowResultSchema)) return;
  yield* renderer.detail(
    {
      pack: result.pack,
      sourceAuthority: result.sourceAuthority,
      canonicalPath: result.canonicalPath,
      manifestVersion: result.manifestVersion,
      trustStatus: result.trustStatus,
      canonicalStatus: result.canonicalStatus,
      desiredCount: result.desiredDependencies.length,
      resolvedCount: result.resolvedDependencies.length,
      drift: result.drift,
      recoveryAction: result.recoveryAction,
    },
    ShowDetail,
    `Pack ${fqn}`,
  );
});

const showConfig = {
  target: Argument.string("name-or-fqn").pipe(
    Argument.withDescription("Configured pack name or fully qualified identity"),
  ),
} as const;

export const showCommand = Command.make("show", showConfig, ({ target }) =>
  handlePacksShow(target).pipe(withWorkspace(DEFAULT_WORKSPACE_SCOPE), withRuntime("packs show")),
).pipe(
  withArgvTracking(showConfig),
  Command.withDescription("Inspect desired, trusted, canonical, and resolved pack state"),
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
