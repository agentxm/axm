---
name: testing-unit
description: Unit test patterns for pure functions and business logic. Use for *.test.ts colocated with source in packages/core/ or packages/cli/src/.
user-invocable: false
---

# Unit Testing Patterns

Unit tests verify business logic. For pure functions, no dependencies are needed.
For handlers, provide test layers—see `/effect-testing`.

Location: colocated with source (e.g., `packages/core/src/**/*.test.ts`).

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

- [ ] **Single behavior per test** — One assertion per logical behavior
- [ ] **Descriptive names** — Test name describes behavior being verified
- [ ] **Edge cases covered** — Empty inputs, boundaries, error cases
- [ ] **Provide layers for handlers** — Use test layers for service dependencies
