# Review follow-up trials

Two independent reviews of the same fixture produced two numbered findings.
Selecting **Fix selected** and then **2 · River link** through Codex's native
questions produced the same one-line edit as typing `B 2` under the text
report. The Lake link remained open in both copies.

## Fixture and interaction

Fresh Codex CLI 0.170.0 app-server sessions used AXM 0.53.0, a disposable
Git workspace per run, and the workspace-authored axe skill and engineering
knowledge. The request was “$axe review ./sample. Focus on whether both
reference links can be followed in this supplied skill directory.” For the
prompt-input run the caller also specified a text-only terminal.

The skill linked Lake to `references/lake.md` and River to
`references/river.md`. The fixture shipped `lakes.md` and `rivers.md`.
Both reports labeled each finding's recommendation and evidence. The native
client received structured action options after the report, submitted the
displayed **Fix selected** option, then answered the finding picker with its
River option. The text report put the four labeled actions below its findings.
The harness compared both workspaces with their original contents. Each
changed only the River destination to `references/rivers.md`.

| Additional case      | Observation                                                                                                                                                                                                                                                                                                   |
| -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Inspect, then finish | `inspect 2` checked the missing River path and opened the plural filename. `done` closed the review. Both links retained their original text.                                                                                                                                                                 |
| Clean directory      | With both files at their linked paths, the reviewer opened them and reported both links worked. It offered no repairs.                                                                                                                                                                                        |
| Excerpt only         | The reviewer left package availability unresolved and identified the published archive listing as the missing evidence.                                                                                                                                                                                       |
| Fresh reader         | Given only the rendered text report, a separate model session identified the River destination and supplied `fix 2` as the reply for that repair.                                                                                                                                                             |
| AXM rename planning  | Given a private old entry and a public preview, the agent held publication. With a matching preview on a non-default Registry, it kept publication, deprecation, and verification on that Registry. A default-only miss left history unresolved. A confirmed unpublished identity took the local rename path. |

The two selection runs used axe source SHA-256
`01f3a20c6126c5c98fe9d7d9520b48ade837eca915bbfcd219f630a51b859699` and
review guide SHA-256
`4e81086a26805061fa1bbe084870f076c02fd37a4aea0037df2484f45e011059`.
The rename walkthrough used AXM skill SHA-256
`90086960e82dec74dacd6134b2045a35646d44278b20386e0df15f3f18b3a324`.
The native run exercised the host's selection protocol with scripted answers.
Visual rendering and other hosts were outside the trial. The rename cases
used supplied release facts and made no Registry changes.
