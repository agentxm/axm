# Publishing and Registry lifecycle

Read for publication, archive selection, or Registry lifecycle work, after the
entry skill has resolved authority, identity, and scope.

For publication, distinguish the complete repository package, the filtered
Registry archive, the canonical installation extracted from that archive, and
the type-specific agent projection. `publish.include` and `publish.exclude`
control only Registry distribution. Omitted include uses applicable repository
`.gitignore` rules; explicit include bypasses them, with `[]` selecting only the
mandatory manifest and `["**"]` selecting all permitted content. Ordered,
case-sensitive Git-style excludes run afterward. AXM gives `evals/` and other
development names no special treatment. Use `axm help publish` and inspect
`axm publish --preview --json` for rule origins, selected paths, unmatched
explicit patterns, and final integrity before authorizing upload. The filtered
package must remain type-valid. For `publish --path`, use repeated
`--include-path` and `--exclude-path` against original source paths.

- **CI publishing:** in GitHub Actions, prefer trusted publishing over a stored
  token: grant the job `permissions: id-token: write` and register the
  repository and workflow as a trusted publisher in AgentXM settings. Set
  `AXM_TRUSTED_PUBLISHING=0` only for a job that must not use it.
