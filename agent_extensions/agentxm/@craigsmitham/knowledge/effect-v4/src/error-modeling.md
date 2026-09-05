---
type: Checklist
title: Error modeling
description: Evaluate whether expected failures, defects, interruption, recovery, and retry remain distinct and truthful.
tags: [effect, effect-v4, errors, cause, defects, interruption, retry]
status: stable
sources:
  - id: effect-errors
    resource: https://github.com/Effect-TS/effect/blob/effect%404.0.0-rc.112/ai-docs/src/01_effect/04_errors/01_error-handling.ts
    title: Effect 4.0.0-rc.112 error handling basics
  - id: effect-cause
    resource: https://github.com/Effect-TS/effect/blob/effect%404.0.0-rc.112/packages/effect/src/Cause.ts
    title: Effect 4.0.0-rc.112 Cause source
generated: { by: codex/gpt-5.6, at: 2026-08-29T19:19:50Z }
---

# Error modeling

- [ ] Keep expected failure in the typed error channel, programmer or invariant
  defects in the defect channel, and cancellation as interruption.
- [ ] Give expected errors stable tags and the structured context a caller needs
  to decide, recover, report, or translate.
- [ ] Capture thrown or rejected `unknown` once at the foreign boundary and map
  it into an owned error rather than leaking `unknown` through the application.
- [ ] Recover by the narrowest relevant tag or reason; do not erase unrelated
  failures with a broad catch-all fallback.
- [ ] Translate infrastructure failures into domain or protocol errors at the
  boundary that owns that vocabulary, preserving useful causes where safe.
- [ ] Retry only failures known to be transient, only when repeating the
  operation is safe, and with an explicit bound and schedule.
- [ ] Use `Result` when success-or-expected-failure is intentionally data
  (such as per-item outcomes), not as a hidden replacement for Effect's error
  channel.
- [ ] Test expected failure, defect, and interruption behavior separately,
  including which failures are recovered, retried, or allowed to propagate.

## Resources

- [Error handling basics](https://github.com/Effect-TS/effect/blob/effect%404.0.0-rc.112/ai-docs/src/01_effect/04_errors/01_error-handling.ts)
- [Cause source](https://github.com/Effect-TS/effect/blob/effect%404.0.0-rc.112/packages/effect/src/Cause.ts)
