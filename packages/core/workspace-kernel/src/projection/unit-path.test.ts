import * as fs from "node:fs";
import * as path from "node:path";
import * as NodeServices from "@effect/platform-node/NodeServices";
import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Option from "effect/Option";
import { projectionUnitPath, scopeUnitPath } from "./unit-path.js";

/** A physical scope root and a link naming it, as an aliased temp or checkout path would. */
const aliasedRoot = Effect.gen(function* () {
  const files = yield* FileSystem.FileSystem;
  const base = fs.realpathSync(yield* files.makeTempDirectoryScoped());
  const physical = path.join(base, "real");
  const alias = path.join(base, "alias");
  fs.mkdirSync(path.join(physical, ".claude", "agents"), { recursive: true });
  fs.symlinkSync(physical, alias, "dir");
  return { base, physical, alias };
});

describe("projection row keys", () => {
  it.effect("key one file identically through an aliased or physical scope root", () =>
    Effect.gen(function* () {
      const { physical, alias } = yield* aliasedRoot;
      const file = path.join(".claude", "agents", "review.md");
      fs.writeFileSync(path.join(physical, file), "body\n");
      const keys = [
        yield* scopeUnitPath(alias, path.join(physical, file)),
        yield* scopeUnitPath(alias, path.join(alias, file)),
        yield* scopeUnitPath(physical, path.join(alias, file)),
        yield* scopeUnitPath(physical, path.join(physical, file)),
      ];
      expect(keys).toEqual(
        Array.from({ length: 4 }, () => Option.some(".claude/agents/review.md")),
      );
      // A planned file not yet written keys the same way.
      expect(yield* scopeUnitPath(alias, path.join(physical, "CLAUDE.md"))).toEqual(
        Option.some("CLAUDE.md"),
      );
    }).pipe(Effect.scoped, Effect.provide(NodeServices.layer)),
  );

  it.effect("key a link at its own location rather than its referent", () =>
    Effect.gen(function* () {
      const { physical, alias } = yield* aliasedRoot;
      fs.writeFileSync(path.join(physical, "AGENTS.md"), "# Source\n");
      fs.symlinkSync("AGENTS.md", path.join(physical, "CLAUDE.md"));
      expect(yield* scopeUnitPath(alias, path.join(alias, "CLAUDE.md"))).toEqual(
        Option.some("CLAUDE.md"),
      );
    }).pipe(Effect.scoped, Effect.provide(NodeServices.layer)),
  );

  it.effect("refuse a target whose physical entry leaves the scope root", () =>
    Effect.gen(function* () {
      const { base, alias } = yield* aliasedRoot;
      fs.mkdirSync(path.join(base, "outside"));
      fs.symlinkSync(path.join(base, "outside"), path.join(alias, "escape"), "dir");
      expect(yield* scopeUnitPath(alias, path.join(base, "sibling.md"))).toEqual(Option.none());
      expect(yield* scopeUnitPath(alias, path.join(alias, "escape", "CLAUDE.md"))).toEqual(
        Option.none(),
      );
      const refused = yield* projectionUnitPath(alias, path.join(base, "sibling.md")).pipe(
        Effect.flip,
      );
      expect(refused._tag).toBe("ProjectionTargetUnsupported");
    }).pipe(Effect.scoped, Effect.provide(NodeServices.layer)),
  );
});
