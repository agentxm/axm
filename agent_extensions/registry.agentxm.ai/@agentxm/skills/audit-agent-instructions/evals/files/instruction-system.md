# Synthetic instruction-system snapshot

Host contract:

- `/workspace/AGENTS.md` applies everywhere.
- `/workspace/services/billing/AGENTS.md` additionally applies beneath
  `services/billing/` and loads after the broad source.
- `CLAUDE.md` is an AXM-owned projection of the root `AGENTS.md`.

Observed sources:

- Root `AGENTS.md` contains a 25-line release procedure already owned by
  `docs/releases.md`.
- Root `AGENTS.md` says `Billing changes: task test:billing`, although catalog
  work also receives the root file.
- Root `AGENTS.md` contains `Migrations` followed by a valid guide path but no
  condition describing when to read it.
- Billing `AGENTS.md` contains a concise invariant unique to billing work.
- `CLAUDE.md` is missing the latest root invariant.

Representative work begins from the repository root, `services/billing/`, and
`services/catalog/`. Catalog work must not receive billing-only commands. The
migration route is useful and its target exists.
