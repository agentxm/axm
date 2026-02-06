/**
 * Source string parser for skills.
 *
 * Parses various source formats (GitHub shorthand, URLs)
 * into a normalized Source structure.
 *
 * @experimental This API is unstable and may change without notice.
 * @packageDocumentation
 */

import * as Array from "effect/Array";
import * as Effect from "effect/Effect";
import * as Match from "effect/Match";
import * as Option from "effect/Option";
import * as Schema from "effect/Schema";

import { config as azurereposConfig } from "./azurerepos/index.js";
import {
  resolveRepo as resolveBitbucketRepo,
  config as bitbucketConfig,
} from "./bitbucket/index.js";
import { ParseError } from "./errors.js";
import { resolveRepo as resolveGitHubRepo, config as githubConfig } from "./github/index.js";
import { resolveRepo as resolveGitLabRepo, config as gitlabConfig } from "./gitlab/index.js";
import { config as localConfig, LOCAL_PATH_PATTERN, parseLocalPath } from "./local/index.js";
import type { Source, SourceConfig } from "./types.js";

// -----------------------------------------------------------------------------
// Input Pattern Types
// -----------------------------------------------------------------------------

/** A simple name with no `/`, `@`, or URL scheme. */
type NameInput = { readonly _tag: "NameInput"; readonly name: string };

/** A scoped registry source: `@scope/name`. */
type RegistrySourceInput = {
  readonly _tag: "RegistrySourceInput";
  readonly scope: string;
  readonly name: string;
};

/** A valid URL (validated via `Schema.URL`). */
type UrlInput = { readonly _tag: "UrlInput"; readonly url: URL };

/** An SCP-style git address: `user@host:path` (e.g. `git@github.com:owner/repo.git`). */
type ScpAddress = { readonly _tag: "ScpAddress"; readonly input: string };

/** An `owner/repo` style pattern containing `/` (not a URL or file path). */
type SlashPattern = {
  readonly _tag: "SlashPattern";
  readonly owner: string;
  readonly repo: string;
  readonly subPath: Option.Option<string>;
};

/** A local filesystem path matching `LOCAL_PATH_PATTERN`. */
type FilePathPattern = { readonly _tag: "FilePathPattern"; readonly path: string };

/** A shorthand prefixed input: `<prefix>:...` where prefix is a known source provider. */
type ShorthandInput = {
  readonly _tag: "ShorthandInput";
  readonly prefix: string;
  readonly input: string;
};

/** Discriminated union of all input patterns recognized by the parser. */
export type InputPattern =
  | NameInput
  | RegistrySourceInput
  | UrlInput
  | ScpAddress
  | SlashPattern
  | FilePathPattern
  | ShorthandInput;

const REGISTRY_SOURCE_PATTERN = /^@([^/]+)\/(.+)$/;

/** SCP-style: `user@host:path` — no `://` scheme. */
const SCP_PATTERN = /^[^@]+@[^:]+:.+$/;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnySourceConfig = SourceConfig<any, any>;

/** All source configs, type-erased for map building. */
const ALL_CONFIGS: ReadonlyArray<AnySourceConfig> = [
  githubConfig,
  gitlabConfig,
  bitbucketConfig,
  azurereposConfig,
  localConfig,
];

/** Map from shorthand prefix to its config. */
const CONFIG_BY_PREFIX = new Map<string, AnySourceConfig>(
  Array.getSomes(
    Array.map(ALL_CONFIGS, (c) => Option.map(c.shorthand, (sh) => [sh.prefix, c] as const)),
  ),
);

/** Map from hostname to its config. */
const CONFIG_BY_HOSTNAME = new Map<string, AnySourceConfig>(
  Array.getSomes(
    Array.map(ALL_CONFIGS, (c) => Option.map(c.parseFromUrl, (url) => [url.hostname, c] as const)),
  ),
);

// Azure Repos uses a different hostname for SCP-style SSH URLs
CONFIG_BY_HOSTNAME.set("ssh.dev.azure.com", azurereposConfig);

