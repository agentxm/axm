import { describe, expect, it } from "@effect/vitest";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import * as Effect from "effect/Effect";
import * as Data from "effect/Data";
import * as Fiber from "effect/Fiber";
import * as Schema from "effect/Schema";
import * as TestClock from "effect/testing/TestClock";
import { TraceReceiptDocumentSchema, withLocalTracing } from "../index.js";
import { makeLocalTraceReceiptWriter, type LocalTraceReceiptHandle } from "./index.js";

class ReceiptIoFailed extends Data.TaggedError("ReceiptIoFailed")<{
  readonly operation: string;
}> {}

// Native promises deliberately remain pending after their Effect waiters end.
// This port models that filesystem lifetime; real receipt/collector specs own
// filesystem compatibility and the compiled tracing test owns process exit.
const promiseGate = () => {
  let release: () => void = () => undefined;
  const promise = new Promise<void>((resolve) => {
    release = resolve;
  });
  return { promise, release };
};

const receiptHandle = (
  options: {
    readonly block?: "write" | "truncate" | "close";
    readonly reject?: "write" | "truncate";
    readonly maxWriteBytes?: number;
  } = {},
) => {
  const entered = promiseGate();
  const release = promiseGate();
  const closed = promiseGate();
  const calls: string[] = [];
  let content = new Uint8Array(0);
  let active = 0;
  let maxActive = 0;
  const begin = async (operation: "write" | "truncate" | "close") => {
    calls.push(operation);
    active += 1;
    maxActive = Math.max(maxActive, active);
    if (options.reject === operation) {
      active -= 1;
      throw new ReceiptIoFailed({ operation });
    }
    if (options.block === operation) {
      entered.release();
      await release.promise;
    }
  };
  const handle: LocalTraceReceiptHandle = {
    write: async (bytes, offset, length, position) => {
      await begin("write");
      const bytesWritten = Math.min(length, options.maxWriteBytes ?? length);
      const next = new Uint8Array(Math.max(content.length, position + bytesWritten));
      next.set(content);
      next.set(bytes.subarray(offset, offset + bytesWritten), position);
      content = next;
      active -= 1;
      return { bytesWritten };
    },
    truncate: async (length) => {
      await begin("truncate");
      content = content.slice(0, length);
      active -= 1;
    },
    close: async () => {
      await begin("close");
      active -= 1;
      closed.release();
    },
  };
  return {
    handle,
    calls,
    entered: entered.promise,
    closed: closed.promise,
    release: release.release,
    text: () => new TextDecoder().decode(content),
    maxActive: () => maxActive,
  };
};

