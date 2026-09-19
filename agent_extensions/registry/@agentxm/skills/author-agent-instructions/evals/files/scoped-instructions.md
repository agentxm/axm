# Synthetic repository instruction system

The repository host loads `/workspace/AGENTS.md` for every task and additionally
loads `/workspace/packages/payments/AGENTS.md` for work beneath
`packages/payments/`. Broad instructions load first; the local file may add
package-specific guidance but must not contradict the broad source.

Current broad guidance contains:

- Never edit generated API clients directly.
- Run the payments integration suite after changing payment adapters.
- A 30-line deployment recovery procedure copied from `docs/deployment.md`.

The payments package has a distinct validation command:
`task test:payments`. Work under `packages/catalog/` must not receive that
command. The existing deployment guide is current and authoritative.

Audit findings supplied for the third case:

- I-02: the payment validation command is placed too broadly.
- I-04: the copied deployment procedure duplicates an authoritative guide and
  lacks a trigger-based route.
