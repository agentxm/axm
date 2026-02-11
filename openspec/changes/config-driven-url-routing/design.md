## Context

URL and SCP routing currently lives in two places with duplicated logic:

1. **`parseSourceInput`** (parser.ts) — hardcoded hostname switches route `github.com` → `githubParseUrl`, etc. Fails for unknown hostnames.
2. **`resolveSource`** (resolve-source.ts) — catches ParseError from step 1, then `tryUrlHostnameMatch` matches the hostname against configured source URLs and rewrites to the canonical hostname before re-parsing.

The error-recovery chain (`parseSourceInput` → `tryConfigNameParse` → `tryUrlHostnameMatch`) makes the actual routing mechanism hard to follow. Built-in defaults for github.com, gitlab.com, etc. already exist in the three-layer source config merge (per `registry-source-config` spec), but `parseSourceInput` bypasses this by hardcoding the same knowledge in hostname switches.

Provider URL parsers (e.g., `github/url.ts`) have the canonical hostname baked into their regex patterns (e.g., `/^https?:\/\/github\.com\/.../`), which is why hostname rewriting exists.

## Goals / Non-Goals

**Goals:**

- Single codepath for URL/SCP hostname routing — canonical and custom hostnames handled identically
- `resolveSource` uses `parseInputPattern` directly and routes URL/SCP inputs against configured sources
- Remove the error-recovery chain in favor of explicit pattern-based routing
- Keep `parseInputPattern` pure (no config, no effects)

**Non-Goals:**

- Making provider URL parsers hostname-agnostic (would require changing all provider regexes)
- Changing shorthand parsing (`github:owner/repo`) — these explicitly name the source type
- Changing how config-name prefixes work (`ghe:owner/repo`) — same mechanism, just restructured
- Adding new source types or capabilities
- Unifying `LocalSourceInput` around `file://` URLs (follow-up change)

## Decisions

### Decision 1: `resolveSource` routes directly from `parseInputPattern`

**Choice:** `resolveSource` calls `parseInputPattern` and matches on the pattern tag to route each input type. The `parseSourceInput` function is removed.

**Why:** The current three-step error-recovery chain (`parseSourceInput` → `tryConfigNameParse` → `tryUrlHostnameMatch`) exists because `parseSourceInput` assumes canonical hostnames. Removing that assumption means the chain collapses into a single routing function.

**Alternative considered:** Keep `parseSourceInput` but have it return a generic "unresolved URL/SCP" type. Rejected because `parseSourceInput` adds no value if it can't resolve URLs/SCPs — `parseInputPattern` already classifies the input.

### Decision 2: URL/SCP routing via exhaustive Match over configured sources

**Choice:** For `UrlInput` and `GitScpAddress` patterns, `resolveSource` maps over the merged sources list using `Match.type<SourceConfig>()` with exhaustive matching on the `source` discriminator. Each source type applies its own matching logic (hostname check + provider parse). `Effect.firstSuccessOf` returns the first successful match.

Provider URL/SCP parsers are parameterized with the hostname (e.g., `parseGitHubUrl(url, hostname)`) instead of having it hardcoded in regexes. The hostname defaults to the canonical value (e.g., `"github.com"`), so existing direct calls continue to work. This eliminates the `rewriteUrl`/`rewriteScp` indirection — no URL cloning or hostname substitution.

The hostname check is a pre-filter; the parse is the real confirmation. If the parse fails, `Effect.firstSuccessOf` continues to the next source.

**Sketch for UrlInput routing:**