describe("Local trace receipt persistence", () => {
  const delayedOperations: ReadonlyArray<"write" | "truncate"> = ["write", "truncate"];
  for (const block of delayedOperations) {
    it.effect(`retires a timed-out ${block} without overlapping its native I/O`, () => {
      const file = receiptHandle({ block });
      return Effect.gen(function* () {
        const writer = makeLocalTraceReceiptWriter(file.handle);
        const incomplete = '{"producerComplete":false,"timings":null}\n';
        const writing = yield* writer.write(incomplete).pipe(Effect.forkChild);
        yield* Effect.promise(() => file.entered);
        yield* TestClock.adjust("100 millis");
        yield* Fiber.join(writing);

        // Finishing product work cannot lend completion to this abandoned I/O.
        yield* writer.write('{"producerComplete":true,"timings":{"executionMillis":1}}\n');
        const closing = yield* writer.close.pipe(Effect.forkChild);
        const closingAgain = yield* writer.close.pipe(Effect.forkChild);
        yield* TestClock.adjust("25 millis");
        yield* Fiber.join(closing);
        yield* Fiber.join(closingAgain);
        expect(file.calls).toEqual(block === "write" ? ["write"] : ["write", "truncate"]);

        file.release();
        yield* Effect.promise(() => file.closed);
        yield* writer.close;
        yield* writer.write('{"producerComplete":true}\n');
        expect(file.text()).toBe(incomplete);
        expect(file.calls).toEqual(
          block === "write" ? ["write", "close"] : ["write", "truncate", "close"],
        );
        expect(file.maxActive()).toBe(1);
      }).pipe(Effect.ensuring(Effect.sync(file.release)));
    });
  }

  it.effect("retains I/O ownership when its waiter is interrupted before the deadline", () => {
    const file = receiptHandle({ block: "write" });
    return Effect.gen(function* () {
      const writer = makeLocalTraceReceiptWriter(file.handle);
      const incomplete = '{"captureState":"starting"}\n';
      const writing = yield* writer.write(incomplete).pipe(Effect.forkChild);
      yield* Effect.promise(() => file.entered);
      yield* Fiber.interrupt(writing);
      yield* writer.write('{"producerComplete":true}\n');
      const closing = yield* writer.close.pipe(Effect.forkChild);
      yield* TestClock.adjust("25 millis");
      yield* Fiber.join(closing);
      expect(file.calls).toEqual(["write"]);
      file.release();
      yield* Effect.promise(() => file.closed);
      expect(file.text()).toBe(incomplete);
      expect(file.calls).toEqual(["write", "close"]);
      expect(file.maxActive()).toBe(1);
    }).pipe(Effect.ensuring(Effect.sync(file.release)));
  });

  it.effect("does not schedule another short write after its deadline", () => {
    const file = receiptHandle({ block: "write", maxWriteBytes: 3 });
    return Effect.gen(function* () {
      const writer = makeLocalTraceReceiptWriter(file.handle);
      const writing = yield* writer.write('{"producerComplete":false}\n').pipe(Effect.forkChild);
      yield* Effect.promise(() => file.entered);
      yield* TestClock.adjust("100 millis");
      yield* Fiber.join(writing);
      yield* writer.write('{"producerComplete":true}\n');
      const closing = yield* writer.close.pipe(Effect.forkChild);
      yield* TestClock.adjust("25 millis");
      yield* Fiber.join(closing);
      expect(file.calls).toEqual(["write"]);

      file.release();
      yield* Effect.promise(() => file.closed);
      yield* writer.close;
      expect(file.text()).toBe('{"p');
      expect(file.calls).toEqual(["write", "close"]);
      expect(file.maxActive()).toBe(1);
    }).pipe(Effect.ensuring(Effect.sync(file.release)));
  });

  it.effect("finishes short UTF-8 writes before truncating each complete snapshot", () =>
    Effect.gen(function* () {
      const file = receiptHandle({ maxWriteBytes: 3 });
      const writer = makeLocalTraceReceiptWriter(file.handle);
      const first = '{"producerComplete":false,"label":"é🙂 and a longer value"}\n';
      const final = '{"producerComplete":true,"label":"é🙂"}\n';
      yield* writer.write(first);
      expect(file.text()).toBe(first);
      yield* writer.write(final);
      expect(file.text()).toBe(final);
      yield* writer.close;
      yield* writer.close;
      expect(file.calls.filter((call) => call === "truncate")).toHaveLength(2);
      expect(file.calls.filter((call) => call === "close")).toHaveLength(1);
      expect(file.maxActive()).toBe(1);
    }),
  );

  it.effect("retires a zero-progress write without truncating or retrying the snapshot", () =>
    Effect.gen(function* () {
      const file = receiptHandle({ maxWriteBytes: 0 });
      const writer = makeLocalTraceReceiptWriter(file.handle);
      yield* writer.write('{"producerComplete":false}\n');
      yield* writer.write('{"producerComplete":true}\n');
      yield* writer.close;
      yield* writer.close;
      expect(file.text()).toBe("");
      expect(file.calls).toEqual(["write", "close"]);
      expect(file.maxActive()).toBe(1);
    }),
  );

  for (const reject of delayedOperations) {
    it.effect(`retires a rejected ${reject} and closes its handle once`, () =>
      Effect.gen(function* () {
        const file = receiptHandle({ reject });
        const writer = makeLocalTraceReceiptWriter(file.handle);
        yield* writer.write('{"producerComplete":false}\n');
        yield* writer.write('{"producerComplete":true}\n');
        yield* writer.close;
        yield* writer.close;
        expect(file.calls).toEqual(
          reject === "write" ? ["write", "close"] : ["write", "truncate", "close"],
        );
        expect(file.text()).toBe(reject === "write" ? "" : '{"producerComplete":false}\n');
        expect(file.maxActive()).toBe(1);
      }),
    );
  }

  it.effect("bounds the close waiter while closing the handle exactly once", () => {
    const file = receiptHandle({ block: "close" });
    return Effect.gen(function* () {
      const writer = makeLocalTraceReceiptWriter(file.handle);
      const document = '{"producerComplete":true}\n';
      yield* writer.write(document);
      const closing = yield* writer.close.pipe(Effect.forkChild);
      yield* Effect.promise(() => file.entered);
      const closingAgain = yield* writer.close.pipe(Effect.forkChild);
      yield* TestClock.adjust("25 millis");
      yield* Fiber.join(closing);
      yield* Fiber.join(closingAgain);
      yield* writer.write('{"captureState":"starting"}\n');
      expect(file.calls).toEqual(["write", "truncate", "close"]);
      file.release();
      yield* Effect.promise(() => file.closed);
      expect(file.text()).toBe(document);
      expect(file.maxActive()).toBe(1);
    }).pipe(Effect.ensuring(Effect.sync(file.release)));
  });
});

