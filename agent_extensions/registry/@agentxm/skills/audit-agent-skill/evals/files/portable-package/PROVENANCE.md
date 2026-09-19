# Synthetic release provenance

- Canonical source: `https://example.invalid/example/local-markdown-formatter`
- Publisher: `@example`
- Release: `v1.0.0`
- Acquisition: synthetic pinned release files copied into this isolated fixture
- Archive identity: `sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa`
- Signature: not supplied; independent publisher verification is outside this fixture
- Review: script, instructions, manifest, and license reviewed as one release
- Update policy: explicit pinned updates only; no mutable remote resources
- Rollback: the synthetic `v1.0.0` source files are retained under the package's computed content identity

The archive identity is a declared upstream locator, not independently verified
evidence. The auditor must compute a separate content identity for the exact
files it inspects and retain signature verification as an explicit condition.
