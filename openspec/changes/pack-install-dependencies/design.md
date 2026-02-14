## Context

The `cli-packs-install` spec already requires cascading extension install (the plan should include `install-skill` operations for pack dependencies). The current implementation only creates the `install-pack` operation and stores dependency metadata in the lockfile without installing them.

The codebase already supports mixed-operation plans — `fork/handler.ts` uses `CopySkillOperation | PublishSkillOperation | InstallSkillOperation` and `update/handler.ts` uses `InstallSkillOperation | UninstallSkillOperation`. The same pattern applies here.

## Goals / Non-Goals

**Goals:**

- Pack install plan includes `install-skill` operations for skills in the pack manifest
- Reuse existing `installSkill` handler and `SourceProviders` infrastructure
- Already-installed skills shown as no-op unless `--force`

**Non-Goals:**

- Installing commands or mcp-servers (no install handlers exist for these types yet)
- Transitive dependency resolution (skill A depends on skill B) — only direct pack references
- Version conflict resolution between packs sharing the same skill

## Decisions

### 1. Fetch dependencies in handler, before plan building

Fetch and extract skill archives in the handler (before `buildInstallPlan`), then pass operations to the plan builder. This matches existing patterns — both `skills/install/handler.ts` and `packs/install/handler.ts` do file I/O before plan construction.

Alternative: Fetch during plan execution. Rejected because plan steps need `location` (extracted archive path) upfront, and plan display needs to show all operations before any execution.

### 2. Combined union type for plan operations

Define `PackInstallOp = InstallPackOperation | InstallSkillOperation` and update `buildInstallPlan` to accept it. The plan builder dispatches on `op.name` to determine no-op status:

- `"install-pack"` → check `lockfile.packs`
- `"install-skill"` → check `lockfile.skills`

Alternative: Build two separate plans. Rejected because the user should see a single unified plan with pack + skills together.

### 3. Use `resolveSource` for dependency FQNs

Pass each dependency FQN (e.g., `@acme/code-review`) through `resolveSource()` rather than manually splitting scope/name. For registry patterns, `resolveSource` has negligible overhead — it just calls `Effect.succeed({ type: "registry", scope, name })`. Using the shared parsing path means we get validation and any future source format changes for free.

### 4. Pack step first, then skill steps

The plan places the pack operation before skill operations. This ensures the pack metadata (including resolved versions) is recorded before skills are installed. If the pack step fails, skill steps won't execute (sequential plan with `concurrency: 1`).

## Risks / Trade-offs

- **Partial install on failure**: If the pack installs but a skill fetch fails, the pack is recorded without its skills. Mitigation: The plan framework already handles per-step errors and reports them. Users can re-run with `--force`.
- **Registry round-trips**: Each skill dependency requires a separate `resolveExtension` + `fetch` call. Mitigation: Dependencies are fetched concurrently via `Effect.forEach` with `concurrency: "unbounded"`.
- **Skills only**: Commands and mcp-servers listed in the pack manifest are stored as metadata but not installed. This is acceptable for now and matches the current infrastructure.
