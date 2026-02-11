## Context

The parser (`parser.ts`) builds two lookup maps from an `ALL_DESCRIPTORS` array:

- `DESCRIPTOR_BY_PREFIX` — maps shorthand prefix (e.g. `"github"`) to a descriptor, used for `github:owner/repo` parsing
- `DESCRIPTOR_BY_HOSTNAME` — maps hostname (e.g. `"github.com"`) to a descriptor, used for URL and SCP parsing

Each descriptor bundles `{ id, print, shorthand: Option<{prefix, parse}>, parseFromUrl: Option<{hostname, parseUrl, parseScp}> }`. The parser unwraps the Options to extract the actual functions. The printer (`printer.ts`) already uses a switch statement and calls `descriptor.print()` — it doesn't use the descriptor shape at all.

`resolve-source.ts` has a third map (`DESCRIPTOR_BY_TYPE`) that maps source type → descriptor, used in two fallback paths: `tryConfigNameParse` (config-name prefix re-parsing) and `tryUrlHostnameMatch` (custom hostname substitution for GitHub Enterprise etc.).

The five descriptor files (`github/descriptor.ts`, `gitlab/descriptor.ts`, etc.) are pure wiring — they import standalone functions and bundle them into a descriptor object. The descriptor interface adds a generic type layer (`SourceDescriptor<T, T2>`) that provides no runtime value.

## Goals / Non-Goals

**Goals:**

- Remove `SourceDescriptor`, `ShorthandDescriptor`, `UrlParseDescriptor` interfaces from `types.ts`
- Delete all five `descriptor.ts` files
- Remove all descriptor lookup maps (`ALL_DESCRIPTORS`, `DESCRIPTOR_BY_PREFIX`, `DESCRIPTOR_BY_HOSTNAME`, `DESCRIPTOR_BY_TYPE`)
- Inline all dispatch logic using switch statements in `parser.ts`, `resolve-source.ts`, and `printer.ts`
- Remove dead code left behind (`shorthandPrefix` constants, `AnySourceDescriptor` type aliases)
- Keep all parsing and printing behavior identical

**Non-Goals:**

- Changing the `AgentDescriptor` pattern (different concern, different change)
- Modifying any parsing or printing behavior
- Changing the provider folder structure or individual function files

## Decisions

### 1. Inline all dispatch logic in parser.ts — no lookup maps

The parser already pattern-matches on input types (`ShorthandInput`, `UrlInput`, `GitScpAddress`). Instead of looking up descriptors in maps, each match arm directly calls the appropriate provider function.

**`ShorthandInput` arm** — switch on prefix:

```typescript
Match.tag("ShorthandInput", ({ prefix, input: shorthandInput }) => {
  switch (prefix) {
    case "github":
      return wrap(githubParseShorthand(shorthandInput));
    case "gitlab":
      return wrap(gitlabParseShorthand(shorthandInput));
    case "bitbucket":
      return wrap(bitbucketParseShorthand(shorthandInput));
    default:
      return Effect.fail(new ParseError({ message: `Unknown shorthand prefix: "${prefix}"`, input }));
  }
}),
```

**`UrlInput` arm** — switch on hostname:

```typescript
Match.tag("UrlInput", ({ url }) => {
  switch (url.hostname) {
    case "github.com":
      return wrap(githubParseUrl(url));
    case "gitlab.com":
      return wrap(gitlabParseUrl(url));
    case "bitbucket.org":
      return wrap(bitbucketParseUrl(url));
    case "dev.azure.com":
      return wrap(azurereposParseUrl(url));
    default:
      return Effect.fail(new ParseError({ message: `Unsupported URL host: "${url.hostname}"`, input: trimmed }));
  }
}),
```

**`GitScpAddress` arm** — switch on host:

```typescript
Match.tag("GitScpAddress", (scp) => {
  const scpInput = `${scp.user}@${scp.host}:${scp.path}`;
  switch (scp.host) {
    case "github.com":
      return wrap(githubParseScp(scpInput));
    case "gitlab.com":
      return wrap(gitlabParseScp(scpInput));
    case "bitbucket.org":
      return wrap(bitbucketParseScp(scpInput));
    case "dev.azure.com":
    case "ssh.dev.azure.com":
      return wrap(azurereposParseScp(scpInput));
    default:
      return Effect.fail(new ParseError({ message: `Unsupported SCP host: "${scp.host}"`, input }));
  }
}),
```

The `SHORTHAND_PREFIXES` set (used in `parseInputPattern` to detect shorthand patterns) becomes a simple inline set:

```typescript
const SHORTHAND_PREFIXES = new Set(["github", "gitlab", "bitbucket"]);
```

### 2. Inline dispatch in resolve-source.ts

