---
type: Decision
status: stable
description: The accepted decision to develop, test, and publish AXM against a single Node 24 floor, with `engines.node`, the `mise.toml` pin, and the `@types/node` ceiling moving as one.
---

# Node runtime floor is Node 24

## Context and forces

`mise.toml` pinned Node `22.23.2` while every package manifest declared
`engines: { "node": ">=22.19.0" }` and the pnpm catalog declared
`@types/node` `26.1.1` — types two majors ahead of the runtime, arrived at by
drift rather than by decision. Four forces bear on the floor:

- **`engines.node` is a published contract, but a narrow one.** Of the five
  documented install paths, only `npm install -g axm.sh` reads it. The install
  script and the Homebrew tap deliver a self-contained compiled binary and
  never consult it. On the npm path the published `bin` is
  `dist/src/main.js`, a real Node program, so the user's own Node runs it.
- **The break is warning-level, not a refusal.** npm treats an unsatisfied
  `engines` range as an `EBADENGINE` warning; it fails the install only when
  the user has set `engine-strict=true`. The repository ships no `.npmrc` that
  changes this for consumers.
- **Nothing exercised the declared floor.** Every CI job takes its Node from
  `mise.toml` through the `setup-workspace` composite, and there is no
  Node-version matrix. A floor below the `mise.toml` pin is a claim no test
  makes.
- **The types decide what the compiler will admit.** `@types/node` 26 against
  a Node 22 floor lets the compiler accept a `node:` API that the floor does
  not ship. The gap is a correctness hole, not a cosmetic mismatch.

Node 22 entered maintenance; Node 24 is the active LTS line, and
`agentxm-internal` already develops on `24.19.0`.

## Accepted choice

One floor, declared once and exercised where it is declared:

- `mise.toml` pins Node `24.19.0`, matching `agentxm-internal` exactly so the
  two repositories share one toolchain cohort.
- Every package manifest declares `engines: { "node": ">=24.19.0" }` — ten
  manifests, including the published `axm.sh`.
- The pnpm catalog declares `@types/node` `24.13.6`, on the 24 line, so the
  compiler admits only what the floor ships. The entry is an exact version
  rather than a range because the `overrides:` convergence entry
  `"@types/node@": "catalog:"` refuses anything else.
- `publish.yml`'s two Windows release-verification jobs carry the
  `node-version: 24.19.0` literal copies that `check:ci-toolchain` holds to
  `mise.toml`.
- `engines.node` and the `mise.toml` pin are the same version by construction,
  so CI exercises the CLI on exactly the floor it declares.
- Runtime declarations remain under manual authority;
  [Dependabot](../../../.github/dependabot.yml) caps `@types/node` at `<25`.
  Raise the runtime floor, development pin, and types ceiling in one change.

Bun stays at `1.3.14`. It compiles the released binaries and moves under its
own change with its own release verification.

Accepting authority: maintainer approval through the repository pull-request
workflow.

## Rationale

Raising the floor and raising the development pin together is the only
arrangement in which the declaration is true. The alternative preserves reach
for Node 22 npm users, but it does so by keeping a claim that no CI job tests
and by holding `@types/node` down to the 22 line anyway — paying the types
cost without buying a tested guarantee. Declaring `>=24.19.0` costs a
warning on one of five install paths, for users on a runtime that entered
maintenance, and it closes the two-major types gap as a consequence rather
than as separate work.

Pinning `24.19.0` rather than the newer `24.21.0` is a parity choice: it
leaves zero divergence from `agentxm-internal` today and makes any later patch
move one coordinated change across both repositories.

## Material alternatives

- **Keep `engines: >=22.19.0` and raise only the development runtime.**
  Rejected: it preserves reach, but the floor stays untested unless a Node 22
  CI matrix is added, and `@types/node` must still drop to the 22 line to keep
  the compiler honest. It adds two obligations to buy a guarantee the
  repository would not actually be making.
- **Raise `@types/node` toward the runtime instead of down to the floor.**
  Rejected: the types exist to refuse an API the floor lacks. Any version above
  the floor's line reintroduces the hole this decision closes.
- **Pin `24.21.0`, the newest Node 24 patch.** Rejected for now: it reopens
  divergence with `agentxm-internal` at `24.19.0` for no benefit this change
  needs. Both repositories move together when they move.

## Consequences

- A user installing through `npm install -g axm.sh` on Node 22 sees an
  `EBADENGINE` warning, and an install fails outright only under
  `engine-strict=true`. The install script and Homebrew paths are unaffected.
- `apps/cli/site-content/install.md` states the `≥24.19.0` requirement on the
  npm option, so the published guidance and the manifest agree.
- The compiler now refuses `node:` APIs newer than the 24 line. Code written
  against the former `@types/node` 26 surface that relied on such an API fails
  type checking and must be rewritten against the floor.
- Raising the floor again is one change touching `mise.toml`, ten `engines`
  declarations, the `@types/node` catalog entry and its Dependabot ceiling,
  `publish.yml`'s two literal copies, `CONTRIBUTING.md`, and `install.md`.
  `check:ci-toolchain` fails the build if the `mise.toml` and `publish.yml`
  copies disagree.

## Supersession and reconsideration

Reconsider when Node 24 leaves active LTS and Node 26 becomes the line the
repository develops on, or if evidence appears that a material share of npm
installs come from Node 22 — in which case the reach argument acquires the
weight it does not have today. Reconsider the `24.19.0` patch choice whenever
`agentxm-internal` moves its own pin; the two are raised together.
