/**
 * A stand-in for the endpoint GitHub Actions gives a job granted
 * `permissions: id-token: write`.
 *
 * GitHub exposes it to the job as `ACTIONS_ID_TOKEN_REQUEST_URL` (already
 * carrying an `api-version` query) with `ACTIONS_ID_TOKEN_REQUEST_TOKEN` as the
 * bearer the job presents, and answers with `{ "value": "<ID token>" }` for the
 * audience the job names. This server answers the same way and records every
 * request so a test can assert the audience and the bearer the CLI sent.
 */

import * as http from "node:http";

export interface IdTokenRequest {
  readonly audience: string | null;
  readonly apiVersion: string | null;
  readonly authorization: string | undefined;
}

export interface GitHubActionsIdTokenServer {
  /** The environment a job granted `id-token: write` runs with. */
  readonly environment: Readonly<Record<string, string>>;
  readonly requestToken: string;
  readonly requests: ReadonlyArray<IdTokenRequest>;
  readonly close: () => Promise<void>;
}

export const startGitHubActionsIdTokenServer = async (options: {
  /** The ID token issued for any request presenting the request token. */
  readonly idToken: string;
}): Promise<GitHubActionsIdTokenServer> => {
  const requestToken = "e2e-actions-request-token";
  const requests: Array<IdTokenRequest> = [];
  const server = http.createServer((request, response) => {
    const url = new URL(request.url ?? "/", "http://actions.test");
    requests.push({
      audience: url.searchParams.get("audience"),
      apiVersion: url.searchParams.get("api-version"),
      authorization: request.headers.authorization,
    });
    const authorized =
      request.method === "GET" &&
      url.pathname === "/token" &&
      request.headers.authorization?.toLowerCase() === `bearer ${requestToken}`;
    response.writeHead(authorized ? 200 : 403, { "content-type": "application/json" });
    response.end(
      JSON.stringify(authorized ? { value: options.idToken } : { message: "Unauthorized" }),
    );
  });
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => resolve());
  });
  const address = server.address();
  if (address === null || typeof address === "string") {
    throw new Error("Failed to determine ID-token server address");
  }
  return {
    environment: {
      CI: "true",
      GITHUB_ACTIONS: "true",
      ACTIONS_ID_TOKEN_REQUEST_URL: `http://127.0.0.1:${String(address.port)}/token?api-version=2.0`,
      ACTIONS_ID_TOKEN_REQUEST_TOKEN: requestToken,
    },
    requestToken,
    requests,
    close: () =>
      new Promise<void>((resolve, reject) => {
        server.closeAllConnections();
        server.close((error) => (error ? reject(error) : resolve()));
      }),
  };
};
