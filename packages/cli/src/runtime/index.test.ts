import { createServer } from "node:http";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import nodePath from "node:path";

import * as HttpClient from "@effect/platform/HttpClient";
import * as HttpClientRequest from "@effect/platform/HttpClientRequest";
import * as Effect from "effect/Effect";
import { afterEach, describe, expect, it } from "vitest";

import { AppLayer } from "./index.js";

const futureExpiry = () => new Date(Date.now() + 60 * 60 * 1000).toISOString();

describe("AppLayer auth runtime wiring", () => {
  const originalHome = process.env["HOME"];

  afterEach(() => {
    if (originalHome === undefined) {
      delete process.env["HOME"];
    } else {
      process.env["HOME"] = originalHome;
    }
  });

  it("exposes the auth-wrapped HttpClient to downstream effects", async () => {
    const tempHome = mkdtempSync(nodePath.join(tmpdir(), "axm-runtime-home-"));
    process.env["HOME"] = tempHome;

    let capturedAuthorization: string | null = null;
    const server = createServer((req, res) => {
      capturedAuthorization =
        typeof req.headers.authorization === "string"
          ? req.headers.authorization
          : null;
      res.statusCode = 200;
      res.end("ok");
    });

    try {
      await new Promise<void>((resolve, reject) => {
        server.once("error", reject);
        server.listen(0, "127.0.0.1", () => resolve());
      });

      const address = server.address();
      if (address === null || typeof address === "string") {
        throw new Error("Failed to resolve test server address");
      }

      const origin = `http://127.0.0.1:${String(address.port)}`;
      const configDir = nodePath.join(tempHome, ".config", "axm");
      mkdirSync(configDir, { recursive: true });
      writeFileSync(
        nodePath.join(configDir, "credentials.json"),
        JSON.stringify(
          {
            version: 1,
            registries: {
              [origin]: {
                accounts: {
                  "local-dev": {
                    access_token: "axm_ses_runtime_test",
                    refresh_token: "axm_ref_runtime_test",
                    expires_at: futureExpiry(),
                    active: true,
                  },
                },
              },
            },
          },
          null,
          2,
        ),
      );

      const status = await Effect.runPromise(
        Effect.gen(function* () {
          const client = yield* HttpClient.HttpClient;
          const response = yield* client.execute(HttpClientRequest.get(`${origin}/probe`));
          return response.status;
        }).pipe(Effect.provide(AppLayer)),
      );

      expect(status).toBe(200);
      expect(capturedAuthorization).toBe("Bearer axm_ses_runtime_test");
    } finally {
      await new Promise<void>((resolve, reject) => {
        server.close((error) => (error ? reject(error) : resolve()));
      });
      rmSync(tempHome, { recursive: true, force: true });
    }
  });
});
