# Engineering routing skill maintenance

Before changing this package, read the
[Agent extension enablement architecture](../../docs/architecture/extension-enablement.md).
It owns the routing skill's responsibility and its relationship to the knowledge
bundle, AXM skill, CLI help, and website docs.

This file is repository maintainer guidance. Keep it outside `src/` and excluded
from publication.

Use the [Agent Extension Glossary](../../knowledge/agent-extension-engineering/src/glossary.md)
for shared meanings. The CLI help and AXM skill reference are generated copies;
change the canonical concept and regenerate with `cli:generate`.
