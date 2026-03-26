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

/** Matches: ./path, ../path, /path, ~/path, ~\path, or Windows paths like C:\path */
const LOCAL_PATH_PATTERN = /^(?:\.\.?\/|\/|~\/|~\\|[A-Za-z]:[\\/])/;

// -----------------------------------------------------------------------------
// Input Pattern Types
// -----------------------------------------------------------------------------

/** A simple name with no `/`, `@`, or URL scheme. */
type NameInput = { readonly pattern: "name-input"; readonly name: string };

/** A namespaced registry source: `@profile/(skills|commands|mcp-servers|packs)/name`. */
type RegistryPatternInput = {
  readonly pattern: "registry-pattern-input";
  readonly type: Option.Option<"skills" | "commands" | "mcp-servers" | "packs">;
  readonly profile: string;
  readonly name: Option.Option<string>;
  readonly versionConstraint: Option.Option<string>;
};

/** A valid URL (validated via `Schema.URL`). */
type UrlInput = { readonly pattern: "url-input"; readonly url: URL };

/** An SCP-style git address: `user@host:path` (e.g. `git@github.com:owner/repo.git`). */
type GitScpAddress = {
  readonly pattern: "git-scp-address";
  readonly user: string;
  readonly host: string;
  readonly path: string;
};

/** An `owner/repo` style pattern containing `/` (not a URL or file path). */
type SlashPattern = {
  readonly pattern: "slash-pattern";
  readonly first: string;
  readonly second: string;
  readonly third: Option.Option<string>;
};

/** A local filesystem path matching `LOCAL_PATH_PATTERN`. */
type FilePathPattern = { readonly pattern: "file-path-pattern"; readonly path: string };

/** A shorthand prefixed input: `<prefix>:...` where prefix is a known source provider. */
export type ShorthandInput = {
  readonly pattern: "shorthand-input";
  readonly prefix: string;
  readonly remainingInput: string;
};

/** A glob pattern containing `*` wildcards (e.g. `effect-*`). */
type GlobInput = { readonly pattern: "glob-input"; readonly value: string };

/** Discriminated union of all input patterns recognized by the parser. */
export type InputPattern =
  | NameInput
  | RegistryPatternInput
  | UrlInput
  | GitScpAddress
  | SlashPattern
  | FilePathPattern
  | ShorthandInput
  | GlobInput;

/** Parse result with the classified pattern and original input. */
export type InputParseResult<T = InputPattern> = {
  readonly pattern: T;
  readonly originalInput: string;
};

const REGISTRY_NAMESPACE_PATTERN = /^@[^/]+$/;

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
export const parseInputPattern = (input: string): Option.Option<InputParseResult> => {
  const wrap = (pattern: InputPattern): InputParseResult => ({ pattern, originalInput: input });
  const parseNameAndConstraint = (
    raw: string,
  ): Option.Option<{
    readonly name: Option.Option<string>;
    readonly versionConstraint: Option.Option<string>;
  }> => {
    const atIndex = raw.indexOf("@");
    if (atIndex === 0) return Option.none();
    if (atIndex > 0) {
      return Option.some({
        name: Option.some(raw.slice(0, atIndex)),
        versionConstraint: Option.some(raw.slice(atIndex + 1)),
      });
    }
    return Option.some({ name: Option.some(raw), versionConstraint: Option.none() });
  };

  // 1. SCP-style git address (user@host:path) — must check before URL
  const scpMatch = input.match(SCP_PATTERN);
  if (scpMatch && scpMatch[1] && scpMatch[2] && scpMatch[3]) {
    return Option.some(
      wrap({
        pattern: "git-scp-address",
        user: scpMatch[1],
        host: scpMatch[2],
        path: scpMatch[3],
      }),
    );
  }

  // 2. Shorthand prefix (github:..., gitlab:..., etc.) — must check before URL
  const colonIndex = input.indexOf(":");
  if (colonIndex > 0 && SHORTHAND_PREFIXES.has(input.slice(0, colonIndex))) {
    return Option.some(
      wrap({
        pattern: "shorthand-input",
        prefix: input.slice(0, colonIndex),
        remainingInput: input.slice(colonIndex + 1),
      }),
    );
  }

  // 3. File path — must check before URL (e.g. `C:/path` is a valid URL with scheme `c:`)
  if (LOCAL_PATH_PATTERN.test(input)) {
    return Option.some(wrap({ pattern: "file-path-pattern", path: input }));
  }

  // 4. URL
  try {
    const url = new URL(input);
    if (url.protocol === "file:") {
      return Option.some(wrap({ pattern: "file-path-pattern", path: url.pathname }));
    }
    return Option.some(wrap({ pattern: "url-input", url }));
  } catch {
    // Not a URL
  }

  // 5. Registry source:
  //    - @profile
  //    - @profile/{type}
  //    - @profile/{type}/{name}@constraint
  if (input.startsWith("@")) {
    const segments = input.split("/");
    const profile = segments.at(0);
    if (profile !== undefined && REGISTRY_NAMESPACE_PATTERN.test(profile)) {
      if (segments.length === 1) {
        return Option.some(
          wrap({
            pattern: "registry-pattern-input",
            type: Option.none(),
            profile,
            name: Option.none(),
            versionConstraint: Option.none(),
          }),
        );
      }

      if (segments.length === 2) {
        const second = segments.at(1);
        if (
          second === "skills" ||
          second === "commands" ||
          second === "mcp-servers" ||
          second === "packs"
        ) {
          return Option.some(
            wrap({
              pattern: "registry-pattern-input",
              type: Option.some(second),
              profile,
              name: Option.none(),
              versionConstraint: Option.none(),
            }),
          );
        }
      }

      if (segments.length === 3) {
        const second = segments.at(1);
        const third = segments.at(2);
        if (
          third !== undefined &&
          (second === "skills" ||
            second === "commands" ||
            second === "mcp-servers" ||
            second === "packs")
        ) {
          const parsedName = parseNameAndConstraint(third);
          if (Option.isSome(parsedName)) {
            return Option.some(
              wrap({
                pattern: "registry-pattern-input",
                type: Option.some(second),
                profile,
                name: parsedName.value.name,
                versionConstraint: parsedName.value.versionConstraint,
              }),
            );
          }
        }
      }
    }
  }

  // 6. Slash pattern (exactly two valid-name segments: `owner/repo`)
  //    3+ segment slash inputs (e.g., `owner/repo/path`) are unsupported here.
  //    Use the full URL or a shorthand like `github:owner/repo --path subdir` instead.
  if (input.includes("/")) {
    const segments = input.split("/");
    if (segments.length === 2 && segments.every((s) => NAME_PATTERN.test(s))) {
      const first = segments.at(0);
      const second = segments.at(1);
      if (first === undefined || second === undefined) {
        return Option.none();
      }
      return Option.some(
        wrap({
          pattern: "slash-pattern",
          first,
          second,
          third: Option.none(),
        }),
      );
    }
    return Option.none();
  }

  // 7. Glob pattern (contains `*` wildcard)
  if (input.includes("*")) {
    return Option.some(wrap({ pattern: "glob-input", value: input }));
  }

  // 8. Simple name (alphanumeric with hyphens, no leading/trailing hyphen)
  if (NAME_PATTERN.test(input)) {
    return Option.some(wrap({ pattern: "name-input", name: input }));
  }

  return Option.none();
};
