---
__default__: patch
---

Compute the Windows installer's SHA-256 verification through .NET
(`System.Security.Cryptography.SHA256`) instead of the `Get-FileHash`
cmdlet, which can fail to resolve in minimal PowerShell environments
without `PSModulePath`/`ProgramFiles`. Completes the checksum-verified
install path introduced alongside `SHA256SUMS` release assets.
