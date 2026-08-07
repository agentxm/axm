---
type: Domain Concept
description: How extension visibility works on the AgentXM registry — the two-value public/private perimeter, hidden existence, visibility defaults, mutability, and how yank and deprecation differ.
tags: [visibility, discovery, private, public, yank, deprecation, access]
status: stable
generated:
  by: claude/fable-5
  at: 2026-08-06T13:04:04Z
---

# Visibility and discovery

Every AgentXM extension carries a two-value **visibility**: `public` or
`private`. One perimeter governs _both_ read access and discovery — there is
no separate discovery flag, and intentionally no "published and fetchable but
hidden from listings" state.

- **Public** extensions are readable and discoverable by anyone,
  authenticated or not.
- **Private** extensions are readable and discoverable only by principals the
  owning account has authorized. Direct-FQN reads, catalog search, web
  listings, and MCP lookup all apply the same predicate.
- **Hidden existence:** to anyone without read access, a private extension is
  indistinguishable from a nonexistent one — on lookup, search, listings, and
  MCP alike.

Registry **Libraries** follow the identical model: one `public`/`private`
value is their single access-and-discovery perimeter, with no "public but
unlisted" state.

## Defaults and mutability

- The platform default visibility is `public`; an account may set its own
  default. Precedence for a first publish: explicit publish value, then owner
  account default, then platform default. Defaults seed the initial publish
  only — they never retroactively change existing extensions.
- Visibility is mutable in both directions on the extension. Making a private
  extension public immediately exposes all of its historical versions, so it
  requires explicit confirmation. Making a public extension private breaks
  outside installs.
- Published versions themselves are immutable, and every published coordinate
  is permanently claimed — see
  [Handles and ownership](handles-and-ownership.md).

## Yank vs. deprecation vs. visibility

| Mechanism   | Granularity                                        | Effect                                                                                                                                             |
| ----------- | -------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| Visibility  | Whole extension                                    | Who can see and fetch it at all                                                                                                                    |
| Yank        | Exact version (or an atomic all-versions snapshot) | "Stop using this" — yanked versions stop resolving for new installs; exact yanked references remain fetchable by authorized readers with a warning |
| Deprecation | Metadata                                           | Warning-only guidance to move on; nothing stops resolving                                                                                          |

Yank is the version-level withdrawal mechanism; visibility is never used to
simulate it.
