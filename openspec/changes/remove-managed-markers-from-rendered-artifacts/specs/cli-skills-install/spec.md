## REMOVED Requirements

### Requirement: Managed marker on materialized SKILL.md

**Reason**: Materialized skills no longer use content markers to indicate AXM ownership. Ownership comes from settings and lockfile state, not mutated `SKILL.md` content.

**Migration**: No user action is required. Existing materialized markers disappear the next time the skill is re-materialized.
