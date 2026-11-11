# Discovery and granularity

Use this guidance when creating or reorganizing a bundle, deciding a concept
split, or investigating readers choosing the wrong material. These are authoring
heuristics, not extra OKF conformance requirements.

## Choose an independently useful unit

A concept should answer a coherent reader question and carry the context needed
to interpret its answer when retrieved directly. State the subject, applicable
situation, and important boundaries in the body. Do not assume an index or
parent concept has already supplied them.

| Decision | Useful evidence |
|---|---|
| Keep material together | Readers need the parts to understand or perform one coherent task; separating them creates repeated reconstruction. |
| Split concepts | Different selection conditions, scopes, evidence, or maintenance lifecycles make each part independently useful. |
| Link to shared knowledge | Several concepts need the same definition or prerequisite; retain a short local explanation and link to its canonical detail. |
| Add a nested index | Readers recognize a useful grouping and the current page mixes questions or becomes difficult to scan. |

For example, an event that never reached its destination and an event delivered
without an acknowledgement require different decisions. Separate procedures
can expose those conditions in their descriptions. Their shared delivery-state
definitions can remain one reference concept. Splitting every step of either
procedure into a separate concept would make that procedure harder to use.

There is no universal word count, token limit, directory fan-out, or mandatory
retrieval engine. Decide from actual reader tasks. Start with a flat structure
when it remains easy to navigate, and avoid repeating a large parent document
inside every child to make retrieval work.

## Make each discovery surface earn the next read

- Catalog metadata selects the bundle; indexes select a section or concept.
  Concept descriptions distinguish nearby alternatives, not merely the domain.
- Use exact domain identifiers, common symptoms, and meaningful aliases in
  metadata or prose where they help likely queries. Do not fill tags with
  speculative synonyms or introduce a second taxonomy just for search.
- Keep index descriptions synchronized with the canonical concept metadata.
  An overview that explains the domain belongs in a concept linked by the index.
- Express relationships in prose: “Before retrying, check…”, “For delivered
  events, use…”, or “This supersedes…”. A directory tree alone cannot express
  all useful relationships.
- Let search go directly to a concept. Read linked context only when needed
  for the task, and stop when the relevant scope and evidence are sufficient.

## Review the discovery routes

During authoring, follow a likely reader question from the root index. Then
look for the relevant knowledge using a symptom, alias, or identifier instead
of its title. Check that each route leads to a concept whose body supplies the
promised answer and can be understood without its parents.

Compare nearby concepts' previews: do their selection conditions distinguish
them, or is an important fact missing? Preserve uncertainty when the available
facts do not identify the right procedure. Repair misleading previews, missing
context, or unnecessary navigation in the responsible surface. The validator
can check reachability and metadata consistency; author review must judge
whether the distinctions and answers are useful.

## Worked example

The [synthetic delivery bundle](../examples/delivery/index.md) contains two
procedures and one shared reference. Its root index routes by reader need;
the nested guide index distinguishes delivery failure from lost acknowledgement.
It uses file-relative links for ordinary Markdown navigation. All domain rules
are fictional teaching material, not instructions for a real service.

For an event that never arrived, the root and guide indexes lead to the retry
procedure. A search for `response-lost` can go directly to the acknowledgement
procedure, whose body supplies its own scope and cautions about duplicate
application. Both procedures link to the shared state definitions when needed.

## Basis and limits

- [OKF §8](SPEC.md#8-index-files) defines optional indexes for progressive
  disclosure; §6 defines links beyond the directory hierarchy.
- [Context engineering](https://www.anthropic.com/research/effective-context-engineering-for-ai-agents)
  motivates lightweight discovery metadata and selective loading.
- [Contextual retrieval](https://www.anthropic.com/research/contextual-retrieval)
  illustrates loss of meaning when retrieved text lacks its context. Its
  retrieval results are not measured gains for OKF bundles.

The concept-boundary heuristics above are this skill's adaptation of those ideas.
