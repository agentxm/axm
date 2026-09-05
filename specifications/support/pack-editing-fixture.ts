/** Real installed members and an authored pack for membership transitions. */
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import {
  extensionName,
  handleInstall,
  handlePacksAdd,
  handlePacksNew,
} from "axm.sh/specification-harness";
import { makeSpecWorkspace } from "./install-harness.js";
import { makeSpecRegistry } from "./registry-fixture.js";

export const makePackEditingFixture = (cleanups: Array<() => void>) =>
  Effect.gen(function* () {
    const registry = makeSpecRegistry();
    cleanups.push(registry.cleanup);
    for (const name of ["review", "test-helper"])
      registry.writeSkill(name, [{ version: "1.2.3", body: `Instructions for ${name}.` }]);
    const workspace = makeSpecWorkspace({
      machine: true,
      settings: { agents: ["claude-code"], sources: [registry.source] },
    });
    cleanups.push(workspace.cleanup);
    for (const name of ["review", "test-helper"])
      yield* handleInstall({
        source: Option.some(`@acme/skills/${name}`),
        force: false,
        preview: false,
      }).pipe(Effect.provide(workspace.layer));
    yield* handlePacksNew({
      name: extensionName("toolkit"),
      owner: Option.none(),
      preview: false,
    }).pipe(Effect.provide(workspace.layer));
    for (const name of ["review", "test-helper"])
      yield* handlePacksAdd({
        pack: "toolkit",
        extension: `@acme/skills/${name}`,
        preview: false,
      }).pipe(Effect.provide(workspace.layer));
    return { workspace, registry };
  });