```typescript
Match.tag("UrlInput", ({ url }) =>
  Effect.gen(function* () {
    const sources = yield* configuredSources;

    const noMatch = new ParseError({ message: "no match", input: url.href });

    const tryParseUrl = <C extends { url: URL }>(
      config: C,
      parse: (url: URL, hostname: string) => Effect.Effect<SourceInput, ParseError>,
    ) =>
      config.url.hostname !== url.hostname
        ? Effect.fail(noMatch)
        : Effect.map(parse(url, config.url.hostname), (input) => ({
            ...input,
            ...config,
          }));

    const tryMatch = Match.type<SourceConfig>().pipe(
      Match.when({ source: "github" }, (config) => tryParseUrl(config, parseGitHubUrl)),
      Match.when({ source: "gitlab" }, (config) => tryParseUrl(config, parseGitLabUrl)),
      Match.when({ source: "bitbucket" }, (config) => tryParseUrl(config, parseBitbucketUrl)),
      Match.when({ source: "azurerepos" }, (config) => tryParseUrl(config, parseAzureReposUrl)),
      Match.when({ source: "registry" }, () => Effect.fail(noMatch)),
      Match.exhaustive,
    );

    return yield* pipe(
      sources,
      Array.map(tryMatch),
      Effect.firstSuccessOf,
      Effect.mapError(() =>
        new ParseError({
          message: `No configured source matches URL "${url.href}"`,
          input: url.href,
        }),
      ),
    );
  }),
),
```

Iteration order is the merged sources list (project → global → built-in), so user configs match before defaults. The `GitScpAddress` branch follows the same pattern with `parseScp` variants. Adding a new source type requires adding a `Match.when` arm — the compiler enforces exhaustiveness.

### Decision 3: `file://` URLs classified as file paths in `parseInputPattern`

**Choice:** `parseInputPattern` detects `file:` protocol URLs and classifies them as `FilePathPattern` (extracting the pathname) instead of `UrlInput`. This happens at the classification layer so `file://` URLs never reach the configured sources loop.

```typescript
// 4. URL (validated via Schema.URL)
const urlOption = Schema.decodeUnknownOption(Schema.URL)(input);
if (Option.isSome(urlOption)) {
  if (urlOption.value.protocol === "file:") {
    return Option.some({ _tag: "FilePathPattern", path: urlOption.value.pathname });
  }
  return Option.some({ _tag: "UrlInput", url: urlOption.value });
}
```

**Why:** A `file://` URL is semantically a file path — there's no configured source to match against. Classifying it early keeps the `UrlInput` handler focused on remote sources. Unifying `LocalSourceInput` around `file://` URLs is a potential follow-up change.

### Decision 4: Shorthand routing stays prefix-based

**Choice:** `ShorthandInput` routing remains in the same function — source-type prefixes (`github:`, `gitlab:`, `bitbucket:`) dispatch directly to the provider's shorthand parser. Config-name prefix fallback (`ghe:owner/repo`) checks `getConfiguredSources()` when the prefix isn't a known source type.

**Why:** Shorthand prefixes explicitly name the source type or config — no hostname matching needed. The mechanism is sound; it just moves into the unified routing function.

### Decision 5: SlashPattern routing uses configured sources

**Choice:** `SlashPattern` (`owner/repo`) iterates the merged sources list filtered to git-hosting types, trying each provider in config order. This replaces the current hardcoded error message suggesting `github:`, `gitlab:`, or `bitbucket:`.

This aligns with the `registry-source-config` spec's "Ambiguous input resolution uses merged sources" requirement, which already specifies this behavior but isn't implemented in the parser.

### Decision 6: NameInput lookup stays in the routing function

**Choice:** `NameInput` (installed skill name) still looks up the lockfile and resolves to a local path. This logic moves from `parseSourceInput` into the unified routing function in `resolveSource`. It requires the `Workspace` service, which `resolveSource` already has.

## Risks / Trade-offs

**`parseSourceInput` removal changes the public API** → The function is marked `@experimental`. `resolveSource` is the actual public entry point. Tests that call `parseSourceInput` directly will need updating to either use `resolveSource` or `parseInputPattern` + provider parsers.

**Two `getConfiguredSources()` calls per resolution** → One for URL/SCP hostname matching, potentially another for config merging. Mitigated by workspace caching (sources are read from settings files once per handler invocation). Could be further optimized by threading sources through if needed.
