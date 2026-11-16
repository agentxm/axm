import { annotateWork, withWork } from "@agentxm/host-primitives/work-observation";
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

class DistributionTreeInvalid extends Data.TaggedError("DistributionTreeInvalid")<{
  readonly detail: string;
  readonly cause?: unknown;
}> {}

/** What one listing observed of an entry without following it. */
type ListedDistributionEntry =
  | { readonly kind: "link"; readonly target: string }
  | ({ readonly kind: "entry" } & Pick<FileSystem.File.Info, "type" | "mode">);

/**
 * A walk of this same `root` the caller made within the same operation:
 * each directory's names in their listing order, keyed by the directory's
 * path relative to the root ("" for the root, joined with the platform
 * separator), and what that walk observed of each entry.
 */
interface DistributionTreeListing {
  readonly names: (relativeDirectory: string) => ReadonlyArray<string> | undefined;
  readonly facts: (relativeDirectory: string, name: string) => ListedDistributionEntry | undefined;
  /**
   * A copy of the bytes that walk read of the regular file at a "/"-joined
   * relative path, when it read them.
   */
  readonly bytes?: (relativePath: string) => Uint8Array | undefined;
}

/**
 * Distribution identity includes implied parents and retained, explicit empty directories.
 *
 * `preparedManifest` carries the bytes of a root-relative regular file the caller
 * has just read from this same `root`. The walk still lists, link-checks, stats
 * and selects that entry, and hashes a copy of those bytes instead of reading
 * the file again; any entry that is not a regular file at exactly that path is
 * read as usual.
 *
 * `listing` replays the directory listings, link targets, entry types and
 * modes the caller's walk of this same `root` observed, in the order this
 * walk would observe them, and the bytes of regular files it read. Any
 * directory, entry or file it does not hold is observed live. Contained-link
 * validation always runs live.
 */
export const computeDistributionTreeIntegrity = (
  root: string,
  selection?: ResolvedFileSelection,
  preparedManifest?: { readonly path: string; readonly bytes: Uint8Array },
  listing?: DistributionTreeListing,
) =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    // The listing's keys join a relative directory with the platform separator.
    const listedDirectory = (relative: string) =>
      relative === "" ? "" : path.join(...relative.split("/"));
    const listedNames = (relative: string) => listing?.names(listedDirectory(relative));
    const listedFacts = (parent: string, name: string) =>
      listing?.facts(listedDirectory(parent), name);
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
    // A directory's listing is taken once: the root's when it is walked, every
    // other directory's when its emptiness is tested, carried with its entry.
    const pending: Array<{ readonly parent: string; readonly names?: ReadonlyArray<string> }> = [
      { parent: "" },
    ];
    while (pending.length > 0) {
      const next = pending.pop();
      if (next === undefined) break;
      const { parent } = next;
      for (const name of next.names ??
        listedNames(parent) ??
        (yield* fs.readDirectory(path.join(root, parent)))) {
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
        const listed = listedFacts(parent, name);
        const link =
          listed === undefined
            ? yield* fs.readLink(absolute).pipe(Effect.option)
            : listed.kind === "link"
              ? Option.some(listed.target)
              : Option.none();
        if (Option.isSome(link)) {
          yield* validateContainedLink(root, absolute, link.value);
          const included =
            selection?.evaluate({ path: relative, kind: "symlink" }).included !== false;
          candidates.push({ path: relative, included, linkTarget: link.value });
          if (included)
            retain(relative, { kind: "symlink", bytes: new TextEncoder().encode(link.value) });
          continue;
        }
        const info = listed?.kind === "entry" ? listed : yield* fs.stat(absolute);
        const included =
          selection?.evaluate({
            path: relative,
            kind: info.type === "Directory" ? "directory" : "file",
          }).included !== false;
        if (info.type === "Directory") {
          const names = listedNames(relative) ?? (yield* fs.readDirectory(absolute));
          if (names.length === 0) {
            candidates.push({ path: relative, included });
            if (included) retain(relative, { kind: "directory" });
          } else pending.push({ parent: relative, names });
        } else if (info.type === "File") {
          candidates.push({ path: relative, included });
          if (included)
            retain(relative, {
              kind: "file",
              executable: info.mode & 0o111,
              bytes:
                preparedManifest?.path === relative
                  ? preparedManifest.bytes.slice()
                  : (listing?.bytes?.(relative) ?? (yield* fs.readFile(absolute))),
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
    yield* annotateWork({
      "axm.work.count": entries.size,
      "axm.work.bytes": [...entries.values()].reduce(
        (total, entry) => total + (entry.bytes?.byteLength ?? 0),
        0,
      ),
    });
    return `sha256-distribution-v1:${hash.digest("hex")}`;
  }).pipe(
    (effect) => withWork("axm.hash.distribution-tree", effect),
    Effect.mapError((cause) =>
      cause instanceof DistributionTreeInvalid
        ? cause
        : new DistributionTreeInvalid({
            detail: "Cannot compare the selected distribution tree.",
            cause,
          }),
    ),
  );
