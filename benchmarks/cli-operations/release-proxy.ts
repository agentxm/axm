import { createHash } from "node:crypto";
import * as fs from "node:fs/promises";
import * as http from "node:http";
import * as https from "node:https";
import * as net from "node:net";
import * as path from "node:path";
import * as Data from "effect/Data";
import * as Effect from "effect/Effect";

class ReleaseFixtureFailure extends Data.TaggedError("ReleaseFixtureFailure")<{
  readonly message: string;
  readonly cause?: unknown;
}> {}

export interface ReleaseProxy {
  readonly environment: Readonly<Record<string, string>>;
  readonly checksum: string;
  readonly payloadBytes: number;
  readonly metrics: () => Readonly<Record<string, number>>;
  readonly close: () => Promise<void>;
}

const listen = (server: net.Server): Promise<number> =>
  new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      server.off("error", reject);
      const address = server.address();
      if (address === null || typeof address === "string")
        reject(new Error("Fixture has no loopback port"));
      else resolve(address.port);
    });
  });

const certificate = async (
  directory: string,
): Promise<{ readonly key: Buffer; readonly cert: Buffer; readonly caPath: string }> => {
  await fs.mkdir(directory, { recursive: true });
  const caPath = path.join(directory, "ca.pem");
  const caKey = path.join(directory, "ca-key.pem");
  const serverKey = path.join(directory, "server-key.pem");
  const request = path.join(directory, "server.csr");
  const serverCert = path.join(directory, "server.pem");
  const extension = path.join(directory, "server.ext");
  await fs.writeFile(
    extension,
    "subjectAltName=DNS:releases.axm.sh\nextendedKeyUsage=serverAuth\nbasicConstraints=CA:FALSE\n",
  );
  const commands = [
    [
      "req",
      "-x509",
      "-newkey",
      "rsa:2048",
      "-nodes",
      "-keyout",
      caKey,
      "-out",
      caPath,
      "-days",
      "1",
      "-subj",
      "/CN=AXM disposable benchmark CA",
    ],
    [
      "req",
      "-newkey",
      "rsa:2048",
      "-nodes",
      "-keyout",
      serverKey,
      "-out",
      request,
      "-subj",
      "/CN=releases.axm.sh",
    ],
    [
      "x509",
      "-req",
      "-in",
      request,
      "-CA",
      caPath,
      "-CAkey",
      caKey,
      "-CAcreateserial",
      "-out",
      serverCert,
      "-days",
      "1",
      "-extfile",
      extension,
    ],
  ];
  for (const args of commands) {
    const child = Bun.spawn(["openssl", ...args], {
      cwd: directory,
      env: {
        PATH: process.env["PATH"] ?? "",
        HOME: directory,
        ...(process.env["SystemRoot"] === undefined
          ? {}
          : { SystemRoot: process.env["SystemRoot"] }),
      },
      stdout: "ignore",
      stderr: "pipe",
    });
    const [exit, stderr] = await Promise.all([child.exited, new Response(child.stderr).text()]);
    if (exit !== 0) throw new Error(`Disposable TLS fixture needs working OpenSSL: ${stderr}`);
  }
  return { key: await fs.readFile(serverKey), cert: await fs.readFile(serverCert), caPath };
};

