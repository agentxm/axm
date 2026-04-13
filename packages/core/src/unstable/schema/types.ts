/**
 * Discriminated union representing the outcome of reading and validating a JSON
 * file against a schema.
 *
 * The `ok` variant carries the decoded value so callers that need it can avoid
 * re-reading the file.
 *
 * @experimental This API is unstable and may change without notice.
 */
export type JsonFileReadResult<A> =
  | { readonly _tag: "ok"; readonly value: A }
  | { readonly _tag: "missing" }
  | { readonly _tag: "read-failure"; readonly error: string }
  | { readonly _tag: "unparseable"; readonly error: string; readonly location?: string }
  | { readonly _tag: "schema-invalid"; readonly issues: ReadonlyArray<string> };
