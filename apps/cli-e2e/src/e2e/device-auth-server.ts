import * as http from "node:http";

type DeviceOutcome = "approved" | "denied" | "expired" | "pending";

const sendJson = (response: http.ServerResponse, status: number, body: unknown) => {
  response.writeHead(status, { "content-type": "application/json" });
  response.end(JSON.stringify(body));
};

export const startDeviceAuthServer = async (initialOutcome: DeviceOutcome = "pending") => {
  let outcome = initialOutcome;
  const server = http.createServer((request, response) => {
    const pathname = new URL(request.url ?? "/", "http://localhost").pathname;
    if (request.method === "POST" && pathname === "/v1/auth/device/code") {
      const address = server.address();
      if (address === null || typeof address === "string") {
        sendJson(response, 500, { error: "server_address_unavailable" });
        return;
      }
      const verificationUri = `http://127.0.0.1:${address.port}/device`;
      sendJson(response, 200, {
        device_code: "device-secret",
        user_code: "ABCD-1234",
        verification_uri: verificationUri,
        verification_uri_complete: `${verificationUri}?user_code=ABCD-1234`,
        interval: 1,
        expires_in: 60,
      });
      return;
    }
    if (request.method === "POST" && pathname === "/v1/auth/token") {
      if (outcome === "approved") {
        sendJson(response, 200, {
          access_token: "axm_ses_e2e",
          refresh_token: "axm_ref_e2e",
          token_type: "Bearer",
          expires_in: 3600,
          expires_at: "2099-01-01T00:00:00.000Z",
        });
        return;
      }
      const error =
        outcome === "denied"
          ? "access_denied"
          : outcome === "expired"
            ? "expired_token"
            : "authorization_pending";
      sendJson(response, 400, {
        kind: "TokenOAuthError",
        error,
        error_description: error,
      });
      return;
    }
    if (request.method === "GET" && pathname === "/v1/auth/me") {
      sendJson(response, 200, {
        user: {
          id: "user_01h455vb4pexka56gq5w2r7cpc",
          handle: "@alice",
          email: "alice@example.com",
        },
        token: {
          id: "tok_01h455vb4pexka56gq5w2r7cpc",
          type: "session",
          name: null,
          prefix: null,
          permissions: null,
          authority: "account",
          expiresAt: "2099-01-01T00:00:00.000Z",
          approvedAt: "2026-01-01T00:00:00.000Z",
          trustedPublisher: null,
        },
      });
      return;
    }
    if (request.method === "POST" && pathname === "/v1/auth/revoke") {
      sendJson(response, 200, {});
      return;
    }
    sendJson(response, 404, { error: "not_found" });
  });

  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  if (address === null || typeof address === "string") throw new Error("Expected TCP address");
  return {
    url: `http://127.0.0.1:${address.port}`,
    setOutcome: (next: DeviceOutcome) => {
      outcome = next;
    },
    close: () =>
      new Promise<void>((resolve, reject) =>
        server.close((error) => (error ? reject(error) : resolve())),
      ),
  };
};
