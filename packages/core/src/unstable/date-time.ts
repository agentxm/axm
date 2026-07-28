import * as Schema from "effect/Schema";
import * as SchemaTransformation from "effect/SchemaTransformation";

/**
 * Canonical timestamp schema: ISO 8601 UTC string on the wire, `DateTime.Utc`
 * in memory.
 *
 * Decoding accepts any string `DateTime.make` understands and normalizes it to
 * UTC; malformed strings fail decoding. Encoding always produces an ISO 8601
 * UTC string (e.g. 2024-01-15T12:00:00.000Z), so wire formats are unchanged
 * from the previous hand-written ISO-string handling.
 *
 * The encoded string side carries the `format: "date-time"` annotation so
 * OpenAPI and JSON Schema emissions preserve the timestamp format.
 *
 * @experimental This API is unstable and may change without notice.
 */
export const DateTimeUtcSchema = Schema.String.annotate({
  identifier: "IsoDateTimeString",
  title: "ISO Date-Time String",
  description: "A date and time string (e.g. 2024-01-15T12:00:00.000Z).",
  format: "date-time",
})
  .pipe(Schema.decodeTo(Schema.DateTimeUtc, SchemaTransformation.dateTimeUtcFromString))
  .annotate({
    identifier: "IsoDateTimeString",
    title: "ISO Date-Time String",
    description: "A date and time string (e.g. 2024-01-15T12:00:00.000Z).",
    message: "Expected an ISO 8601 date-time string (e.g., 2024-01-15T12:00:00.000Z)",
  });

/**
 * Timestamp schema for edges that hold a legacy JavaScript `Date` (database
 * driver hydration, third-party APIs): `Date` on the outside, `DateTime.Utc`
 * in memory.
 *
 * @experimental This API is unstable and may change without notice.
 */
export const DateTimeUtcFromDateSchema = Schema.DateTimeUtcFromDate.annotate({
  identifier: "DateTimeUtcFromDate",
  title: "DateTime.Utc from Date",
  description: "Converts a JavaScript Date into a DateTime.Utc.",
});
