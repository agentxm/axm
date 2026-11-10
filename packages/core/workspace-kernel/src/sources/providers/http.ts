import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Path from "effect/Path";
import * as Option from "effect/Option";
import type * as Scope from "effect/Scope";
import type { HttpSource } from "@agentxm/extension-model/unstable/sources/types";
import type { ExtensionRef } from "@agentxm/extension-model/unstable/extensions/refs/extension-ref";
import type { HttpArtifactSnapshot } from "@agentxm/extension-model/unstable/sources/http-artifact";
import { discoverConventionRefs } from "./convention-discovery.js";
import type {
  FindOptions,
  SourceHostProvider,
} from "@agentxm/extension-model/unstable/sources/source-host-provider";
import {
  MAX_ACQUIRED_TREE_ENTRIES,
  measureAcquiredTree,
  MAX_ACQUIRED_TREE_BYTES,
  MAX_OPERATION_SCRATCH_BYTES,
  OperationScratchBudget,
  makeOperationScratchBudget,
} from "../../acquisition/index.js";
import { ArtifactHttpClient, downloadHttpArtifact } from "../http-download.js";
import {
  acquireHttpOffer,
  acquireAcceptedHttpPackage,
  type HttpPackageOffer,
} from "../http-package.js";
import { parseWellKnownIndex } from "../well-known-index.js";
import { SourceNetworkFailure, SourceNotResolvable, type SourceError } from "../errors.js";

const discoverOffers = (source: HttpSource) =>
  Effect.gen(function* () {
    if (source.kind !== "index") {
      const parts = source.url.pathname.split("/").filter(Boolean);
      const name =
        source.kind === "skill-md"
          ? (parts.at(-2) ?? "skill")
          : (parts.at(-1)?.replace(/\.(zip|tar\.gz|tar|tgz)$/iu, "") ?? "skill");
      return [
        { name, format: source.kind, artifacts: [{ url: source.url }] },
      ] satisfies ReadonlyArray<HttpPackageOffer>;
    }
    const indexUrl = new URL(source.url.href);
    const originDiscovery = indexUrl.pathname === "/";
    if (originDiscovery) indexUrl.pathname = "/.well-known/agent-skills/index.json";
    else if (!indexUrl.pathname.endsWith("index.json"))
      indexUrl.pathname = `${indexUrl.pathname.replace(/\/$/u, "")}/index.json`;
    const downloaded = yield* downloadHttpArtifact(indexUrl).pipe(
      Effect.catchTag("SourceNotResolvable", (error) =>
        originDiscovery && error.category === "not_found"
          ? downloadHttpArtifact(new URL("/.well-known/skills/index.json", source.url))
          : Effect.fail(error),
      ),
    );
    return yield* parseWellKnownIndex(downloaded.bytes, downloaded.url);
  });

type HttpRef = Extract<ExtensionRef, { readonly refType: "http" }>;
type LocalRef = Extract<ExtensionRef, { readonly refType: "local" }>;

/** Bind discovered package semantics to the immutable archive that supplied them. */
export const bindHttpPackageRef = (
  ref: LocalRef,
  source: HttpSource,
  snapshot: HttpArtifactSnapshot,
  sourceRoot = ".",
): HttpRef => {
  const withinSource = (relative: string) =>
    relative === "." ? sourceRoot : sourceRoot === "." ? relative : `${sourceRoot}/${relative}`;
  const sourcePath = withinSource(ref.sourceRelativePath ?? ".");
  const common = {
    refType: "http" as const,
    source: { ...source, ...(source.kind === "index" ? {} : { entry: sourcePath }) },
    sourcePath,
    location: ref.location,
    snapshot,
    portable: ref.type === "skill" && ref.portable === true,
    name: ref.name,
    ...(ref.heldBySource === undefined ? {} : { heldBySource: ref.heldBySource }),
    ...(ref.distribution === undefined
      ? {}
      : {
          distribution: {
            ...ref.distribution,
            packageRoot: withinSource(ref.distribution.packageRoot),
          },
        }),
  };
  if (ref.type === "skill")
    return {
      ...common,
      type: "skill",
      skill: ref.skill,
      ...(ref.owner === undefined ? {} : { owner: ref.owner }),
    };
  // Native plugin MCP components have a different package contract from manifest-backed MCPs.
  if (ref.type === "mcp-server")
    return {
      ...common,
      type: "mcp-server",
      server: ref.server,
      ...(ref.owner === undefined ? {} : { owner: ref.owner }),
    };
  if (ref.type === "pack") {
    const members = ref.sourceMembers.flatMap((member) => {
      if (
        member.refType !== "local" ||
        (member.type === "mcp-server" && member.owner === undefined)
      )
        return [];
      const converted = bindHttpPackageRef(member, source, snapshot, sourceRoot);
      return converted.type === "pack" ? [] : [converted];
    });
    return {
      ...common,
      type: "pack",
      owner: ref.owner,
      version: ref.version,
      pack: ref.pack,
      sourceMembers: members,
    };
  }
  const owned = { ...common, owner: ref.owner };
  switch (ref.type) {
    case "knowledge":
      return { ...owned, type: ref.type, knowledge: ref.knowledge };
    case "hook":
      return { ...owned, type: ref.type, hook: ref.hook };
    case "rule":
      return { ...owned, type: ref.type, rule: ref.rule };
    case "subagent":
      return { ...owned, type: ref.type, subagent: ref.subagent };
  }
};

