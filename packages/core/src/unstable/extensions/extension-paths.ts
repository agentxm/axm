/**
 * Shared extension directory path helpers.
 *
 * @experimental This API is unstable and may change without notice.
 */

import * as Option from "effect/Option";
import type { ExtensionTypePlural } from "./common.js";
import type { Handle } from "./handle.js";
import type { GitBasedSource, LocalSource, RegistrySource } from "../sources/types.js";
import { decodeAbsolutePathSync, type AbsolutePath } from "../utils/path-types.js";
import type { WorkspaceLayout } from "../workspace/layout.js";

export type ExtensionPathSource =
  | {
      readonly refType: "registry";
      readonly owner: Handle;
      readonly source: RegistrySource;
      readonly portable?: false;
    }
  | {
      readonly refType: "workspace";
      readonly owner: Handle;
      readonly portable?: false;
    }
  | {
      readonly refType: "git-hosted";
      readonly source: GitBasedSource;
      readonly sourcePath?: string;
      readonly portable?: boolean;
    }
  | {
      readonly refType: "local";
      readonly source: LocalSource;
      readonly sourcePath?: string;
      readonly portable?: boolean;
    };

export type ExtensionPathLockEntry =
  | {
      readonly type: "registry";
      readonly sourceName: string;
      readonly endpoint: URL;
      readonly owner: Handle;
    }
  | {
      readonly type: "local";
      readonly path: string;
      readonly packageFormat: "agentxm" | "agent-skill";
    }
  | {
      readonly type: "github" | "gitlab" | "bitbucket";
      readonly sourceName: string;
      readonly endpoint: URL;
      readonly owner: string;
      readonly repo: string;
      readonly path?: string | undefined;
      readonly ref?: string | undefined;
      readonly packageFormat: "agentxm" | "agent-skill";
    }
  | {
      readonly type: "azurerepos";
      readonly sourceName: string;
      readonly endpoint: URL;
      readonly organization: string;
      readonly project: string;
      readonly repo: string;
      readonly path?: string | undefined;
      readonly ref?: string | undefined;
      readonly packageFormat: "agentxm" | "agent-skill";
    }
  | {
      readonly type: "git";
      readonly url: string;
      readonly path?: string | undefined;
      readonly ref?: string | undefined;
      readonly packageFormat: "agentxm" | "agent-skill";
    };

export const extensionPathSourceFromLockEntry = (
  entry: ExtensionPathLockEntry,
): Exclude<ExtensionPathSource, { readonly refType: "workspace" }> => {
  switch (entry.type) {
    case "registry":
      return {
        refType: "registry",
        owner: entry.owner,
        source: {
          type: "registry",
          name: entry.sourceName,
          location: entry.endpoint,
          owner: Option.some(entry.owner),
        },
      };
    case "local":
      return {
        refType: "local",
        source: { type: "local", path: entry.path },
        sourcePath: entry.path,
        portable: entry.packageFormat === "agent-skill",
      };
    case "github":
    case "gitlab":
    case "bitbucket":
      return {
        refType: "git-hosted",
        source: {
          type: entry.type,
          name: entry.sourceName,
          url: entry.endpoint,
          owner: entry.owner,
          repo: entry.repo,
          ref: Option.fromUndefinedOr(entry.ref),
          subPath: Option.fromUndefinedOr(entry.path),
        },
        ...(entry.path === undefined ? {} : { sourcePath: entry.path }),
        portable: entry.packageFormat === "agent-skill",
      };
    case "azurerepos":
      return {
        refType: "git-hosted",
        source: {
          type: "azurerepos",
          name: entry.sourceName,
          url: entry.endpoint,
          organization: entry.organization,
          project: entry.project,
          repo: entry.repo,
          ref: Option.fromUndefinedOr(entry.ref),
          subPath: Option.fromUndefinedOr(entry.path),
        },
        ...(entry.path === undefined ? {} : { sourcePath: entry.path }),
        portable: entry.packageFormat === "agent-skill",
      };
    case "git":
      return {
        refType: "git-hosted",
        source: {
          type: "git",
          url: new URL(entry.url),
          ref: Option.fromUndefinedOr(entry.ref),
        },
        ...(entry.path === undefined ? {} : { sourcePath: entry.path }),
        portable: entry.packageFormat === "agent-skill",
      };
  }
};

export interface ExtensionDirPaths {
  readonly canonicalPath: AbsolutePath;
  readonly extensionSrcPath: AbsolutePath;
}

export const extensionContentFilename = (name: string): string => `${name}.md`;

export const extensionContentPath = (
  join: (...paths: string[]) => string,
  root: string,
  name: string,
): AbsolutePath => decodeAbsolutePathSync(join(root, extensionContentFilename(name)));

const sourcePathSegments = (value: string): ReadonlyArray<string> => {
  const segments = value
    .replaceAll("\\", "/")
    .split("/")
    .filter((segment) => segment !== "" && segment !== ".");
  if (segments.some((segment) => segment === "..")) {
    throw new Error(`Extension source path cannot contain traversal segments: ${value}`);
  }
  return segments;
};

