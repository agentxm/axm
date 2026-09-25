/**
 * Forge coordinate, clone URL, and browser URL grammar.
 *
 * Probing and acquisition stay with source resolution; the model owns the
 * strings and URLs that identify each forge repository.
 *
 * @experimental This API is unstable and may change without notice.
 * @packageDocumentation
 */

import * as Option from "effect/Option";
import * as Result from "effect/Result";
import * as Schema from "effect/Schema";

import { SourceNamespaceSchema, SourceRefSchema, SourceSubPathSchema } from "./types.js";

/** @experimental */
export const FORGE_PREFIXES = ["github", "gitlab", "bitbucket", "azurerepos"] as const;
/** @experimental */
export type ForgePrefix = (typeof FORGE_PREFIXES)[number];
/** @experimental */
export const isForgePrefix = (value: string): value is ForgePrefix =>
  FORGE_PREFIXES.some((prefix) => prefix === value);

/** @experimental */
export interface ForgeCoordinate {
  readonly forge: ForgePrefix;
  readonly repository: string;
  readonly ref: Option.Option<string>;
  readonly subPath: Option.Option<string>;
}

interface BrowserPath {
  readonly repository: string;
  readonly ref?: string;
  readonly subPath?: string;
}

/** @experimental */
export interface Forge {
  readonly prefix: ForgePrefix;
  readonly hostname: string;
  readonly repositorySegments: (count: number) => boolean;
  readonly cloneUrl: (repository: string) => URL;
  readonly repositoryFromCloneUrl: (pathname: string) => string | undefined;
  readonly parseBrowserPath: (pathname: string) => BrowserPath | undefined;
}

const segments = (pathname: string): readonly string[] =>
  pathname.split("/").filter((segment) => segment.length > 0);
const withoutGit = (name: string): string => (name.endsWith(".git") ? name.slice(0, -4) : name);

const hostedRepositoryFromCloneUrl = (pathname: string): string | undefined => {
  const parts = segments(pathname);
  const last = parts.at(-1);
  return last === undefined || parts.length < 2
    ? undefined
    : [...parts.slice(0, -1), withoutGit(last)].join("/");
};

const hostedBrowserPath = (pathname: string, marker: "tree" | "src"): BrowserPath | undefined => {
  const pattern =
    marker === "tree"
      ? /^\/([^/]+)\/([^/]+?)(?:\.git)?(?:\/tree\/([^/]+)(?:\/(.+))?)?$/u
      : /^\/([^/]+)\/([^/]+?)(?:\.git)?(?:\/src\/([^/]+)(?:\/(.+))?)?$/u;
  const match = pattern.exec(pathname);
  if (match?.[1] === undefined || match[2] === undefined) return undefined;
  return {
    repository: `${match[1]}/${match[2]}`,
    ...(match[3] === undefined ? {} : { ref: match[3] }),
    ...(match[4] === undefined ? {} : { subPath: match[4] }),
  };
};

const gitlabBrowserPath = (pathname: string): BrowserPath | undefined => {
  const marker = "/-/tree/";
  const markerIndex = pathname.indexOf(marker);
  const repositoryParts = segments(markerIndex < 0 ? pathname : pathname.slice(0, markerIndex));
  const last = repositoryParts.at(-1);
  if (last === undefined || repositoryParts.length < 2) return undefined;
  const treePath = markerIndex < 0 ? [] : pathname.slice(markerIndex + marker.length).split("/");
  const subPath = treePath.slice(1).join("/");
  return {
    repository: [...repositoryParts.slice(0, -1), withoutGit(last)].join("/"),
    ...(treePath[0] === undefined ? {} : { ref: treePath[0] }),
    ...(subPath.length === 0 ? {} : { subPath }),
  };
};

const azureRepositoryFromCloneUrl = (pathname: string): string | undefined => {
  const parts = segments(pathname);
  return parts.length === 4 && parts[2] === "_git"
    ? `${parts[0]}/${parts[1]}/${withoutGit(parts[3] ?? "")}`
    : undefined;
};

const azureBrowserPath = (pathname: string): BrowserPath | undefined => {
  const match = /^\/([^/]+)\/([^/]+)\/_git\/([^/]+?)(?:\.git)?$/u.exec(pathname);
  return match?.[1] === undefined || match[2] === undefined || match[3] === undefined
    ? undefined
    : { repository: `${match[1]}/${match[2]}/${match[3]}` };
};

const hostedForge = (
  prefix: "github" | "gitlab" | "bitbucket",
  hostname: string,
  parseBrowserPath: Forge["parseBrowserPath"],
): Forge => ({
  prefix,
  hostname,
  repositorySegments: (count) => count >= 2,
  cloneUrl: (repository) => new URL(`https://${hostname}/${repository}.git`),
  repositoryFromCloneUrl: hostedRepositoryFromCloneUrl,
  parseBrowserPath,
});

