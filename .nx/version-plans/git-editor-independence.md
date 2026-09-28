---
__default__: patch
---

Git-backed commands and `axm publish` source-state checks no longer fail when the shell exports `EDITOR`, `VISUAL`, `GIT_EDITOR`, or `GIT_SEQUENCE_EDITOR`. When publish cannot assess an extension's source state, it now reports Git's reason, with URL passwords redacted.
