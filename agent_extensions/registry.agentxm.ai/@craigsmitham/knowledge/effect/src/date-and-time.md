---
type: Checklist
title: Date and time
description: Evaluate whether instants, calendar values, durations, time zones, and current time have explicit owners.
tags: [effect, effect-v4, datetime, duration, clock, timezone, testing]
status: stable
sources:
  - id: effect-datetime
    resource: https://github.com/Effect-TS/effect/blob/effect%404.1.0/ai-docs/src/07_datetime/10_creating-and-formatting.ts
    title: Effect 4.1.0 DateTime basics
  - id: effect-testclock
    resource: https://github.com/Effect-TS/effect/blob/effect%404.1.0/packages/effect/src/testing/TestClock.ts
    title: Effect 4.1.0 TestClock source
  - id: effect-pg-types
    resource: https://github.com/Effect-TS/effect/blob/effect%404.1.0/packages/sql/pg/src/PgTypes.ts
    title: Effect 4.1.0 PostgreSQL timestamp codecs
  - id: effect-datetime-tests
    resource: https://github.com/Effect-TS/effect/blob/effect%404.1.0/packages/effect/test/DateTime.test.ts
    title: Effect 4.1.0 elapsed and calendar arithmetic tests
  - id: effect-duration
    resource: https://github.com/Effect-TS/effect/blob/effect%404.1.0/packages/effect/src/Duration.ts
    title: Effect 4.1.0 ISO duration contracts
  - id: effect-cron-tests
    resource: https://github.com/Effect-TS/effect/blob/effect%404.1.0/packages/effect/test/Cron.test.ts
    title: Effect 4.1.0 cron overlap and gap tests
generated: { by: codex/gpt-6, at: 2026-10-29T19:51:52Z }
---

# Date and time

- [ ] Name the domain meaning of every value: instant, local calendar value,
  zoned date-time, elapsed duration, or schedule.
- [ ] Use one representation within each bounded concern and transform explicitly
  at persistence, transport, platform, or separately governed module boundaries.
- [ ] Obtain current time through the Effect `Clock`—for example via
  `DateTime.now`—rather than calling ambient wall-clock APIs in Effect logic.
- [ ] Use `Duration` for elapsed spans, timeouts, and delays instead of
  hand-maintained unit conversions. For ISO duration boundaries, use
  `Duration.fromIso` / `formatIso` or `Schema.DurationFromIsoString`; months
  and years are unsupported, and duration days are fixed elapsed units rather
  than calendar-day arithmetic.[^effect-duration]
- [ ] Make time-zone and calendar assumptions explicit before formatting or
  arithmetic: zoned `DateTime.add` / `subtract` apply sub-day units as elapsed
  time, while calendar days can span 23 or 25 hours across DST.[^effect-datetime-tests]
- [ ] Decode and encode timestamps with a schema matching the external
  representation: string, epoch value, native `Date`, or another declared
  form, including the time zone a driver applies on write.[^effect-pg-types]
- [ ] Express retry timing, polling, and repetition with `Schedule` and Effect
  timing operators rather than manual timestamp loops; for zoned cron jobs,
  choose `onDstOverlap` deliberately (`earlier`, the default, `later`, or
  `both`) and test the intended repeated-hour executions.[^effect-cron-tests]
- [ ] Use `TestClock` to verify sleeps, deadlines, retries, and time-dependent
  behavior without real waiting; include explicit zoned-value cases for DST
  gaps, repeated hours, and elapsed-versus-calendar arithmetic.[^effect-datetime-tests]

## Resources

- [DateTime basics](https://github.com/Effect-TS/effect/blob/effect%404.1.0/ai-docs/src/07_datetime/10_creating-and-formatting.ts)
- [DateTime source](https://github.com/Effect-TS/effect/blob/effect%404.1.0/packages/effect/src/DateTime.ts)
- [PostgreSQL timestamp codecs](https://github.com/Effect-TS/effect/blob/effect%404.1.0/packages/sql/pg/src/PgTypes.ts)
- [TestClock source](https://github.com/Effect-TS/effect/blob/effect%404.1.0/packages/effect/src/testing/TestClock.ts)

[^effect-pg-types]: Effect PostgreSQL timestamp codecs.

[^effect-datetime-tests]: [Effect elapsed and calendar arithmetic tests](https://github.com/Effect-TS/effect/blob/effect%404.1.0/packages/effect/test/DateTime.test.ts).

[^effect-duration]: [Effect ISO duration contracts](https://github.com/Effect-TS/effect/blob/effect%404.1.0/packages/effect/src/Duration.ts).

[^effect-cron-tests]: [Effect cron overlap and gap tests](https://github.com/Effect-TS/effect/blob/effect%404.1.0/packages/effect/test/Cron.test.ts).
