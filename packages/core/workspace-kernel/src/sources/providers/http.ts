import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Path from "effect/Path";
import * as Option from "effect/Option";
import type * as Scope from "effect/Scope";
import { toFileLocation } from "@agentxm/host-primitives";
import type { HttpSource } from "@agentxm/extension-model/unstable/sources/types";
import type { HttpSkillRef } from "@agentxm/extension-model/unstable/extensions/refs/skill";
import type { SourceHostProvider } from "@agentxm/extension-model/unstable/sources/source-host-provider";
import {
  MAX_ACQUIRED_TREE_BYTES,
  MAX_OPERATION_SCRATCH_BYTES,
  OperationScratchBudget,
  makeOperationScratchBudget,
} from "@agentxm/registry-client";
import { MAX_ACQUIRED_TREE_ENTRIES, measureAcquiredTree } from "../../acquisition/index.js";
import { ArtifactHttpClient, downloadHttpArtifact } from "../http-download.js";
import { acquireHttpOffer, acquireAcceptedHttpPackage } from "../http-package.js";
import { parseWellKnownIndex, type SkillArtifactOffer } from "../well-known-index.js";
import { discoverExtensionPackages } from "../package-discovery.js";
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
      ] satisfies ReadonlyArray<SkillArtifactOffer>;
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

export const createHttpSourceHostProvider = (): SourceHostProvider<
  HttpSource,
  FileSystem.FileSystem | Path.Path | ArtifactHttpClient | Scope.Scope,
  SourceError
> => ({
  type: "http",
  match: (url) => Effect.succeed(url.protocol === "https:"),
  find: (source, options) =>
    Effect.gen(function* () {
      if (options.type !== "skill" && options.type !== "*") return [];
      const path = yield* Path.Path;
      const offers = yield* discoverOffers(source);
      const operationBudget = yield* Effect.serviceOption(OperationScratchBudget);
      const budget = Option.isSome(operationBudget)
        ? operationBudget.value
        : yield* makeOperationScratchBudget(MAX_OPERATION_SCRATCH_BYTES);
      const refs: HttpSkillRef[] = [];
      let remainingEntries = MAX_ACQUIRED_TREE_ENTRIES;
      for (const offer of offers) {
        if (source.kind === "index" && source.entry !== undefined && source.entry !== offer.name)
          continue;
        const acquired = yield* Effect.gen(function* () {
          const reservation = yield* budget.reserve(MAX_ACQUIRED_TREE_BYTES);
          const acquired = yield* acquireHttpOffer(offer, { maxEntries: remainingEntries });
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
        const candidates = yield* discoverExtensionPackages(
          acquired.directory,
          {
            type: "skill",
            names:
              source.kind !== "index" && source.entry !== undefined
                ? [source.entry]
                : options.names,
            owner: options.owner,
          },
          { rootName: offer.name },
        );
        for (const candidate of candidates) {
          if (candidate.kind === "plugin-mcp") continue;
          if (candidate.kind === "manifest" && candidate.manifest.type !== "skill") continue;
          const name =
            candidate.kind === "portable-skill" ? candidate.name : candidate.identity.name;
          const sourcePath =
            path.relative(acquired.directory, candidate.directory).split(path.sep).join("/") || ".";
          if (
            source.kind !== "index" &&
            source.entry !== undefined &&
            source.entry !== sourcePath &&
            source.entry !== name
          )
            continue;
          if (
            options.names.length > 0 &&
            !options.names.includes(name) &&
            !options.names.includes(sourcePath)
          )
            continue;
          const distribution =
            candidate.kind === "portable-skill" ? candidate.distribution : undefined;
          const packageRoot =
            distribution === undefined
              ? undefined
              : path
                  .relative(
                    acquired.directory,
                    path.resolve(
                      candidate.directory,
                      ...distribution.componentPath
                        .split("/")
                        .filter((part) => part !== ".")
                        .map(() => ".."),
                    ),
                  )
                  .split(path.sep)
                  .join("/") || ".";
          refs.push({
            type: "skill",
            refType: "http",
            name,
            source: { ...source, entry: source.kind === "index" ? offer.name : sourcePath },
            sourcePath,
            location: toFileLocation(candidate.directory),
            portable: candidate.kind === "portable-skill",
            snapshot: acquired.snapshot,
            ...(distribution === undefined || packageRoot === undefined
              ? {}
              : { distribution: { ...distribution, packageRoot } }),
            ...(candidate.kind === "portable-skill"
              ? {
                  skill: candidate.skill,
                }
              : {
                  owner: candidate.identity.owner,
                  skill: {
                    name,
                    description: Option.fromUndefinedOr(candidate.manifest.description),
                    metadata: Option.none(),
                  },
                }),
          });
        }
      }
      return refs;
    }),
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
          detail: "Accepted HTTP artifact does not contain the selected skill",
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