/** Map from source type to its config. */
const CONFIG_BY_SOURCE_TYPE = new Map<string, AnySourceConfig>(
  Array.map(ALL_CONFIGS, (c) => [c.id, c] as const),
);

/** Known shorthand prefixes from source configs. */
const SHORTHAND_PREFIXES = new Set(CONFIG_BY_PREFIX.keys());

/** Simple name: alphanumeric with hyphens, no leading/trailing hyphen. */
const NAME_PATTERN = /^[a-zA-Z0-9](?:[a-zA-Z0-9-]*[a-zA-Z0-9])?$/;

/**
 * Classify an input string into an InputPattern.
 *
 * Pure function — no effects, no trimming. Returns `None` for empty/whitespace-only input.
 */
export const parseInputPattern = (input: string): Option.Option<InputPattern> => {
  // 1. SCP-style git address (user@host:path) — must check before URL
  if (SCP_PATTERN.test(input)) {
    return Option.some({ _tag: "ScpAddress", input });
  }

  // 2. Shorthand prefix (github:..., gitlab:..., etc.) — must check before URL
  const colonIndex = input.indexOf(":");
  if (colonIndex > 0 && SHORTHAND_PREFIXES.has(input.slice(0, colonIndex))) {
    return Option.some({ _tag: "ShorthandInput", prefix: input.slice(0, colonIndex), input });
  }

  // 3. File path — must check before URL (e.g. `C:/path` is a valid URL with scheme `c:`)
  if (LOCAL_PATH_PATTERN.test(input)) {
    return Option.some({ _tag: "FilePathPattern", path: input });
  }

  // 4. URL (validated via Schema.URL)
  const urlOption = Schema.decodeUnknownOption(Schema.URL)(input);
  if (Option.isSome(urlOption)) {
    return Option.some({ _tag: "UrlInput", url: urlOption.value });
  }

  // 5. Registry source (@scope/name)
  const registryMatch = input.match(REGISTRY_SOURCE_PATTERN);
  if (registryMatch && registryMatch[1] && registryMatch[2]) {
    return Option.some({
      _tag: "RegistrySourceInput",
      scope: registryMatch[1],
      name: registryMatch[2],
    });
  }

  // 6. Slash pattern (exactly two valid-name segments: `owner/repo`)
  if (input.includes("/")) {
    const segments = input.split("/");
    if (segments.length === 2 && segments.every((s) => NAME_PATTERN.test(s))) {
      const subPathStr = segments.slice(2).join("/");
      return Option.some({
        _tag: "SlashPattern",
        owner: segments[0]!,
        repo: segments[1]!,
        subPath: Option.fromNullable(subPathStr || undefined),
      });
    }
    return Option.none();
  }

  // 7. Simple name (alphanumeric with hyphens, no leading/trailing hyphen)
  if (NAME_PATTERN.test(input)) {
    return Option.some({ _tag: "NameInput", name: input });
  }

  return Option.none();
};

// -----------------------------------------------------------------------------
// SlashPattern Resolution
// -----------------------------------------------------------------------------

const resolveSlashPattern = (pattern: SlashPattern): Effect.Effect<Source, ParseError> =>
  Effect.gen(function* () {
    const github = yield* resolveGitHubRepo(pattern);
    if (Option.isSome(github)) return github.value;

    const gitlab = yield* resolveGitLabRepo(pattern);
    if (Option.isSome(gitlab)) return gitlab.value;

    const bitbucket = yield* resolveBitbucketRepo(pattern);
    if (Option.isSome(bitbucket)) return bitbucket.value;

    const fullPath = `${pattern.owner}/${pattern.repo}${Option.match(pattern.subPath, { onNone: () => "", onSome: (sp) => `/${sp}` })}`;
    return yield* new ParseError({
      message: `Repository '${fullPath}' not found on GitHub, GitLab, or Bitbucket`,
      input: fullPath,
    });
  });

