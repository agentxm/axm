import { describe, expect, it } from "vitest";

import { bytes, day, list, moment, remainingTime } from "./grammar.js";
import { interruptionPhrase, verdictFacts } from "./phrases.js";

describe("human vocabulary", () => {
  it("keeps interruption outcomes distinct, with the consequence apart from the claim", () => {
    expect(interruptionPhrase("SIGINT", "restored")).toEqual({
      claim: "Interrupted",
      consequence: "changes rolled back",
    });
    expect(interruptionPhrase("SIGTERM", "retained")).toEqual({
      claim: "Terminated",
      consequence: "partial work kept",
    });
    expect(verdictFacts(interruptionPhrase("SIGINT", "untouched"), ["exit 130"])).toEqual([
      "no changes made",
      "exit 130",
    ]);
  });

  it("says how long is left as minutes and zero-padded seconds", () => {
    expect(remainingTime(292_000)).toBe("4:52 left");
    expect(remainingTime(600_000)).toBe("10:00 left");
    expect(remainingTime(45_000)).toBe("0:45 left");
    expect(remainingTime(1)).toBe("0:01 left");
    expect(remainingTime(0)).toBe("expired");
  });

  it("states sizes, lists, and dates in one form each", () => {
    expect(bytes(999)).toBe("999 B");
    expect(bytes(96_000)).toBe("96 KB");
    expect(bytes(2_500_000_000)).toBe("2.5 GB");
    expect(list(["a"])).toBe("a");
    expect(list(["a", "b"])).toBe("a and b");
    expect(list(["a", "b", "c"])).toBe("a, b, and c");
    expect(day("2026-09-21T16:44:17.865Z")).toBe("21 Sep 2026");
    expect(moment("2026-09-21T16:44:17.865Z")).toBe("21 Sep 2026 16:44 UTC");
  });
});
