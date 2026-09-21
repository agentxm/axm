---
__default__: major
---

Raise the supported Node runtime floor to 24. `axm.sh` now declares
`engines: { "node": ">=24.19.0" }`, so installing through npm on Node 22
reports `EBADENGINE`. The install-script and Homebrew distributions ship a
self-contained binary and are unaffected.
