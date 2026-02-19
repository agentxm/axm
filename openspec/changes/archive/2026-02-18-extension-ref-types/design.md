## Context

`SourceExtensionRef` is a 2D discriminated union (extension type × source type) producing 14 individually-named type aliases. Each variant is a flat intersection: `SkillRefBase & { source: GitHubSource } & GitHostedRefDetails`. Consumers switch on `ref.source.type` across up to 8 branches, with type assertions (`ref as GitHubSkillRef`) needed after each branch because TS can't narrow the outer intersection from the nested `source.type` discriminator.

Key consumers:

- `sourceToLockEntry()` — 8-branch switch with type assertions per branch
- `install-skill.ts` — `"location" in ref` structural check + `ref.source.type === "registry"` checks
- `service.ts` — dispatches `find`/`fetch` by `source.type` (8 branches each)
- `git-hosting.ts` fetch — `"location" in ref` structural check

The primary pain points: combinatorial explosion when adding source/extension types, required type assertions after switching on a nested discriminator, and no way to generically handle "all git-hosted refs" without listing every variant.

## Goals / Non-Goals

**Goals:**

- Introduce a top-level `refType` discriminator that groups sources by hosting category, enabling TS narrowing without type assertions
- Establish a generic base type hierarchy (`ExtensionRefBase` → per-extension-type base → concrete types) that scales additively, not multiplicatively
- Collapse 5 git-based source variants into a single `git-hosted` ref type — specific source identity available via `source.type` when needed
- Eliminate `"location" in ref` structural checks in favor of discriminated-union narrowing on `refType`

**Non-Goals:**

- Changing the `Source`, `SourceHost`, or `SourceParams` type hierarchies — those are fine
- Changing `FindOptions`, `SourceHostProvider` interface shape, or the provider dispatch model in `service.ts` (those switch on `source.type`, which is about routing to the right provider, not about ref structure)
- Changing lockfile schemas — lock entries persist source-type granularity and are unaffected
- Backwards compatibility with the old ref types

## Decisions

### 1. Top-level `refType` discriminator

Add `refType: RefType` as a top-level field on every extension ref, alongside the existing `type: ExtensionType`.

```typescript
type RefType = "git-hosted" | "registry" | "local" | "builtin";
```

**Why over alternatives:**

- `source.type` is nested and doesn't narrow the outer ref type — requires type assertions
- A top-level discriminator enables TS narrowing on both `type` (extension kind) and `refType` (hosting category) directly
- 4 ref types vs 8 source types — git hosting sources (GitHub, GitLab, Bitbucket, AzureRepos) plus generic git all share identical ref detail fields, so they collapse naturally

### 2. Generic base type hierarchy

Three layers of generics:

```typescript
// Layer 1: Universal base
interface ExtensionRefBase<
  TExtensionType extends ExtensionType,
  TRefType extends RefType,
  TSource extends Source,
> {
  readonly type: TExtensionType;
  readonly refType: TRefType;
  readonly source: TSource;
}

// Layer 2: Extension-type bases (add extension-specific metadata)
type SkillExtensionRefBase<TRefType extends RefType, TSource extends Source> = ExtensionRefBase<
  "skill",
  TRefType,
  TSource
> & {
  readonly skill: {
    readonly name: string;
    readonly description: Option<string>;
    readonly metadata: Option<Record.ReadonlyRecord<string, unknown>>;
  };
};

type McpServerExtensionRefBase<TRefType extends RefType, TSource extends Source> = ExtensionRefBase<
  "mcp-server",
  TRefType,
  TSource
> & {
  readonly server: { readonly name: string };
};

// Layer 3: Concrete ref types (add ref-type-specific details)
type GitHostedSkillRef = SkillExtensionRefBase<"git-hosted", GitBasedSource> & GitHostedRefDetails;
type RegistrySkillRef = SkillExtensionRefBase<"registry", RegistrySource> & RegistryRefDetails;
type LocalSkillRef = SkillExtensionRefBase<"local", LocalSource> & LocalRefDetails;
type BuiltinSkillRef = SkillExtensionRefBase<"builtin", BuiltinSource> & BuiltinRefDetails;
```

