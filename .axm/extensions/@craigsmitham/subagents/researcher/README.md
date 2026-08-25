# Researcher

Provides the fresh-context, read-only worker used by the QRSPI pack to frame a
Research Brief or execute one as an evidence-backed report. The calling agent
retains responsibility for scope, authority, acceptance checks, and the final
user-facing result.

The subagent accepts only bounded QRSPI delegation envelopes. It does not make
external changes, decide beyond the supplied authority, or subdelegate its
work. Install it through the QRSPI pack; it requires the pack's `question` and
`research` skills and is not a standalone extension.

## Install

```bash
axm packs install @craigsmitham/packs/qrspi
```

## Delegation example

```text
Delegate phase execute to researcher with this Research Brief, standard depth,
read-only public evidence authority, the QRSPI report contract, and no
subdelegation.
```

## License

MIT
