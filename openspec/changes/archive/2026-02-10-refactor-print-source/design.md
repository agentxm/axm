## Context

`printSource` in `sources/printer.ts` accepts `Source | SourceInput` and dispatches to descriptor-based `print` functions for 5 of 7 source types (github, gitlab, bitbucket, azurerepos, local). The remaining 2 types (`git`, `registry`) use an ad-hoc fallback switch — `registry` prints the unhelpful literal `"registry"`.

The print functions only read input fields (owner, repo, ref, subPath, url, path, scope, name) — never config fields. The `Source` half of the union is unnecessary.

Separately, `resolution/types.ts` re-exports `SourceType` as `Source`, which shadows the actual `Source` union type from `sources/types.ts`.

## Goals / Non-Goals

**Goals:**

- Rename `printSource` to `printSourceInput` and narrow to `SourceInput` only
- All 7 source types have proper print implementations
- Remove the confusing `Source` alias from `resolution/types.ts`

**Non-Goals:**

- Creating full `SourceDescriptor` structures for `git` and `registry` (they don't need shorthand/URL parsing)

## Decisions

### 1. Inline print for git and registry in `printSourceInput` (no new descriptors)

`git` and `registry` don't need shorthand parsing or URL matching — they only need print. Adding full `SourceDescriptor` instances just for print is over-engineering. Instead, move the existing fallback switch cases to proper exhaustive handling within `printSourceInput`.

**Alternative considered**: Create `git/descriptor.ts` and `registry/descriptor.ts` with `Option.none()` for shorthand/parseFromUrl. Rejected — adds files and boilerplate for no benefit.

### 2. Print formats

- **git**: `source.url.href` (already the fallback behavior, just making it explicit)
- **registry**: `@${source.scope}/${source.name}` (matches the input format from the parser)

### 3. Narrow signature to `SourceInput` only

The individual print functions (e.g., `github/print.ts`) already accept `*SourceInput`, not `*Source`. The dispatcher should match — it only needs input fields. Callers in handlers pass `Source` which structurally satisfies `SourceInput` (superset), so no call-site changes beyond the rename.

### 4. Remove resolution/types.ts re-export

Remove `export type { Source }` from `resolution/types.ts` and `resolution/index.ts`. No external consumers import it (verified by grep).

## Risks / Trade-offs

- **Rename churn** → All call sites (install handler, fork handler, install-skill, parser tests, extensions index) need updating. Mitigation: mechanical find-and-replace, low risk.
