## Why

The names `AgentConfig` and `SourceConfig` suggest user-configurable settings, but these types actually describe **built-in definitions** — static metadata about agents and source providers that ship with the CLI. This creates real ambiguity: `SourceConfig` exists in both `sources/types.ts` (a parser/printer descriptor) and `settings/schema.ts` (a user-configurable source entry). Renaming to "Descriptor" clarifies which types are built-in definitions vs. user-configurable settings.

## What Changes

- **BREAKING** Rename `AgentConfig` → `AgentDescriptor` in `agents/types.ts` and all consumers
- **BREAKING** Rename `AgentSkillsConfig` → `AgentSkillsDescriptor` in `agents/types.ts`
- **BREAKING** Rename `SourceConfig` → `SourceDescriptor` in `sources/types.ts` (the parser/printer interface)
- **BREAKING** Rename `ShorthandConfig` → `ShorthandDescriptor` in `sources/types.ts`
- **BREAKING** Rename `UrlParseConfig` → `UrlParseDescriptor` in `sources/types.ts`
- Rename agent definition files from `config.ts` → `descriptor.ts` (e.g., `agents/kilo/config.ts` → `agents/kilo/descriptor.ts`)
- Rename source definition files from `config.ts` → `descriptor.ts` (e.g., `sources/github/config.ts` → `sources/github/descriptor.ts`)
- `SourceConfig` in `settings/schema.ts` is **unchanged** — it genuinely represents user-configurable source entries

## Capabilities

### New Capabilities

_(none)_

### Modified Capabilities

_(none — this is a naming/organizational change with no behavioral impact)_

## Impact

- **Types**: `AgentConfig`, `AgentSkillsConfig`, `SourceConfig` (sources), `ShorthandConfig`, `UrlParseConfig` renamed across all imports and usages
- **Files**: ~35 agent `config.ts` files renamed to `descriptor.ts`, ~6 source `config.ts` files renamed to `descriptor.ts`
- **Barrel exports**: `agents/index.ts` and `sources/index.ts` updated
- **Consumers**: `workspace/service.ts`, `workspace/ensure-agents.ts`, `resolution/`, `sources/parser.ts`, `sources/printer.ts`, all agent/source definition files
- **Tests**: Type references in test files updated
- **No runtime behavior change** — purely a compile-time naming clarification
