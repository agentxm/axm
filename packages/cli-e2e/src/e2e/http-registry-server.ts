/**
 * A minimal HTTP registry for end-to-end tests.
 *
 * The CLI routes `http://` and `https://` sources through its remote registry
 * client, which is a different transport from the `file://` registry every
 * other suite uses: bearer auth, a `PUT` upload with a content digest, and
 * JSON index responses in the registry's wire shape rather than the on-disk
 * one. Nothing exercised that path end to end, so this server implements just
 * enough of the contract for a publish-then-install round trip.
 *
 * Response bodies are hand-written rather than imported: `packages/cli-e2e` may
 * not depend on `@agentxm/client-core`, and an e2e suite that shared the
 * producer's types could not catch a drift between them. Assertions therefore
 * lean on observable CLI behavior — exit codes and materialized files — instead
 * of the response fields.
 */

import * as crypto from "node:crypto";
import * as http from "node:http";

const PUBLISH_PATH = /^\/v1\/extensions\/(@[^/]+)\/([^/]+)\/([^/]+)\/([^/]+)$/;
const ARCHIVE_PATH = /^\/v1\/extensions\/(@[^/]+)\/([^/]+)\/([^/]+)\/([^/]+)\/archive$/;
const INDEX_PATH = /^\/v1\/extensions\/(@[^/]+)\/([^/]+)\/([^/]+)$/;

const TYPE_BY_PLURAL: Readonly<Record<string, string>> = {
  skills: "skill",
  commands: "command",
  mcps: "mcp-server",
  subagents: "subagent",
  files: "files",
  rules: "rule",
  hooks: "hook",
  knowledge: "knowledge",
  packs: "pack",
};

export interface PublishRecord {
  readonly owner: string;
  readonly plural: string;
  readonly name: string;
  readonly version: string;
  readonly integrity: string;
  readonly authorization: string | undefined;
  readonly contentType: string | undefined;
  readonly byteLength: number;
}

/** Every request the CLI made, in order — the transport contract under test. */
export interface RequestRecord {
  readonly method: string;
  readonly path: string;
  readonly status: number;
}

export interface HttpRegistry {
  readonly url: string;
  readonly publishes: ReadonlyArray<PublishRecord>;
  readonly requests: ReadonlyArray<RequestRecord>;
  readonly close: () => Promise<void>;
}

interface StoredVersion {
  readonly version: string;
  readonly integrity: string;
  readonly archive: Buffer;
  readonly published: string;
}

const readBody = async (request: http.IncomingMessage): Promise<Buffer> => {
  const chunks: Array<Buffer> = [];
  for await (const chunk of request) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk)));
  }
  return Buffer.concat(chunks);
};

const sha512Integrity = (archive: Buffer): string =>
  `sha512-${crypto.createHash("sha512").update(archive).digest("base64")}`;

const sendJson = (response: http.ServerResponse, status: number, body: unknown) => {
  const payload = JSON.stringify(body);
  response.writeHead(status, {
    "content-type": "application/json",
    "content-length": String(Buffer.byteLength(payload)),
  });
  response.end(payload);
};

const PROBLEM_CODE_BY_STATUS: Readonly<Record<number, string>> = {
  401: "unauthorized",
  404: "not_found",
  405: "method_not_allowed",
  409: "version_exists",
  500: "internal_error",
};

/**
 * RFC 9457 problem body in the registry's dialect. `code` is required by the
 * generated client's `ProblemDetails` schema — omit it and even an expected 404
 * fails to decode, which the CLI reports as a schema mismatch rather than as
 * "not found".
 */
const sendProblem = (response: http.ServerResponse, status: number, detail: string) =>
  sendJson(response, status, {
    type: "about:blank",
    title: http.STATUS_CODES[status] ?? "Error",
    status,
    detail,
    code: PROBLEM_CODE_BY_STATUS[status] ?? "error",
  });

/**
 * Starts a registry on an ephemeral loopback port. Extensions are keyed by
 * owner/plural/name and held in memory for the lifetime of the server.
 */
