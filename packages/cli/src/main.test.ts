import { Console, Effect, Ref } from "effect";
import { describe, expect, it } from "vitest";
import { program } from "./main.js";

const TypeId: Console.TypeId = Symbol.for("effect/Console") as Console.TypeId;

const makeTestConsole = (outputRef: Ref.Ref<string[]>): Console.Console => ({
  [TypeId]: TypeId,
  assert: () => Effect.void,
  clear: Effect.void,
  count: () => Effect.void,
  countReset: () => Effect.void,
  debug: () => Effect.void,
  dir: () => Effect.void,
  dirxml: () => Effect.void,
  error: () => Effect.void,
  group: () => Effect.void,
  groupEnd: Effect.void,
  info: () => Effect.void,
  log: (...args: ReadonlyArray<unknown>) =>
    Ref.update(outputRef, (lines) => [...lines, args.join(" ")]),
  table: () => Effect.void,
  time: () => Effect.void,
  timeEnd: () => Effect.void,
  timeLog: () => Effect.void,
  trace: () => Effect.void,
  warn: () => Effect.void,
  unsafe: console,
});

describe("main", () => {
  it("displays startup message", async () => {
    const output = await Effect.runPromise(
      Effect.gen(function* () {
        const outputRef = yield* Ref.make<string[]>([]);
        const testConsole = makeTestConsole(outputRef);
        yield* Console.withConsole(program, testConsole);
        return yield* Ref.get(outputRef);
      }),
    );

    expect(output).toContain("AgentXM CLI ready");
  });
});
