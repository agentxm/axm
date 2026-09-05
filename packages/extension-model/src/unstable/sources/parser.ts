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
import * as Result from "effect/Result";
import type { VersionRange } from "../version-constraints/version-constraints.js";
import type { ExtensionName, ExtensionType, ExtensionTypePlural } from "../extensions/common.js";
import type { Handle } from "../extensions/handle.js";
import { parseFqn } from "../extensions/fqn.js";
import { parseSourceQualifiedRegistrySourcePatternParts } from "../extensions/registry-source.js";

/** Matches: ./path, ../path, /path, ~/path, ~\path, or Windows paths like C:\path */
const LOCAL_PATH_PATTERN = /^(?:\.\.?\/|\/|~\/|~\\|[A-Za-z]:[\\/])/;

// -----------------------------------------------------------------------------
// Input Pattern Types
// -----------------------------------------------------------------------------

/** A simple name with no `/`, `@`, or URL scheme. */
type NameInput = { readonly pattern: "name-input"; readonly name: string };

/** A namespaced registry source: `[source-name:]@owner/<plural-type>/name`. */
type RegistryPatternInput = {
  readonly pattern: "registry-pattern-input";
  readonly sourceName: string;
  readonly type: Option.Option<ExtensionTypePlural>;
  readonly owner: Handle;
  readonly name: Option.Option<ExtensionName>;
  readonly versionRange: Option.Option<VersionRange>;
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

/** An `owner/repo[/path]` style pattern containing `/` (not a URL or file path). */
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

/** An intrinsic workspace package locator. */
type WorkspacePatternInput = {
  readonly pattern: "workspace-pattern-input";
  readonly owner: Handle;
  readonly type: ExtensionType;
  readonly name: ExtensionName;
};

/** Discriminated union of all input patterns recognized by the parser. */
export type InputPattern =
  | NameInput
  | RegistryPatternInput
  | UrlInput
  | GitScpAddress
  | SlashPattern
  | FilePathPattern
  | ShorthandInput
  | GlobInput
  | WorkspacePatternInput;

/** Parse result with the classified pattern and original input. */
export type InputParseResult<T = InputPattern> = {
  readonly pattern: T;
  readonly originalInput: string;
};

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
  // 1. SCP-style git address (user@host:path) — must check before URL
  const scpMatch = input.includes("://") ? null : input.match(SCP_PATTERN);
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

  // 2. Intrinsic workspace source — must be intercepted before URL parsing,
  // because URL accepts arbitrary opaque schemes such as `workspace:`.
  if (input.startsWith("workspace:")) {
    const parsed = parseFqn(input.slice("workspace:".length));
    if (Result.isFailure(parsed)) return Option.none();
    return Option.some(
      wrap({
        pattern: "workspace-pattern-input",
        owner: parsed.success.owner,
        type: parsed.success.type,
        name: parsed.success.name,
      }),
    );
  }

  // 3. Registry source, including an explicit configured source name. This
  // must be intercepted before URL parsing because URL accepts arbitrary
  // opaque schemes such as `agentxm:`.
  const registry = parseSourceQualifiedRegistrySourcePatternParts(input);
  if (registry !== undefined) {
    return Option.some(
      wrap({
        pattern: "registry-pattern-input",
        sourceName: registry.sourceName,
        type: Option.fromUndefinedOr(registry.type),
        owner: registry.owner,
        name: Option.fromUndefinedOr(registry.name),
        versionRange: Option.fromUndefinedOr(registry.versionRange),
      }),
    );
  }

  // 4. Shorthand prefix (github:..., gitlab:..., etc.) — must check before URL
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

  // 5. File path — must check before URL (e.g. `C:/path` is a valid URL with scheme `c:`)
  if (LOCAL_PATH_PATTERN.test(input)) {
    return Option.some(wrap({ pattern: "file-path-pattern", path: input }));
  }

  // 6. URL
  try {
    const url = new URL(input);
    if (url.protocol === "file:") {
      return Option.some(wrap({ pattern: "file-path-pattern", path: url.pathname }));
    }
    return Option.some(wrap({ pattern: "url-input", url }));
  } catch {
    // Not a URL
  }

  // 7. Slash pattern (`owner/repo` or `owner/repo/path`)
  if (input.includes("/")) {
    const segments = input.split("/");
    const first = segments.at(0);
    const second = segments.at(1);
    if (
      first !== undefined &&
      second !== undefined &&
      segments.length >= 2 &&
      NAME_PATTERN.test(first) &&
      NAME_PATTERN.test(second) &&
      segments.slice(2).every((s) => s.length > 0 && s !== "..")
    ) {
      const remaining = segments.slice(2).join("/");
      return Option.some(
        wrap({
          pattern: "slash-pattern",
          first,
          second,
          third: remaining.length === 0 ? Option.none() : Option.some(remaining),
        }),
      );
    }
    return Option.none();
  }

  // 8. Glob pattern (contains `*` wildcard)
  if (input.includes("*")) {
    return Option.some(wrap({ pattern: "glob-input", value: input }));
  }

  // 9. Simple name (alphanumeric with hyphens, no leading/trailing hyphen)
  if (NAME_PATTERN.test(input)) {
    return Option.some(wrap({ pattern: "name-input", name: input }));
  }

  return Option.none();
};
