import {
  extensionRefName,
  type ExtensionRef,
} from "@agentxm/extension-model/unstable/extensions/refs/extension-ref";
/**
 * Reconstructing a forced immutable-source reinstall from accepted lock authority.
 *
 * @experimental This API is unstable and may change without notice.
 * @packageDocumentation
 */

import { toFileLocation, fromFileLocation } from "@agentxm/host-primitives";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import * as Path from "effect/Path";
import * as Ref from "effect/Ref";

import { expandGlobs } from "@agentxm/extension-model/unstable/extensions/name-patterns";
import {
  toExtensionTypePlural,
  type ExtensionType,
} from "@agentxm/extension-model/unstable/extensions/common";
import type {
  GitSource,
  HttpSource,
  Source,
} from "@agentxm/extension-model/unstable/sources/types";
import {
  DesiredStateReader,
  WorkspaceLocation,
  computeExtensionPathsForLayout,
  extensionPathSourceFromLockEntry,
  computeMaterializedTreeIntegrity,
  LockfileReader,
  retainedPackageBindings,
  retainedPackageKeyForRef,
  acceptedLockedResolutionRef,
} from "@agentxm/workspace-kernel/workspace-state";
import { SourceHostProviders, pluginMcpPackageName } from "@agentxm/workspace-kernel/sources";
import { installRefused } from "@agentxm/workspace-kernel/operations";
import { sourceResolutionRefused } from "@agentxm/workspace-kernel/reconciliation";

const sameLocator = (left: GitSource | HttpSource, right: GitSource | HttpSource): boolean => {
  if (left.type === "http" && right.type === "http")
    return (
      left.url.href === right.url.href &&
      left.kind === right.kind &&
      (right.entry === undefined || left.entry === right.entry)
    );
  return (
    left.type === "git" &&
    right.type === "git" &&
    left.url.href === right.url.href &&
    Option.getOrUndefined(left.ref) === Option.getOrUndefined(right.ref) &&
    Option.getOrUndefined(left.subPath) === Option.getOrUndefined(right.subPath)
  );
};

const reacquireAcceptedSourceRef = (
  ref: Extract<ExtensionRef, { readonly refType: "git-hosted" | "http" }>,
) =>
  Effect.gen(function* () {
    const sources = yield* SourceHostProviders;
    const fetched = yield* sources
      .fetch(ref)
      .pipe(Effect.mapError((cause) => sourceResolutionRefused(cause)));
    return {
      ...ref,
      location: toFileLocation(fetched.directory),
    } satisfies ExtensionRef;
  });

/** Find matching accepted refs before any movable selector is resolved. */
export const findSourceReinstallRefs = (
  source: GitSource | HttpSource,
  type: ExtensionType,
  names: ReadonlyArray<string>,
) =>
  Effect.gen(function* () {
    const desired = yield* DesiredStateReader;
    const graph = yield* desired.graph();
    const nodes = graph.nodes.filter((node) => node.type === type);
    const selectedNames = expandGlobs(
      names,
      nodes.map((node) => node.name),
    );
    const accepted = yield* Effect.forEach(
      nodes,
      (node) =>
        acceptedLockedResolutionRef({ type: node.type, name: node.name }).pipe(
          Effect.mapError((cause) =>
            installRefused({
              category: "conflict",
              detail: `Accepted source resolution for ${node.name} could not be read`,
              cause,
            }),
          ),
          Effect.flatMap(
            Option.match({
              onNone: () => Effect.succeed(Option.none<ExtensionRef>()),
              onSome: (ref) =>
                (ref.refType === "git-hosted" || ref.refType === "http") &&
                sameLocator(ref.source, source) &&
                (names.length === 0 ||
                  selectedNames.includes(node.name) ||
                  (ref.type === "skill" &&
                    ref.sourcePath !== undefined &&
                    names.includes(ref.sourcePath)))
                  ? reacquireAcceptedSourceRef(ref).pipe(Effect.map(Option.some))
                  : Effect.succeed(Option.none<ExtensionRef>()),
            }),
          ),
        ),
      { concurrency: 1 },
    );
    return accepted.filter(Option.isSome).map((ref) => ref.value);
  });

