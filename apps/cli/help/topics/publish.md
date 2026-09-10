# Publishing

`axm publish` and each `axm <type> publish` command distribute only extensions
authored by the project workspace. Authorship comes from the configured
exact `workspace` source together with the project `owner`, settings map key,
extension type, and matching manifest in that type's authored root. A canonical
directory alone does not grant publication authority.

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

The package root is the Registry archive boundary. By default every regular
file under it is included, including files outside `src/`. The boundaries are
deliberately different:

| Boundary                        | Meaning                                                     |
| ------------------------------- | ----------------------------------------------------------- |
| Repository or workspace package | Complete authoring source retained locally                  |
| Registry archive                | Package-root files after `publish.ignore` filtering         |
| Canonical Registry installation | Exact contents extracted from the published archive         |
| Agent projection                | Type-specific runtime content, usually selected from `src/` |

Declare Registry-only exclusions in the type manifest:

```jsonc
{
  "publish": {
    "ignore": ["evals/*"],
  },
}
```

This example makes that particular package's `evals/` source workspace-only.
It is not a convention: packages may intentionally ship evaluation material,
and AXM assigns no special behavior to `evals/`, `tests/`, `fixtures/`, or
`benchmarks/`. Use `"ignore": []` to record an explicit reviewed publish-all
decision. Omission also publishes all package-root files.

Ignore patterns are case-sensitive and matched against archive-relative POSIX
paths. `*` is the only wildcard and spans `/`; `?`, brackets, and negation are
literals. A wholly excluded subtree cannot selectively re-include a file.
Patterns affect Registry publication only: they do not alter workspace, Git,
local, import, fork, or agent-projection workflows.

`axm publish --preview --json` reports the complete effective archive:
included paths and sizes, excluded paths and their matching patterns,
per-pattern match counts, unmatched-pattern warnings, counts, source bytes,
ZIP bytes, and final integrity. Text output stays compact; add `--verbose` for
paths. Unmatched patterns warn without changing archive bytes. Likely
development roots without an explicit decision prompt a review but are never
automatically excluded.

## Git source review

For a new upload inside a Git worktree, AXM compares the exact filtered
Registry archive with the package subtree at local Git `HEAD`. Added, modified,
or deleted archive paths mean the release would contain source state that the
current commit does not represent. `axm publish --preview --json` reports the
commit, package directory, difference count, and a bounded list of paths.

Differences excluded by `publish.ignore` do not count. AXM does not inspect a
remote or upstream branch, does not require a clean repository outside the
archive boundary, and does not apply this check to an existing version verified
by `--on-existing verify`. Outside a Git worktree, publication continues without
Git source evidence. A worktree with no `HEAD` commit requires the same explicit
acceptance as a differing archive.

Apply stops before upload unless `--accept-warnings` explicitly accepts this
condition; publish offers no other approval flag. AXM checks the source
evidence again immediately before upload and stops if it changed after
planning.

AXM validates the filtered result as a complete type-specific package before
upload, and Registry ingestion repeats that validation. Ignoring the manifest,
`src/SKILL.md`, `src/<subagent-name>.md`, `src/RULE.md`, a Hook entrypoint, or a
Knowledge root fails before publication.

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
