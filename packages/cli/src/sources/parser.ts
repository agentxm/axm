/**
 * Input pattern classification for source strings.
 *
 * Classifies raw input strings into typed `InputPattern` variants
 * (URL, SCP, shorthand, file path, etc.) for downstream routing
 * by `resolveSource`.
 *
 * @experimental This API is unstable and may change without notice.
 * @packageDocumentation
 */

import * as Option from "effect/Option";
import * as Schema from "effect/Schema";

/** Matches: ./path, ../path, /path, ~/path, ~\path, or Windows paths like C:\path */
const LOCAL_PATH_PATTERN = /^(?:\.\.?\/|\/|~\/|~\\|[A-Za-z]:[\\/])/;

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

/** Known shorthand prefixes. */
const SHORTHAND_PREFIXES = new Set(["github", "gitlab", "bitbucket"]);

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
    if (urlOption.value.protocol === "file:") {
      return Option.some({ _tag: "FilePathPattern", path: urlOption.value.pathname });
    }
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