// -----------------------------------------------------------------------------
// Main Parser
// -----------------------------------------------------------------------------

/**
 * Parse a source string into a Source.
 *
 * Supported formats:
 * - Slash pattern: `owner/repo` (probes GitHub → GitLab → Bitbucket)
 * - Prefixed shorthand: `github:owner/repo[/path][@ref]`, `gitlab:...`, `bitbucket:...`, `local:...`
 * - HTTPS URLs: `https://github.com/owner/repo`, `https://gitlab.com/...`, `https://bitbucket.org/...`
 * - SSH URLs: `git@github.com:owner/repo.git`, `git@gitlab.com:...`, `git@bitbucket.org:...`
 * - Local paths: `./path`, `../path`, `/absolute/path`, `~/path`, `C:\path`
 *
 * @experimental This API is unstable and may change without notice.
 * @param input - The source string to parse
 * @returns Effect containing Source or ParseError
 */
export const parseSource = (input: string): Effect.Effect<Source, ParseError> => {
  const trimmed = input.trim();
  if (!trimmed) {
    return Effect.fail(new ParseError({ message: "Source string cannot be empty", input }));
  }
  return parseInputPattern(trimmed).pipe(
    Option.match({
      onNone: () => Effect.fail(new ParseError({ message: "Unable to parse source", input })),
      onSome: Match.type<InputPattern>().pipe(
        Match.tag("NameInput", () =>
          Effect.fail(new ParseError({ message: "Name input is not yet supported", input })),
        ),
        Match.tag("RegistrySourceInput", () =>
          Effect.fail(
            new ParseError({ message: "Registry source input is not yet supported", input }),
          ),
        ),
        Match.tag("ScpAddress", ({ input: scpInput }) => {
          const hostMatch = scpInput.match(/@([^:]+):/);
          if (!hostMatch || !hostMatch[1]) {
            return Effect.fail(
              new ParseError({ message: `Unable to extract host from SCP address`, input }),
            );
          }
          const host = hostMatch[1];
          const cfg = CONFIG_BY_HOSTNAME.get(host);
          if (!cfg || Option.isNone(cfg.parseFromUrl)) {
            return Effect.fail(
              new ParseError({ message: `Unsupported SCP host: "${host}"`, input }),
            );
          }
          return cfg.parseFromUrl.value.parseScp(scpInput);
        }),
        Match.tag("UrlInput", ({ url }) => {
          const cfg = CONFIG_BY_HOSTNAME.get(url.hostname);
          if (!cfg || Option.isNone(cfg.parseFromUrl)) {
            return Effect.fail(
              new ParseError({
                message: `Unsupported URL host: "${url.hostname}"`,
                input: trimmed,
              }),
            );
          }
          return cfg.parseFromUrl.value.parseUrl(url);
        }),
        Match.tag("SlashPattern", (pattern) => resolveSlashPattern(pattern)),
        Match.tag("FilePathPattern", ({ path }) => parseLocalPath(path)),
        Match.tag("ShorthandInput", ({ prefix, input: shorthandInput }) => {
          const cfg = CONFIG_BY_PREFIX.get(prefix);
          if (!cfg || Option.isNone(cfg.shorthand)) {
            return Effect.fail(
              new ParseError({ message: `Unknown shorthand prefix: "${prefix}"`, input }),
            );
          }
          return cfg.shorthand.value.parse(shorthandInput);
        }),
        Match.exhaustive,
      ),
    }),
  );
};

// -----------------------------------------------------------------------------
// Print
// -----------------------------------------------------------------------------

/**
 * Print a source as its canonical shorthand string.
 *
 * @experimental This API is unstable and may change without notice.
 */
export const printSource = (source: Source): string => {
  const cfg = CONFIG_BY_SOURCE_TYPE.get(source.source);
  if (cfg) return cfg.print(source);

  // Fallback for types without a config
  switch (source.source) {
    case "git":
    case "registry":
      return "url" in source ? source.url : source.path;
    default:
      return source.source;
  }
};