/** Use a matching accepted ref and make its recorded content available locally. */
export const pinSourceReinstallRef = (
  ref: ExtensionRef,
  configuredName: string = extensionRefName(ref),
) =>
  Effect.gen(function* () {
    if (ref.refType !== "git-hosted" && ref.refType !== "http") return ref;
    const accepted = yield* acceptedLockedResolutionRef({
      type: ref.type,
      name: configuredName,
    }).pipe(
      Effect.mapError((cause) =>
        installRefused({
          category: "conflict",
          detail: `Accepted source resolution for ${configuredName} could not be read`,
          cause,
        }),
      ),
    );
    if (
      Option.isNone(accepted) ||
      (accepted.value.refType !== "git-hosted" && accepted.value.refType !== "http") ||
      accepted.value.type !== ref.type ||
      !sameLocator(accepted.value.source, ref.source)
    ) {
      return ref;
    }

    return yield* reacquireAcceptedSourceRef(accepted.value);
  });

/** Discover additional components of retained Git packages at their accepted commits. */
export const findRetainedGitComponents = (source: GitSource, type: ExtensionType) =>
  Effect.gen(function* () {
    const sources = yield* SourceHostProviders;
    const location = yield* WorkspaceLocation;
    const path = yield* Path.Path;
    const layout = yield* Ref.get(location.layout);
    const lock = yield* (yield* LockfileReader).lockfile.pipe(
      Effect.mapError((cause) =>
        installRefused({
          category: "conflict",
          detail: "Accepted package resolutions could not be read",
          cause,
        }),
      ),
    );
    const seen = new Set<string>();
    const refs: ExtensionRef[] = [];
    const requestedRoot = Option.getOrElse(source.subPath, () => ".");
    for (const binding of retainedPackageBindings(lock)) {
      const entry = binding.entry;
      if (
        entry.source.type !== "git" ||
        !("commit" in entry.resolved) ||
        entry.source.url.href !== source.url.href ||
        seen.has(binding.packageKey)
      )
        continue;
      const root = entry.source.distribution?.packageRoot ?? entry.source.path ?? ".";
      if (
        root !== "." &&
        requestedRoot !== "." &&
        root !== requestedRoot &&
        !root.startsWith(`${requestedRoot}/`) &&
        !requestedRoot.startsWith(`${root}/`)
      )
        continue;
      seen.add(binding.packageKey);
      const canonical = computeExtensionPathsForLayout(
        path.join,
        layout,
        extensionPathSourceFromLockEntry(entry),
        toExtensionTypePlural(binding.type),
        entry.identity.name,
      ).canonicalPath;
      const integrity = yield* computeMaterializedTreeIntegrity(canonical).pipe(Effect.option);
      if (Option.isSome(integrity) && integrity.value === entry.treeIntegrity) {
        const found = yield* sources
          .find(
            { type: "local", path: canonical },
            { type, names: [], owner: Option.none(), versionRange: Option.none() },
          )
          .pipe(Effect.mapError(sourceResolutionRefused));
        for (const ref of found) {
          if (ref.refType !== "local") continue;
          const component =
            path.relative(canonical, fromFileLocation(ref.location)).split(path.sep).join("/") ||
            ".";
          if (component !== (ref.distribution?.componentPath ?? ".")) continue;
          refs.push({
            ...ref,
            refType: "git-hosted",
            source: {
              type: "git",
              url: entry.source.url,
              ref: Option.fromUndefinedOr(entry.source.revision),
              subPath: root === "." ? Option.none() : Option.some(root),
            },
            sourcePath:
              component === "." ? root : root === "." ? component : `${root}/${component}`,
            gitCommitSha: entry.resolved.commit,
            gitTreeSha: entry.resolved.tree,
            ...(ref.distribution === undefined
              ? {}
              : { distribution: { ...ref.distribution, packageRoot: root } }),
            ...(ref.type === "mcp-server" && ref.nativeComponent !== undefined
              ? {
                  name: pluginMcpPackageName({
                    type: "git",
                    url: entry.source.url,
                    packageRoot: root,
                  }),
                }
              : {}),
          });
        }
        continue;
      }
      const found = yield* sources
        .find(
          {
            type: "git",
            url: entry.source.url,
            ref: Option.some(entry.resolved.commit),
            subPath: root === "." ? Option.none() : Option.some(root),
          },
          { type, names: [], owner: Option.none(), versionRange: Option.none() },
        )
        .pipe(Effect.mapError((cause) => sourceResolutionRefused(cause)));
      for (const ref of found)
        if (ref.refType === "git-hosted" && retainedPackageKeyForRef(ref) === binding.packageKey)
          refs.push({
            ...ref,
            source: { ...ref.source, ref: Option.fromUndefinedOr(entry.source.revision) },
          });
    }
    return refs;
  });

