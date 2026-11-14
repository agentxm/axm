import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";
import { LocalCheckDocumentSchema } from "@agentxm/workspace-features/inspection";
import { makeWorkspaceLifecycleTestContext } from "../../test-support/test-helpers.js";
import { writeWorkspaceFiles } from "../../test-support/test-stubs.js";
import { makeAxmSkillCompatibilityPolicyLayer } from "@agentxm/cli-maintenance/official-skill/composition";
import { handleLocalCheck } from "./command.js";

it.effect(
  "reports completed negative assessment and an empty-scope success through the same schema",
  () => {
    const original = process.cwd();
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "axm-check-command-"));
    process.chdir(root);
    writeWorkspaceFiles(path.join(root, ".axm"));
    const { provide, rendererState } = makeWorkspaceLifecycleTestContext({ machine: true });
    return provide(
      Effect.gen(function* () {
        const missing = yield* handleLocalCheck({
          selection: { kind: "identities", identities: ["missing"] },
          checks: ["lint"],
          strict: false,
        });
        expect(missing.exitCode).toBe(1);
        const negative = Schema.decodeUnknownSync(LocalCheckDocumentSchema)(
          rendererState.results[0]?.data,
        );
        expect(negative.verdict.ok).toBe(false);
        expect(negative.selection.requests[0]?.resolution).toBe("not-found");
        const empty = yield* handleLocalCheck({
          selection: { kind: "all" },
          checks: ["lint"],
          strict: false,
        });
        expect(empty.exitCode).toBe(0);
        const positive = Schema.decodeUnknownSync(LocalCheckDocumentSchema)(
          rendererState.results[1]?.data,
        );
        expect(positive.verdict.ok).toBe(true);
        expect(positive.scope.subjects).toEqual([]);
        expect(
          rendererState.events.filter((event) => event._tag === "OperationSettled"),
        ).toMatchObject([{ outcome: "completed" }, { outcome: "completed" }]);
      }),
    ).pipe(
      Effect.provide(makeAxmSkillCompatibilityPolicyLayer("1.0.0")),
      Effect.ensuring(
        Effect.sync(() => {
          process.chdir(original);
          fs.rmSync(root, { recursive: true, force: true });
        }),
      ),
    );
  },
);
