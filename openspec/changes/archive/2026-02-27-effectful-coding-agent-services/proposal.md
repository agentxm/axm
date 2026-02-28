## Why

Agent integration is currently driven by hard-coded descriptors, which makes agent-specific behavior difficult to extend and test consistently. We need a service-oriented contract for coding agents in the skills install path so we can support agents whose effective skills directory differs from a universal default.

## What Changes

- Introduce a first-class `CodingAgent` capability contract for agent-specific skills install behavior.
- Define a service method that resolves each agent's effective skills directory with explicit outcomes (`supported`, `unsupported`, `disabled`, `misconfigured`).
- Update skills install behavior to gather configured agents, apply strict vs best-effort policy for unknown configured agents, resolve effective directories, de-duplicate directories, and perform one materialization/symlink operation per distinct directory.
- Define path precedence for effective directory resolution: runtime override -> validated docs mapping -> descriptor fallback.
- Keep scope limited to skills install operation behavior for this change; migration of other operations is explicitly deferred.

## Capabilities

### New Capabilities

- `coding-agent-services`: Defines the `CodingAgent` service contract and required behavior for agent-scoped skills installation, including effective skills directory resolution.

### Modified Capabilities

- `skills-install-execute`: Skill install requirements will define agent-specific effective skills directory resolution, strict/best-effort unknown-agent policy, distinct-directory targeting, and symlink behavior per resolved directory.

## Impact

- Affected code: agent modeling/domain plus skills-install orchestration paths (`SkillManager` and direct install operation parity paths).
- Affected APIs: internal `CodingAgent` service interface used by skills install orchestration.
- Dependencies/systems: Effect service graph/layers for agent implementations and skill installation wiring.
