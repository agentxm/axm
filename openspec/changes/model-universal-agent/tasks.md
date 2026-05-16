## 1. Agent model and accessor

- [x] Add `universal` to `AGENT_IDS` and `AGENTS`.
- [x] Add a synthetic `CodingAgent` implementation that supports skills at
      `.agents/skills` and reports all non-skill capabilities as unsupported.
- [x] Add `getMaterializationAgents()` to `CodingAgentRepository`.
- [x] Keep configured-agent accessors real-agent-only and ensure detection never
      auto-detects `universal`.

## 2. Materialization

- [x] Switch skill materialization paths to `getMaterializationAgents()`.
- [x] Delete direct universal target handling from `skills/operations/install.ts`.
- [x] Update enable/disable and cleanup paths so `universal` is handled through
      the shared agent path.
- [x] Keep setup/new/config user-facing flows on configured agents only.

## 3. Lockfile and lint

- [x] Remove `universalArtifact` from current skill lock entries.
- [x] Bump `lockfileVersion`.
- [x] Migrate legacy skill entries with `universalArtifact` to include
      `universal` in `agents[]`.
- [x] Retarget `workspace/skills-universal-artifact-present` to require
      `universal` in enabled skill lock entries and keep autofix.

## 4. Verification

- [x] Add or update unit coverage for repository composition, lockfile migration,
      lint autofix, and materialization with empty settings agents.
- [x] Update docs and fixtures that reference universal artifacts.
- [x] Run focused client-core tests and typecheck.
