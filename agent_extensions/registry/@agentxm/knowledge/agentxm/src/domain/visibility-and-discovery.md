---
type: Domain Concept
description:
  How extension and Library visibility works on the AgentXM registry — the
  public/private perimeter, hidden existence, and how visibility differs from
  archive, hold, deletion, yank, deprecation, and Library curation archival.
tags:
  [
    visibility,
    discovery,
    private,
    public,
    yank,
    deprecation,
    archive,
    hold,
    deletion,
    access,
    library,
  ]
status: stable
generated:
  by: openai/codex
  at: 2026-09-25T13:00:00Z
---

# Visibility and discovery

Every AgentXM extension carries a two-value **visibility**: `public` or
`private`. One perimeter governs _both_ read access and discovery — there is no
separate discovery flag, and intentionally no "published and fetchable but
hidden from listings" state.

- **Public** extensions are readable and discoverable by anyone, authenticated
  or not.
- **Private** extensions are readable and discoverable only by principals the
  owning account has authorized. Direct-FQN reads, catalog search, web listings,
  and MCP lookup all apply the same predicate.
- **Hidden existence:** to anyone without read access, a private extension is
  indistinguishable from a nonexistent one — on lookup, search, listings, and
  MCP alike.

Registry **Libraries** follow the identical model: one `public`/`private` value
is their single access-and-discovery perimeter, with no "public but unlisted"
state.

## Whole-extension lifecycle

A publisher can **archive** an extension to declare it finished. Archive is a
reversible write-freeze, not a withdrawal: the extension remains visible under
its existing access perimeter, and consumers can still discover, resolve,
install, and update to its published versions. The archived state and optional
publisher reason are visible to consumers. While archived, the publisher cannot
publish another version, change visibility, or unyank a version; deprecation,
yank, access removal, deletion, and reads remain available.

A publisher can **delete** a whole extension only before anyone could have come
to depend on it: while nothing is published, or within 24 hours of its first
published version while no other extension depends on it. The rule is the same
for public and private extensions, on the web and from the CLI. Deletion is
immediate and cannot be undone: every published version is permanently retired,
the name is held for 24 hours before anyone can reuse it, and the owner — for an
Organization, every administrator — is notified. Past that point a publisher
deprecates or archives the extension instead, or asks AgentXM support to remove
it.

A platform **hold** is reversible containment of one extension. A held extension
leaves discovery and resolution, new archive fetches are refused, and publisher
changes are frozen. A hold does not change the publisher identity, erase
published history, or alter copies already installed. Releasing it reveals the
publisher's archive and deprecation state exactly as they remained underneath.
Public responses disclose only the held state and any public-safe notice, never
private investigation details.

## Library curation lifecycle

Library archival means **no longer curated**. It is separate from visibility and
access: archiving leaves the Library page, its public/private perimeter, account
access, and current extension membership unchanged. The archived state is
visible on public and management surfaces, with an optional curator reason.

While archived, curator changes to the Library title, description, visibility,
or extension membership are frozen. A curator can restore the Library to resume
those changes, or permanently delete it while it remains archived. Repeating an
archive or restore request is safe and converges on the requested state.

Deletion removes the Library and its membership. Its name then follows the reuse
hold described in [Handles and ownership](handles-and-ownership.md).

## Defaults and mutability

- The platform default visibility is `public`; an account may set its own
  default. Precedence for a first publish: explicit publish value, then owner
  account default, then platform default. Defaults seed the initial publish only
  — they never retroactively change existing extensions.
- Visibility is mutable in both directions on the extension. Making a private
  extension public immediately exposes all of its historical versions, so it
  requires explicit confirmation. Making a public extension private breaks
  outside installs.
- Published versions themselves are immutable, and every published coordinate is
  permanently claimed — see [Handles and ownership](handles-and-ownership.md).

## Deprecation guidance

Deprecation belongs to an extension identity rather than to any one published
version. Every deprecation has a reason:

| Reason         | Replacement                  | Publisher notes | Consumer action                |
| -------------- | ---------------------------- | --------------- | ------------------------------ |
| `superseded`   | Required; any extension type | Optional        | Migrate to the named extension |
| `obsolete`     | None                         | Required        | Remove the extension           |
| `unmaintained` | Optional                     | Optional        | Choose a successor manually    |
| `other`        | Optional                     | Required        | Read the notes and choose      |

The replacement is another exact extension identity in the same Registry; it is
guidance, not an identity rename, redirect, or dependency. A directly installed
consumer can preview `axm migrate <fqn> --dry-run`, then apply
`axm migrate <fqn>` for `superseded` or `obsolete`. Migration installs the
replacement at the source's workspace scope and agent targets before removing
the source as one plan, or just removes an obsolete source. It refuses a Pack
member; the Pack publisher must update its dependency. It also refuses
`unmaintained` and `other`, which require a human choice, and a `superseded`
extension whose replacement is unavailable or concealed.

Deprecation starts a period that continues while its guidance is edited.
Restoring the extension ends that period, and deprecating it again starts a new
one. The state is warning-only: it does not change version selection, artifact
availability, exact-reference behavior, or authorization.

Replacement disclosure follows the same visibility perimeter as any other
extension read. A reader who cannot see the replacement learns only that the
guidance is unavailable, not its identity. If the replacement later becomes
unreadable, deprecated, unresolved, or deleted, consumers retain the source
deprecation but treat the replacement as unavailable. Reusing the replacement's
former spelling for a different identity does not make the old guidance point to
the new extension.

## Lifecycle mechanisms compared

| Mechanism         | Granularity                                        | Effect                                                                                                                                             |
| ----------------- | -------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| Visibility        | Whole extension or Library                         | Who can see and fetch it at all                                                                                                                    |
| Extension archive | Whole extension identity                           | Publisher-declared write-freeze; published versions remain discoverable and available with an archived notice                                      |
| Platform hold     | Whole extension identity                           | Reversible containment; removes discovery and refuses new resolution and fetches while preserving identity and history                             |
| Yank              | Exact version (or an atomic all-versions snapshot) | "Stop using this" — yanked versions stop resolving for new installs; exact yanked references remain fetchable by authorized readers with a warning |
| Deprecation       | Whole extension identity                           | Warning-only guidance to move on; nothing stops resolving                                                                                          |
| Library archival  | One Library                                        | Marks curation as ended and freezes curator changes without changing visibility, access, or current membership                                     |

These states stay independent. Archive does not imply deprecation, hold does not
overwrite publisher intent, yank remains version-level withdrawal, and
visibility is never used to simulate a lifecycle state.
