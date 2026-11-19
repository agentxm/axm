/**
 * Review a design change as paintings rather than text diffs.
 *
 * `lab review` finds every gallery snapshot that differs from a Git revision,
 * `HEAD` unless `--base` names another, and shows each one before and after
 * side by side, marking the rows that changed. A snapshot too wide to sit
 * beside its counterpart is shown stacked instead. Added and removed
 * snapshots show against an empty side.
 */

import * as Console from "effect/Console";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Option from "effect/Option";
import * as Path from "effect/Path";
import { ChildProcess, ChildProcessSpawner } from "effect/process";

import { displayWidth, padDisplay } from "../../src/screen/width.js";

import { userError, type LabStyle } from "./shared.js";

const ESC = "\u001b[";
const tone = (code: string, text: string, colors: boolean) =>
  colors ? `${ESC}${code}m${text}${ESC}0m` : text;

interface SnapshotChange {
  readonly file: string;
  readonly status: "added" | "removed" | "modified";
  readonly before: ReadonlyArray<string>;
  readonly after: ReadonlyArray<string>;
}

const linesOf = (content: string): ReadonlyArray<string> =>
  content.length === 0 ? [] : content.replace(/\n$/u, "").split("\n");

const sideBySide = (
  change: SnapshotChange,
  columns: number,
  colors: boolean,
): ReadonlyArray<string> => {
  const half = Math.floor((columns - 3) / 2);
  const widest = Math.max(0, ...[...change.before, ...change.after].map(displayWidth));
  const rows = Math.max(change.before.length, change.after.length);
  if (widest > half) {
    return [
      tone("2", "before", colors),
      ...change.before.map((line, index) =>
        line === change.after[index] ? line : tone("31", line, colors),
      ),
      tone("2", "after", colors),
      ...change.after.map((line, index) =>
        line === change.before[index] ? line : tone("32", line, colors),
      ),
    ];
  }
  const width = Math.max(widest, Math.min(half, 40));
  return [
    `${padDisplay(tone("2", "before", colors), width)}   ${tone("2", "after", colors)}`,
    ...Array.from({ length: rows }, (_, index) => {
      const before = change.before[index] ?? "";
      const after = change.after[index] ?? "";
      const same = before === after;
      const gutter = same ? " │ " : tone("33", " ┃ ", colors);
      return `${padDisplay(same ? before : tone("31", before, colors), width)}${gutter}${same ? after : tone("32", after, colors)}`.trimEnd();
    }),
  ];
};

export const reviewSnapshots = (base: string, columns: number, style: LabStyle) =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const spawner = yield* ChildProcessSpawner.ChildProcessSpawner;
    const snapshots = yield* path.fromFileUrl(
      new URL("../../src/test-support/gallery/__snapshots__/", import.meta.url),
    );
    const root = (yield* spawner.string(
      ChildProcess.make("git", ["rev-parse", "--show-toplevel"], { cwd: snapshots }),
    )).trim();
    // Pathspecs resolve from the working directory, so Git runs at the root.
    const git = (args: ReadonlyArray<string>) =>
      spawner.string(ChildProcess.make("git", args, { cwd: root }));
    const relative = path.relative(root, snapshots);
    const verified = yield* git(["rev-parse", "--verify", "--quiet", `${base}^{commit}`]).pipe(
      Effect.option,
    );
    if (Option.isNone(verified) || verified.value.trim().length === 0)
      return yield* userError(`${base} is not a revision Git knows.`);
    const tracked = linesOf(
      yield* git(["diff", "--name-status", "--no-renames", base, "--", relative]),
    ).flatMap(
      (
        line,
      ): ReadonlyArray<{ readonly file: string; readonly status: SnapshotChange["status"] }> => {
        const [code, file] = line.split("\t");
        if (file === undefined) return [];
        const status = code === "A" ? "added" : code === "D" ? "removed" : "modified";
        return [{ file: path.basename(file), status }];
      },
    );
    const untracked = linesOf(
      yield* git(["ls-files", "--others", "--exclude-standard", "--", relative]),
    ).map((file) => ({ file: path.basename(file), status: "added" as const }));
    const changes = [...tracked, ...untracked].sort((left, right) =>
      left.file < right.file ? -1 : left.file > right.file ? 1 : 0,
    );
    if (changes.length === 0) {
      yield* Console.log(`No gallery snapshot differs from ${base}.`);
      return;
    }
    for (const change of changes) {
      const before =
        change.status === "added"
          ? []
          : linesOf(yield* git(["show", `${base}:${relative}/${change.file}`]));
      const after =
        change.status === "removed"
          ? []
          : linesOf(yield* fs.readFileString(path.join(snapshots, change.file)));
      const name = change.file.replace(/\.txt$/u, "");
      const title = `── ${name} (${change.status}) `;
      yield* Console.log(
        tone(
          "1",
          `${title}${"─".repeat(Math.max(0, columns - displayWidth(title)))}`,
          style.colors,
        ),
      );
      yield* Console.log(
        sideBySide({ ...change, before, after }, columns, style.colors).join("\n"),
      );
      yield* Console.log("");
    }
    yield* Console.log(
      changes.length === 1
        ? `1 snapshot differs from ${base}.`
        : `${String(changes.length)} snapshots differ from ${base}.`,
    );
  });
