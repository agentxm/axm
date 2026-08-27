---
id: 2026-08-27T030038Z-a1c7
subject: axm-cli-interactions
key: gen-stack-check-null
observed_at: "2026-08-27T03:00:38Z"
session: 01a04118-27fd-7e71-9416-9b6200baed6b
kind: gap
status: open
---

**Expected:** The documented canonical `gen-stack.py -C <repository-root>
check` command should report separate OKF, Gen Stack profile, and relationship
projection results for the newly authored AXM corpus.

**Observed:** The command exited 2 and emitted only `null` on standard output;
no diagnostic output or structured error fields were supplied.

**Impact:** The canonical aggregate result was unusable, so progress required
running the focused validators separately. One extra diagnostic path was
introduced; elapsed delay was not measured.

**Recovery:** Continue with the documented focused OKF, profile, and
relationship checks. Task completion remains pending.

**Detected by:** Direct invocation of the documented mechanical gate after
relationship synchronization.

**Observed factors:** AXM CLI and installed AXM skill were both version 0.28.1
and compatible; `axm lint --json` had returned no findings before the check.

**Diagnostic evidence:** Command
`python3 agent_extensions/agentxm/@craigsmitham/knowledge/gen-stack/scripts/gen-stack.py -C . check`;
process exit status `2`; result output `null`; diagnostic output not supplied.

**Hypothesis:** unknown
