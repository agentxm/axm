import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import { validateAgentIds } from "./validate-agent-ids.js";

describe("agent id validation", () => {
  it.effect("reports the manual delivery path for a hosted agent", () =>
    Effect.gen(function* () {
      const error = yield* validateAgentIds(["chatgpt"]).pipe(Effect.flip);

      expect(error.category).toBe("validation");
      expect(error.detail).toContain("ChatGPT is a hosted agent");
      expect(error.detail).toContain("axm lint");
      expect(error.detail).toContain(
        "ChatGPT workspace skill administration for an eligible workspace",
      );
      expect(error.detail).toContain("ChatGPT plugin for web/mobile distribution");
      expect(error.detail).toContain("AXM does not upload or publish it");
      expect(error.suggestions).toEqual([
        {
          description: "Open the ChatGPT skill installation guide.",
          url: "https://learn.chatgpt.com/docs/enterprise/skills",
        },
      ]);
    }),
  );
});
