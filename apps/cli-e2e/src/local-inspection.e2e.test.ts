import * as fs from "node:fs";
import * as path from "node:path";
import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";
import { expect, it } from "@effect/vitest";
import { defineExecutionBinding } from "@agentxm/specification-metadata";
import { snapshotTree } from "@agentxm/test-support";
import { makeDirectoryFixture } from "./test-support/directory-harness.js";
import { snapshotHomeWithoutFailureRecords } from "./test-support/diagnostic-home-snapshot.js";

export const executionBinding = defineExecutionBinding({
  requirements: [
    "cli/show/selection-is-explicit",
    "cli/show/preserves-request-outcomes",
    "cli/commands-use-selected-directory",
  ],
  boundary: "process",
  rationale:
    "The assembled CLI parses root and typed selectors in the chosen directory, returns equal full documents, and reports completed-query process exits for exact misses, conflicts and partial batches.",
});

const document = Schema.decodeUnknownSync(
  Schema.fromJsonString(Schema.Record(Schema.String, Schema.Unknown)),
);

it.effect(
  "keeps root and typed facts equal through real selection, directory and completion boundaries",
  () => {
    const fixture = makeDirectoryFixture();
    fs.writeFileSync(path.join(fixture.invoking, "axm.json"), "{ malformed incidental workspace");
    fs.writeFileSync(
      path.join(fixture.selected, "axm.json"),
      JSON.stringify({
        owner: "@acme",
        agents: [],
        skills: { review: { source: "workspace" } },
        rules: { review: { source: "workspace" } },
      }),
    );
    for (const { directory, type, filename } of [
      { directory: "skills", type: "skill", filename: "SKILL.md" },
      { directory: "rules", type: "rule", filename: "RULE.md" },
    ]) {
      const root = path.join(fixture.selected, directory, "review");
      fs.mkdirSync(path.join(root, "src"), { recursive: true });
      fs.writeFileSync(
        path.join(root, `${type}.json`),
        JSON.stringify({
          owner: "@acme",
          name: "review",
          type,
          version: "1.0.0",
          description: "Review changes",
          ...(type === "rule" ? { title: "Review changes" } : {}),
        }),
      );
      fs.writeFileSync(
        path.join(root, "src", filename),
        "---\nname: review\ndescription: Review changes\n---\nReview the change.\n",
      );
    }
    const snapshot = () => ({
      invoking: snapshotTree(fixture.invoking),
      selected: snapshotTree(fixture.selected),
      home: snapshotHomeWithoutFailureRecords(fixture.home),
    });
    const before = snapshot();
    return Effect.gen(function* () {
      for (const selection of [
        { args: ["review"], exit: 0 },
        { args: ["review", "missing", "review"], exit: 1 },
        { args: ["--all"], exit: 0 },
        {
          args: ["--path", "skills/review/src/SKILL.md", "--path", "skills/review/src/SKILL.md"],
          exit: 0,
        },
      ]) {
        const root = yield* Effect.tryPromise(() =>
          fixture.run([
            "-C",
            fixture.selected,
            "show",
            ...selection.args,
            "--type",
            "skill",
            "--json",
          ]),
        );
        const typed = yield* Effect.tryPromise(() =>
          fixture.run(["-C", fixture.selected, "skills", "show", ...selection.args, "--json"]),
        );
        expect(root.exitCode, root.stdout + root.stderr).toBe(selection.exit);
        expect(typed.exitCode, typed.stdout + typed.stderr).toBe(selection.exit);
        expect(document(root.stdout)).toEqual(document(typed.stdout));
        expect(document(root.stdout)).toMatchObject({
          ok: selection.exit === 0,
          mode: "query",
          outcome: "completed",
          result: { scope: "project" },
        });
        if (selection.exit === 1)
          expect(document(root.stdout)).toMatchObject({
            result: {
              requests: [{ code: 0 }, { code: 3 }, { code: 0 }],
              items: [expect.objectContaining({ requestRefs: ["request-1", "request-3"] })],
            },
          });
      }
      for (const [name, exit] of [
        ["review", 6],
        ["missing", 3],
      ] as const) {
        const result = yield* Effect.tryPromise(() =>
          fixture.run(["-C", fixture.selected, "show", name, "--json"]),
        );
        expect(result.exitCode, result.stdout + result.stderr).toBe(exit);
        expect(document(result.stdout)).toMatchObject({
          ok: false,
          mode: "query",
          outcome: "completed",
          result: { requests: [{ code: exit }] },
        });
      }
      expect(snapshot()).toEqual(before);
    }).pipe(Effect.ensuring(Effect.sync(fixture.cleanup)));
  },
);
