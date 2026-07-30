---
__default__: patch
---

Fix the Windows installer's checksum verification: the SHA256SUMS accumulator
shadowed PowerShell's automatic `$Matches` variable (variable names are
case-insensitive), so every checksum-verified install failed with "A hash
table can only be added to another hash table". First surfaced by the
cli-v0.24.0 installer verification; npm, Homebrew, and macOS/Linux script
installs were unaffected.
