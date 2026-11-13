/** Local CONNECT fixture for the compiled CLI's fixed distribution URL. It never forwards externally. */
import * as fs from "node:fs";
import * as http from "node:http";
import * as https from "node:https";
import * as net from "node:net";
import * as os from "node:os";
import * as path from "node:path";
import { execFile } from "node:child_process";
import { X509Certificate } from "node:crypto";
import * as Effect from "effect/Effect";
import { fixtureFailure } from "./observability-contract.js";
import type { RequestRecord } from "./lifecycle-registry.js";

interface StartupReleaseResponse {
  readonly status: number;
  readonly body: string;
  readonly bodyDelayMillis: number;
}

interface StartupReleaseProxy {
  readonly environment: Readonly<Record<string, string>>;
  readonly certificateSha256: string;
  readonly reset: (response: StartupReleaseResponse) => void;
  readonly requests: () => ReadonlyArray<RequestRecord>;
  readonly evidence: () => {
    readonly acceptedTunnels: number;
    readonly rejectedTunnels: number;
    readonly successfulHandshakes: number;
    readonly failedHandshakes: number;
    readonly rejectedHttpRequests: number;
    readonly responses: ReadonlyArray<{
      readonly status: number;
      readonly headersSent: boolean;
      readonly completed: boolean;
      readonly responseBytes: number;
    }>;
  };
}

const openssl = (cwd: string, args: ReadonlyArray<string>) =>
  Effect.tryPromise({
    try: () =>
      new Promise<void>((resolve, reject) => {
        execFile("openssl", [...args], { cwd, timeout: 10_000, maxBuffer: 64 * 1024 }, (error) =>
          error === null ? resolve() : reject(error),
        );
      }),
    catch: () =>
      fixtureFailure(
        "The isolated startup fixture could not generate its ephemeral TLS credentials.",
      ),
  });

const listen = (server: net.Server) =>
  Effect.tryPromise({
    try: () =>
      new Promise<number>((resolve, reject) => {
        const failed = (error: Error) => reject(error);
        server.once("error", failed);
        server.listen(0, "127.0.0.1", () => {
          server.off("error", failed);
          const address = server.address();
          if (address === null || typeof address === "string")
            reject(new Error("Expected a loopback TCP address."));
          else resolve(address.port);
        });
      }),
    catch: () =>
      fixtureFailure("The isolated startup fixture could not open its loopback listener."),
  });

