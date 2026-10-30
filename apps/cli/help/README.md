# CLI Help Topics

Before changing help content, read the
[Agent extension enablement architecture](../../../docs/architecture/extension-enablement.md).

Files in `topics/` are bundled into `axm help <topic>`.

Use this Markdown subset so interactive terminal rendering stays predictable:

- `#`, `##`, and `###` headings
- paragraphs, unordered bullets, and one level of nested bullets
- fenced code blocks
- inline code, bold text, emphasis, and links
- GitHub-flavored tables

Schema topics are generated from
`apps/cli/site-content/__generated__/schemas/*.schema.json` and render raw
JSON instead of Markdown.

Machine output, piped output, and `NO_COLOR=1` preserve the raw topic source.
