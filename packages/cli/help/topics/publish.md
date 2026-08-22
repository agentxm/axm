# Publishing

`axm publish` and each `axm <type> publish` command distribute only extensions
authored by the project workspace. Authorship comes from the configured
`workspace:@owner/<plural-type>/<name>` source; a canonical directory alone
does not grant publication authority.

## Selection

With no selectors, publish selects every workspace-authored extension. `--owner`,
`--type`, and `--exclude` narrow that authored set. Explicit names, FQNs, globs,
and per-type selectors must also resolve to workspace-authored extensions.

An explicit installed Registry, Git, or local-source package fails as
`not_authored` before AXM constructs an archive. Run `axm adopt <extension>`
when this workspace should take ownership of retained canonical content. Run
`axm fork <source> <extension>` when the result needs a separate authored
identity.

For packs, `--include-dependencies` adds only selected pack dependencies that
are also workspace-authored. External dependencies remain Registry references;
the Registry still validates their availability and version constraints.

## Archive and existing versions

AXM validates the complete authored selection, constructs one deterministic ZIP
archive per eligible package, and computes its SRI SHA-512 digest before any
upload. Publication never reads an installed external package as a release
input.

Registry releases are immutable. When a selected version already exists,
`--on-existing verify` rebuilds the local authored archive and requires its
SHA-512 digest to equal the published version. A match is a verified successful
no-op. Different authored content at the same version is `integrity_drift` and
blocks the complete selection; increment the authored version rather than
overwriting the release. `--on-existing error` makes any existing version a
conflict.

Archive integrity and installed content have different lifetimes. AXM verifies
downloaded Registry archive bytes before extraction. Extracted canonical files
are mutable observed materialization, so local formatter changes are drift and
are not continuously compared with the published ZIP digest.

## Where to go next

- `axm publish --help` — root selectors, filters, preview, and Registry options
- `axm <type> publish --help` — type-specific selectors and options
- `axm help workspace-state` — desired, accepted-resolution, and observed state
- `axm help packs` — authored dependency inclusion and Registry validation
