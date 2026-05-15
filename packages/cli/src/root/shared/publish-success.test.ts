import * as Option from "effect/Option";
import { describe, expect, it } from "vitest";

import type { ExecutedPlan } from "@agentxm/client-core/unstable/plan";

import { publishSuccessRender } from "./publish-success.js";

describe("publishSuccessRender", () => {
  it("renders linked publish steps inline and as suggestions", () => {
    const resolution: ExecutedPlan = {
      _tag: "ExecutedPlan",
      name: "Publish skill",
      description: Option.some("Publish skills"),
      jobs: [
        {
          concurrency: 1,
          steps: [
            {
              label: "Publish @acme/skills/review",
              result: {
                result: "success",
                message: "Published @acme/skills/review@1.0.0",
                links: { html: "https://agentxm.ai/acme/skills/review" },
              },
            },
            {
              label: "Publish @acme/skills/lint",
              result: {
                result: "success",
                message: "Published @acme/skills/lint@1.0.0",
                links: { html: "https://agentxm.ai/acme/skills/lint" },
              },
            },
          ],
        },
      ],
    };

    expect(publishSuccessRender(resolution)).toEqual({
      message: [
        "Published @acme/skills/review@1.0.0",
        "→ https://agentxm.ai/acme/skills/review",
        "Published @acme/skills/lint@1.0.0",
        "→ https://agentxm.ai/acme/skills/lint",
      ].join("\n"),
      suggestions: [
        {
          description: "View in browser",
          url: "https://agentxm.ai/acme/skills/review",
        },
        {
          description: "View in browser",
          url: "https://agentxm.ai/acme/skills/lint",
        },
      ],
    });
  });

  it("keeps the existing Done message when no links are available", () => {
    const resolution: ExecutedPlan = {
      _tag: "ExecutedPlan",
      name: "Publish skill",
      description: Option.none(),
      jobs: [
        {
          concurrency: 1,
          steps: [
            {
              label: "Publish @acme/skills/review",
              result: { result: "success", message: "Published @acme/skills/review@1.0.0" },
            },
          ],
        },
      ],
    };

    expect(publishSuccessRender(resolution)).toEqual({ message: "Done" });
  });
});
