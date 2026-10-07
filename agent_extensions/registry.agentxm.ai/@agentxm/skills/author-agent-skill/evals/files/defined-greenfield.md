# Synthetic commissioned requirements

Create a portable Agent Skill that normalizes YAML frontmatter in local
Markdown files. The caller supplies one file path and an ordered list of allowed
keys. The skill must preserve the Markdown body byte-for-byte, order recognized
keys as requested, report unknown keys without deleting them, and write only
after the caller names an output path. It must work through ordinary assistant
output on a POSIX host with a YAML parser available.

The skill may inspect the input file and write the named output. It may not use
the network, install dependencies, overwrite the input, publish artifacts, or
claim compatibility with untested YAML parsers. Success means that the output
parses as YAML, contains every original frontmatter value, has the requested key
order where applicable, and has a body identical to the input. No prior usage
history or production evidence exists; use synthetic representative cases and
label remaining assumptions.
