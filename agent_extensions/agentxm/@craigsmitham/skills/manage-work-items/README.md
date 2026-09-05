# Manage work items

Creates and maintains evidence-aware Operational Incident Records, Defect
Reports, and Changes across tracker hosts without imposing a delivery method.

Install the supported pack rather than this non-standalone skill:

```sh
axm packs install @craigsmitham/packs/work-management
```

The skill reads the pack's Work Management knowledge sibling, applicable
repository instructions, and the selected tracker's native schema. It can
classify, draft, revise, triage, relate, merge, split, reopen, close, title,
summarize, and map software work items. It does not implement fixes, diagnose
code, prioritize a backlog, plan team capacity, or invent product and technical
decisions.

Examples:

- “Turn these observations into a Defect Report.”
- “Draft a Change for rotating API credentials without downtime.”
- “Update the incident record from these response notes.”
- “Triage these possible duplicate reports.”
- “Rewrite this issue title and summary without changing its body.”

The package is MIT-licensed. Its required knowledge sibling is licensed under
CC-BY-SA-4.0.
