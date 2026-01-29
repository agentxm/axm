---
name: testing-unit
description: Unit test patterns for pure functions. Use when writing tests in packages/core/.
user-invocable: false
---

# Unit Testing Patterns

Unit tests verify pure business logic without dependencies. Location:
`packages/core/src/**/*.test.ts`

For Effect testing patterns (running effects, error assertions), see
`/effect-testing`.

---

## Pattern

```typescript
import { Effect } from "effect";
import { describe, expect, it } from "vitest";
import { parseSource } from "../source-parser.js";

describe("source-parser", () => {
  // Helpers - see /effect-testing for patterns
  const parse = (input: string) => Effect.runPromise(parseSource(input));

  describe("GitHub shorthand", () => {
    it("parses owner/repo", async () => {
      const result = await parse("owner/repo");

      expect(result.type).toBe("github");
      expect(result.owner).toBe("owner");
      expect(result.repo).toBe("repo");
    });
  });

  describe("edge cases", () => {
    it("handles empty string", async () => {
      // Test boundary conditions
    });

    it("handles special characters", async () => {
      // Test unusual inputs
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
