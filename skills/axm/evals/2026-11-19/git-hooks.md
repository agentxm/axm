# Git hook discovery trials

Four fresh Codex sessions received the existing AXM skill and the candidate
CLI help in separate disposable Git repositories. Each project pointed to
the skill and its local CLI. An invocation wrapper allowed help requests.
The prompts asked for advice and required files to remain unchanged. The
table records the help actually opened and the operation recommended.

| Request                                                                                                                                             | Observed route                                                                                           | Recommended operation                                                                                                                         |
| --------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| “I pulled a teammate's rule change, but my agent still shows the old instructions. How could we catch that after future pulls and branch switches?” | Inspected hook and sync command help, then the topic list, rules, and `help git-hooks`.                  | Advisory sync preview after branch checkout, successful merge, or rebase. Preserve planning errors and use the manual check after a conflict. |
| “I want to check our project skills before commit. We use partial staging. How would you set that up?”                                              | Explored skills, check, hooks, setup, and the topic list. Opened `help git-hooks` and lint command help. | Run staged lint once after formatters, with no filename list.                                                                                 |
| “We want to hear about newer upstream versions of our team's extensions without changing everyone's checkout. What should we run?”                  | Opened list, update, and check command help.                                                             | Use `axm list --outdated` for the read-only report. This prompted the addition of that reporting route alongside update preview in the guide. |
| “After my coding agent edits a file, I want a command to run. What kind of hook should I look into and where do I start?”                           | Opened `help hooks`, also inspected `help git-hooks`, and read hook scaffolding help.                    | Use the host's agent lifecycle event and matcher.                                                                                             |

All four read the skill. Command traces showed help and file reads. Comparing
each worktree to its starting index showed no edited or added files. The two
Git cases reached the guide, so these observations support keeping the recipes
in CLI help and retaining the existing skill. The explicit project pointer
and single trial per prompt limit claims about spontaneous skill activation.
The process specification `cli/help/git-hook-workflows` separately exercises
the bundled examples with real Git and AXM.
