import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import { validateAgentIds } from "./membership.js";

describe("agent id validation", () => {
  it.effect("reports the manual delivery path for a hosted agent", () =>
    Effect.gen(function* () {
      const error = yield* validateAgentIds(["chatgpt"]).pipe(Effect.flip);

      expect(error.category).toBe("validation");
      expect(error.detail).toContain("ChatGPT is a hosted agent");
      expect(error.detail).toContain("axm lint");
      expect(error.detail).toContain("Upload from your computer");
      expect(error.suggestions).toEqual([
        {
          description: "Open the ChatGPT skill installation guide.",
          url: "https://help.openai.com/en/articles/20001066-skills-in-chatgpt",
        },
      ]);
    }),
  );
});