describe("Local trace receipt rewrites", () => {
  const first = '{"schemaVersion":2,"service":"axm","captureState":"disabled"}\n';
  const second = '{"schemaVersion":2,"service":"axm","captureState":"setup-failed"}\n';

  it.effect("skips a document identical to the last persisted one", () =>
    Effect.gen(function* () {
      const file = receiptHandle();
      const writer = makeLocalTraceReceiptWriter(file.handle);
      yield* writer.write(first);
      yield* writer.write(first);
      expect(file.calls).toEqual(["write", "truncate"]);
      expect(file.text()).toBe(first);
      yield* writer.close;
      expect(file.calls).toEqual(["write", "truncate", "close"]);
    }),
  );

  it.effect("persists every document that differs from the last persisted one", () =>
    Effect.gen(function* () {
      const file = receiptHandle();
      const writer = makeLocalTraceReceiptWriter(file.handle);
      yield* writer.write(first);
      yield* writer.write(second);
      expect(file.calls).toEqual(["write", "truncate", "write", "truncate"]);
      expect(file.text()).toBe(second);
      // An earlier document is not the last persisted one, so it is written again.
      yield* writer.write(first);
      expect(file.calls).toEqual(["write", "truncate", "write", "truncate", "write", "truncate"]);
      expect(file.text()).toBe(first);
    }),
  );

  it.effect("skips an identical document only after its short writes all completed", () =>
    Effect.gen(function* () {
      const file = receiptHandle({ maxWriteBytes: 3 });
      const writer = makeLocalTraceReceiptWriter(file.handle);
      const document = '{"captureState":"é🙂"}\n';
      const writes = Math.ceil(new TextEncoder().encode(document).length / 3);
      yield* writer.write(document);
      yield* writer.write(document);
      expect(file.calls).toEqual([...Array.from({ length: writes }, () => "write"), "truncate"]);
      expect(file.text()).toBe(document);
    }),
  );

  it.effect("drops an identical document after a timed-out write retired the writer", () => {
    const file = receiptHandle({ block: "write" });
    return Effect.gen(function* () {
      const writer = makeLocalTraceReceiptWriter(file.handle);
      const writing = yield* writer.write(first).pipe(Effect.forkChild);
      yield* Effect.promise(() => file.entered);
      yield* TestClock.adjust("100 millis");
      yield* Fiber.join(writing);
      file.release();
      yield* writer.write(first);
      const closing = yield* writer.close.pipe(Effect.forkChild);
      yield* TestClock.adjust("25 millis");
      yield* Fiber.join(closing);
      yield* Effect.promise(() => file.closed);
      expect(file.calls).toEqual(["write", "close"]);
      expect(file.text()).toBe(first);
    }).pipe(Effect.ensuring(Effect.sync(file.release)));
  });

  it.effect("drops an identical document after a rejected truncate retired the writer", () =>
    Effect.gen(function* () {
      const file = receiptHandle({ reject: "truncate" });
      const writer = makeLocalTraceReceiptWriter(file.handle);
      yield* writer.write(first);
      yield* writer.write(first);
      expect(file.calls).toEqual(["write", "truncate"]);
      yield* writer.close;
      expect(file.calls).toEqual(["write", "truncate", "close"]);
    }),
  );

  it.live("leaves exactly the capture state of a session-less invocation in the receipt file", () =>
    Effect.scoped(
      Effect.gen(function* () {
        const directory = yield* Effect.acquireRelease(
          Effect.promise(() => mkdtemp(join(tmpdir(), "axm-receipt-rewrite-"))),
          (path) => Effect.promise(() => rm(path, { recursive: true, force: true })),
        );
        const decode = Schema.decodeUnknownSync(Schema.fromJsonString(TraceReceiptDocumentSchema));
        const disabled = join(directory, "disabled.json");
        expect(yield* withLocalTracing(Effect.succeed(42), { AXM_TRACE_RECEIPT: disabled })).toBe(
          42,
        );
        const disabledText = yield* Effect.promise(() => readFile(disabled, "utf8"));
        expect(disabledText).toBe(first);
        expect(decode(disabledText)).toEqual({
          schemaVersion: 2,
          service: "axm",
          captureState: "disabled",
        });

        const invalid = join(directory, "invalid-endpoint.json");
        expect(
          yield* withLocalTracing(Effect.succeed(42), {
            AXM_TRACE: "1",
            AXM_TRACE_ENDPOINT: "http://127.0.0.1:5341/ingest/otlp/v1/traces?private",
            AXM_TRACE_RECEIPT: invalid,
          }),
        ).toBe(42);
        const invalidText = yield* Effect.promise(() => readFile(invalid, "utf8"));
        expect(invalidText).toBe(
          '{"schemaVersion":2,"service":"axm","captureState":"invalid-endpoint"}\n',
        );
        expect(decode(invalidText)).toEqual({
          schemaVersion: 2,
          service: "axm",
          captureState: "invalid-endpoint",
        });
      }),
    ),
  );
});
