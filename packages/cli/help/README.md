# CLI Help Topics

Files in `topics/` are bundled into `axm help <topic>`.

Use this Markdown subset so interactive terminal rendering stays predictable:

- `#`, `##`, and `###` headings
- paragraphs, unordered bullets, and one level of nested bullets
- fenced code blocks
- inline code, bold text, emphasis, and links
- GitHub-flavored tables
- HTML comments for generator directives such as `<!-- axm:embed-schema ... -->`

Machine output, piped output, and `NO_COLOR=1` preserve the raw Markdown source.
