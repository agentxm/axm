## Context

`axm packs publish` currently publishes only the pack manifest archive. A pack's `axm-pack.json` references dependency extensions (skills, commands, MCP servers) by FQN and semver range, but those dependencies must be published separately. For packs with many locally-developed extensions, this means running N+1 publish commands manually.

The existing plan system already supports heterogeneous operations — `packs install` uses `InstallPackOperation | InstallSkillOperation` in a single plan. The same pattern applies here.

Skills already have a publish operation (`publishSkill`). Commands and MCP servers do not yet have publish operations, but the flow is identical: read manifest, zip, compute integrity, publish.

## Goals / Non-Goals

**Goals:**

- Publish locally managed dependency extensions alongside the pack in a single command
- Reuse existing publish infrastructure (plan system, registry client, archive utilities)
- Skip dependencies that aren't locally managed (with a warning)

**Non-Goals:**

- Creating standalone `axm commands publish` or `axm mcp-servers publish` CLI commands (only the operation handlers are needed)
- Transitive dependency publishing (only direct pack dependencies)
- Version conflict resolution across dependencies

## Decisions

### 1. Generic publish extension operation

**Decision**: Create a single `PublishExtensionOperation` that works for any extension type (skill, command, mcp-server), rather than separate `PublishCommandOperation` / `PublishMcpServerOperation` types.

**Rationale**: The publish flow is identical across types — read manifest, zip, compute integrity, publish. The only difference is the manifest schema and directory path, both derivable from the extension type. A generic operation avoids duplicating three near-identical operation types and handlers.

**Alternative considered**: Separate operation types per extension type (matching the install pattern). Rejected because publish is simpler than install — no lockfile updates, no symlinks, no dependency resolution.

### 2. Two-job plan: dependencies first, then pack

**Decision**: Build the plan with two sequential jobs — Job 1 publishes dependencies (concurrently), Job 2 publishes the pack.

**Rationale**: While publish is idempotent and order doesn't strictly matter for registry state, publishing dependencies first means the plan output reads naturally ("published 3 dependencies, then published the pack") and any dependency publish failure stops before the pack is published.

### 3. Skip non-local dependencies with a warning

**Decision**: When a dependency FQN in the manifest doesn't have a corresponding directory in `.axm/extensions/`, skip it and log a warning. Don't fail.

**Rationale**: Non-local dependencies are assumed to already exist in the registry (e.g., third-party extensions the pack depends on). Failing would make the flag unusable for packs that mix local and external dependencies.

### 4. Handler reads manifest early for dependency discovery

**Decision**: Read and parse the pack manifest in the handler (before plan construction) to discover dependencies, rather than deferring to the operation executor.

**Rationale**: The handler needs the dependency list to build the plan steps. The manifest is read again during the pack publish operation, but that's acceptable — it's a local file read, not expensive.

## Risks / Trade-offs

- **Partial publish**: If some dependencies publish but the pack fails, the registry has orphaned versions. → Mitigated by idempotent publish — re-running the command succeeds without duplicating.
- **Version mismatch**: The pack manifest references `^1.0.0` but the local extension is at `1.2.0`. The published version may not match the range. → Out of scope for this change; version alignment is the user's responsibility.
