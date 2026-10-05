import { createHash } from "node:crypto";
import { decodeExtensionNameSync } from "@agentxm/extension-model/unstable/extensions";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Option from "effect/Option";
import * as Path from "effect/Path";
import { toFileLocation } from "@agentxm/host-primitives";

import type { ExtensionRef } from "@agentxm/extension-model/unstable/extensions/refs/extension-ref";
import type { HookExtensionRef } from "@agentxm/extension-model/unstable/extensions/refs/hook";
import type { KnowledgeExtensionRef } from "@agentxm/extension-model/unstable/extensions/refs/knowledge";
import type { McpServerExtensionRef } from "@agentxm/extension-model/unstable/extensions/refs/mcp-server";
import type { PackRef } from "@agentxm/extension-model/unstable/extensions/refs/pack";
import type { RuleExtensionRef } from "@agentxm/extension-model/unstable/extensions/refs/rule";
import type { SkillExtensionRef } from "@agentxm/extension-model/unstable/extensions/refs/skill";
import type { SubagentExtensionRef } from "@agentxm/extension-model/unstable/extensions/refs/subagent";
import type { FindOptions } from "@agentxm/extension-model/unstable/sources/source-host-provider";
import type { GitBasedSource, LocalSource } from "@agentxm/extension-model/unstable/sources/types";
import { getCommitSha, getTreeSha } from "../git/operations.js";
import {
  discoverExtensionPackages,
  type DiscoveredExtensionPackage,
} from "../package-discovery.js";
import type { GitOperationFailed, SourceError } from "../errors.js";

type ExternalSource = GitBasedSource | LocalSource;

type LocalSourceRefDetails = {
  readonly refType: "local";
  readonly source: LocalSource;
  readonly sourcePath: string;
  readonly sourceRelativePath: string;
  readonly location: string;
};

type GitSourceRefDetails = {
  readonly refType: "git-hosted";
  readonly source: GitBasedSource;
  readonly sourcePath: string;
  readonly location: string;
  readonly gitTreeSha: string;
  readonly gitCommitSha: string;
};

// Git metadata probes stay serial because they spawn subprocesses and no
// higher subprocess capacity has been established.
const GIT_METADATA_CONCURRENCY = 1;

const relativeDir = (basePath: string, directory: string) =>
  Effect.gen(function* () {
    const path = yield* Path.Path;
    return path.relative(basePath, directory);
  });

const gitTreeShaFor = (
  basePath: string,
  directory: string,
): Effect.Effect<string, GitOperationFailed, Path.Path> =>
  relativeDir(basePath, directory).pipe(Effect.flatMap((dir) => getTreeSha(basePath, dir)));

const subPathForSource = (source: ExternalSource): Option.Option<string> => {
  switch (source.type) {
    case "git":
      return source.subPath;
    case "local":
      return Option.none();
  }
};

const searchRootFor = (source: ExternalSource, basePath: string) =>
  Effect.gen(function* () {
    const path = yield* Path.Path;
    if (source.type === "local") return source.path;
    return Option.match(subPathForSource(source), {
      onNone: () => basePath,
      onSome: (subPath) => path.join(basePath, subPath),
    });
  });

const sourceRefDetails = (
  source: ExternalSource,
  basePath: string,
  directory: string,
  packageDirectory: string,
) =>
  Effect.gen(function* () {
    const sourcePath = yield* relativeDir(basePath, directory);
    const location = toFileLocation(directory);
    switch (source.type) {
      case "local":
        return {
          refType: "local",
          source,
          sourcePath,
          sourceRelativePath: sourcePath.split((yield* Path.Path).sep).join("/") || ".",
          location,
        } satisfies LocalSourceRefDetails;
      case "git":
        return {
          refType: "git-hosted",
          source,
          sourcePath: sourcePath.split((yield* Path.Path).sep).join("/") || ".",
          location,
          gitTreeSha: yield* gitTreeShaFor(basePath, packageDirectory),
          gitCommitSha: yield* getCommitSha(basePath),
        } satisfies GitSourceRefDetails;
    }
  });

