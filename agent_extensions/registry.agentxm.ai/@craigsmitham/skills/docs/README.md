# Documentation craft skill

Use this skill in your workspace to write, review, and organize documentation
on the subject your readers need. Readers will usually consult the result
digitally. A brief describing where the document will be used helps the
skill adapt it, for example to a packing bench with no screen.
Install the [documentation craft pack](https://github.com/craigsmitham/agent-extensions/tree/main/packs/docs)
to supply the skill and the knowledge bundle it consults.

```sh
axm packs install @craigsmitham/packs/docs
```

Try “Review this README for a first-time contributor.” Give the agent the
README and the project it describes. Expect feedback on whether its claims
match the project and whether a newcomer can find and complete the first task.

For a named document form, ask to understand it, draft one, or decide whether
it fits. The skill opens the corresponding explainer, guide, or design
pattern when the installed bundle supplies that page. For example, in this
checkout “Write a runbook for the restore procedure below” starts with the
runbook authoring guide. To see which pages your installation supplies, run
`axm knowledge concepts query runbook` in the project.