/** Read an already retained payload before consulting a mutable local or HTTP source. */
export const findRetainedSourceComponents = (
  source: Source,
  type: ExtensionType,
  refreshLocal = false,
) =>
  Effect.gen(function* () {
    if (source.type === "local" && refreshLocal) return [];
    if (source.type === "git") return yield* findRetainedGitComponents(source, type);
    if (source.type !== "local" && source.type !== "http") return [];
    const sources = yield* SourceHostProviders;
    const location = yield* WorkspaceLocation;
    const path = yield* Path.Path;
    const layout = yield* Ref.get(location.layout);
    const lock = yield* (yield* LockfileReader).lockfile.pipe(
      Effect.mapError((cause) =>
        installRefused({
          category: "conflict",
          detail: "Accepted package resolutions could not be read",
          cause,
        }),
      ),
    );
    const seen = new Set<string>();
    const refs: ExtensionRef[] = [];
    for (const binding of retainedPackageBindings(lock)) {
      const entry = binding.entry;
      if (seen.has(binding.packageKey)) continue;
      if (entry.source.type !== "path" && entry.source.type !== "http") continue;
      const descriptor = entry.source.distribution;
      const component = descriptor?.componentPath ?? ".";
      const suffix = component === "." ? "" : `/${component}`;
      const packageRoot =
        entry.source.type === "http"
          ? (descriptor?.packageRoot ?? entry.source.path)
          : suffix !== "" && entry.source.path.endsWith(suffix)
            ? entry.source.path.slice(0, -suffix.length) || "."
            : entry.source.path;
      if (source.type === "local") {
        if (entry.source.type !== "path") continue;
        const absolute = path.resolve(location.baseDir, packageRoot);
        const requested = path.resolve(location.baseDir, source.path);
        if (
          absolute !== requested &&
          !absolute.startsWith(`${requested}${path.sep}`) &&
          !requested.startsWith(`${absolute}${path.sep}`)
        )
          continue;
      } else if (
        entry.source.type !== "http" ||
        source.url.href !== entry.source.url.href ||
        source.kind !== entry.source.kind ||
        (source.entry !== undefined && source.entry !== entry.source.entry)
      )
        continue;
      seen.add(binding.packageKey);
      const canonical = computeExtensionPathsForLayout(
        path.join,
        layout,
        extensionPathSourceFromLockEntry(entry),
        toExtensionTypePlural(binding.type),
        entry.identity.name,
      ).canonicalPath;
      const integrity = yield* computeMaterializedTreeIntegrity(canonical).pipe(Effect.option);
      let discoveryRoot: string = canonical;
      if (Option.isNone(integrity) || integrity.value !== entry.treeIntegrity) {
        if (entry.source.type !== "path")
          return yield* installRefused({
            category: "conflict",
            detail: "The retained package must be restored before adding a component",
          });
        const original = path.resolve(location.baseDir, packageRoot);
        const originalIntegrity = yield* computeMaterializedTreeIntegrity(original).pipe(
          Effect.option,
        );
        if (Option.isNone(originalIntegrity) || originalIntegrity.value !== entry.treeIntegrity)
          return yield* installRefused({
            category: "conflict",
            detail:
              "Neither the retained package nor the local source contains the accepted snapshot",
          });
        discoveryRoot = original;
      }
      const found = yield* sources
        .find(
          { type: "local", path: discoveryRoot },
          {
            type,
            names: [],
            owner: Option.none(),
            versionRange: Option.none(),
          },
        )
        .pipe(Effect.mapError((cause) => sourceResolutionRefused(cause)));
      for (const ref of found) {
        if (ref.refType !== "local") continue;
        const selected =
          path.relative(discoveryRoot, fromFileLocation(ref.location)).split(path.sep).join("/") ||
          ".";
        if (selected !== (ref.distribution?.componentPath ?? ".")) continue;
        const sourcePath =
          selected === "."
            ? packageRoot
            : packageRoot === "."
              ? selected
              : `${packageRoot}/${selected}`;
        const distribution =
          ref.distribution === undefined
            ? undefined
            : { ...ref.distribution, packageRoot: descriptor?.packageRoot ?? packageRoot };
        if (source.type === "local")
          refs.push({
            ...ref,
            source,
            sourcePath,
            ...(ref.type === "mcp-server" && ref.nativeComponent !== undefined
              ? {
                  name: pluginMcpPackageName({
                    type: "local",
                    path: path.resolve(location.baseDir, packageRoot),
                  }),
                  source: {
                    type: "local" as const,
                    path: path.resolve(location.baseDir, packageRoot),
                  },
                }
              : {}),
            sourceRelativePath:
              path
                .relative(
                  path.resolve(location.baseDir, source.path),
                  path.resolve(location.baseDir, sourcePath),
                )
                .split(path.sep)
                .join("/") || ".",
            ...(distribution === undefined ? {} : { distribution }),
          });
        else if (ref.type === "skill" && entry.source.type === "http" && "format" in entry.resolved)
          refs.push({
            ...ref,
            refType: "http",
            source: {
              ...source,
              ...(entry.source.entry === undefined ? {} : { entry: entry.source.entry }),
            },
            sourcePath,
            portable: entry.source.portable,
            snapshot: entry.resolved,
            ...(distribution === undefined ? {} : { distribution }),
          });
      }
    }
    return refs;
  });

