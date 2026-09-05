import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import * as http from "node:http";
import { createCliRunner } from "@agentxm/client-e2e-utils";

const runBuiltCli = createCliRunner(
  new URL("../../packages/cli/dist/src/main.js", import.meta.url),
);

export const makeEnvironmentProcessFixture = () => {
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "axm-environment-spec-")));
  const platformHome = path.join(root, "platform-home");
  const applicationHome = path.join(root, "application-home");
  const invoking = path.join(root, "invoking");
  const selected = path.join(root, "selected");
  for (const directory of [platformHome, applicationHome, invoking, selected])
    fs.mkdirSync(directory);
  return {
    root,
    platformHome,
    applicationHome,
    invoking,
    selected,
    run: (args: ReadonlyArray<string>, environment: Readonly<Record<string, string>> = {}) =>
      runBuiltCli(args, {
        cwd: invoking,
        env: {
          HOME: platformHome,
          USERPROFILE: platformHome,
          HOMEPATH: platformHome,
          AXM_USER_HOME: applicationHome,
          AXM_TOKEN: "",
          AXM_TOKEN_FILE: "",
          AXM_NO_UPDATE_CHECK: "1",
          AXM_REGISTRY_LOCATION: "",
          AXM_REGISTRY_URL: "https://registry.invalid",
          // Force the supported file backend even if this process is later run
          // through a native executable. Every home above is disposable.
          SSH_CLIENT: "environment-spec",
          CI: "",
          ...environment,
        },
      }),
    cleanup: () => fs.rmSync(root, { recursive: true, force: true }),
  };
};

export const withEnvironmentRegistry = async <A>(
  respond: (requestPath: string) => {
    readonly body: string | Buffer;
    readonly contentType?: string;
    readonly status?: number;
  },
  use: (origin: string, requests: ReadonlyArray<string>) => Promise<A>,
): Promise<A> => {
  const requests: string[] = [];
  const server = http.createServer((request, response) => {
    const requestPath = decodeURI(request.url ?? "/");
    requests.push(requestPath);
    const result = respond(requestPath);
    response.writeHead(result.status ?? 200, {
      "content-type": result.contentType ?? "application/json",
    });
    response.end(result.body);
  });
  try {
    await new Promise<void>((resolve, reject) => {
      server.once("error", reject);
      server.listen(0, "127.0.0.1", resolve);
    });
    const address = server.address();
    if (address === null || typeof address === "string")
      throw new Error("Registry fixture has no port");
    return await use(`http://127.0.0.1:${address.port}`, requests);
  } finally {
    if (server.listening)
      await new Promise<void>((resolve, reject) =>
        server.close((error) => (error === undefined ? resolve() : reject(error))),
      );
  }
};
