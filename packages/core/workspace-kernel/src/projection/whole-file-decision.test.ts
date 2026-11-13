import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import { describe, expect, it } from "@effect/vitest";
import { ProjectionDigestSchema, type RecordedProjectionRow } from "../workspace-state/index.js";
import { decideOutputDeletion } from "./deletion-guard.js";
import { decideWholeFileWrite } from "./whole-file-decision.js";

const gen = ProjectionDigestSchema.make(`sha256:${"a".repeat(64)}`);
const older = ProjectionDigestSchema.make(`sha256:${"b".repeat(64)}`);
const rendered = "rendered\n";
const lastWritten = "last written\n";
const edited = "hand edited\n";
const row = (fields: { readonly gen?: typeof gen; readonly stale?: boolean }) =>
  Option.some<RecordedProjectionRow>({
    row: {
      ...(fields.gen === undefined ? {} : { gen: fields.gen }),
      output: ProjectionDigestSchema.make(
        "sha256:08b2ab97e4813ac766d37e3322d58e632c9bbb6e11c8e78f5cd94847a48d6158",
      ),
    },
    stale: fields.stale ?? fields.gen === undefined,
  });
const none = Option.none<RecordedProjectionRow>();

describe("decideWholeFileWrite", () => {
  it.effect.each([
    {
      label: "current row, present",
      recorded: row({ gen }),
      bytes: Option.some(edited),
      replace: false,
      expected: { _tag: "current" },
    },
    {
      label: "current row, absent",
      recorded: row({ gen }),
      bytes: Option.none(),
      replace: false,
      expected: { _tag: "write", lastWrite: "absent" },
    },
    {
      label: "stale row, absent",
      recorded: row({ gen: older }),
      bytes: Option.none(),
      replace: false,
      expected: { _tag: "write", lastWrite: "absent" },
    },
    {
      label: "stale row, last write",
      recorded: row({ gen: older }),
      bytes: Option.some(lastWritten),
      replace: false,
      expected: { _tag: "write", lastWrite: "matches" },
    },
    {
      label: "stale row, already rendered",
      recorded: row({ gen: older }),
      bytes: Option.some(rendered),
      replace: false,
      expected: { _tag: "write", lastWrite: "matches" },
    },
    {
      label: "stale row, hand edited",
      recorded: row({ gen: older }),
      bytes: Option.some(edited),
      replace: false,
      expected: { _tag: "write", lastWrite: "modified" },
    },
    {
      label: "contract-stale row, matching gen",
      recorded: row({ gen, stale: true }),
      bytes: Option.some(lastWritten),
      replace: false,
      expected: { _tag: "write", lastWrite: "matches" },
    },
    {
      label: "row without gen",
      recorded: row({}),
      bytes: Option.some(edited),
      replace: false,
      expected: { _tag: "write", lastWrite: "modified" },
    },
    {
      label: "no row, absent",
      recorded: none,
      bytes: Option.none(),
      replace: false,
      expected: { _tag: "write", lastWrite: "absent" },
    },
    {
      label: "no row, identical",
      recorded: none,
      bytes: Option.some(rendered),
      replace: false,
      expected: { _tag: "record" },
    },
    {
      label: "no row, identical, replace",
      recorded: none,
      bytes: Option.some(rendered),
      replace: true,
      expected: { _tag: "record" },
    },
    {
      label: "no row, different",
      recorded: none,
      bytes: Option.some(edited),
      replace: false,
      expected: { _tag: "conflict" },
    },
    {
      label: "no row, different, replace",
      recorded: none,
      bytes: Option.some(edited),
      replace: true,
      expected: { _tag: "write", lastWrite: "unrecorded" },
    },
  ])("$label", ({ recorded, bytes, replace, expected }) =>
    Effect.gen(function* () {
      expect(
        yield* decideWholeFileWrite({ recorded, gen, bytes, rendered, replaceUnrecorded: replace }),
      ).toEqual(expected);
    }),
  );
});

describe("decideOutputDeletion", () => {
  it.effect.each([
    {
      label: "already absent",
      recorded: none,
      bytes: Option.none<string>(),
      render: Option.none<string>(),
      discard: false,
      expected: { _tag: "delete" },
    },
    {
      label: "unrecorded",
      recorded: none,
      bytes: Option.some(lastWritten),
      render: Option.none<string>(),
      discard: false,
      expected: { _tag: "retain", reason: "unrecorded" },
    },
    {
      label: "unrecorded, discard ignored",
      recorded: none,
      bytes: Option.some(rendered),
      render: Option.some(rendered),
      discard: true,
      expected: { _tag: "retain", reason: "unrecorded" },
    },
    {
      label: "matches last write",
      recorded: row({ gen }),
      bytes: Option.some(lastWritten),
      render: Option.none<string>(),
      discard: false,
      expected: { _tag: "delete" },
    },
    {
      label: "matches current render",
      recorded: row({ gen }),
      bytes: Option.some(rendered),
      render: Option.some(rendered),
      discard: false,
      expected: { _tag: "delete" },
    },
    {
      label: "modified",
      recorded: row({ gen }),
      bytes: Option.some(edited),
      render: Option.some(rendered),
      discard: false,
      expected: { _tag: "retain", reason: "modified" },
    },
    {
      label: "modified, discard",
      recorded: row({ gen }),
      bytes: Option.some(edited),
      render: Option.none<string>(),
      discard: true,
      expected: { _tag: "delete" },
    },
  ])("$label", ({ recorded, bytes, render, discard, expected }) =>
    Effect.gen(function* () {
      expect(
        yield* decideOutputDeletion({
          recorded,
          bytes,
          expectedRender: render,
          discardModified: discard,
        }),
      ).toEqual(expected);
    }),
  );
});
