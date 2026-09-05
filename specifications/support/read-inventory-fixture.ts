/** Real accepted installation, with a mutable file Registry for read-side observations. */
import * as fs from "node:fs";
import * as path from "node:path";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import { handleInstall } from "axm.sh/specification-harness";
import { makeReadSpecWorkspace } from "./read-harness.js";
import { makeSpecRegistry } from "./registry-fixture.js";

export const makeInstalledReadFixture = (
  cleanups: Array<() => void>,
  options: { readonly machine?: boolean } = {},
) =>
  Effect.gen(function* () {
    const fixture = makeSpecRegistry();
    const registry = { ...fixture, source: { ...fixture.source, name: "company" } };
    cleanups.push(registry.cleanup);
    registry.writeSkill("review", [{ version: "1.0.0", body: "Review guidance." }]);
    const workspace = makeReadSpecWorkspace({
      ...options,
      settings: { sources: [registry.source] },
    });
    cleanups.push(workspace.cleanup);
    yield* handleInstall({
      source: Option.some("company:@acme/skills/review@^1.0.0"),
      preview: false,
      force: false,
    }).pipe(Effect.provide(workspace.layer));
    const indexPath = path.join(registry.root, "extensions/@acme/skills/review/index.json");
    const setDeprecation = (deprecation: unknown): void => {
      const current: unknown = JSON.parse(fs.readFileSync(indexPath, "utf8"));
      if (typeof current !== "object" || current === null)
        throw new Error("Expected Registry index");
      fs.writeFileSync(indexPath, JSON.stringify({ ...current, deprecation }));
    };
    return { workspace, registry, indexPath, setDeprecation };
  });