const localSourcePathSegments = (value: string): ReadonlyArray<string> =>
  value
    .replaceAll("\\", "/")
    .split("/")
    .filter((segment) => segment !== "" && segment !== ".")
    .map((segment) => (segment === ".." ? "%2E%2E" : encodeURIComponent(segment)));

const gitRepositorySegments = (url: URL): ReadonlyArray<string> => {
  const pathSegments = sourcePathSegments(url.pathname);
  const last = pathSegments.at(-1);
  const repositorySegments =
    last?.endsWith(".git") === true
      ? [...pathSegments.slice(0, -1), last.slice(0, -4)]
      : pathSegments;
  return [url.hostname, ...repositorySegments].filter((segment) => segment.length > 0);
};

const selectedSourcePath = (
  source: Extract<ExtensionPathSource, { readonly refType: "git-hosted" }>,
) =>
  source.sourcePath ??
  (source.source.type === "git" ? undefined : Option.getOrUndefined(source.source.subPath));

const acquiredSourceSegments = (
  source: Exclude<ExtensionPathSource, { readonly refType: "workspace" }>,
) => {
  switch (source.refType) {
    case "registry":
      return [source.source.name, source.owner];
    case "local":
      return ["local", ...localSourcePathSegments(source.sourcePath ?? source.source.path)];
    case "git-hosted": {
      const selected = selectedSourcePath(source);
      const selectedSegments = selected === undefined ? [] : sourcePathSegments(selected);
      switch (source.source.type) {
        case "github":
        case "gitlab":
        case "bitbucket":
          return [
            source.source.name,
            ...sourcePathSegments(source.source.owner),
            source.source.repo,
            ...selectedSegments,
          ];
        case "azurerepos":
          return [
            source.source.name,
            source.source.organization,
            source.source.project,
            source.source.repo,
            ...selectedSegments,
          ];
        case "git":
          return ["git", ...gitRepositorySegments(source.source.url), ...selectedSegments];
      }
    }
  }
};

/** Render a portable display path for an acquired extension package. */
export const acquiredExtensionDisplayPath = (
  root: string,
  source: Exclude<ExtensionPathSource, { readonly refType: "workspace" }>,
  type: ExtensionTypePlural,
  name: string,
): string =>
  [
    root.replace(/[\\/]+$/u, ""),
    ...acquiredSourceSegments(source),
    ...(source.refType === "registry" ? [type, name] : []),
  ].join("/");

/** Render the acquired display path proven by a persisted lock entry. */
export const acquiredExtensionDisplayPathFromLockEntry = (
  root: string,
  entry: ExtensionPathLockEntry,
  type: ExtensionTypePlural,
  name: string,
): string =>
  acquiredExtensionDisplayPath(root, extensionPathSourceFromLockEntry(entry), type, name);

const extensionPathsAt = (
  join: (...paths: string[]) => string,
  canonicalPath: string,
  source: ExtensionPathSource,
  type: ExtensionTypePlural,
): ExtensionDirPaths => ({
  canonicalPath: decodeAbsolutePathSync(canonicalPath),
  extensionSrcPath: decodeAbsolutePathSync(
    source.refType !== "workspace" && source.portable === true
      ? canonicalPath
      : type === "mcps" || type === "packs"
        ? canonicalPath
        : join(canonicalPath, "src"),
  ),
});

export const computeExtensionPaths = (
  join: (...paths: string[]) => string,
  base: string,
  source: ExtensionPathSource,
  type: ExtensionTypePlural,
  sanitizedName: string,
): ExtensionDirPaths => {
  const canonicalPath =
    source.refType === "workspace"
      ? join(base, type, sanitizedName)
      : join(
          base,
          ".axm",
          "extensions",
          ...acquiredSourceSegments(source),
          ...(source.refType === "registry" ? [type, sanitizedName] : []),
        );
  return extensionPathsAt(join, canonicalPath, source, type);
};

export const computeExtensionPathsForLayout = (
  join: (...paths: string[]) => string,
  layout: WorkspaceLayout,
  source: ExtensionPathSource,
  type: ExtensionTypePlural,
  sanitizedName: string,
): ExtensionDirPaths => {
  if (source.refType === "workspace") {
    const canonicalPath =
      layout.scope === "project"
        ? join(
            layout.authoredRoot(
              type === "mcps"
                ? "mcp-server"
                : type === "skills"
                  ? "skill"
                  : type === "subagents"
                    ? "subagent"
                    : type === "rules"
                      ? "rule"
                      : type === "hooks"
                        ? "hook"
                        : type === "knowledge"
                          ? "knowledge"
                          : "pack",
            ),
            sanitizedName,
          )
        : join(layout.canonicalRoot, source.owner, type, sanitizedName);
    return extensionPathsAt(join, canonicalPath, source, type);
  }

  const root = layout.scope === "project" ? layout.acquiredRoot : layout.canonicalRoot;
  const canonicalPath = join(
    root,
    ...acquiredSourceSegments(source),
    ...(source.refType === "registry" ? [type, sanitizedName] : []),
  );
  return extensionPathsAt(join, canonicalPath, source, type);
};
