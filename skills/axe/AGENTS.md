# Engineering routing skill maintenance

Before changing this package, read the
[Agent extension enablement architecture](../../docs/architecture/extension-enablement.md).
It owns the routing skill's responsibility and its relationship to the knowledge
bundle, AXM skill, CLI help, and website docs.

This file is repository maintainer guidance. Keep it outside `src/` and excluded
from publication.

When changing a route, start with a request an extension author would make.
Follow it to the concept and check that the author can act on the answer.
Try a nearby request with a different destination. Add a routing cue when
the distinction changes which guidance the reader needs.

The [discovery and execution trials](evals/2026-11-18/README.md) record the
README routing comparison and the review router change. When a review misses
something, capture a fresh case first. Add a standing instruction when varied
cases show a recurring miss and a comparison improves detection while
preserving focused and clean reviews.

Use the [Agent Extension Glossary](../../knowledge/agent-extension-engineering/src/glossary.md)
for shared meanings. Keep definitions in that knowledge concept and maintain
consistent terminology in documentation, help, skills, and product copy.
