## MODIFIED Requirements

### Requirement: Install writes default entry form

The install handler SHALL write the settings entry as a plain string (collapsed form) via `ws.setSkill()`. If the source string includes a version constraint, the full source string including the version SHALL be persisted. Install always implies `enabled: true` and `managed: true`.

#### Scenario: Install writes default entry form

- **WHEN** a skill is installed via `axm install @acme/tool`
- **THEN** `ws.setSkill()` SHALL write the entry as `"@acme/tool"` (plain string, no version)

#### Scenario: Install preserves version constraint

- **WHEN** a skill is installed via `axm install @acme/tool@^1.0.0`
- **THEN** `ws.setSkill()` SHALL write the entry as `"@acme/tool@^1.0.0"` (version constraint preserved in source string)

#### Scenario: Install preserves exact pin

- **WHEN** a skill is installed via `axm install @acme/tool@1.2.3`
- **THEN** `ws.setSkill()` SHALL write the entry as `"@acme/tool@1.2.3"`