const refForCandidate = (
  source: ExternalSource,
  basePath: string,
  candidate: DiscoveredExtensionPackage,
) =>
  Effect.gen(function* () {
    const path = yield* Path.Path;
    const packageDirectory =
      candidate.kind === "portable-skill" && candidate.distribution !== undefined
        ? path.resolve(
            candidate.directory,
            ...candidate.distribution.componentPath
              .split("/")
              .filter((segment) => segment !== ".")
              .map(() => ".."),
          )
        : candidate.directory;
    const details = yield* sourceRefDetails(
      source,
      basePath,
      candidate.directory,
      packageDirectory,
    );
    if (candidate.kind === "plugin-mcp") {
      const packagePath =
        path.relative(basePath, candidate.directory).split(path.sep).join("/") || ".";
      const packageIdentity =
        details.refType === "local"
          ? path.resolve(candidate.directory)
          : `${details.source.url.href}#${packagePath}`;
      const packageName = decodeExtensionNameSync(
        `plugin-${createHash("sha256").update(packageIdentity).digest("hex").slice(0, 16)}`,
      );
      const member = {
        type: "mcp-server" as const,
        name: packageName,
        server: { name: candidate.name },
        nativeComponent: candidate.nativeComponent,
        distribution: { ...candidate.distribution, packageRoot: packagePath },
      };
      return Option.some<ExtensionRef>(
        details.refType === "local"
          ? { ...details, ...member, source: { ...details.source, path: candidate.directory } }
          : {
              ...details,
              ...member,
              source: {
                ...details.source,
                subPath: packagePath === "." ? Option.none() : Option.some(packagePath),
              },
            },
      );
    }
    if (candidate.kind === "portable-skill") {
      return Option.some<ExtensionRef>({
        type: "skill",
        ...details,
        name: candidate.name,
        skill: candidate.skill,
        portable: true,
        ...(candidate.distribution === undefined
          ? {}
          : {
              distribution: {
                ...candidate.distribution,
                ...(candidate.distribution.marketplace === undefined
                  ? {}
                  : {
                      marketplace: {
                        ...candidate.distribution.marketplace,
                        path: path
                          .relative(
                            basePath,
                            path.resolve(
                              packageDirectory,
                              ...candidate.distribution.packageRoot
                                .split("/")
                                .filter((segment) => segment !== ".")
                                .map(() => ".."),
                              candidate.distribution.marketplace.path,
                            ),
                          )
                          .split(path.sep)
                          .join("/"),
                      },
                    }),
                packageRoot:
                  path
                    .relative(
                      basePath,
                      path.resolve(
                        candidate.directory,
                        ...candidate.distribution.componentPath
                          .split("/")
                          .filter((segment) => segment !== ".")
                          .map(() => ".."),
                      ),
                    )
                    .split(path.sep)
                    .join("/") || ".",
              },
            }),
      } satisfies SkillExtensionRef);
    }

    const { identity, manifest } = candidate;
    switch (manifest.type) {
      case "skill":
        return Option.some<ExtensionRef>({
          type: "skill",
          ...details,
          owner: identity.owner,
          name: identity.name,
          skill: {
            name: identity.name,
            description: Option.fromUndefinedOr(manifest.description),
            metadata: Option.none(),
          },
        } satisfies SkillExtensionRef);
      case "mcp-server":
        return Option.some<ExtensionRef>({
          type: "mcp-server",
          ...details,
          owner: identity.owner,
          name: identity.name,
          server: { name: identity.name },
        } satisfies McpServerExtensionRef);
      case "subagent":
        return Option.some<ExtensionRef>({
          type: "subagent",
          ...details,
          owner: identity.owner,
          name: identity.name,
          subagent: {
            name: identity.name,
            description: Option.fromUndefinedOr(manifest.description),
          },
        } satisfies SubagentExtensionRef);
      case "rule":
        return Option.some<ExtensionRef>({
          type: "rule",
          ...details,
          owner: identity.owner,
          name: identity.name,
          rule: { name: identity.name },
        } satisfies RuleExtensionRef);
      case "hook":
        return Option.some<ExtensionRef>({
          type: "hook",
          ...details,
          owner: identity.owner,
          name: identity.name,
          hook: { name: identity.name },
        } satisfies HookExtensionRef);
      case "knowledge":
        return Option.some<ExtensionRef>({
          type: "knowledge",
          ...details,
          owner: identity.owner,
          name: identity.name,
          knowledge: { name: identity.name },
        } satisfies KnowledgeExtensionRef);
      case "pack":
        return Option.some<ExtensionRef>({
          type: "pack",
          ...details,
          owner: identity.owner,
          name: identity.name,
          version: manifest.version,
          pack: {
            name: identity.name,
            dependencies: manifest.dependencies,
          },
          sourceMembers: [],
        } satisfies PackRef);
    }
  });

export const discoverConventionRefs = (
  source: ExternalSource,
  basePath: string,
  options: FindOptions,
): Effect.Effect<ReadonlyArray<ExtensionRef>, SourceError, FileSystem.FileSystem | Path.Path> =>
  Effect.gen(function* () {
    const root = yield* searchRootFor(source, basePath);
    const candidates = yield* discoverExtensionPackages(
      root,
      options.type === "pack" || options.type === "*"
        ? {
            type: "*",
            names: [],
            owner: Option.none(),
          }
        : options,
      source.type === "git"
        ? {
            rootName:
              source.url.pathname
                .split("/")
                .filter(Boolean)
                .at(-1)
                ?.replace(/\.git$/u, "") ?? "skill",
          }
        : {},
    );
    const refs = yield* Effect.forEach(
      candidates,
      (candidate) => refForCandidate(source, basePath, candidate),
      { concurrency: GIT_METADATA_CONCURRENCY },
    );
    const discovered = refs.flatMap((ref) => (Option.isSome(ref) ? [ref.value] : []));
    const sourceMembers = discovered.filter((ref) => ref.type !== "pack");
    if (options.type !== "pack" && options.type !== "*") return discovered;
    const complete = discovered.map((ref) =>
      ref.type === "pack" ? { ...ref, sourceMembers } : ref,
    );
    return complete.filter(
      (ref) =>
        (options.type === "*" || ref.type === "pack") &&
        (options.names.length === 0 || options.names.includes(ref.name)) &&
        (Option.isNone(options.owner) || options.owner.value === ref.owner),
    );
  });
