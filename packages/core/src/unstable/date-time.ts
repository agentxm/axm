import * as Schema from "effect/Schema";
import * as SchemaGetter from "effect/SchemaGetter";

const isIsoDateTimeString = (value: string): boolean =>
  value.includes("T") && !Number.isNaN(Date.parse(value));

export const IsoDateTimeStringSchema = Schema.NonEmptyString.pipe(
  Schema.check(
    Schema.makeFilter((value: string) =>
      isIsoDateTimeString(value) ? undefined : `Expected ISO 8601 date-time string, got: ${value}`,
    ),
  ),
).annotate({
  identifier: "IsoDateTimeString",
  title: "ISO Date-Time String",
  description: "A date and time string (e.g. 2024-01-15T12:00:00.000Z).",
  format: "date-time",
  examples: ["2024-01-15T12:00:00.000Z"],
  message: "Expected an ISO 8601 date-time string (e.g., 2024-01-15T12:00:00.000Z)",
});

export const DateFromIsoDateTimeStringSchema = IsoDateTimeStringSchema.pipe(
  Schema.decodeTo(Schema.DateValid, {
    decode: SchemaGetter.Date<string>(),
    encode: SchemaGetter.transform((date: Date) => date.toISOString()),
  }),
  Schema.annotate({
    identifier: "DateFromIsoDateTimeString",
    title: "Date from ISO String",
    description: "Converts a date-time string into a Date object.",
  }),
);