/** CONNECT terminates only at this fixture's own TLS server; no remote forwarding exists. */
export const startReleaseProxy = (options: {
  readonly directory: string;
  readonly binary: string;
  readonly version: string;
  readonly assetName: string;
  readonly badChecksum?: boolean;
}): Effect.Effect<ReleaseProxy, ReleaseFixtureFailure> =>
  Effect.tryPromise({
    try: async () => {
      const [tls, payload] = await Promise.all([
        certificate(options.directory),
        fs.readFile(options.binary),
      ]);
      const checksum = createHash("sha256").update(payload).digest("hex");
      const manifest = Buffer.from(
        `${options.badChecksum === true ? "0".repeat(64) : checksum}  ${options.assetName}\n`,
      );
      const prefix = `/cli-v${options.version}/`;
      const sockets = new Set<net.Socket>();
      const counts = {
        releaseRequests: 0,
        releaseBinaryRequests: 0,
        releaseChecksumRequests: 0,
        releaseLatestRequests: 0,
        releasePayloadBytes: 0,
        releaseResponseBytes: 0,
        releaseConnections: 0,
        releaseDeniedConnections: 0,
        releaseUnexpectedRequests: 0,
        releaseTlsErrors: 0,
      };
      const remember = (socket: net.Socket): void => {
        sockets.add(socket);
        socket.once("close", () => sockets.delete(socket));
      };
      const server = https.createServer({ key: tls.key, cert: tls.cert }, (request, response) => {
        counts.releaseRequests += 1;
        let body: Buffer | undefined;
        if (request.method === "GET" && request.headers.host === "releases.axm.sh") {
          if (request.url === `${prefix}${options.assetName}`) {
            body = payload;
            counts.releaseBinaryRequests += 1;
            counts.releasePayloadBytes += payload.byteLength;
          }
          if (request.url === `${prefix}SHA256SUMS`) {
            body = manifest;
            counts.releaseChecksumRequests += 1;
          }
          if (request.url === "/latest.txt") {
            body = Buffer.from(`${options.version}\n`);
            counts.releaseLatestRequests += 1;
          }
        }
        if (body === undefined) {
          counts.releaseUnexpectedRequests += 1;
          response.writeHead(404, { "content-length": "0" });
          response.end();
          return;
        }
        counts.releaseResponseBytes += body.byteLength;
        response.writeHead(200, {
          "content-type": "application/octet-stream",
          "content-length": String(body.byteLength),
          connection: "close",
        });
        response.end(body);
      });
      server.on("connection", remember);
      server.on("tlsClientError", () => {
        counts.releaseTlsErrors += 1;
      });
      const proxy = http.createServer((_request, response) => {
        counts.releaseUnexpectedRequests += 1;
        response.writeHead(403);
        response.end();
      });
      proxy.on("connection", remember);
      const close = async (): Promise<void> => {
        for (const socket of sockets) socket.destroy();
        await Promise.all([
          new Promise<void>((resolve) => proxy.close(() => resolve())),
          new Promise<void>((resolve) => server.close(() => resolve())),
        ]);
      };
      try {
        const port = await listen(server);
        proxy.on("connect", (request, socket, head) => {
          counts.releaseConnections += 1;
          if (request.url !== "releases.axm.sh:443") {
            counts.releaseDeniedConnections += 1;
            socket.end("HTTP/1.1 403 Forbidden\r\nContent-Length: 0\r\n\r\n");
            return;
          }
          // This fixed loopback endpoint is the only connection this proxy can make.
          const local = net.connect(port, "127.0.0.1", () => {
            socket.write("HTTP/1.1 200 Connection Established\r\n\r\n");
            if (head.length > 0) local.write(head);
            socket.pipe(local);
            local.pipe(socket);
          });
          remember(local);
          local.on("error", () => socket.destroy());
          socket.on("error", () => local.destroy());
        });
        const proxyPort = await listen(proxy);
        const address = `http://127.0.0.1:${String(proxyPort)}`;
        return {
          environment: {
            HTTP_PROXY: address,
            HTTPS_PROXY: address,
            ALL_PROXY: address,
            http_proxy: address,
            https_proxy: address,
            all_proxy: address,
            NO_PROXY: "",
            no_proxy: "",
            SSL_CERT_FILE: tls.caPath,
          },
          checksum,
          payloadBytes: payload.byteLength,
          metrics: () => ({ ...counts }),
          close,
        };
      } catch (cause) {
        await close();
        throw cause;
      }
    },
    catch: (cause) => new ReleaseFixtureFailure({ message: String(cause), cause }),
  });
