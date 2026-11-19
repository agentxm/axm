import * as DateTime from "effect/DateTime";
import * as Option from "effect/Option";

/**
 * The general grammar every human sentence shares: counts, lists, sizes,
 * durations, dates, and sentence case. Each has one form, so two commands
 * never state the same kind of fact two ways. Feature wording belongs to the
 * feature's own phrases; only what every feature says the same way is here.
 */

/** A count and its noun, pluralized for the count. */
export const count = (value: number, singular: string, plural = `${singular}s`): string =>
  `${String(value)} ${value === 1 ? singular : plural}`;

/** The noun alone, pluralized for a count stated elsewhere. */
export const plural = (value: number, singular: string, pluralForm = `${singular}s`): string =>
  value === 1 ? singular : pluralForm;

const conjunction = new Intl.ListFormat("en", { style: "long", type: "conjunction" });

/** Items in prose: `a`, `a and b`, `a, b, and c`. */
export const list = (items: ReadonlyArray<string>): string => conjunction.format(items);

/** A size in decimal units, as progress and caches both state it. */
export const bytes = (value: number): string => {
  if (value < 1_000) return `${String(value)} B`;
  if (value < 1_000_000) return `${String(Math.round(value / 100) / 10)} KB`;
  if (value < 1_000_000_000) return `${String(Math.round(value / 100_000) / 10)} MB`;
  return `${String(Math.round(value / 100_000_000) / 10)} GB`;
};

/** How long something took: milliseconds under a second, else tenths of seconds. */
export const duration = (elapsedMs: number): string =>
  elapsedMs < 1_000
    ? `${String(Math.max(0, Math.round(elapsedMs)))}ms`
    : `${String(Math.round(elapsedMs / 100) / 10)}s`;

/**
 * How long is left before a handoff expires, as an open wait says it: minutes
 * and zero-padded seconds, as a clock reads. A wait that has run out says so
 * rather than counting past zero.
 */
export const remainingTime = (remainingMs: number): string => {
  if (remainingMs <= 0) return "expired";
  const seconds = Math.ceil(remainingMs / 1_000);
  const minutes = Math.floor(seconds / 60);
  return `${String(minutes)}:${String(seconds % 60).padStart(2, "0")} left`;
};

/**
 * A description set beside a command, such as a `Next` action's, is a
 * fragment: a single sentence loses its closing stop, while prose of several
 * sentences keeps its own.
 */
export const fragment = (description: string): string => {
  const trimmed = description.trimEnd();
  return trimmed.endsWith(".") && !/[.!?]\s/u.test(trimmed.slice(0, -1))
    ? trimmed.slice(0, -1)
    : description;
};

/**
 * A version a unit moved between, as every ledger, record, and message says
 * it: `1.9.4 to 2.0.1`. Where both ends are the same, or only one is known,
 * the one version stands alone.
 */
export const versionMove = (from: string | undefined, to: string | undefined): string =>
  from === undefined || to === undefined || from === to ? (to ?? from ?? "") : `${from} to ${to}`;

/** The first letter raised, for a phrase that opens a line. */
export const capitalized = (value: string): string =>
  `${value.slice(0, 1).toUpperCase()}${value.slice(1)}`;

type Instant = DateTime.DateTime | Date | string;

const instant = (value: Instant): DateTime.DateTime | undefined =>
  DateTime.isDateTime(value) ? value : Option.getOrUndefined(DateTime.make(value));

const MONTHS = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
] as const;

/** A calendar day, as every command states one: `21 Sep 2026`, in UTC. */
export const day = (value: Instant): string => {
  const at = instant(value);
  if (at === undefined) return String(value);
  const parts = DateTime.toPartsUtc(at);
  return `${String(parts.day)} ${MONTHS[parts.month - 1] ?? ""} ${String(parts.year)}`;
};

/** A moment to the minute, for facts that change within a day: `21 Sep 2026 16:44 UTC`. */
export const moment = (value: Instant): string => {
  const at = instant(value);
  if (at === undefined) return String(value);
  const parts = DateTime.toPartsUtc(at);
  const clock = `${String(parts.hour).padStart(2, "0")}:${String(parts.minute).padStart(2, "0")}`;
  return `${day(at)} ${clock} UTC`;
};