/** Selectors already present in an accepted package need no mutable upstream discovery. */
export const retainedSelectionSatisfied = (
  refs: ReadonlyArray<ExtensionRef>,
  names: ReadonlyArray<string>,
): boolean => {
  const available = refs.flatMap((ref) => [
    ref.name,
    extensionRefName(ref),
    ...("sourcePath" in ref && ref.sourcePath !== undefined ? [ref.sourcePath] : []),
    ...("sourceRelativePath" in ref && ref.sourceRelativePath !== undefined
      ? [ref.sourceRelativePath]
      : []),
    ...("distribution" in ref && ref.distribution !== undefined
      ? [ref.distribution.componentPath]
      : []),
    ...("nativeComponent" in ref && ref.nativeComponent !== undefined
      ? [
          ref.nativeComponent.name,
          `${"sourcePath" in ref ? ref.sourcePath : "."}#${ref.nativeComponent.name}`,
        ]
      : []),
  ]);
  return (
    refs.length > 0 &&
    names.length > 0 &&
    names.every((name) => !name.includes("*") && expandGlobs([name], available).length > 0)
  );
};

export const mergeRetainedSourceRefs = (
  retained: ReadonlyArray<ExtensionRef>,
  fresh: ReadonlyArray<ExtensionRef>,
) => {
  const keys = new Set(
    retained.flatMap((ref) => (ref.refType === "workspace" ? [] : [retainedPackageKeyForRef(ref)])),
  );
  return [
    ...retained,
    ...fresh.filter(
      (ref) => ref.refType === "workspace" || !keys.has(retainedPackageKeyForRef(ref)),
    ),
  ];
};