/** Discover against current offers, or replay an explicitly accepted immutable artifact view. */
export const findHttpSource = (
  source: HttpSource,
  options: FindOptions,
  accepted?: HttpArtifactSnapshot,
) =>
  Effect.gen(function* () {
    if (source.kind !== "archive" && options.type !== "skill" && options.type !== "*") return [];
    const offers =
      accepted === undefined
        ? yield* discoverOffers(source)
        : [
            {
              name: source.entry ?? "accepted",
              format: "archive",
              artifacts: [],
            } satisfies HttpPackageOffer,
          ];
    const operationBudget = yield* Effect.serviceOption(OperationScratchBudget);
    const budget = Option.isSome(operationBudget)
      ? operationBudget.value
      : yield* makeOperationScratchBudget(MAX_OPERATION_SCRATCH_BYTES);
    const refs: ExtensionRef[] = [];
    let remainingEntries = MAX_ACQUIRED_TREE_ENTRIES;
    for (const offer of offers) {
      if (source.kind === "index" && source.entry !== undefined && source.entry !== offer.name)
        continue;
      const acquired = yield* Effect.gen(function* () {
        const reservation = yield* budget.reserve(MAX_ACQUIRED_TREE_BYTES);
        const acquired =
          accepted === undefined
            ? yield* acquireHttpOffer(offer, { maxEntries: remainingEntries })
            : yield* acquireAcceptedHttpPackage(accepted);
        const measured = yield* measureAcquiredTree(acquired.directory, {
          maxEntries: remainingEntries,
        });
        remainingEntries -= measured.entries;
        yield* reservation.settle(measured.bytes);
        return acquired;
      }).pipe(
        Effect.catchTags({
          OperationScratchLimitExceeded: (cause) =>
            Effect.fail(
              new SourceNotResolvable({
                category: "validation",
                detail: `HTTP discovery exceeds the ${cause.capacity} byte operation scratch limit`,
              }),
            ),
          AcquiredTreeLimitExceeded: (cause) =>
            Effect.fail(
              new SourceNotResolvable({
                category: "validation",
                detail: `HTTP artifact exceeds the ${cause.limit} ${cause.resource} tree limit`,
              }),
            ),
          PlatformError: (cause) =>
            Effect.fail(
              new SourceNetworkFailure({
                detail: "Could not inspect acquired HTTP artifact",
                cause,
              }),
            ),
          NativeLocationError: (cause) =>
            Effect.fail(
              new SourceNotResolvable({
                category: "validation",
                detail: String(cause),
              }),
            ),
        }),
      );
      const candidates = yield* discoverConventionRefs(
        { type: "local", path: acquired.directory },
        acquired.directory,
        {
          ...options,
          type: source.kind === "archive" ? options.type : "skill",
          names:
            source.kind !== "index" && source.entry !== undefined ? [source.entry] : options.names,
        },
        { rootName: offer.name },
      );
      for (const candidate of candidates) {
        if (candidate.refType !== "local") continue;
        if (candidate.type === "mcp-server" && candidate.owner === undefined) continue;
        const sourcePath = candidate.sourceRelativePath ?? ".";
        if (
          source.kind !== "index" &&
          source.entry !== undefined &&
          source.entry !== sourcePath &&
          source.entry !== candidate.name
        )
          continue;
        if (
          options.names.length > 0 &&
          !options.names.includes(candidate.name) &&
          !options.names.includes(sourcePath)
        )
          continue;
        refs.push(
          bindHttpPackageRef(
            candidate,
            { ...source, ...(source.kind === "index" ? { entry: offer.name } : {}) },
            acquired.snapshot,
          ),
        );
      }
    }
    return refs;
  });

export const createHttpSourceHostProvider = (): SourceHostProvider<
  HttpSource,
  FileSystem.FileSystem | Path.Path | ArtifactHttpClient | Scope.Scope,
  SourceError
> => ({
  type: "http",
  match: (url) => Effect.succeed(url.protocol === "https:"),
  find: findHttpSource,
  fetch: (_source, ref) =>
    Effect.gen(function* () {
      if (ref.refType !== "http")
        return yield* new SourceNotResolvable({
          category: "validation",
          detail: "HTTP source requires an accepted artifact reference",
        });
      const path = yield* Path.Path;
      const fs = yield* FileSystem.FileSystem;
      const acquired = yield* acquireAcceptedHttpPackage(ref.snapshot);
      const directory = path.join(acquired.directory, ref.sourcePath);
      if (!(yield* fs.exists(directory)))
        return yield* new SourceNotResolvable({
          category: "conflict",
          detail: "Accepted HTTP artifact does not contain the selected extension",
        });
      return {
        directory,
        scratchRoot: acquired.directory,
        ...(ref.distribution === undefined
          ? {}
          : {
              packageDirectory: path.join(acquired.directory, ref.distribution.packageRoot),
              componentPath: ref.distribution.componentPath,
            }),
      };
    }).pipe(
      Effect.catchTag("PlatformError", (cause) =>
        Effect.fail(
          new SourceNetworkFailure({ detail: "Could not read accepted HTTP package", cause }),
        ),
      ),
    ),
});
