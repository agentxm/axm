---
__default__: patch
---

`axm lint` judges official AXM skill compatibility only from the package the workspace's settings and lock state select, so a stale extra copy on disk no longer fails or rescues it, and findings name that package's path. `axm skills install @agentxm/skills/axm --bundled` now verifies the installed skill bytes and restores the workspace if they are not the bundled, compatible release.
