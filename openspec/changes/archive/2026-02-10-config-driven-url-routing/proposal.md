## Why

URL and SCP routing in `parseSourceInput` uses hardcoded hostname switches (`github.com` → GitHub, `gitlab.com` → GitLab, etc.), assuming canonical hostnames. Custom-hosted instances (GitHub Enterprise, self-hosted GitLab) only work via a buried fallback in `resolveSource`. This makes the primary codepath incorrect for non-canonical URLs and hides the real routing mechanism in error recovery.

## What Changes

- **BREAKING**: URL and SCP hostname → source type routing becomes config-driven, matching the input hostname against configured source URLs (including built-in defaults)
- The hardcoded hostname switch in the parser is removed; `resolveSource` routes URLs/SCPs by matching against the merged sources list
- The `tryUrlHostnameMatch` fallback becomes the primary routing mechanism for URL and SCP inputs
- `parseSourceInput` no longer resolves URL/SCP inputs to a specific source type — it classifies them as "URL" or "SCP" and `resolveSource` does the source type mapping
- Canonical and custom hostnames use the same codepath

## Capabilities

### New Capabilities

_(none — this restructures existing routing, no new user-facing capabilities)_

### Modified Capabilities

- `resolve-source`: URL and SCP routing moves from hardcoded hostname matching in the parser to config-driven matching against the merged sources list. `parseSourceInput` no longer maps URL/SCP hostnames to source types — `resolveSource` handles this using configured sources.
- `extension-sources`: `parseSourceInput` returns a generic URL/SCP classification for URL and SCP inputs instead of a provider-specific `SourceInput`. The function no longer needs provider-specific URL/SCP parsers for hostname routing — those are invoked later by `resolveSource` after config-driven hostname matching determines the source type.

## Impact

- `sources/parser.ts` — hostname switch removed; URL/SCP inputs return a generic classification
- `sources/resolve-source.ts` — URL/SCP hostname matching becomes the primary mechanism, not a fallback
- `sources/{github,gitlab,bitbucket,azurerepos}/url.ts` and `scp.ts` — parsers still exist but are invoked by `resolveSource` after source type is determined, not by `parseSourceInput`
- No changes to shorthand parsing (`github:owner/repo`), local paths, registry patterns, or git prefix — these are unambiguous without config