/** @experimental */
export const FORGES: Record<ForgePrefix, Forge> = {
  github: hostedForge("github", "github.com", (pathname) => hostedBrowserPath(pathname, "tree")),
  gitlab: hostedForge("gitlab", "gitlab.com", gitlabBrowserPath),
  bitbucket: hostedForge("bitbucket", "bitbucket.org", (pathname) =>
    hostedBrowserPath(pathname, "src"),
  ),
  azurerepos: {
    prefix: "azurerepos",
    hostname: "dev.azure.com",
    repositorySegments: (count) => count === 3,
    cloneUrl: (repository) => {
      const [organization, project, repo] = repository.split("/");
      return new URL(`https://dev.azure.com/${organization}/${project}/_git/${repo}`);
    },
    repositoryFromCloneUrl: azureRepositoryFromCloneUrl,
    parseBrowserPath: azureBrowserPath,
  },
};

/** @experimental */
export const forgeForHostname = (hostname: string): Forge | undefined =>
  Object.values(FORGES).find((forge) => forge.hostname === hostname);

const decodeNamespace = Schema.decodeUnknownResult(SourceNamespaceSchema);
const decodeSubPath = Schema.decodeUnknownResult(SourceSubPathSchema);
const decodeRef = Schema.decodeUnknownResult(SourceRefSchema);
const validCoordinate = (coordinate: ForgeCoordinate): boolean =>
  FORGES[coordinate.forge].repositorySegments(coordinate.repository.split("/").length) &&
  Result.isSuccess(decodeNamespace(coordinate.repository)) &&
  (Option.isNone(coordinate.subPath) ||
    Result.isSuccess(decodeSubPath(coordinate.subPath.value))) &&
  (Option.isNone(coordinate.ref) || Result.isSuccess(decodeRef(coordinate.ref.value)));

const splitRef = (input: string): { readonly coordinate: string; readonly ref?: string } => {
  const refIndex = input.lastIndexOf("@");
  if (refIndex <= 0) return { coordinate: input };
  const ref = input.slice(refIndex + 1);
  const subPathMarker = input.indexOf("//");
  const isAtPathSegment =
    subPathMarker !== -1 &&
    refIndex > subPathMarker + 1 &&
    input[refIndex - 1] === "/" &&
    ref.includes("/");
  return isAtPathSegment ? { coordinate: input } : { coordinate: input.slice(0, refIndex), ref };
};

/** @experimental */
export const parseForgeCoordinate = (
  forge: ForgePrefix,
  body: string,
): Result.Result<ForgeCoordinate, { readonly reason: string }> => {
  const { coordinate, ref } = splitRef(body);
  const marker = coordinate.indexOf("//");
  const repository = marker < 0 ? coordinate : coordinate.slice(0, marker);
  const subPath = marker < 0 ? undefined : coordinate.slice(marker + 2);
  const parsed = {
    forge,
    repository,
    ref: Option.fromUndefinedOr(ref),
    subPath: Option.fromUndefinedOr(subPath),
  } satisfies ForgeCoordinate;
  return validCoordinate(parsed)
    ? Result.succeed(parsed)
    : Result.fail({ reason: `Expected valid ${forge} repository[//subpath][@ref]` });
};

/** @experimental */
export const printForgeCoordinateBody = (coordinate: ForgeCoordinate): string => {
  let body = coordinate.repository;
  if (Option.isSome(coordinate.subPath)) body += `//${coordinate.subPath.value}`;
  if (Option.isSome(coordinate.ref)) body += `@${coordinate.ref.value}`;
  return body;
};

/** @experimental */
export const printForgeCoordinate = (coordinate: ForgeCoordinate): string =>
  `${coordinate.forge}:${printForgeCoordinateBody(coordinate)}`;

/** @experimental */
export const forgeCloneUrl = (coordinate: ForgeCoordinate): URL =>
  FORGES[coordinate.forge].cloneUrl(coordinate.repository);

/** @experimental */
export const forgeCoordinateFromGitUrl = (
  url: URL,
  ref: Option.Option<string>,
  subPath: Option.Option<string>,
): Option.Option<ForgeCoordinate> => {
  const forge = forgeForHostname(url.hostname);
  if (forge === undefined) return Option.none();
  const repository = forge.repositoryFromCloneUrl(url.pathname);
  if (repository === undefined) return Option.none();
  const coordinate = { forge: forge.prefix, repository, ref, subPath } satisfies ForgeCoordinate;
  return validCoordinate(coordinate) ? Option.some(coordinate) : Option.none();
};

/** @experimental */
export const parseForgeBrowserUrl = (url: URL): Option.Option<ForgeCoordinate> => {
  const forge = forgeForHostname(url.hostname);
  if (forge === undefined) return Option.none();
  const parsed = forge.parseBrowserPath(url.pathname);
  if (parsed === undefined) return Option.none();
  const coordinate = {
    forge: forge.prefix,
    repository: parsed.repository,
    ref: Option.fromUndefinedOr(parsed.ref),
    subPath: Option.fromUndefinedOr(parsed.subPath),
  } satisfies ForgeCoordinate;
  return validCoordinate(coordinate) ? Option.some(coordinate) : Option.none();
};
