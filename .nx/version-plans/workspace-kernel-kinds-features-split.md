---
__default__: major
---

Split the workspace package into `@agentxm/workspace-kernel`, `@agentxm/extension-kinds`, and `@agentxm/workspace-features`, each exposing one entry point per slice. Consumers of the unstable programmatic APIs must adopt the new package coordinates and slice entry points.
