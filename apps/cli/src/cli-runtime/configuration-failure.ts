/**
 * Configuration-failure record.
 *
 * A workspace-bound command reads its workspace's settings and state while the
 * workspace is built, before its handler runs, and its workspace boundary then
 * converts a failure there into the envelope it renders. The boundary records
 * that failure's identity here first, taken from the failure as raised, so the
 * runtime envelope reports it in the configuration phase under its own kind
 * rather than as a failure of the command.
 */

import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import * as Ref from "effect/Ref";
import * as ServiceMap from "effect/Context";

import {
  defectIdentity,
  handledFailureIdentity,
  type FailureIdentity,
} from "./failure-identity.js";

export interface ConfigurationFailureRecord {
  /** The failure exactly as it leaves the workspace boundary. */
  readonly failure: unknown;
  readonly identity: FailureIdentity;
}

export class ConfigurationFailure extends ServiceMap.Service<
  ConfigurationFailure,
  { readonly ref: Ref.Ref<Option.Option<ConfigurationFailureRecord>> }
>()("axm.sh/cli-runtime/configuration-failure/ConfigurationFailure") {}

const recordConfigurationFailure = (record: ConfigurationFailureRecord): Effect.Effect<void> =>
  Effect.gen(function* () {
    const service = yield* Effect.serviceOption(ConfigurationFailure);
    if (Option.isNone(service)) return;
    yield* Ref.set(service.value.ref, Option.some(record));
  });

/**
 * Build a command's workspace, converting a failure for rendering and
 * recording it as a configuration failure. No record is kept outside a
 * runtime envelope.
 */
export const recordingConfigurationFailure =
  <E, E2>(convert: (error: E) => E2) =>
  <A, R>(build: Effect.Effect<A, E, R>): Effect.Effect<A, E2, R> =>
    build.pipe(
      Effect.catch((error) => {
        const converted = convert(error);
        return recordConfigurationFailure({
          failure: converted,
          identity: handledFailureIdentity(error),
        }).pipe(Effect.andThen(Effect.fail(converted)));
      }),
      Effect.tapDefect((defect) =>
        recordConfigurationFailure({ failure: defect, identity: defectIdentity(defect) }),
      ),
    );

/** The identity recorded for this failure when building the workspace raised it. */
export const recordedConfigurationFailure = (
  ref: Ref.Ref<Option.Option<ConfigurationFailureRecord>>,
  failure: unknown,
): Effect.Effect<Option.Option<FailureIdentity>> =>
  Effect.map(Ref.get(ref), (record) =>
    Option.isSome(record) && record.value.failure === failure
      ? Option.some(record.value.identity)
      : Option.none(),
  );
