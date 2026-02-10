## Context

`AgentConfig` and `SourceConfig` (in `sources/types.ts`) describe built-in, static definitions — not user-configurable settings. Meanwhile, `SourceConfig` in `settings/schema.ts` genuinely represents user-configurable source entries. The naming collision causes confusion when reading code or imports.

Current structure:

- Each agent has `agents/<name>/config.ts` exporting `config: AgentConfig`
- Each source has `sources/<name>/config.ts` exporting `config: SourceConfig<T, T2>`
- Sub-folder `index.ts` barrels re-export `{ config }` from `./config.js`
- `agents/registry.ts` imports `{ config as <name> }` from each agent's index
- `sources/parser.ts` and `sources/printer.ts` import configs from each source's index

## Goals / Non-Goals

**Goals:**

- Rename built-in definition types from `*Config` to `*Descriptor` to disambiguate from user settings
- Rename definition files from `config.ts` to `descriptor.ts` for consistency
- Rename the exported binding from `config` to `descriptor` throughout the chain
- All tests and linting pass after the rename

**Non-Goals:**

- Changing any runtime behavior
- Renaming `SourceConfig` in `settings/schema.ts` (it's correctly named)
- Renaming `AgentId`, `AgentRegistry`, `SourceType`, `SourceInput`, or any source data types (`GitHubSource`, etc.)
- Backward compatibility shims or re-exports

## Decisions

### 1. Rename exported bindings, not just types

**Decision**: Rename the exported `const config` to `const descriptor` in each agent/source definition file, and update all barrel re-exports and import aliases accordingly.

**Rationale**: Renaming only the type but keeping `config` as the binding name would leave half the ambiguity in place. The registry imports (`{ config as kilo }`) become `{ descriptor as kilo }` — semantically clearer.

**Alternative considered**: Rename types only, keep `config` bindings. Rejected — inconsistent naming undermines the goal.

### 2. Rename files via `git mv`

**Decision**: Use `git mv` to rename `config.ts` → `descriptor.ts` in each agent/source sub-folder. This preserves git history.

**Rationale**: `git mv` ensures blame history is maintained for the renamed files. Creating new files and deleting old ones would lose history.

**File renames** (all `config.ts` → `descriptor.ts`):

Agent definitions (38 files):

```
agents/adal/config.ts         agents/amp/config.ts
agents/antigravity/config.ts  agents/augment/config.ts
agents/claude-code/config.ts  agents/cline/config.ts
agents/codebuddy/config.ts    agents/codex/config.ts
agents/command-code/config.ts agents/continue/config.ts
agents/crush/config.ts        agents/cursor/config.ts
agents/droid/config.ts        agents/gemini-cli/config.ts
agents/github-copilot/config.ts agents/goose/config.ts
agents/iflow-cli/config.ts   agents/junie/config.ts
agents/kilo/config.ts         agents/kimi-cli/config.ts
agents/kiro-cli/config.ts    agents/kode/config.ts
agents/mcpjam/config.ts      agents/mistral-vibe/config.ts
agents/mux/config.ts          agents/neovate/config.ts
agents/openclaw/config.ts    agents/opencode/config.ts
agents/openhands/config.ts   agents/pi/config.ts
agents/pochi/config.ts        agents/qoder/config.ts
agents/qwen-code/config.ts   agents/replit/config.ts
agents/roo/config.ts          agents/trae/config.ts
agents/trae-cn/config.ts     agents/windsurf/config.ts
agents/zencoder/config.ts
```

Source definitions (5 files):

```
sources/azurerepos/config.ts  sources/bitbucket/config.ts
sources/github/config.ts      sources/gitlab/config.ts
sources/local/config.ts
```

**Barrel re-export updates** (not renamed, import paths change):

- Each `agents/<name>/index.ts`: `export { config }` → `export { descriptor }` from `./descriptor.js`
- Each `sources/<name>/index.ts`: same pattern
- `agents/registry.ts`: `{ config as <name> }` → `{ descriptor as <name> }` for all 38 imports
- `sources/parser.ts` and `sources/printer.ts`: same pattern for source imports

No folder renames — only files within sub-folders.

### 3. Rename `AgentSkillsConfig` → `AgentSkillsDescriptor`

**Decision**: Rename this supporting type alongside `AgentConfig`.

**Rationale**: It's a sub-structure of `AgentDescriptor` and shares the same "built-in definition" nature. Keeping it as `*Config` would be inconsistent.

### 4. Rename `ShorthandConfig` / `UrlParseConfig` → `ShorthandDescriptor` / `UrlParseDescriptor`

**Decision**: Rename these source-related supporting types.

**Rationale**: Same reasoning — they're part of the `SourceDescriptor` definition, not user-configurable. `ShorthandDescriptor` describes how a source type parses shorthand syntax; `UrlParseDescriptor` describes how it parses URLs.

### 5. Update `AgentRegistry` value type only

**Decision**: Keep the name `AgentRegistry` but update its value type to `AgentDescriptor`.

**Rationale**: "Registry" accurately describes its purpose (a lookup table). Only the value type reference changes: `Record.ReadonlyRecord<AgentId, AgentDescriptor>`.

## Risks / Trade-offs

- **Large diff surface** — ~40 files renamed, ~60+ files with import/type changes → Mitigated by mechanical nature (find-and-replace + `git mv`); typecheck and lint gates catch errors
- **Merge conflicts** — Any in-flight branches touching agent/source configs will conflict → Mitigated by doing this as a single atomic commit on a clean main
