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
import { LockfileSchema, type Lockfile } from "../../../lockfile/schema.js";
import { SettingsSchema, type Settings } from "../../../settings/schema.js";

export const decodedSettings = (input: unknown): Effect.Effect<Settings, Schema.SchemaError> =>
  Schema.decodeUnknownEffect(SettingsSchema)(input);

export const decodedLockfile = (input: unknown): Effect.Effect<Lockfile, Schema.SchemaError> =>
  Schema.decodeUnknownEffect(LockfileSchema)(input);