**Why this structure over flat types:**

- Adding a new source type under an existing ref category (e.g., a new git host) requires zero new ref types — just add the source to `GitBasedSource`
- Adding a new extension type requires only the layer-2 base + concrete types for each ref category (4 types, not 8)
- Adding a new ref category is additive — new detail interface + one concrete type per extension type

**Why not a single generic type with conditional types:**

- Conditional types destroy TS discriminated-union narrowing
- Explicit concrete types at layer 3 give TS the flat union it needs for `switch` narrowing

### 3. RefType-to-Source constraint

Each `refType` maps to a constrained set of sources:

| `refType`      | Source union                                                          | Ref details                             |
| -------------- | --------------------------------------------------------------------- | --------------------------------------- |
| `"git-hosted"` | `GitBasedSource` (GitHub \| GitLab \| Bitbucket \| AzureRepos \| Git) | `location`, `gitTreeSha`                |
| `"registry"`   | `RegistrySource`                                                      | `scope`, `name`, `version`, `integrity` |
| `"local"`      | `LocalSource`                                                         | `location`                              |
| `"builtin"`    | `BuiltinSource`                                                       | (none)                                  |

This is enforced at the type level via the generic parameter `TSource` — a `GitHostedSkillRef` can only carry a `GitBasedSource`, not a `RegistrySource`.

### 4. Ref detail interfaces

`GitHostedRefDetails`, `LocalRefDetails`, `BuiltinRefDetails` remain unchanged.

`RegistryRefDetails` gains `name: string`:

```typescript
interface RegistryRefDetails {
  /** Registry scope (e.g., "@corp") */
  readonly namespace: string;
  /**
   * Registry package name — the name under which this extension is published.
   * This may differ from the extension-specific name (e.g., skill.name, pack.name)
   * which is the user-facing display name parsed from the extension's manifest.
   */
  readonly name: string;
  /** Resolved semver version from the registry index */
  readonly version: string;
  /** SRI integrity hash for archive verification */
  readonly integrity: string;
}
```

`name` is the registry package name — distinct from the extension-specific display name (`skill.name`, `pack.name`, `server.name`). The registry name is the identifier used for registry operations (fetch, version resolution), while the extension name is the user-facing display name from the manifest. These may differ. Implementation MUST include a code comment on `RegistryRefDetails.name` clarifying this distinction.

This makes registry ref details uniform across all extension types (skills, packs, mcp-servers). Consumers that need scope/name/version/integrity after `refType === "registry"` narrowing get them from the ref details — no structural checks or extension-type-specific access patterns needed.

Pack refs no longer need asymmetric `pack` field shapes: `PackExtensionRefBase` has `pack: { name }` and all registry-specific data comes from `RegistryRefDetails`.

### 5. Skill description becomes `Option<string>`

`SkillRefBase.skill.description` changes from `string` to `Option<string>`. Providers that lack a description return `Option.none()` instead of `""`.

### 6. Union types at each level

```typescript
// Per-extension unions
type SkillExtensionRef = GitHostedSkillRef | RegistrySkillRef | LocalSkillRef | BuiltinSkillRef;
type McpServerExtensionRef =
  | GitHostedMcpServerRef
  | RegistryMcpServerRef
  | LocalMcpServerRef
  | BuiltinMcpServerRef;
type PackExtensionRef = RegistryPackRef | BuiltinPackRef;

// Top-level union
type ExtensionRef = SkillExtensionRef | McpServerExtensionRef | PackExtensionRef;
```

Rename `SourceExtensionRef` → `ExtensionRef`. The "Source" prefix was always redundant — all refs carry a source.

### 7. Consumer migration patterns

**`sourceToLockEntry()`** — two-level switch becomes cleaner:

