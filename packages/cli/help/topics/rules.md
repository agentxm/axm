# Rules

Before distributing package-root files, read `axm help publish` for the
Registry-only archive policy and effective preview.

Rule extensions are installable guidance packages. A rule package has a
`rule.json` manifest and a `src/RULE.md` body. When instruction-file management
is enabled, active Rules contribute their bodies to the complete managed
`region=rules` block in the canonical instruction source.
The region carries `ext=@agentxm/rules/instructions`, and each Rule begins with
a versioned `axm:point v=1 kind=rule` contributor anchor.

Rule guidance targets the [AGENTS.md](https://agents.md) cross-vendor standard.
AXM owns only the managed Rules region; authored prose and other contributors
retain their own ownership.

Global instruction-file propagation is a separate workspace capability. Use
`axm instructions` and `axm help instructions` to inspect or configure it.

## Install and manage Rules

Install, inspect, activate, and remove Rules through the `axm rules` group:

```bash
axm rules install @owner/rules/<name>
axm rules list
axm rules show <name>
axm rules disable <name>
axm rules enable <name>
axm rules uninstall <name>
```

Rules are tracked in `axm.json` under `rules` and in
`axm-lock.yaml` under `rules`. The rule name is always required for
activation. Bare `rules enable` and `rules disable` commands are usage errors.

Every Rule install, update, activation, deactivation, uninstall, and sync
recomputes the complete Rules contribution. When instruction-file management is
enabled, AXM reconciles that contribution with all configured instruction
aliases and the managed `.gitignore` block in one transaction. Other managed
regions, including Knowledge discovery, retain their content and relative
order.

Run `axm help rule-schema` to inspect the raw `rule.json` schema.

## Commands

Rule lifecycle commands accept `--scope project` (default) or `--scope user`:

- `axm rules new <name>` — scaffold a Rule package in the project workspace.
- `axm rules install [source]` — install one Rule, or reinstall the configured
  set when the source is omitted.
- `axm rules list` — inventory detected Rules and their lifecycle
  classification.
- `axm rules show <name>` — inspect installed state for one Rule.
- `axm rules enable <name>` / `axm rules disable <name>` — activate or
  deactivate an installed Rule.
- `axm rules update [source] [--name <glob>]` — update configured Rules.
- `axm rules uninstall <name>` — remove a Rule.
- `axm rules publish` — publish a project-authored Rule.

## Reconciliation and ownership

The Rules region is an aggregate ownership unit. It contains every active Rule
that desired state routes into the workspace, in deterministic order. Enabling,
disabling, or removing one Rule re-renders the region from the remaining active
set; it never replaces the region with only the Rule being operated on.

AXM preserves authored prose outside its markers. A malformed, duplicate, or
otherwise ambiguous managed region blocks the transition without changing
settings or files. Use `axm lint` for diagnostics and `axm sync --preview` to
inspect reconciliation.

Marker identity is the region name; provenance attributes do not create a
second region. Formatting-only prose wrapping and table padding do not create
drift, and AXM writes no formatter directives.

## Self-containment and Packs

Keep Rule extensions self-contained. If a Rule requires another extension,
follow `axm help packs` for supported direct-sibling Pack composition.
`recommendedPacks` alone does not install the Pack or its members.

## Where to go next

- `axm rules --help` — full Rule command surface
- `axm instructions --help` — global instruction-file management
- `axm help rule-schema` — exact Rule manifest shape
- `axm help settings` — workspace desired state
- `axm help workspace-state` — accepted and observed reconciliation state
- `axm help packs` — extension composition
