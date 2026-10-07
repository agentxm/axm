import * as crypto from "node:crypto";
import * as Data from "effect/Data";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Option from "effect/Option";
import * as Path from "effect/Path";
import { validateContainedLink } from "../locations/index.js";
import {
  excludedDistributionLinkTarget,
  type DistributionLinkEntry,
} from "./distribution-links.js";
import type { ResolvedFileSelection, SelectionPath } from "./file-selection.js";

export class DistributionTreeInvalid extends Data.TaggedError("DistributionTreeInvalid")<{
  readonly detail: string;
  readonly cause?: unknown;
}> {}

/** Distribution identity includes implied parents and retained, explicit empty directories. */
export const computeDistributionTreeIntegrity = (root: string, selection?: ResolvedFileSelection) =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const entries = new Map<
      string,
      {
        readonly kind: SelectionPath["kind"];
        readonly executable?: number;
        readonly bytes?: Uint8Array;
      }
    >();
    const retain = (
      relative: string,
      value: {
        readonly kind: SelectionPath["kind"];
        readonly executable?: number;
        readonly bytes?: Uint8Array;
      },
    ) => {
      entries.set(relative, value);
      const parts = relative.split("/");
      for (let index = 1; index < parts.length; index++)
        entries.set(parts.slice(0, index).join("/"), { kind: "directory" });
    };
    const candidates: Array<DistributionLinkEntry> = [];
    const pending = [""];
    while (pending.length > 0) {
      const parent = pending.pop();
      if (parent === undefined) break;
      for (const name of yield* fs.readDirectory(path.join(root, parent))) {
        if (name === ".git") {
          candidates.push({ path: parent === "" ? name : `${parent}/${name}`, included: false });
          continue;
        }
        if (name.includes("\\") || name.includes("/") || name === "..") {
          return yield* new DistributionTreeInvalid({
            detail: "Invalid distribution path segment.",
          });
        }
        const relative = parent === "" ? name : `${parent}/${name}`;
        const absolute = path.join(root, relative);
        const link = yield* fs.readLink(absolute).pipe(Effect.option);
        if (Option.isSome(link)) {
          yield* validateContainedLink(root, absolute, link.value);
          const included =
            selection?.evaluate({ path: relative, kind: "symlink" }).included !== false;
          candidates.push({ path: relative, included, linkTarget: link.value });
          if (included)
            retain(relative, { kind: "symlink", bytes: new TextEncoder().encode(link.value) });
          continue;
        }
        const info = yield* fs.stat(absolute);
        const included =
          selection?.evaluate({
            path: relative,
            kind: info.type === "Directory" ? "directory" : "file",
          }).included !== false;
        if (info.type === "Directory") {
          if ((yield* fs.readDirectory(absolute)).length === 0) {
            candidates.push({ path: relative, included });
            if (included) retain(relative, { kind: "directory" });
          } else pending.push(relative);
        } else if (info.type === "File") {
          candidates.push({ path: relative, included });
          if (included)
            retain(relative, {
              kind: "file",
              executable: info.mode & 0o111,
              bytes: yield* fs.readFile(absolute),
            });
        } else
          return yield* new DistributionTreeInvalid({
            detail: `Unsupported distribution entry: ${relative}`,
          });
      }
    }
    const broken = excludedDistributionLinkTarget(candidates);
    if (broken !== undefined)
      return yield* new DistributionTreeInvalid({
        detail:
          broken.kind === "excluded-target"
            ? `Retained link "${broken.path}" points to excluded content "${broken.target}".`
            : "Distribution link resolution exceeds the shared archive validation budget.",
      });
    const hash = crypto.createHash("sha256");
    const frame = (bytes: Uint8Array) => {
      const size = Buffer.alloc(8);
      size.writeBigUInt64BE(BigInt(bytes.length));
      hash.update(size).update(bytes);
    };
    frame(Buffer.from("axm-distribution-tree-v1"));
    for (const [relative, entry] of [...entries].sort(([left], [right]) =>
      left.localeCompare(right, "en"),
    )) {
      frame(Buffer.from(relative));
      frame(Buffer.from(entry.kind));
      if (entry.executable !== undefined) frame(Buffer.from(String(entry.executable)));
      if (entry.bytes !== undefined) frame(entry.bytes);
    }
    return `sha256-distribution-v1:${hash.digest("hex")}`;
  }).pipe(
    Effect.mapError((cause) =>
      cause instanceof DistributionTreeInvalid
        ? cause
        : new DistributionTreeInvalid({
            detail: "Cannot compare the selected distribution tree.",
            cause,
          }),
    ),
  );