/** Trust is scoped to one child environment; private keys never enter retained evidence. */
export const startStartupReleaseProxy = Effect.fnUntraced(function* () {
  const privateRoot = yield* Effect.acquireRelease(
    Effect.try(() => fs.mkdtempSync(path.join(os.tmpdir(), "axm-startup-tls-"))),
    (root) => Effect.sync(() => fs.rmSync(root, { recursive: true, force: true })),
  );
  fs.chmodSync(privateRoot, 0o700);
  yield* openssl(privateRoot, [
    "req",
    "-x509",
    "-newkey",
    "rsa:2048",
    "-nodes",
    "-keyout",
    "ca.key",
    "-out",
    "ca.pem",
    "-days",
    "2",
    "-subj",
    "/CN=AXM isolated startup benchmark CA",
    "-addext",
    "basicConstraints=critical,CA:TRUE",
    "-addext",
    "keyUsage=critical,keyCertSign,cRLSign",
  ]);
  yield* openssl(privateRoot, [
    "req",
    "-newkey",
    "rsa:2048",
    "-nodes",
    "-keyout",
    "server.key",
    "-out",
    "server.csr",
    "-subj",
    "/CN=releases.axm.sh",
  ]);
  fs.writeFileSync(
    path.join(privateRoot, "server.ext"),
    "subjectAltName=DNS:releases.axm.sh\nbasicConstraints=critical,CA:FALSE\nkeyUsage=critical,digitalSignature,keyEncipherment\nextendedKeyUsage=serverAuth\n",
    { mode: 0o600 },
  );
  yield* openssl(privateRoot, [
    "x509",
    "-req",
    "-in",
    "server.csr",
    "-CA",
    "ca.pem",
    "-CAkey",
    "ca.key",
    "-CAcreateserial",
    "-out",
    "server.pem",
    "-days",
    "2",
    "-sha256",
    "-extfile",
    "server.ext",
  ]);
  for (const name of fs.readdirSync(privateRoot)) fs.chmodSync(path.join(privateRoot, name), 0o600);
  const caPath = path.join(privateRoot, "ca.pem");
  const certificateSha256 = new X509Certificate(fs.readFileSync(caPath)).fingerprint256
    .replaceAll(":", "")
    .toLowerCase();
  let response: StartupReleaseResponse = { status: 200, body: "999.0.0\n", bodyDelayMillis: 0 };
  let acceptedTunnels = 0;
  let rejectedTunnels = 0;
  let successfulHandshakes = 0;
  let failedHandshakes = 0;
  let rejectedHttpRequests = 0;
  const records: Array<{
    startedAtMs: number;
    finishedAtMs: number;
    key: string;
    status: number;
    responseBytes: number;
    archiveBody: boolean;
    headersSent: boolean;
    completed: boolean;
  }> = [];
  const sockets = new Set<net.Socket>();
  const timers = new Set<ReturnType<typeof setTimeout>>();
  const track = (socket: net.Socket) => {
    sockets.add(socket);
    socket.once("close", () => sockets.delete(socket));
  };
  const origin = https.createServer(
    {
      key: fs.readFileSync(path.join(privateRoot, "server.key")),
      cert: fs.readFileSync(path.join(privateRoot, "server.pem")),
    },
    (request, reply) => {
      if (
        request.method !== "GET" ||
        request.url !== "/latest.txt" ||
        request.headers.host !== "releases.axm.sh"
      ) {
        rejectedHttpRequests++;
        reply.writeHead(421, { connection: "close" });
        reply.end();
        return;
      }
      const selected = response;
      const record = {
        startedAtMs: Date.now(),
        finishedAtMs: 0,
        key: "GET releases.axm.sh/latest.txt",
        status: selected.status,
        responseBytes: 0,
        archiveBody: false,
        headersSent: false,
        completed: false,
      };
      records.push(record);
      reply.writeHead(selected.status, {
        "content-type": "text/plain",
        "content-length": Buffer.byteLength(selected.body),
        connection: "close",
      });
      reply.flushHeaders();
      record.headersSent = true;
      reply.once("finish", () => {
        record.completed = true;
        record.finishedAtMs = Date.now();
      });
      reply.once("close", () => {
        if (record.finishedAtMs === 0) record.finishedAtMs = Date.now();
      });
      const send = () => {
        if (!reply.destroyed) {
          record.responseBytes = Buffer.byteLength(selected.body);
          reply.end(selected.body);
        }
      };
      if (selected.bodyDelayMillis === 0) send();
      else {
        const timer = setTimeout(() => {
          timers.delete(timer);
          send();
        }, selected.bodyDelayMillis);
        timers.add(timer);
      }
    },
  );
  origin.on("connection", track);
  origin.on("secureConnection", () => {
    successfulHandshakes++;
  });
  origin.on("tlsClientError", () => {
    failedHandshakes++;
  });
  // The tunnel has exactly one fixed local destination, so it cannot become an open proxy.
  const proxy = http.createServer((_request, reply) => {
    rejectedHttpRequests++;
    reply.writeHead(403, { connection: "close" });
    reply.end();
  });
  proxy.on("connection", track);
  yield* Effect.addFinalizer(() =>
    Effect.promise(async () => {
      for (const timer of timers) clearTimeout(timer);
      for (const socket of sockets) socket.destroy();
      await Promise.all(
        [origin, proxy].map(
          (server) =>
            new Promise<void>((resolve) => {
              if (!server.listening) {
                resolve();
                return;
              }
              server.close(() => resolve());
            }),
        ),
      );
    }),
  );
  const originPort = yield* listen(origin);
  proxy.on("connect", (request, client, head) => {
    if (request.url !== "releases.axm.sh:443") {
      rejectedTunnels++;
      client.end("HTTP/1.1 403 Forbidden\r\nConnection: close\r\n\r\n");
      return;
    }
    acceptedTunnels++;
    const upstream = net.connect({ host: "127.0.0.1", port: originPort });
    track(upstream);
    upstream.once("connect", () => {
      client.write("HTTP/1.1 200 Connection Established\r\n\r\n");
      if (head.length > 0) upstream.write(head);
      client.pipe(upstream);
      upstream.pipe(client);
    });
    client.on("error", () => upstream.destroy());
    upstream.on("error", () => client.destroy());
    client.once("close", () => upstream.destroy());
    upstream.once("close", () => client.destroy());
  });
  const proxyPort = yield* listen(proxy);
  return {
    environment: {
      HTTPS_PROXY: "http://127.0.0.1:" + proxyPort,
      NO_PROXY: "127.0.0.1,localhost,::1",
      NODE_EXTRA_CA_CERTS: caPath,
    },
    certificateSha256,
    reset: (next) => {
      for (const timer of timers) clearTimeout(timer);
      timers.clear();
      for (const socket of sockets) socket.destroy();
      response = next;
      acceptedTunnels = 0;
      rejectedTunnels = 0;
      successfulHandshakes = 0;
      failedHandshakes = 0;
      rejectedHttpRequests = 0;
      records.length = 0;
    },
    requests: () =>
      records.map(({ headersSent: _headersSent, completed: _completed, ...record }) => ({
        ...record,
      })),
    evidence: () => ({
      acceptedTunnels,
      rejectedTunnels,
      successfulHandshakes,
      failedHandshakes,
      rejectedHttpRequests,
      responses: records.map(({ status, headersSent, completed, responseBytes }) => ({
        status,
        headersSent,
        completed,
        responseBytes,
      })),
    }),
  } satisfies StartupReleaseProxy;
});
