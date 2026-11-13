# Shared verification evidence

[Download the retained archive](shared-observability-evidence.tar.gz) and extract
it into an empty directory with `tar -xzf`. Its README maps each claim to exact
receipts, receiver payloads, independent oracles, commands, source snapshots and
results. The [claim index](claim-index.json) is also available without extraction.

SHA-256: `52be229a5f75879bf639037b6f7bda7062e965432d3ec648aff0ff812d3658d5`.
The [archive verification](archive-verification.json) records deterministic
rebuilding and complete member/hash readback.

The archive retains the six-case Seq suite, separate authenticated captures,
bounded shutdown observations, native-platform evidence and later owner checks.
These have their original revisions; they do not certify final integration or
isolated elapsed/RSS overhead. Owner logs do not independently embed per-run
source attestations. The standalone readiness workflow removed its temporary raw
receipt/query files; separate authenticated captures retain their raw evidence.
ARM64/macOS evidence is job/step metadata, with Linux/Windows command logs.

Platform log copies explicitly omit unrelated remote-branch inventory and
coordination labels. The [redaction manifest](redaction-manifest.json) records
original and projected hashes and exact line changes. Raw originals remain
local; the public archive contains only the declared projections. Failure
controls and platform-inapplicable skips retain their actual outcomes.
