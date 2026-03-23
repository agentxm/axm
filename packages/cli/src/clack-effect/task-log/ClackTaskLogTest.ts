import * as ServiceMap from "effect/ServiceMap";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Ref from "effect/Ref";
import { ClackTaskLog } from "./service.js";
import type { ClackTaskLogGroupHandle } from "./types.js";

export interface ClackTaskLogGroupCall {
  readonly method: string;
  readonly args: ReadonlyArray<unknown>;
}

export interface ClackTaskLogGroupRecord {
  readonly name: string;
  readonly calls: ReadonlyArray<ClackTaskLogGroupCall>;
}

export interface ClackTaskLogCall {
  readonly method: string;
  readonly args: ReadonlyArray<unknown>;
}

export interface ClackTaskLogRecord {
  readonly calls: ReadonlyArray<ClackTaskLogCall>;
  readonly groups: ReadonlyArray<ClackTaskLogGroupRecord>;
}

const emptyRecord: ClackTaskLogRecord = {
  calls: [],
  groups: [],
};

export class ClackTaskLogTest extends ServiceMap.Service<
  ClackTaskLogTest,
  {
    readonly ref: Ref.Ref<ClackTaskLogRecord>;
    readonly get: Effect.Effect<ClackTaskLogRecord>;
  }
>()("@axm.sh/cli/test/ClackTaskLogTest") {}

export const ClackTaskLogTestLayer: Layer.Layer<ClackTaskLog | ClackTaskLogTest> =
  Layer.effectServices(
    Effect.gen(function* () {
      const ref = yield* Ref.make(emptyRecord);

      const appendCall = (method: string, args: ReadonlyArray<unknown>) =>
        Ref.update(ref, (r) => ({
          ...r,
          calls: [...r.calls, { method, args }],
        }));

      const makeGroupHandle = (name: string): Effect.Effect<ClackTaskLogGroupHandle> =>
        Effect.gen(function* () {
          // Create a ref for this group's calls
          const groupCallsRef = yield* Ref.make<ReadonlyArray<ClackTaskLogGroupCall>>([]);

          // Add this group to the record
          yield* Ref.update(ref, (r) => ({
            ...r,
            groups: [...r.groups, { name, calls: [] }],
          }));

          const groupIndex = (yield* Ref.get(ref)).groups.length - 1;

          const appendGroupCall = (method: string, args: ReadonlyArray<unknown>) =>
            Ref.update(groupCallsRef, (calls) => [...calls, { method, args }]).pipe(
              Effect.andThen(
                Ref.update(ref, (r) => ({
                  ...r,
                  groups: r.groups.map((g, i) =>
                    i === groupIndex ? { ...g, calls: [...g.calls, { method, args }] } : g,
                  ),
                })),
              ),
            );

          return {
            message: (msg: string) => appendGroupCall("message", [msg]),
            error: (message: string) => appendGroupCall("error", [message]),
            success: (message: string) => appendGroupCall("success", [message]),
          };
        });

      const service: ServiceMap.Service.Shape<typeof ClackTaskLog> = {
        start: (config) =>
          appendCall("start", [config]).pipe(
            Effect.map(() => ({
              message: (msg: string) => appendCall("message", [msg]),
              group: (name: string) =>
                appendCall("group", [name]).pipe(Effect.flatMap(() => makeGroupHandle(name))),
              error: (message: string) => appendCall("error", [message]),
              success: (message: string) => appendCall("success", [message]),
            })),
          ),
      };

      const test: ServiceMap.Service.Shape<typeof ClackTaskLogTest> = {
        ref,
        get: Ref.get(ref),
      };

      return ServiceMap.empty().pipe(
        ServiceMap.add(ClackTaskLog, service),
        ServiceMap.add(ClackTaskLogTest, test),
      );
    }),
  );
