## Why

Multiple coding agents (amp, kimi-cli, replit, and growing) default their skills directory to `.agents/skills` — an emerging cross-agent convention we call the "universal location." The codebase has no explicit model for this shared directory. Instead, each agent independently declares `skills.dir: ".agents/skills"` in its descriptor. This causes false agent detection (the directory existing is attributed to each agent individually), false lint findings (stale/orphan warnings for agents that were never installed), and fragile dedup-by-coincidence during install. The problem worsens as more agents adopt the convention.

## What Changes

- Introduce a `UNIVERSAL_SKILLS_DIR` constant (`.agents/skills`) as the named, authoritative representation of the universal location.
- Add a derived utility (`isUniversalSkillsDir`) that compares a resolved effective skills dir against the constant — not a static flag, so it remains correct when agent config overrides the default.
- **BREAKING**: Agent detection no longer treats the universal skills dir as an agent-specific detection signal. An agent whose only filesystem footprint is the universal dir is not considered "detected" unless it has an additional agent-specific marker.
- **BREAKING**: Lint rules (`workspace/agents-detected-declared`, `workspace/skills-artifacts-clean`, `workspace/skills-artifacts-correct`) become universal-dir-aware. Artifacts in the universal location are not attributed to any single agent for stale/orphan/inconsistency purposes.
- Install continues to target the universal location for agents that resolve there (already deduped), but the intent is now explicit and named rather than an emergent property of string equality.

## Capabilities

### New Capabilities

- `universal-skills-dir`: The constant, the derived check utility, and the rules governing how the universal location interacts with detection, lint, and install.

### Modified Capabilities

- `cli-init`: Agent auto-detection during init must exclude agents whose only signal is the universal skills dir.
- `workspace-reconciliation`: Reconciliation and lint rules must distinguish universal-location artifacts from agent-specific artifacts.

## Impact

- `packages/core/src/unstable/agents/detection.ts` — detection logic gains universal-dir awareness
- `packages/core/src/unstable/lint/catalog/workspace-accessor/platform.ts` — lint-time detection mirrors the change
- `packages/core/src/unstable/lint/catalog/workspace/skills-artifacts-clean.ts` — stale arm skips universal-dir artifacts for non-declared agents
- `packages/core/src/unstable/lint/catalog/workspace/skills-artifacts-correct.ts` — consistency checks account for shared dir
- `packages/core/src/unstable/lint/catalog/workspace/agents-detected-declared.ts` — false positives suppressed for universal-dir-only agents
- `packages/core/src/unstable/skills/operations/install.ts` — install targets the named constant; dedup logic unchanged but intent is explicit
- `packages/core/src/unstable/agents/amp/descriptor.ts`, `kimi-cli/descriptor.ts`, `replit/descriptor.ts` — descriptors unchanged but now understood as "defaults to universal"
- `packages/core/src/unstable/agents/coding-agent.ts` — `resolveEffectiveSkillsDir` contract unchanged; future agent config parsing will slot in here
