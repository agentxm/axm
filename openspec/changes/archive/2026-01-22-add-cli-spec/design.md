## Context

The CLI entry point (`packages/cli/src/main.ts`) uses Effect with `Console.log` for output. Testing requires verifying the startup message without running the full CLI process.

## Goals / Non-Goals

- Goals: Unit test the startup message output
- Non-Goals: E2E CLI testing (process spawning) at this stage

## Decisions

- **Decision**: Use Effect's testable layer pattern to mock `Console`
- **Alternatives considered**:
  1. Spawn `axm` as subprocess and capture stdout - More realistic but slower, harder to isolate
  2. Extract message to constant and test constant - Too shallow, doesn't verify actual output behavior
  3. Mock Effect Console service - Preferred: fast, isolated, tests real behavior

## Approach

1. Extract the CLI program Effect to a testable module
2. In tests, provide a `TestConsole` layer that captures output
3. Assert captured output contains "AgentXM CLI ready"

```typescript
// Example test structure
import { Effect, TestConsole } from "effect";
import { program } from "./main.js";

it("displays startup message", async () => {
  const result = await Effect.runPromise(program.pipe(Effect.provide(TestConsole.layer)));
  const output = yield * TestConsole.output;
  expect(output).toContain("AgentXM CLI ready");
});
```

## Risks / Trade-offs

- **Risk**: Test doesn't verify actual CLI invocation
- **Mitigation**: Add E2E test later if needed; unit test provides fast feedback for now

## Open Questions

- None
