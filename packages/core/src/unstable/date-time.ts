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
).annotate({ format: "date-time" });

export const DateFromIsoDateTimeStringSchema = IsoDateTimeStringSchema.pipe(
  Schema.decodeTo(Schema.DateValid, {
    decode: SchemaGetter.Date<string>(),
    encode: SchemaGetter.transform((date: Date) => date.toISOString()),
  }),
);
