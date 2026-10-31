# AXM skill maintenance

Before changing this package, read the
[Agent extension enablement architecture](../../docs/architecture/extension-enablement.md).
It owns this skill's responsibility and its boundaries with CLI help, the
engineering collection, and website docs.

This file is repository maintainer guidance. Keep it outside `src/` and excluded
from publication; shipped agent instructions belong in `src/SKILL.md` and its
selected references.

Use the [Agent Extension Glossary](../../knowledge/agent-extension-engineering/src/glossary.md)
for shared meanings. The CLI help and AXM skill reference are generated copies;
change the canonical concept and regenerate with `cli:generate`.
