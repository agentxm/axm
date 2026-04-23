## Context

Multiple coding agents default their skills directory to `.agents/skills`. This path appears independently in three agent descriptors (amp, kimi-cli, replit) with more expected. The codebase has no name for this shared location. Detection, lint, and install all operate on resolved `skills.dir` strings without knowing whether a directory is agent-specific or shared.

The existing `resolveEffectiveSkillsDir` contract on `CodingAgent` already supports per-agent overrides (Claude Code reads an env var, Augment hardcodes a different path). Future agents will read their own config files to override the default. The "is this the universal dir?" question must therefore be answered after resolution, not before.

## Goals / Non-Goals

**Goals:**

- Name the universal location with a single constant so the system can reason about it.
- Provide a derived utility that compares a resolved path against the constant.
- Eliminate false agent detection when the only filesystem signal is the universal dir.
- Eliminate false/noisy lint findings (stale artifacts, undeclared agents) caused by universal-dir ambiguity.
- Keep install behavior functionally unchanged (dedup already works); make the intent explicit.

**Non-Goals:**

- Modeling per-agent config file parsing (amp config, opencode config, etc.). Those override mechanisms will slot into `resolveEffectiveSkillsDir` later.
- Changing the `AgentDescriptor` type or adding static flags for "uses universal dir."
- Introducing a universal dir for commands or subagents (skills only for now).
- Backward compatibility with prior lint output — false findings going away is the goal.

## Decisions

### 1. Constant placement: `extensions/constants.ts`

Place `UNIVERSAL_SKILLS_DIR = ".agents/skills"` alongside the existing `REGISTRY_EXTENSIONS_DIR` and `EXTERNAL_EXTENSIONS_DIR` constants in `packages/core/src/unstable/extensions/constants.ts`. This module already holds the canonical path constants for extension layout.

**Alternative considered**: A new `agents/constants.ts` export. Rejected because the constant describes a filesystem layout concern (where skills land), not an agent-identity concern. The existing constants module is the natural home.

### 2. Derived check utility, not a descriptor flag

Add `isUniversalSkillsDir(resolvedDir: string, workspaceRoot: string): boolean` as a pure path comparison: resolve both sides and compare. This lives in `extensions/constants.ts` alongside the constant.

The check is a pure function (synchronous, no Effect wrapper needed) because both inputs are already-resolved absolute paths at every call site.

**Alternative considered**: Adding `isUniversal?: boolean` to `AgentSkillsDescriptor`. Rejected because the property would become stale the moment an agent's config overrides the default dir. The derived check stays correct automatically.

**Alternative considered**: An Effect-wrapped check that calls `resolveEffectiveSkillsDir` internally. Rejected because every consumer already has the resolved dir in hand — adding an Effect wrapper would force unnecessary service dependencies.

### 3. Detection: require an agent-specific signal beyond the universal dir

In both detection sites (`agents/detection.ts` and `lint/workspace-accessor/platform.ts`), when an agent's detection probes resolve to only the first segment of `UNIVERSAL_SKILLS_DIR` (i.e., `.agents`), that probe is excluded from detection. The agent is detected only if it has another signal: a commands dir, subagents dir, or legacy `~/.<id>` marker.

Concretely: `detectionSegments` / `detectionProbes` filter out segments that equal the first segment of `UNIVERSAL_SKILLS_DIR`. For agents that have other dirs (commands, subagents), detection still works through those. For agents that only have the universal skills dir (amp, kimi-cli, replit today), the universal dir alone is no longer a detection signal.

**Alternative considered**: Checking whether the universal dir contains any skills before attributing it. Rejected — the dir existing at all (even with skills in it) does not mean a specific agent is installed. The directory belongs to the convention, not to any agent.

### 4. Lint: universal-dir-aware artifact rules

**`agents-detected-declared`**: No change needed beyond the detection fix (Decision 3). Once detection stops false-positiving on the universal dir, this rule's findings are automatically correct.

**`skills-artifacts-clean` (stale arm)**: When iterating a declared agent's `skills.dir` and the resolved dir is the universal location, skip the stale-artifact check for that agent. Rationale: artifacts in the universal dir are shared — they aren't "owned" by any single declared agent, so their presence doesn't indicate staleness relative to that agent's declaration. The dangling arm (canonical source missing) still fires regardless, since that's a global integrity issue.

**`skills-artifacts-correct` (consistency arm)**: When checking that an enabled skill has artifacts in every declared agent's dir, collapse agents that resolve to the universal dir into a single check target. Today this happens accidentally via string dedup on `artifactPath`; the design makes it explicit by grouping agents by resolved dir and treating universal-dir agents as a single check group.

### 5. Install: name the intent, keep the mechanism

The existing `Array.dedupe` on resolved `targetDir` already produces correct behavior. The change is documentation and clarity: the install code references `UNIVERSAL_SKILLS_DIR` in a comment and the dedup is understood as "multiple agents share the universal location" rather than an accidental string collision.

No behavioral change to install.

## Risks / Trade-offs

**[Agent that only uses the universal dir becomes undetectable]** → This is intentional. If amp's only filesystem footprint is `.agents/skills/`, axm cannot distinguish "amp is installed" from "some other agent or manual setup created `.agents/skills/`." Users must explicitly declare such agents in `settings.agents` via `axm setup --agents amp` or by editing settings. The `agents-detected-declared` lint rule will not warn about these agents (since they're not detected), which is correct — there's nothing to warn about.

**[Future agent config parsing changes the resolved dir]** → The derived check handles this automatically. When an agent's `resolveEffectiveSkillsDir` starts reading config files and returns a non-universal path, `isUniversalSkillsDir` returns `false` and detection/lint treat that agent as having its own dir. No code changes needed beyond the agent's service implementation.

**[New agents adopting `.agents/skills` need no descriptor changes]** → Just set `skills.dir: ".agents/skills"` in the descriptor. The constant comparison handles the rest. If a new agent also has commands/subagents dirs, detection works through those.

## Open Questions

- Should `axm setup` in interactive mode still show universal-dir-only agents in the multiselect (unchecked) as available options, even though they weren't detected? This would let users opt in without needing `--agents`. Deferring to implementation — the current setup flow already shows all known agents, just with detected ones pre-checked.
