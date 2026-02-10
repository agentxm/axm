/**
 * Source string parser for skills.
 *
 * Parses various source formats (GitHub shorthand, URLs)
 * into a normalized SourceInput structure.
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
import { config as bitbucketConfig } from "./bitbucket/index.js";
import { ParseError } from "./errors.js";
import { config as githubConfig } from "./github/index.js";
import { config as gitlabConfig } from "./gitlab/index.js";
import { config as localConfig, parseLocalPath } from "./local/index.js";
import type { SkillLockEntry } from "../lockfile/index.js";
import { WorkspaceContextTag as Workspace } from "../workspace/index.js";

/** Matches: ./path, ../path, /path, ~/path, ~\path, or Windows paths like C:\path */
const LOCAL_PATH_PATTERN = /^(?:\.\.?\/|\/|~\/|~\\|[A-Za-z]:[\\/])/;
import type { SourceConfig } from "./types.js";

// -----------------------------------------------------------------------------
// Input Pattern Types
// -----------------------------------------------------------------------------

/** A simple name with no `/`, `@`, or URL scheme. */
type NameInput = { readonly _tag: "NameInput"; readonly name: string };

/** A scoped registry source: `@scope/name`. */
type RegistryPatternInput = {
  readonly _tag: "RegistryPatternInput";
  readonly scope: string;
  readonly name: string;
};

/** A valid URL (validated via `Schema.URL`). */
type UrlInput = { readonly _tag: "UrlInput"; readonly url: URL };

/** An SCP-style git address: `user@host:path` (e.g. `git@github.com:owner/repo.git`). */
type GitScpAddress = {
  readonly _tag: "GitScpAddress";
  readonly user: string;
  readonly host: string;
  readonly path: string;
};

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
  | RegistryPatternInput
  | UrlInput
  | GitScpAddress
  | SlashPattern
  | FilePathPattern
  | ShorthandInput;

const REGISTRY_SOURCE_PATTERN = /^@([^/]+)\/(.+)$/;

/** SCP-style: `user@host:path` — no `://` scheme. */
const SCP_PATTERN = /^([^@]+)@([^:]+):(.+)$/;

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
  const scpMatch = input.match(SCP_PATTERN);
  if (scpMatch && scpMatch[1] && scpMatch[2] && scpMatch[3]) {
    return Option.some({
      _tag: "GitScpAddress",
      user: scpMatch[1],
      host: scpMatch[2],
      path: scpMatch[3],
    });
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
      _tag: "RegistryPatternInput",
      scope: registryMatch[1],
      name: registryMatch[2],
    });
  }

  // 6. Slash pattern (exactly two valid-name segments: `owner/repo`)
  if (input.includes("/")) {
    const segments = input.split("/");
    if (segments.length === 2 && segments.every((s) => NAME_PATTERN.test(s))) {
      return Option.some({
        _tag: "SlashPattern",
        owner: segments[0]!,
        repo: segments[1]!,
        subPath: Option.none(),
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
// Helpers
// -----------------------------------------------------------------------------

/**
 * Get the relative path of an installed skill from its lockfile entry.
 */
const getInstalledSkillPath = (name: string, entry: SkillLockEntry): string => {
  if (entry.source === "registry") {
    return `.axm/extensions/${entry.scope}/skills/${name}`;
  }
  return `.agents/skills/${name}`;
};

// -----------------------------------------------------------------------------
// Main Parser
// -----------------------------------------------------------------------------

/**
 * Determine the source from a user-provided input string.
 *
 * Supported formats:
 * - Installed skill name: `my-skill` (resolved via lockfile to local path)
 * - Slash pattern: `owner/repo` (probes GitHub → GitLab → Bitbucket)
 * - Prefixed shorthand: `github:owner/repo[/path][@ref]`, `gitlab:...`, `bitbucket:...`, `local:...`
 * - HTTPS URLs: `https://github.com/owner/repo`, `https://gitlab.com/...`, `https://bitbucket.org/...`
 * - SSH URLs: `git@github.com:owner/repo.git`, `git@gitlab.com:...`, `git@bitbucket.org:...`
 * - Local paths: `./path`, `../path`, `/absolute/path`, `~/path`, `C:\path`
 *
 * @experimental This API is unstable and may change without notice.
 * @param input - The source string to determine
 * @returns Effect containing SourceInput or ParseError
 */
export const determineSourceInput = (input: string) => {
  const trimmed = input.trim();
  if (!trimmed) {
    return Effect.fail(new ParseError({ message: "Source string cannot be empty", input }));
  }
  return parseInputPattern(trimmed).pipe(
    Option.match({
      onNone: () => Effect.fail(new ParseError({ message: "Unable to parse source", input })),
      onSome: Match.type<InputPattern>().pipe(
        Match.tag("NameInput", ({ name }) =>
          Effect.gen(function* () {
            const ws = yield* Workspace;
            const skills = yield* ws.getLockedSkills().pipe(
              Effect.mapError(
                (e) =>
                  new ParseError({
                    message: `Failed to read lockfile: ${e._tag}`,
                    input,
                  }),
              ),
            );
            if (!(name in skills)) {
              return yield* new ParseError({
                message: `Unknown skill "${name}". Check installed skills with \`axm skills list\`.`,
                input,
              });
            }
            return yield* parseLocalPath(getInstalledSkillPath(name, skills[name]!));
          }),
        ),
        Match.tag("RegistryPatternInput", () =>
          Effect.fail(
            new ParseError({ message: "Registry source input is not yet supported", input }),
          ),
        ),
        Match.tag("GitScpAddress", (scp) => {
          const cfg = CONFIG_BY_HOSTNAME.get(scp.host);
          if (!cfg || Option.isNone(cfg.parseFromUrl)) {
            return Effect.fail(
              new ParseError({ message: `Unsupported SCP host: "${scp.host}"`, input }),
            );
          }
          return cfg.parseFromUrl.value.parseScp(`${scp.user}@${scp.host}:${scp.path}`);
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
        Match.tag("SlashPattern", (pattern) =>
          Effect.fail(
            new ParseError({
              message: `Ambiguous pattern '${pattern.owner}/${pattern.repo}' — use github:${pattern.owner}/${pattern.repo}, gitlab:${pattern.owner}/${pattern.repo}, or bitbucket:${pattern.owner}/${pattern.repo}`,
              input: trimmed,
            }),
          ),
        ),
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
