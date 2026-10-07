/**
 * Schema-decoded fixture builders for tests.
 *
 * Tests that need a real `Settings` or `Lockfile` value should run the input
 * through the actual decoder rather than casting an arbitrary object via
 * `as unknown as Settings`. These helpers wrap the canonical schema decoders
 * so call sites yield the decoded value with `yield* decodedSettings({ ... })`.
 */
import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";
import {
  LOCKFILE_VERSION,
  LockfileSchema,
  LockfileViewSchema,
  type Lockfile,
} from "../../desired/lockfile/schema.js";
import { SettingsSchema, type Settings } from "../../desired/settings/schema.js";

export const decodedSettings = (input: unknown): Effect.Effect<Settings, Schema.SchemaError> =>
  Schema.decodeUnknownEffect(SettingsSchema)(input);

export const decodedLockfile = (input: unknown): Effect.Effect<Lockfile, Schema.SchemaError> =>
  Schema.decodeUnknownEffect(LockfileViewSchema)(input);

/** Construct current wire fixtures from explicitly selected per-kind resolution facts. */
export const storedLockfileFixture = (entries: object) => {
  const serialized: unknown = JSON.parse(
    JSON.stringify({
      lockfileVersion: LOCKFILE_VERSION,
      skills: {},
      ...entries,
    }),
  );
  return Schema.encodeSync(LockfileSchema)(
    Schema.decodeUnknownSync(LockfileViewSchema)(serialized, { onExcessProperty: "error" }),
  );
};
