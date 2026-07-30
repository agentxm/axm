---
__default__: major
---

Align the CLI with Effect v4 beta.101 idioms. Built-in global flags are now
filtered through `CliConfig.layer({ builtIns })` instead of mutating
`GlobalFlag.BuiltIns`; `--verbose`/`--debug` connect to Effect's minimum
log-level channel; browser/clipboard and agent-CLI subprocess spawns run
through Effect's `ChildProcessSpawner`; eight temp-file-and-rename writers
share one `writeFileAtomic` helper with a concurrent-writer test; the
generated registry client decodes server-sent event streams correctly
(post-processed while Effect-TS/effect#6769 is open); and empty environment
values follow current `Config` semantics (`AXM_USER_HOME=""` now falls back
to the home directory).
