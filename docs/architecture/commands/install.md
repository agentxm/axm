---
type: Architecture
status: stable
description: How AXM install expresses direct extension intent and realizes the affected workspace state.
depends-on:
  - ./overview.md
  - ../workspace/invariants.md
  - ../extensions/source-compatible-distribution.md
---

# Install

`axm install <source>` and all seven typed install routes require an explicit
source. A cloned workspace realizes its configured state with `axm sync`;
`axm update --reinstall` reacquires accepted external content.

Installation expresses that an extension should be directly desired in the
selected workspace scope. It then realizes the selected extension and the other
extensions that must change with it.

## Responsibilities

Install:

- adds or updates the extension's direct workspace configuration;
- resolves Pack members and an exact allowed version when needed;
- records the accepted immutable external resolution in the authoritative
  lockfile;
- materializes canonical extension content and required agent projections; and
- applies the affected semantic mutation closure atomically.

Installing an extension already desired at the requested constraint preserves
its satisfying accepted resolution. When its content and projections are valid,
this is a successful no-op without source resolution or acquisition. Missing or
drifted acquired content is restored from the exact accepted identity; failure
to obtain that identity does not authorize a newer one. Supplying a different constraint explicitly authorizes
changing that durable choice; it does not require a replacement override.

Inline MCP definitions are authoritative configuration and have no external
source to acquire. Sync reconciles their projections.

## Non-responsibilities

Install does not repair unrelated workspace state, adopt existing unowned
content, publish extensions, or advance other satisfying resolutions merely
because newer releases exist. It does not overwrite workspace-authored or
unowned content.

## Scope and symmetry

Install preflights only the invariants required for the selected extension and
the other extensions that must change with it. Unrelated invalid extensions do
not block a valid install.

The root command is the normal fully qualified extension surface. A type
command group may accept additional type-specific inputs, but both forms
express the same durable intent and produce the same underlying plan and result.

## What a source offers

A source offers the extensions it authors. A source that is an AXM workspace
authors what its configured type directories hold, and nothing elsewhere in the
repository. It also holds packages it acquired from other publishers beneath
its install root; discovery reports them as held, because a Pack beside them
may inherit them as members, but neither `--all` nor the selection question
takes them. They stay installable by name, and they arrive with a Pack that
depends on them. [Source-compatible distribution](../extensions/source-compatible-distribution.md#discovery-semantics)
owns how discovery decides both.

Every installable type opens the source before anything is chosen. Names and
patterns select within their type. `--all` takes every offered Pack and every
other offered extension no Pack among them brings, so nothing becomes desired
both directly and through a Pack unless a person chose it twice; a member
chosen both ways keeps both routes and settles as one unit. `--all` and a
per-type selector do not combine. A request that leaves the choice open asks
once, with Packs first.

MCP convenience flags distinguish literal inputs from host environment
references: `--bind INPUT_ID=VALUE` pairs with `--bind-env INPUT_ID=ENV_NAME`,
and `--header NAME=VALUE` pairs with `--header-env NAME=ENV_NAME`. These values
split on the first `=`; subsequent separators belong to the value. Inline
`--env NAME` records a host environment reference, while `--env KEY=VALUE`
records a literal. References are stored symbolically rather than read from
the CLI process environment.

Skill installation and the configured update sweep share the skill
application's planning and the same transactional materialization path. The
application owns skill selection, recipient diagnostics, and artifact meaning.
Install declares direct intent; update re-declares the intent the workspace
already recorded and advances its accepted resolution. The shared transaction
machinery owns settlement and restoration, without deciding whether a skill
declaration should change.

Install and reinstall expose neutral skill-acquisition observations after
settlement. A native-output repair retains its accepted source identity and
does not count as a fresh install; update marks freshly reacquired skills as
reinstalls. CLI telemetry consumes these facts without owning settlement.

## Specifications

The `cli/install/*` specifications own install's binding obligations — recorded
intent and realized state (`cli/install/direct-intent-recorded-and-realized`),
pure preview (`cli/install/preview-is-pure`), idempotence
(`cli/install/reinstall-is-idempotent`), preservation of unrelated and unowned
state (`cli/install/preserves-unrelated-and-unowned-state`), parity between
root and type-specific forms (`cli/install-forms-express-same-intent`), what a
source offers and how a request selects from it
(`cli/install/selects-requested-source-extensions`), and the single selection
question (`cli/install/source-selection-is-one-question`). The
[specification catalog](../../../specifications/catalog.md) resolves each
identity to its owning project and file.
