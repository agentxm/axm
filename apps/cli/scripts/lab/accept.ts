/**
 * Accept the painting of named fixtures as their new snapshots.
 *
 * `lab accept <fixture...>` runs the gallery test for those fixtures alone
 * with snapshot updates on, so their invariants still have to hold, and then
 * removes any of their snapshot files no longer at a size they snapshot. Every
 * other fixture's snapshots are left exactly as they were.
 */

import * as Console from "effect/Console";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Path from "effect/Path";
import { ChildProcess } from "effect/process";

import { snapshotFilesOf, type GalleryFixture } from "../../src/test-support/gallery/fixture.js";

import { userError } from "./shared.js";

const escapeRegExp = (value: string): string => value.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");

export const acceptFixtures = (
  gallery: ReadonlyArray<GalleryFixture>,
  names: ReadonlyArray<string>,
) =>
  Effect.gen(function* () {
    const unknown = names.filter((name) => !gallery.some((fixture) => fixture.name === name));
    if (unknown.length > 0)
      return yield* userError(
        `No fixture is named ${unknown.join(", ")}. List them with \`pnpm lab list\`.`,
      );
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const cliRoot = yield* path.fromFileUrl(new URL("../../", import.meta.url));
    const snapshots = path.join(cliRoot, "src/test-support/gallery/__snapshots__");
    // A test is named `paints <fixture>.<size> within the terminal`.
    const pattern = `paints (${names.map(escapeRegExp).join("|")})\\.[0-9]`;
    const vitest = yield* ChildProcess.make(
      "pnpm",
      [
        "exec",
        "vitest",
        "run",
        "--config",
        "vitest.screen.config.ts",
        "--update",
        "--testNamePattern",
        pattern,
        "src/test-support/gallery/gallery.test.ts",
      ],
      {
        cwd: cliRoot,
        env: { NODE_OPTIONS: "--conditions=axm-source" },
        extendEnv: true,
        stdin: "inherit",
        stdout: "inherit",
        stderr: "inherit",
      },
    );
    const exitCode = yield* vitest.exitCode;
    if (exitCode !== 0)
      return yield* userError("The gallery test failed, so the snapshots were not all accepted.");
    const kept = new Set(
      gallery.filter((fixture) => names.includes(fixture.name)).flatMap(snapshotFilesOf),
    );
    const stale = (yield* fs.readDirectory(snapshots)).filter(
      (file) => !kept.has(file) && names.some((name) => file.startsWith(`${name}.`)),
    );
    for (const file of stale) yield* fs.remove(path.join(snapshots, file));
    yield* Console.log(
      `Accepted ${names.join(", ")}${stale.length === 0 ? "" : `; removed ${stale.join(", ")}`}.`,
    );
  }).pipe(Effect.scoped);
