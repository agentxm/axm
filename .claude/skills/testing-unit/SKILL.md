---
name: testing-unit
description: Unit test patterns for pure functions. Use when writing tests in packages/core/.
user-invocable: false
---

# Unit Testing Patterns

Unit tests verify pure business logic without dependencies. Location:
`packages/core/src/**/*.test.ts`

---

## Pattern

```typescript
import { Effect } from "effect";
import { describe, expect, it } from "vitest";
import { parseSource } from "../source-parser.js";

describe("source-parser", () => {
  // Helper to run Effect and return result
  const parse = (input: string) => Effect.runPromise(parseSource(input));

  // Helper for expected failures
  const parseError = (input: string) =>
    Effect.runPromise(parseSource(input).pipe(Effect.either)).then((result) => {
      expect(result._tag).toBe("Left");
      if (result._tag === "Left") return result.left;
      throw new Error("Expected failure");
    });

  describe("GitHub shorthand", () => {
    it("parses owner/repo", async () => {
      const result = await parse("owner/repo");

      expect(result.type).toBe("github");
      expect(result.owner).toBe("owner");
      expect(result.repo).toBe("repo");
    });

    it("rejects invalid format", async () => {
      const error = await parseError("invalid");

      expect(error._tag).toBe("ParseError");
    });
  });
});
```

---

## Checklist

- [ ] **Pure functions only** — No I/O, no services, no side effects
- [ ] **Single behavior per test** — One assertion per logical behavior
- [ ] **Descriptive names** — Test name describes behavior being verified
- [ ] **Edge cases covered** — Empty inputs, boundaries, error cases
- [ ] **Effect.either for errors** — Use `Effect.either` to assert on failures
