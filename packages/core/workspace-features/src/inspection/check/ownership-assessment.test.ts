import { expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import { NativePlatformTest } from "@agentxm/workspace-kernel/locations/testing";
import { LocalInspection, assessCheckOwnership } from "../index.js";
import { makeAuthoredExtensionFixture } from "../testing.js";

it.effect("reports an existing unowned path without treating it as an ownership violation", () => {
  const fixture = makeAuthoredExtensionFixture("skill");
  return fixture
    .provide(
      Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem;
        const file = `${fixture.root}/unowned.txt`;
        yield* fs.writeFileString(file, "User content");
        const inspection = yield* LocalInspection.query({
          selection: { kind: "paths", paths: [file] },
        });
        expect(inspection.items[0]?.editing.kind).toBe("unmanaged");
        expect(assessCheckOwnership({ inspection, phase: "before" }).conclusion).not.toBe(
          "attention-required",
        );
        expect(assessCheckOwnership({ inspection, phase: "before" })).toMatchObject({
          coverage: { state: "complete" },
          conclusion: "satisfied",
        });
        expect(
          assessCheckOwnership({
            inspection: {
              ...inspection,
              requests: [
                {
                  id: "all",
                  kind: "all",
                  input: "--all",
                  resolution: "resolved",
                  code: 0,
                  subjectRefs: inspection.items.map(({ id }) => id),
                  candidateRefs: [],
                },
              ],
              observationDiagnostics: [
                {
                  source: "scanner",
                  code: "scanner-config",
                  message: 'agent-root: collision on ".qoder" across agents: qoder, qoder-cn',
                },
              ],
            },
            phase: "before",
          }),
        ).toMatchObject({ coverage: { state: "complete" }, conclusion: "satisfied" });
        // A changed read belongs to the current phase, unlike an unrelated
        // inventory warning, and must prevent a complete ownership answer.
        expect(
          assessCheckOwnership({
            inspection: {
              ...inspection,
              observationDiagnostics: [
                {
                  code: "inspection-read-changed",
                  path: file,
                  message: "Content changed during observation",
                },
              ],
            },
            phase: "before",
          }),
        ).toMatchObject({ coverage: { state: "incomplete" }, conclusion: "unknown" });
        for (const diagnostic of [
          {
            code: "scanner-config",
            path: file,
            message: "Selected native target cannot be resolved",
          },
          { code: "scanner-io", path: file, message: "Selected path could not be read" },
          { code: "scanner-parse", message: "Discovery could not be completed" },
        ]) {
          expect(
            assessCheckOwnership({
              inspection: { ...inspection, observationDiagnostics: [diagnostic] },
              phase: "before",
            }).coverage.state,
          ).toBe("incomplete");
        }
        expect(yield* fs.readFileString(file)).toBe("User content");
        yield* fs.remove(file);
        const after = yield* LocalInspection.query({ selection: { kind: "paths", paths: [file] } });
        expect(assessCheckOwnership({ inspection: after, phase: "after" })).toMatchObject({
          coverage: { state: "incomplete" },
          conclusion: "unknown",
        });
      }),
    )
    .pipe(Effect.provide(NativePlatformTest), Effect.ensuring(Effect.sync(fixture.cleanup)));
});
