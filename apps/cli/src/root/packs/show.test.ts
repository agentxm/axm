import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import { makeAuthoredPackFixture } from "@agentxm/workspace/inspection/testing";

import { makeCliTestContext } from "../../test-support/test-helpers.js";
import { humanScreenLayer, makeRecordingStreams } from "../../test-support/screen-harness.js";
import { handlePacksShow } from "./show.js";

describe("pack inspection output", () => {
  it.effect("keeps source authority and declared members together on stdout", () => {
    const fixture = makeAuthoredPackFixture({ dependencies: { "@acme/skills/review": ">=1.2.3" } });
    const streams = makeRecordingStreams();
    const context = makeCliTestContext({ screenLayer: humanScreenLayer(streams) });
    return fixture
      .provide(
        Effect.gen(function* () {
          yield* handlePacksShow("toolkit");
          const stdout = streams.lines("stdout").join("\n");
          for (const fact of [
            "@acme/packs/toolkit",
            "Source authority",
            "workspace",
            "@acme/skills/review",
            ">=1.2.3",
            "satisfying",
          ])
            expect(stdout).toContain(fact);
          expect(streams.lines("stderr").join("\n")).toContain("Inspect pack");
        }),
      )
      .pipe(Effect.provide(context.baseLayer), Effect.ensuring(Effect.sync(fixture.cleanup)));
  });
});
