# Reviewer

Reviewer is the fresh-context, read-only worker used by the Gen Stack Review
skill. One assignment performs either a focused implementation checkpoint
review or an integrated final review of one exact candidate.

The subagent requires a stable subject, exact authorities, bounded evidence,
scope, read authority, and the compact Review result contract. It never edits
the candidate, accepts desired state, dispositions implementation actions, or
authorizes release.

## Install

```bash
axm install @craigsmitham/packs/gen-stack
```

Reviewer is not standalone. Install it with the Review skill through the Gen
Stack pack.

## Delegation example

```text
Mode: checkpoint
Focus: architecture
Subject: candidate checkpoint r52
Change context: CH-8 revision 4; CS-8 revision 3; D-8 revision 1
Authorities: A-PAYMENTS revision 2 and applicable repository instructions
Evidence: supplied diff and Architecture-realization Result AR-7
Scope and read authority: read-only candidate and named evidence
Output: compact Review result
```

## License

MIT
