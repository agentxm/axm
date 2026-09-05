---
type: Decision
status: stable
description: AXM human output is a typed document painted by one terminal owner, while machine output remains schema-backed and Ink remains deferred.
depends-on:
  - ../commands/output.md
  - ../package-architecture.md
  - ../system-wide/testing-strategy.md
---

# CLI output view model and terminal ownership

## Context and forces

AXM commands produce structured operation results, but human presentation was
assembled through imperative renderer calls distributed across command
handlers. Progress animation, logs, prompts, errors, and result text could
write independently to the same process streams. The arrangement made layout
and vocabulary depend on call order, allowed diagnostics to interrupt animated
lines, and coupled command features to terminal mechanics.

The output architecture must keep feature results typed, preserve published
machine documents and events, present useful static output when animation is
unavailable, and allow terminal rendering to evolve without another command-
wide migration.

## Accepted choice

Human presentation crosses the application boundary as a typed `Doc` tree.
Feature-owned views translate typed results into semantic nodes; they do not
emit terminal escapes, padding, or process-stream writes. A pure text painter
turns the tree into interactive or plain text.

One application-owned `Screen` service owns stdout, stderr, the append-only
transcript, live task frame, prompts, and Effect log forwarding after runtime
startup. Human primary results use stdout. Progress, diagnostics, warnings,
instructions, logs, and errors use stderr. Every write cooperates with the live
frame so transcript output is inserted above it and interruption restores the
cursor.

Machine output remains a separate projection of the same typed result. It
continues to use schema-backed stdout documents and structured stderr events;
the human `Doc` is never parsed or serialized to produce machine output.

Adopting Ink is deferred. The `Doc` tree is the feature-to-output contract, so
a future Ink renderer can replace the painter and frame without changing
feature views or machine schemas.

Accepting authority: maintainer approval of the output redesign. Existing
executable specifications continue to own published machine behavior; this
record does not add or revise a requirement.

## Rationale

A semantic document makes output structure testable without freezing terminal
bytes or spreading paint decisions through features. One terminal owner makes
frame, transcript, prompt, logging, resize, and shutdown behavior coherent.
Keeping machine encoding beside the typed result preserves its independent
contract authority. Deferring a terminal framework avoids making a dependency
choice before the view-model boundary proves sufficient.

## Material alternatives

- **Keep the imperative renderer and add a write mutex.** This would prevent
  some byte interleaving but would retain call-order composition, duplicated
  vocabulary, and feature ownership of terminal layout. Rejected.
- **Adopt Ink as the feature contract.** Components would provide a live tree,
  but feature code would become coupled to one terminal framework before the
  semantic output model is established. Rejected for now.
- **Render machine output from human documents.** One visible representation
  would appear simpler, but terminal wording and layout would become wire
  contracts and schema authority would be lost. Rejected.
- **Let stdout and stderr have independent owners.** This cannot keep a result
  write from landing inside a live stderr frame when both streams share one
  terminal. Rejected.

## Consequences

Positive:

- feature views own meaning while the painter owns formatting;
- interactive and plain modes paint the same document;
- one serialized write path preserves transcript and live-frame integrity;
- human vocabulary and layout can evolve independently of machine schemas;
  and
- a future Ink renderer is a bounded painter replacement.

Negative:

- every human-output call site must migrate to typed views;
- the application owns a scoped coordination service with resize, prompt, and
  shutdown behavior that needs focused testing; and
- code that writes directly to process streams after runtime startup violates
  the boundary and must be prevented by repository enforcement.

## Supersession and reconsideration

Reconsider the painter choice when the typed document and live-frame model are
stable and prompt behavior supplies evidence that a component renderer would
reduce complexity. Reconsider the single-owner boundary only if stdout and
stderr can no longer share a terminal or the CLI moves to a transport that
does not expose terminal state. Any superseding decision must preserve the
independent authority of schema-backed machine output.
