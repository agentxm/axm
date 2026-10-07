# Synthetic instruction-system snapshot

The host loads `/workspace/AGENTS.md` for every repository task. Inspection
confirms that the file loads, its paths and commands resolve, its guidance is
internally consistent, and it has no projection drift.

The file grew through five isolated maintainer intuitions. No failure cases,
baseline, held-out cases, outcome measures, token or latency measures, tool-use
observations, or safety comparisons were retained. Maintainers now claim the
file is helpful because agents load and follow it.

Representative work includes implementation, documentation, and diagnosis.
Adjacent held-out work must not receive irrelevant commands. The requested
audit is read-only and asks whether the surface is helpful, not merely whether
it is structurally conformant.
