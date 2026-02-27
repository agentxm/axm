import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import { ClackTaskLog } from "./service.js";
import { ClackTaskLogTest, ClackTaskLogTestLayer } from "./ClackTaskLogTest.js";

describe("ClackTaskLog", () => {
  it.effect("start returns a handle", () =>
    Effect.gen(function* () {
      const taskLog = yield* ClackTaskLog;
      const handle = yield* taskLog.start({ title: "Building" });
      expect(handle).toBeDefined();
      expect(handle.message).toBeTypeOf("function");
      expect(handle.group).toBeTypeOf("function");
      expect(handle.error).toBeTypeOf("function");
      expect(handle.success).toBeTypeOf("function");
      const { calls } = yield* (yield* ClackTaskLogTest).get;
      expect(calls).toEqual([{ method: "start", args: [{ title: "Building" }] }]);
    }).pipe(Effect.provide(ClackTaskLogTestLayer)),
  );

  it.effect("handle.message records calls", () =>
    Effect.gen(function* () {
      const taskLog = yield* ClackTaskLog;
      const handle = yield* taskLog.start({ title: "Installing" });
      yield* handle.message("step 1");
      yield* handle.message("step 2");
      const { calls } = yield* (yield* ClackTaskLogTest).get;
      expect(calls).toEqual([
        { method: "start", args: [{ title: "Installing" }] },
        { method: "message", args: ["step 1"] },
        { method: "message", args: ["step 2"] },
      ]);
    }).pipe(Effect.provide(ClackTaskLogTestLayer)),
  );

  it.effect("handle.error records calls", () =>
    Effect.gen(function* () {
      const taskLog = yield* ClackTaskLog;
      const handle = yield* taskLog.start({ title: "Task" });
      yield* handle.error("something failed");
      const { calls } = yield* (yield* ClackTaskLogTest).get;
      expect(calls).toEqual([
        { method: "start", args: [{ title: "Task" }] },
        { method: "error", args: ["something failed"] },
      ]);
    }).pipe(Effect.provide(ClackTaskLogTestLayer)),
  );

  it.effect("handle.success records calls", () =>
    Effect.gen(function* () {
      const taskLog = yield* ClackTaskLog;
      const handle = yield* taskLog.start({ title: "Task" });
      yield* handle.success("all done");
      const { calls } = yield* (yield* ClackTaskLogTest).get;
      expect(calls).toEqual([
        { method: "start", args: [{ title: "Task" }] },
        { method: "success", args: ["all done"] },
      ]);
    }).pipe(Effect.provide(ClackTaskLogTestLayer)),
  );

  it.effect("handle.group returns a group handle", () =>
    Effect.gen(function* () {
      const taskLog = yield* ClackTaskLog;
      const handle = yield* taskLog.start({ title: "Build" });
      const group = yield* handle.group("dependencies");
      expect(group).toBeDefined();
      expect(group.message).toBeTypeOf("function");
      expect(group.error).toBeTypeOf("function");
      expect(group.success).toBeTypeOf("function");
      const record = yield* (yield* ClackTaskLogTest).get;
      expect(record.calls).toEqual([
        { method: "start", args: [{ title: "Build" }] },
        { method: "group", args: ["dependencies"] },
      ]);
      expect(record.groups).toHaveLength(1);
      expect(record.groups[0]!.name).toBe("dependencies");
    }).pipe(Effect.provide(ClackTaskLogTestLayer)),
  );

  it.effect("group handle methods record calls", () =>
    Effect.gen(function* () {
      const taskLog = yield* ClackTaskLog;
      const handle = yield* taskLog.start({ title: "Build" });
      const group = yield* handle.group("compile");
      yield* group.message("compiling file.ts");
      yield* group.error("syntax error");
      yield* group.success("compiled ok");
      const record = yield* (yield* ClackTaskLogTest).get;
      expect(record.groups[0]!.calls).toEqual([
        { method: "message", args: ["compiling file.ts"] },
        { method: "error", args: ["syntax error"] },
        { method: "success", args: ["compiled ok"] },
      ]);
    }).pipe(Effect.provide(ClackTaskLogTestLayer)),
  );

  it.effect("multiple groups are tracked separately", () =>
    Effect.gen(function* () {
      const taskLog = yield* ClackTaskLog;
      const handle = yield* taskLog.start({ title: "Pipeline" });
      const g1 = yield* handle.group("lint");
      const g2 = yield* handle.group("test");
      yield* g1.message("linting...");
      yield* g2.message("testing...");
      const record = yield* (yield* ClackTaskLogTest).get;
      expect(record.groups).toHaveLength(2);
      expect(record.groups[0]!.name).toBe("lint");
      expect(record.groups[0]!.calls).toEqual([{ method: "message", args: ["linting..."] }]);
      expect(record.groups[1]!.name).toBe("test");
      expect(record.groups[1]!.calls).toEqual([{ method: "message", args: ["testing..."] }]);
    }).pipe(Effect.provide(ClackTaskLogTestLayer)),
  );

  it.effect("start with optional config fields", () =>
    Effect.gen(function* () {
      const taskLog = yield* ClackTaskLog;
      yield* taskLog.start({ title: "Build", limit: 5, retainLog: true });
      const { calls } = yield* (yield* ClackTaskLogTest).get;
      expect(calls[0]).toEqual({
        method: "start",
        args: [{ title: "Build", limit: 5, retainLog: true }],
      });
    }).pipe(Effect.provide(ClackTaskLogTestLayer)),
  );
});