export const startHttpRegistry = async (): Promise<HttpRegistry> => {
  const extensions = new Map<string, Array<StoredVersion>>();
  const publishes: Array<PublishRecord> = [];
  const requests: Array<RequestRecord> = [];

  const key = (owner: string, plural: string, name: string) => `${owner}/${plural}/${name}`;

  const server = http.createServer((request, response) => {
    const url = request.url ?? "/";
    const pathname = url.split("?")[0] ?? "/";
    response.on("finish", () => {
      requests.push({
        method: request.method ?? "UNKNOWN",
        path: pathname,
        status: response.statusCode,
      });
    });

    void (async () => {
      if (request.method === "PUT") {
        const match = PUBLISH_PATH.exec(pathname);
        if (match === null) {
          sendProblem(response, 404, `No publish route for ${pathname}`);
          return;
        }
        const [, owner = "", plural = "", name = "", version = ""] = match;
        const type = TYPE_BY_PLURAL[plural];
        if (type === undefined) {
          sendProblem(response, 404, `Unknown extension type segment "${plural}"`);
          return;
        }
        if (request.headers.authorization === undefined) {
          sendProblem(response, 401, "Publishing requires a bearer token.");
          return;
        }

        const archive = await readBody(request);
        const integrity = sha512Integrity(archive);
        const versions = extensions.get(key(owner, plural, name)) ?? [];
        if (versions.some((entry) => entry.version === version)) {
          sendProblem(response, 409, `Version ${version} already exists.`);
          return;
        }
        const published = new Date("2026-01-01T00:00:00.000Z").toISOString();
        versions.push({ version, integrity, archive, published });
        extensions.set(key(owner, plural, name), versions);
        publishes.push({
          owner,
          plural,
          name,
          version,
          integrity,
          authorization: request.headers.authorization,
          contentType: request.headers["content-type"],
          byteLength: archive.byteLength,
        });

        sendJson(response, 201, {
          owner,
          type,
          name,
          version,
          integrity,
          sha256_hex: crypto.createHash("sha256").update(archive).digest("hex"),
          published_at: published,
          publish_status: "available",
          links: { html: `https://example.test/${owner}/${plural}/${name}` },
        });
        return;
      }

      if (request.method !== "GET" && request.method !== "HEAD") {
        sendProblem(response, 405, `Unsupported method ${request.method ?? "unknown"}`);
        return;
      }

      const archiveMatch = ARCHIVE_PATH.exec(pathname);
      if (archiveMatch !== null) {
        const [, owner = "", plural = "", name = "", version = ""] = archiveMatch;
        const stored = extensions
          .get(key(owner, plural, name))
          ?.find((entry) => entry.version === version);
        if (stored === undefined) {
          sendProblem(response, 404, `No archive for ${plural}/${name}@${version}`);
          return;
        }
        response.writeHead(200, {
          "content-type": "application/zip",
          "content-length": String(stored.archive.byteLength),
        });
        response.end(stored.archive);
        return;
      }

      const indexMatch = INDEX_PATH.exec(pathname);
      if (indexMatch !== null) {
        const [, owner = "", plural = "", name = ""] = indexMatch;
        const type = TYPE_BY_PLURAL[plural];
        const versions = extensions.get(key(owner, plural, name));
        if (type === undefined || versions === undefined || versions.length === 0) {
          sendProblem(response, 404, `No extension ${plural}/${name}`);
          return;
        }
        sendJson(response, 200, {
          name,
          owner,
          type,
          publisher_binding_id: "hbnd_e2e",
          visibility: "public",
          versions: versions.map((entry) => ({
            version: entry.version,
            published: entry.published,
            integrity: entry.integrity,
          })),
        });
        return;
      }

      sendProblem(response, 404, `No route for ${pathname}`);
    })().catch((cause: unknown) => {
      sendProblem(response, 500, `Registry harness failed: ${String(cause)}`);
    });
  });

  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => resolve());
  });

  const address = server.address();
  if (address === null || typeof address === "string") {
    throw new Error("Failed to determine HTTP registry address");
  }

  return {
    url: `http://127.0.0.1:${address.port}`,
    publishes,
    requests,
    close: () =>
      new Promise<void>((resolve, reject) => {
        server.close((error) => (error ? reject(error) : resolve()));
      }),
  };
};