```typescript
switch (ref.refType) {
  case "git-hosted": {
    // TS knows: ref has location, gitTreeSha; source is GitBasedSource
    // Still switch on source.type for lock entry granularity (github/gitlab/etc.)
    switch (ref.source.type) {
      case "github": return { type: "github", owner: ref.source.owner, ... }
      // ...
    }
  }
  case "registry":
    // TS knows: ref has scope, name, version — no type assertion needed
    return { type: "registry", namespace: ref.scope, ... }
  case "local":
    return { type: "local", path: ref.source.path, ... }
  case "builtin":
    return { type: "builtin", ... }
}
```

**`install-skill.ts`** — replace structural checks:

```typescript
// Before: "location" in ref, ref.source.type === "registry"
// After:  ref.refType === "registry" (or !== "registry")
```

**`SkillPathSource`** — can use `refType` directly:

```typescript
type SkillPathSource =
  | { readonly refType: "registry"; readonly namespace: string }
  | { readonly refType: Exclude<RefType, "registry"> };
```

**`packs/install/handler.ts`** — replace structural checks:

```typescript
// Before: "namespace" in packRef, "version" in packRef
// After:  packRef.refType === "registry" → TS knows scope, name, version from RegistryRefDetails
```

**`service.ts` `find`/`fetch` dispatch** — these switch on `source.type` (not `ref.source.type`) to route to the right provider. These switches are about provider dispatch, not ref structure, so they remain unchanged.

### 8. Naming: `ExtensionRef` not `SourceExtensionRef`

Rename `SourceExtensionRef` → `ExtensionRef`. Every ref carries a source — the prefix adds no information. This aligns with the user's proposed naming.

### 9. Cleanup opportunities

The `refType` discriminator eliminates several categories of workarounds in existing code:

**Type assertions removed** — `sourceToLockEntry()` has 7 `ref as GitHubSkillRef`-style assertions that become unnecessary when `refType` narrowing gives TS the ref detail fields directly.

**Structural `"in"` checks removed** — 14+ instances of `"location" in ref`, `"namespace" in ref`, `"version" in ref` across install, update, copy, and pack handlers. All become `switch (ref.refType)`.

**`GIT_SOURCE_TYPES` set removed** — `build-plan.ts` maintains `new Set(["github", "gitlab", "bitbucket", "azurerepos", "git"])` for change detection. Replace with `ref.refType === "git-hosted"`.

**`SkillPathSource` bridge type simplified** — Currently enumerates all 8 source types just to distinguish "registry" from "everything else". Becomes `{ refType: "registry"; scope } | { refType: Exclude<RefType, "registry"> }`.

**`getSkillDisplayName` fallback simplified** — Uses `"location" in ref ? basenamePure(ref.location) : ref.skill.name`. With `refType`, the branch is explicit: `ref.refType === "git-hosted" || ref.refType === "local"`.

**Provider ref construction** — `git-hosting.ts` builds refs with `as SourceExtensionRef` because TS can't prove the generic `S` narrows correctly. Adding `refType: "git-hosted"` to the constructed object makes the shape match a concrete type, potentially eliminating the assertion.

## Risks / Trade-offs

**[Two-level switching in `sourceToLockEntry`]** → The lockfile needs per-source-type granularity (github lock entry ≠ gitlab lock entry ≠ azurerepos lock entry). The `refType` switch eliminates type assertions for ref detail access, but source-type switching is still needed for source-specific fields. Net improvement: cleaner outer switch + no `as` casts.

**[14 → ~12 named types]** → The reduction is modest (14 → ~12) because we keep per-extension concrete types at layer 3. The real win is structural: adding source types is O(1) instead of O(extension types), and consumers work with 4 `refType` branches instead of 8 `source.type` branches.

**[Breaking change surface]** → Every file that imports from `sources/types.ts` needs updates. The consumer research shows ~15 production files + ~10 test files. This is manageable in a single coordinated change since backward compatibility is a non-goal.
