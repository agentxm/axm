import * as ConfigProvider from "effect/ConfigProvider";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Layer from "effect/Layer";
import * as Path from "effect/Path";
import { AuthEnvironment, CredentialStoreLive } from "../adapters/index.js";

/** A real, isolated restricted credential file; no operating-system keychain. */
export const credentialFileFixture = Effect.gen(function* () {
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const home = yield* fs.makeTempDirectoryScoped({ prefix: "axm-credentials-" });
  const directory = path.join(home, ".config", "axm");
  yield* fs.makeDirectory(directory, { recursive: true, mode: 0o700 });
  const file = path.join(directory, "credentials.json");
  const environment = ConfigProvider.fromEnvRecord({
    AXM_USER_HOME: home,
    SSH_TTY: "/dev/ttys000",
  });
  const layer = Layer.fresh(CredentialStoreLive).pipe(
    Layer.provide(Layer.succeed(AuthEnvironment, environment)),
  );
  return { fs, home, directory, file, environment, layer };
});
