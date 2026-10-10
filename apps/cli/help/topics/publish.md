# Publishing

`axm publish` can publish an existing skill directory with `--path`, or select
extensions authored by the project workspace. Each `axm <type> publish` command
selects from the authored workspace. Authorship comes from the configured
exact `workspace` source together with the project `owner`, settings map key,
extension type, and matching manifest in that type's authored root. A canonical
directory alone does not grant publication authority.

## Existing skill directories

Supply the publisher identity and version separately from the existing source:

```bash
axm publish @acme/skills/review --path ./review --package-version 1.0.0 --preview
axm publish @acme/skills/review --path ./review --package-version 1.0.0
```

The directory must contain `SKILL.md`. No setup, upstream `skill.json`, or source
conversion is required. AXM retains the original body, descriptive metadata,
supporting files, executable modes, empty directories, and contained relative
links. It wraps that payload under `src/` in the archive and generates a separate
`skill.json` with the supplied publisher identity and version. The source stays
unchanged and does not become workspace-authored.

This mode requires one skill FQN, `--path`, and `--package-version` together.
Selection filters and dependency expansion do not apply. `--version` still
reports the CLI version. Use `--registry NAME_OR_URL` to select the
Registry; publication to a remote Registry still requires its normal publisher
authorization. Preview does not upload anything.

Git's `.git` administration entry is excluded and reported in the archive
inventory. Other payload content remains subject to the normal archive safety
checks. Links outside the supplied skill directory are refused; supplying a
plugin component alone does not make its sibling resources part of that directory.

## Configured selection

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

## Existing versions

Registry releases are immutable. For each selected package, AXM reads and
decodes the manifest, checks it against the configured identity, and looks up
the manifest version in the Registry before any other preparation. Existing-directory
publication uses the supplied identity/version envelope for this check:

| Registry state of the manifest version               | Outcome                                        |
| ---------------------------------------------------- | ---------------------------------------------- |
| Published, including yanked                          | Successful skip, reported as already published |
| Not published, at or above the highest published one | Prepared and uploaded                          |
| Not published, below the highest published one       | Conflict unless `--backfill` is supplied       |

The rule is the same for bare, filtered, and explicit selections, for the root
and every `axm <type> publish` command, and for dependencies added by
`--include-dependencies`. Naming an already-published version is a successful
skip with exit code 0. A malformed manifest or a mismatched identity still
fails.

AXM does not lint, build, validate, or review an already-published version, so
local content at that version does not affect the outcome and is never
shipped. To publish local edits from an existing directory, supply a new
`--package-version`. For an authored workspace package, increment its manifest
version, for example with `axm version <fqn> patch`, and publish again.

Only versions that will upload are built and validated; workspace-authored
packages also run authoring lint. AXM prepares all of them before the first upload. A preparation failure in any of
them blocks every upload; an already-published version never causes that block. When
execution partially succeeds, run the same command again: uploaded versions are
then skipped as already published and the remaining ones upload.

## Archive

For each version that will upload, AXM constructs one deterministic ZIP archive
and computes its SRI SHA-512 digest before any upload. Configured publication
does not select installed external packages as release inputs.

For workspace-authored packages, the package root is the Registry archive
boundary. Default selection applies repository `.gitignore` patterns to every
path, including tracked files. Executable modes, retained empty directories,
and contained link targets are preserved. The boundaries are
deliberately different:

| Boundary                        | Meaning                                                                  |
| ------------------------------- | ------------------------------------------------------------------------ |
| Repository or workspace package | Complete authoring source retained locally                               |
| Registry archive                | Package-root files after `publish.include` / `publish.exclude` filtering |
| Canonical Registry installation | Exact contents extracted from the published archive                      |
| Agent projection                | Type-specific runtime content, usually selected from `src/`              |

Use the type manifest to select Registry distribution files:

```jsonc
{
  "publish": {
    "include": ["/src/", "/dist/", "/README.md", "/LICENSE"],
    "exclude": ["*.test.ts", "*.map"],
  },
}
```

| Declaration               | Selection                                                           |
| ------------------------- | ------------------------------------------------------------------- |
| `include` omitted         | Apply repository-root, ancestor, and nested `.gitignore` files      |
| `include: []`             | Only the automatically retained type manifest                       |
| `include: ["**"]`         | All otherwise-permitted content, bypassing Git ignores              |
| Other `include` array     | Ordered allowlist; positive patterns select and `!` patterns remove |
| `exclude` omitted or `[]` | No additional exclusions                                            |
| Other `exclude` array     | Ordered exclusions; `!` restores an already selected path           |

