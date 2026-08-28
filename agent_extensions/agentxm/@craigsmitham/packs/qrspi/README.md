# QRSPI — deprecated

QRSPI has been superseded by Research `3.0.0`, distributed through the Gen Stack
pack. Research owns both bounded Research Brief framing and fresh-context,
read-only evidence execution. The Question skill is no longer a separate normal
entry point.

Migrate with:

```bash
axm packs uninstall qrspi
axm install @craigsmitham/packs/gen-stack
```

Framing-only callers should invoke Research and request that it stop after the
Research Brief. Named depth modes are removed; callers supply concrete limits
when needed.

This package remains only as a compatibility source for prior installations;
new installations should use `@craigsmitham/packs/gen-stack`.

## License

MIT
