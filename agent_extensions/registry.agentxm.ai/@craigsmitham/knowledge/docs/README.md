# Documentation craft knowledge

Use this bundle to choose a document form for the reader’s task, whether
you maintain software guides or a knowledge base in another field.
In the project where you want to use it, install the [documentation craft pack](https://github.com/craigsmitham/agent-extensions/tree/main/packs/docs)
for the guidance and the skill that selects it for writing and review tasks.

```sh
axm packs install @craigsmitham/packs/docs
```

To look up the pages in your installation, run
`axm knowledge concepts query readiness` in the same project. To browse
this checkout, enter through the [knowledge index](src/index.md) or go
directly to the kind of help you need. For example, choose an
[explainer](src/explainers/readiness-checklist.md) to understand how a
readiness decision works, the [authoring guide](src/guides/designing-a-readiness-checklist.md)
to turn release conditions into a usable checklist, or the
[pattern](src/patterns/readiness-checklist.md) to judge whether this design
fits the decision.
