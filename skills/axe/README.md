# Axe · Agent extension engineering

Ask about one extension, the extensions you author or use together, or the
workspace setup that supplies them. “Review our AXM setup for contributors”
starts from a contributor's task and follows it to the intended host. Ask
“How should we keep shared rules current across branch switches?” to compare
workspace management policies and decide how to check the result.

```text
$axe ./skills/quality
$axe design a way to remind contributors to check the package they edited
```

The first request reviews the named skill for issues, opportunities to improve a
successful task, and steps that could be pruned. The review opens with a verdict and an evidence-backed coverage checklist. Each finding has a recommendation
and evidence. Choose an action in the picker or reply `inspect 1` to see the first
finding’s evidence or `apply 2` to apply just the second recommendation.

The second request recommends an extension type and a design. Install the
engineering pack to get the skill and the knowledge it uses.

```sh
axm install @agentxm/packs/agent-extension-engineering
```

| Request                                                                                                       | What you get                                                               |
| ------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------- |
| `$axe`                                                                                                        | A suggested next action based on the conversation, or a few ways to start. |
| `$axe create a skill that reviews release archives`                                                           | An authored draft for that job.                                            |
| `$axe review ./skills/quality — focus on invocation and scope`                                                | A read-only assessment of those two aspects.                               |
| `$axe revise ./skills/quality so an unknown area never falls back to the whole model`                         | A bounded change and a check of the failure case.                          |
| `$axe verify ./skills/quality — do “evaluate Triage Accuracy” and its paraphrase resolve to the same factor?` | Evidence about target resolution for both requests.                        |
| `$axe how should a skill handle an optional verb that is also a directory name?`                              | Applicable guidance and a worked example.                                  |

Ordinary requests also work. “Should this build instruction live at the repository
root or in the website package?” calls for guidance on scoped instructions.
