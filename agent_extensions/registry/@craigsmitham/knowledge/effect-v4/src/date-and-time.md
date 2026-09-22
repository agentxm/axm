---
type: Checklist
title: Date and time
description: Evaluate whether instants, calendar values, durations, time zones, and current time have explicit owners.
tags: [effect, effect-v4, datetime, duration, clock, timezone, testing]
status: stable
sources:
  - id: effect-datetime
    resource: https://github.com/Effect-TS/effect/blob/effect%404.0.0-rc.117/ai-docs/src/07_datetime/10_creating-and-formatting.ts
    title: Effect 4.0.0-rc.117 DateTime basics
  - id: effect-testclock
    resource: https://github.com/Effect-TS/effect/blob/effect%404.0.0-rc.117/packages/effect/src/testing/TestClock.ts
    title: Effect 4.0.0-rc.117 TestClock source
  - id: effect-pg-types
    resource: https://github.com/Effect-TS/effect/blob/effect%404.0.0-rc.117/packages/sql/pg/src/PgTypes.ts
    title: Effect 4.0.0-rc.117 PostgreSQL timestamp codecs
generated: { by: claude/opus-5.5, at: 2026-09-22T21:20:55Z }
---

# Date and time

- [ ] Name the domain meaning of every value: instant, local calendar value,
  zoned date-time, elapsed duration, or schedule.
- [ ] Use one representation within each bounded concern and transform explicitly
  at persistence, transport, platform, or separately governed module boundaries.
- [ ] Obtain current time through the Effect `Clock`—for example via
  `DateTime.now`—rather than calling ambient wall-clock APIs in Effect logic.
- [ ] Use `Duration` for elapsed spans, timeouts, and delays instead of
  hand-maintained unit conversions.
- [ ] Make time-zone and calendar assumptions explicit before formatting or
  performing calendar arithmetic.
- [ ] Decode and encode timestamps with a schema matching the external
  representation: string, epoch value, native `Date`, or another declared
  form, including the time zone a driver applies on write.[^effect-pg-types]
- [ ] Express retry timing, polling, and repetition with `Schedule` and Effect
  timing operators rather than manual timestamp loops.
- [ ] Use `TestClock` to verify sleeps, deadlines, retries, and time-dependent
  behavior without real waiting.

## Resources

- [DateTime basics](https://github.com/Effect-TS/effect/blob/effect%404.0.0-rc.117/ai-docs/src/07_datetime/10_creating-and-formatting.ts)
- [DateTime source](https://github.com/Effect-TS/effect/blob/effect%404.0.0-rc.117/packages/effect/src/DateTime.ts)
- [PostgreSQL timestamp codecs](https://github.com/Effect-TS/effect/blob/effect%404.0.0-rc.117/packages/sql/pg/src/PgTypes.ts)
- [TestClock source](https://github.com/Effect-TS/effect/blob/effect%404.0.0-rc.117/packages/effect/src/testing/TestClock.ts)

[^effect-pg-types]: Effect PostgreSQL timestamp codecs.