`resolve-source.ts` uses descriptors in two fallback paths. Both become switch statements.

**`tryConfigNameParse`** — switch on `matchedConfig.source` to call the right `parseShorthand`:

```typescript
// Re-parse: construct `{sourceType}:{remainder}` and parse with the provider
const reparsed = `${matchedConfig.source}:${remainder}`;
switch (matchedConfig.source) {
  case "github": {
    const parsedInput = yield * githubParseShorthand(reparsed);
    return {
      input: parsedInput,
      config: Option.some(matchedConfig),
    } satisfies ParseSourceInputResult;
  }
  case "gitlab": {
    const parsedInput = yield * gitlabParseShorthand(reparsed);
    return {
      input: parsedInput,
      config: Option.some(matchedConfig),
    } satisfies ParseSourceInputResult;
  }
  case "bitbucket": {
    const parsedInput = yield * bitbucketParseShorthand(reparsed);
    return {
      input: parsedInput,
      config: Option.some(matchedConfig),
    } satisfies ParseSourceInputResult;
  }
  default:
    return (
      yield *
      Effect.fail(
        new ParseError({
          message: `Source type "${matchedConfig.source}" does not support shorthand syntax`,
          input,
        }),
      )
    );
}
```

Note: `azurerepos` has no shorthand (`Option.none()` in its old descriptor), so it falls through to the default error — same behavior as before.

**`tryUrlHostnameMatch`** — helper function that returns canonical hostname + parsers for a source type:

```typescript
const getCanonicalUrlParsers = (sourceType: string) => {
  switch (sourceType) {
    case "github":
      return Option.some({
        hostname: "github.com",
        parseUrl: githubParseUrl,
        parseScp: githubParseScp,
      });
    case "gitlab":
      return Option.some({
        hostname: "gitlab.com",
        parseUrl: gitlabParseUrl,
        parseScp: gitlabParseScp,
      });
    case "bitbucket":
      return Option.some({
        hostname: "bitbucket.org",
        parseUrl: bitbucketParseUrl,
        parseScp: bitbucketParseScp,
      });
    case "azurerepos":
      return Option.some({
        hostname: "dev.azure.com",
        parseUrl: azurereposParseUrl,
        parseScp: azurereposParseScp,
      });
    default:
      return Option.none();
  }
};
```

Then in `tryUrlHostnameMatch`, replace `DESCRIPTOR_BY_TYPE.get(matchingConfig.source)` + `desc.parseFromUrl` with `getCanonicalUrlParsers(matchingConfig.source)`.

### 3. Printer imports print functions directly

`printer.ts` already dispatches via switch on `source.source`. Replace descriptor imports with direct function imports:

```typescript
import { print as githubPrint } from "./github/index.js";
import { print as gitlabPrint } from "./gitlab/index.js";
import { print as bitbucketPrint } from "./bitbucket/index.js";
import { print as azurereposPrint } from "./azurerepos/index.js";
import { print as localPrint } from "./local/index.js";

export const printSourceInput = (source: SourceInput): string => {
  switch (source.source) {
    case "github":
      return githubPrint(source);
    case "gitlab":
      return gitlabPrint(source);
    case "bitbucket":
      return bitbucketPrint(source);
    case "azurerepos":
      return azurereposPrint(source);
    case "local":
      return localPrint(source);
    case "git":
      return source.url.href;
    case "registry":
      return `${source.scope}/${source.name}`;
  }
};
```

### 4. Dead code cleanup

Removing descriptors makes several things dead code:

- **`shorthandPrefix` constants** in `github/shorthand.ts`, `gitlab/shorthand.ts`, `bitbucket/shorthand.ts` — only used by `descriptor.ts` files. Remove the constants and their re-exports from provider `index.ts` files.
- **`AnySourceDescriptor` type alias** in `parser.ts` and `resolve-source.ts` — only used for descriptor maps.
- **`RegistrySourceInput` doc comment** referencing "SourceDescriptor" (`Location resolved from SourceDescriptor at runtime`) — update or remove.

### 5. Provider index files drop descriptor re-exports

Each provider's `index.ts` currently re-exports `descriptor` and `shorthandPrefix`. After deletion, remove both. The individual function exports (`print`, `parseShorthand`, `parseUrl`, `parseScp`) remain.

## Risks / Trade-offs

- **Adding a new provider requires touching switch cases in `parser.ts` and `resolve-source.ts`** — Previously, you'd create a `descriptor.ts` and add it to `ALL_DESCRIPTORS`. Now you add cases to the shorthand/hostname/SCP switches. → Acceptable: providers are added rarely, the switch cases are co-located and easy to scan, and the compiler won't catch a missing case (but neither did the old map approach).
