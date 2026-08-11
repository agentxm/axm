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
import { unzipSync } from "fflate";

const PUBLISH_PATH = /^\/v1\/extensions\/(@[^/]+)\/([^/]+)\/([^/]+)\/([^/]+)$/;
const ARCHIVE_PATH = /^\/v1\/extensions\/(@[^/]+)\/([^/]+)\/([^/]+)\/([^/]+)\/archive$/;
const INDEX_PATH = /^\/v1\/extensions\/(@[^/]+)\/([^/]+)\/([^/]+)$/;
const OWNER_PATH = /^\/v1\/owners\/(@[^/]+)$/;
const STEP_UP_REQUEST_ID = "step_01h455vb4pexka56gq5w2r7cpc";
const TEST_OWNER = "@test";

const TYPE_BY_PLURAL: Readonly<Record<string, string>> = {
  skills: "skill",
  mcps: "mcp-server",
  subagents: "subagent",
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
  readonly ifMatch: string | undefined;
  readonly requestedVisibility: string | undefined;
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

export interface HttpRegistryOptions {
  /** Test-only delay used to make an unordered pack upload fail deterministically. */
  readonly publishDelayMsByPlural?: Readonly<Record<string, number>>;
  /** Reject a pack until every dependency named by its archive exists. */
  readonly enforcePackDependencies?: boolean;
  /** Require and complete the durable step-up flow for POST /v1/tokens. */
  readonly stepUpTokenCreate?: boolean;
  /** Return a deliberately unusable publish-preview contract. */
  readonly publishPreviewMode?: "unavailable" | "incomplete" | "missing";
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

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const packDependencies = (archive: Buffer): ReadonlyArray<string> => {
  const entries = unzipSync(archive);
  const manifestBytes = entries["pack.json"];
  if (manifestBytes === undefined) throw new Error("Pack archive has no pack.json");
  const manifest: unknown = JSON.parse(new TextDecoder().decode(manifestBytes));
  if (!isRecord(manifest) || !isRecord(manifest["dependencies"])) return [];
  return Object.keys(manifest["dependencies"]);
};

/**
 * Starts a registry on an ephemeral loopback port. Extensions are keyed by
 * owner/plural/name and held in memory for the lifetime of the server.
 */
export const startHttpRegistry = async (
  options: HttpRegistryOptions = {},
): Promise<HttpRegistry> => {
  const extensions = new Map<string, Array<StoredVersion>>();
  const extensionVisibilities = new Map<string, "public" | "private">();
  const previewConditions = new Map<string, string>();
  const publishes: Array<PublishRecord> = [];
  const requests: Array<RequestRecord> = [];

  const key = (owner: string, plural: string, name: string) => `${owner}/${plural}/${name}`;
  const targetKey = (owner: string, plural: string, name: string, version: string) =>
    `${key(owner, plural, name)}@${version}`;

  const server = http.createServer((request, response) => {
    const url = new URL(request.url ?? "/", "http://registry.test");
    const pathname = url.pathname;
    response.on("finish", () => {
      requests.push({
        method: request.method ?? "UNKNOWN",
        path: pathname,
        status: response.statusCode,
      });
    });

    void (async () => {
      if (options.stepUpTokenCreate === true && request.method === "POST") {
        if (pathname !== "/v1/tokens") {
          sendProblem(response, 404, `No POST route for ${pathname}`);
          return;
        }
        await readBody(request);
        const requestOrigin = `http://${request.headers.host ?? "127.0.0.1"}`;
        if (request.headers["x-axm-step-up-request"] !== STEP_UP_REQUEST_ID) {
          sendJson(response, 401, {
            code: "eotp",
            max_age: 300,
            step_up: {
              request_id: STEP_UP_REQUEST_ID,
              verification_url: `${requestOrigin}/step-up/${STEP_UP_REQUEST_ID}`,
              status_url: `${requestOrigin}/v1/auth/step-up/requests/${STEP_UP_REQUEST_ID}`,
              expires_at: "2026-08-10T16:05:00.000Z",
              interval: 0,
              action: "Create access token",
              target: "e2e-step-up",
            },
          });
          return;
        }
        sendJson(response, 201, {
          id: "token_step_up_e2e",
          token: "axmt_step_up_e2e",
          name: "e2e-step-up",
          scopes: ["extensions:read"],
          permissions: { permission: "read" },
          created_at: "2026-08-10T15:00:00.000Z",
          expires_at: "2026-09-09T15:00:00.000Z",
        });
        return;
      }

      if (request.method === "POST" && pathname === "/v1/publish-previews") {
        if (options.publishPreviewMode === "missing") {
          sendProblem(response, 404, "Publish previews are not supported.");
          return;
        }
        if (request.headers.authorization === undefined) {
          sendProblem(response, 401, "Publishing requires a bearer token.");
          return;
        }
        const body: unknown = JSON.parse((await readBody(request)).toString("utf8"));
        if (!isRecord(body) || !Array.isArray(body["candidates"])) {
          sendProblem(response, 400, "Publish preview candidates are required.");
          return;
        }
        const requestedVisibility =
          body["visibility"] === "public" || body["visibility"] === "private"
            ? body["visibility"]
            : undefined;
        const previews = body["candidates"].map((candidate: unknown) => {
          if (
            !isRecord(candidate) ||
            typeof candidate["owner"] !== "string" ||
            typeof candidate["type"] !== "string" ||
            typeof candidate["name"] !== "string" ||
            typeof candidate["version"] !== "string"
          ) {
            throw new Error("Invalid publish preview candidate");
          }
          const owner = candidate["owner"];
          const type = candidate["type"];
          const name = candidate["name"];
          const version = candidate["version"];
          const plural = Object.entries(TYPE_BY_PLURAL).find(([, value]) => value === type)?.[0];
          if (plural === undefined) throw new Error(`Unknown extension type ${type}`);
          const extensionKey = key(owner, plural, name);
          const existingVisibility = extensionVisibilities.get(extensionKey);
          const visibility =
            existingVisibility === undefined
              ? {
                  value: requestedVisibility ?? "public",
                  disposition: "establish",
                  source: requestedVisibility === undefined ? "platform" : "explicit",
                }
              : {
                  value: existingVisibility,
                  disposition: "preserve",
                  source: "existing",
                };
          const condition = `"e2e-${crypto
            .createHash("sha256")
            .update(`${targetKey(owner, plural, name, version)}:${JSON.stringify(visibility)}`)
            .digest("hex")}"`;
          previewConditions.set(targetKey(owner, plural, name, version), condition);
          return {
            kind: "resolved",
            target: { owner, type, name, version },
            visibility,
            condition,
          };
        });
        if (options.publishPreviewMode === "unavailable") {
          sendJson(
            response,
            200,
            previews.map((preview) => ({
              kind: "unavailable",
              target: preview.target,
              code: "publish/target-unavailable",
            })),
          );
          return;
        }
        sendJson(
          response,
          200,
          options.publishPreviewMode === "incomplete" ? previews.slice(0, -1) : previews,
        );
        return;
      }

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
        const expectedCondition = previewConditions.get(targetKey(owner, plural, name, version));
        if (expectedCondition === undefined || request.headers["if-match"] !== expectedCondition) {
          sendProblem(response, 412, "Publish preview condition is missing or stale.");
          return;
        }

        const archive = await readBody(request);
        const integrity = sha512Integrity(archive);
        if (plural === "packs" && options.enforcePackDependencies === true) {
          const missing = packDependencies(archive).filter((dependency) => {
            const dependencyVersions = extensions.get(dependency);
            return dependencyVersions === undefined || dependencyVersions.length === 0;
          });
          if (missing.length > 0) {
            sendProblem(
              response,
              409,
              `Pack dependencies are not published: ${missing.join(", ")}`,
            );
            return;
          }
        }
        const delayMs = options.publishDelayMsByPlural?.[plural] ?? 0;
        if (delayMs > 0) {
          await new Promise<void>((resolve) => setTimeout(resolve, delayMs));
        }
        const extensionKey = key(owner, plural, name);
        const versions = extensions.get(extensionKey) ?? [];
        if (versions.some((entry) => entry.version === version)) {
          sendProblem(response, 409, `Version ${version} already exists.`);
          return;
        }
        const published = new Date("2026-01-01T00:00:00.000Z").toISOString();
        const existingVisibility = extensionVisibilities.get(extensionKey);
        const requestedVisibility = url.searchParams.get("visibility");
        const establishedVisibility =
          requestedVisibility === "public" || requestedVisibility === "private"
            ? requestedVisibility
            : "public";
        const resolvedVisibility = existingVisibility ?? establishedVisibility;
        versions.push({ version, integrity, archive, published });
        extensions.set(extensionKey, versions);
        extensionVisibilities.set(extensionKey, resolvedVisibility);
        publishes.push({
          owner,
          plural,
          name,
          version,
          integrity,
          authorization: request.headers.authorization,
          contentType: request.headers["content-type"],
          ifMatch: request.headers["if-match"],
          requestedVisibility: requestedVisibility ?? undefined,
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
          visibility:
            existingVisibility === undefined
              ? {
                  value: resolvedVisibility,
                  disposition: "establish",
                  source: requestedVisibility === null ? "platform" : "explicit",
                }
              : { value: existingVisibility, disposition: "preserve", source: "existing" },
          warnings: [],
          links: { html: `https://example.test/${owner}/${plural}/${name}` },
        });
        return;
      }

      if (request.method !== "GET" && request.method !== "HEAD") {
        sendProblem(response, 405, `Unsupported method ${request.method ?? "unknown"}`);
        return;
      }

      if (
        options.stepUpTokenCreate === true &&
        pathname === `/v1/auth/step-up/requests/${STEP_UP_REQUEST_ID}`
      ) {
        sendJson(response, 200, {
          status: "verified",
          expires_at: "2026-08-10T16:05:00.000Z",
        });
        return;
      }

      const ownerMatch = OWNER_PATH.exec(pathname);
      if (ownerMatch !== null) {
        const [, owner = ""] = ownerMatch;
        if (owner !== TEST_OWNER) {
          sendProblem(response, 404, `No owner ${owner}`);
          return;
        }
        sendJson(response, 200, { displayName: "Test Owner" });
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
          visibility: extensionVisibilities.get(key(owner, plural, name)) ?? "public",
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
