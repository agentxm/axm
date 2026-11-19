# Spot Spew

Find changes that would reduce the cost of maintaining code, configuration,
or delivery tooling while preserving the behavior people rely on.

```sh
axm install @craigsmitham/skills/spot-spew
```

Try “$spot-spew review our build scripts for custom steps the build tool
already handles.” The assessment identifies what each step protects, whether
the replacement covers it, and what migration would cost. If keeping the
scripts is cheaper, the assessment can conclude that no change is worthwhile.
