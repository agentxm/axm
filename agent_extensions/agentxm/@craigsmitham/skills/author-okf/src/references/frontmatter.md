# OKF frontmatter reference

`type` is the only always-required key. A concept carrying just `type` is fully conformant.

| Field | Req | Form | Notes |
|---|---|---|---|
| `type` | **yes** | string | Kind of concept. Uncontrolled vocabulary — see [Type discipline](../SKILL.md#type-discipline). |
| `title` | rec | string | Canonical display name. Use exact wording in index links. Consumers may fall back to the filename. |
| `description` | rec | string | One sentence distinguishing this concept from its neighbors. For action concepts, include the selection condition and supported outcome; for Processes, include the trigger and closing outcome. Reuse it exactly in index entries and search snippets. |
| `resource` | rec | URI/path | Canonical URI of the underlying asset. Omit for abstract concepts. |
| `tags` | rec | list | Stable domain terms, aliases, and query vocabulary; do not merely repeat the title. |
| `sources` | opt | list | Provenance. Each entry needs `resource`; `id`, `title`, `author`, `usage_count`, `last_modified` optional. |
| `usage_window` | opt | `{from, to}` | Sibling of `sources`; frames every `usage_count`. Dates are `YYYY-MM-DD`. |
| `generated` | opt | `{by, at}` | `by` required within it; an actor. `at` = last meaningful content change, ISO 8601 datetime. |
| `verified` | opt | list of `{by, at}` | Verification events. A bare mapping is a one-element list. |
| `status` | opt | enum | `draft` \| `stable` \| `deprecated`. Absent means `stable`. |
| `stale_after` | opt | `YYYY-MM-DD` | Absolute date, not a TTL. Stale when `today >= stale_after`. |

Producers may add any other keys; consumers must preserve them. Use that freedom sparingly — a
custom key no consumer reads is dead weight.

**Trust tiers** are derived, never stored: no `verified` key → unverified; `verified` by non-`human:`
actors only → machine-confirmed; at least one `human:<id>` → human-reviewed.

## Actor convention

Identity fields (`generated.by`, `verified[].by`) use exactly one of:

- `<producer>/<version>` — agents and tools, e.g. `reference_agent/gemini-2.5-pro`
- `human:<id>` — people, e.g. `human:ahormati`
- `process:<id>` — automated processes, e.g. `process:finance-nightly`

The `human:` prefix is load-bearing: it is what raises a concept to the human-reviewed tier. Use it
for hand-authored and human-confirmed content, and never for agent output.

`sources[].author` nominally uses the same convention, but the spec's own examples use a team form
(`team:finance-fpa`). Both are accepted; the validator only flags freeform values here.