Exclusions run after inclusion. The type manifest is automatic, so an allowlist
need not name it; a final exclusion that removes it is an error. Other required
content must survive filtered-package validation. `evals/`, `tests/`,
`fixtures/`, and `benchmarks/` have no special selection behavior.

Patterns follow case-sensitive [Git ignore grammar](https://git-scm.com/docs/gitignore):
`*` and `?` match within a path segment, brackets match character classes, `**`
can span directories, a leading `/` anchors at the rule's root, and a trailing
`/` matches directories rather than same-named files or links. Dotfiles match
normally. Backslashes escape literal leading `#` or `!` and trailing spaces;
blank lines and comments are ignored. Rules are ordered. An exclusion cannot
restore a child while its parent remains excluded: restore the parent first.
An include allowlist's negative rules can narrow a selected directory.

Authored content uses the nearest enclosing repository as its ignore boundary,
including linked worktrees and nested repositories. Outside Git, discovery
stops at the declared source directory. Nested ignore files retain their own
rule bases. Global ignores and `.git/info/exclude` never participate. Linked
`.gitignore` files are refused. Git administration entries are omitted without
traversing their contents; other subtrees are inventoried eagerly, including
excluded paths, so unreadable or unsafe source entries still refuse publication.
A retained link to content removed by selection is refused. Existing safety
checks still reject included `node_modules` and `.env` entries.

For `--path`, repeat `--include-path` and `--exclude-path` to supply the same
ordered selection policy against original source paths. For example:

```bash
axm publish @acme/skills/review --path ./review --package-version 1.0.0 \
  --include-path '**' --exclude-path '*.map' --preview
```

The flags are available only with `--path`. Ignore rules are evaluated before
the `src/` envelope mapping; previews retain source and archive paths, and the
generated manifest records envelope-relative explicit policy. The generated
envelope is mandatory; an upstream manifest follows ordinary source selection.
Selection affects only publication, leaving acquisition, import, fork, and projection intact.

`axm publish --preview --json` reports the complete effective archive:
included paths and sizes, excluded paths and their matching patterns,
per-pattern match counts, unmatched-pattern warnings, counts, source bytes,
ZIP bytes, and final integrity. Text output stays compact; add `--verbose` for
paths. Unmatched explicit manifest patterns warn without changing archive bytes. Likely
development roots without an explicit decision prompt a review but are never
automatically excluded.

## Git source review

For a new upload inside a Git worktree, AXM compares the exact filtered
Registry payload with the package subtree at local Git `HEAD`. For `--path`,
comparison uses the original directory and excludes the generated envelope.
Link targets and executable modes participate in comparison. Added, modified,
or deleted archive paths mean the release would contain source state that the
current commit does not represent. `axm publish --preview --json` reports the
commit, package directory, difference count, and a bounded list of paths.

Differences excluded by `publish.include` / `publish.exclude` do not count. AXM does not inspect a
remote or upstream branch, does not require a clean repository outside the
archive boundary, and does not review a version the Registry already has.
Outside a Git worktree, publication continues without
Git source evidence. A worktree with no `HEAD` commit requires the same explicit
acceptance as a differing archive.

Apply stops before upload unless `--accept-warnings` explicitly accepts this
condition; publish offers no other approval flag. AXM checks the source
evidence and rediscovered default ignore policy immediately before upload,
and stops if source bytes or any effective policy input changed after planning.
Adding, deleting, or editing an ancestor or nested ignore file invalidates a
prepared default selection, even outside Git. Explicit includes bypass ignore
discovery and instead revalidate their declared policy and selected bytes.

AXM validates the filtered result as a complete type-specific package before
upload, and Registry ingestion repeats that validation. Ignoring the manifest,
`src/SKILL.md`, `src/<subagent-name>.md`, `src/RULE.md`, a Hook entrypoint, or a
Knowledge root fails before publication.

Archive integrity and installed content have different lifetimes. AXM verifies
downloaded Registry archive bytes before extraction. Extracted canonical files
are mutable observed materialization, so local formatter changes are drift and
are not continuously compared with the published ZIP digest.

## Where to go next

- `axm publish --help` — root selectors, filters, preview, and Registry options
- `axm <type> publish --help` — type-specific selectors and options
- `axm help workspace-state` — desired, accepted-resolution, and observed state
- `axm help packs` — authored dependency inclusion and Registry validation
