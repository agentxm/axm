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
import { unzipSync, zipSync } from "fflate";

const PUBLISH_PATH = /^\/v1\/extensions\/(@[^/]+)\/([^/]+)\/([^/]+)\/([^/]+)$/;
const VERSION_PATH = PUBLISH_PATH;
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
  readonly publicationSetDigest: string | undefined;
  readonly publicationDescriptorDigest: string | undefined;
  readonly requestedVisibility: string | undefined;
  readonly byteLength: number;
}

/** Every request the CLI made, in order — the transport contract under test. */
export interface RequestRecord {
  readonly method: string;
  readonly path: string;
  readonly status: number;
  readonly authorization: string | undefined;
  readonly userAgent: string | undefined;
}

export interface HttpRegistry {
  readonly url: string;
  readonly publishes: ReadonlyArray<PublishRecord>;
  readonly requests: ReadonlyArray<RequestRecord>;
  readonly copyVersion: (
    owner: string,
    plural: string,
    name: string,
    sourceVersion: string,
    targetVersion: string,
  ) => void;
  readonly yank: (owner: string, plural: string, name: string, version: string) => void;
  readonly close: () => Promise<void>;
}

export interface HttpRegistryOptions {
  /** Test-only delay used to make an unordered pack upload fail deterministically. */
  readonly publishDelayMsByPlural?: Readonly<Record<string, number>>;
  /** Fail the first upload for each plural/name key, then allow recovery. */
  readonly failPublishOnce?: ReadonlyArray<string>;
  /** Reject a pack until every dependency named by its archive exists. */
  readonly enforcePackDependencies?: boolean;
  /** Require and complete the durable step-up flow for POST /v1/tokens. */
  readonly stepUpTokenCreate?: boolean;
  /** Return a deliberately unusable publish-preview contract or HTTP failure. */
  readonly publishPreviewMode?: "unavailable" | "incomplete" | "missing" | "service-unavailable";
  /** Map bearer tokens to the owner whose private extensions they may read. */
  readonly tokenOwners?: Readonly<Record<string, string>>;
}

interface StoredVersion {
  readonly version: string;
  readonly integrity: string;
  readonly archive: Buffer;
  readonly published: string;
  readonly yankedAt?: string;
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

interface PreviewTarget {
  readonly owner: string;
  readonly type: string;
  readonly name: string;
  readonly version: string;
}

interface PreviewDependency {
  readonly owner: string;
  readonly type: string;
  readonly name: string;
  readonly range: string;
}

interface PreviewDescriptor {
  readonly target: PreviewTarget;
  readonly participation: "publish" | "verified-existing";
  readonly archiveSha256Hex?: string;
  readonly visibility: {
    readonly intent: {
      readonly value: "public" | "private";
      readonly source: "manifest" | "workspace";
      readonly fingerprint: string;
    } | null;
    readonly request: "public" | "private" | null;
  };
  readonly pack?: { readonly dependencies: ReadonlyArray<PreviewDependency> };
}

const compareText = (left: string, right: string): number =>
  left < right ? -1 : left > right ? 1 : 0;

const parsePreviewDescriptor = (value: unknown): PreviewDescriptor | undefined => {
  if (!isRecord(value) || !isRecord(value["target"])) return undefined;
  const target = value["target"];
  if (
    typeof target["owner"] !== "string" ||
    typeof target["type"] !== "string" ||
    typeof target["name"] !== "string" ||
    typeof target["version"] !== "string" ||
    (value["participation"] !== "publish" && value["participation"] !== "verified-existing")
  ) {
    return undefined;
  }
  const archiveSha256Hex = value["archiveSha256Hex"];
  if (archiveSha256Hex !== undefined && typeof archiveSha256Hex !== "string") return undefined;
  const visibilityValue = value["visibility"];
  if (!isRecord(visibilityValue)) return undefined;
  const request = visibilityValue["request"];
  if (request !== null && request !== "public" && request !== "private") return undefined;
  const intentValue = visibilityValue["intent"];
  let intent: PreviewDescriptor["visibility"]["intent"] = null;
  if (intentValue !== null) {
    if (
      !isRecord(intentValue) ||
      (intentValue["value"] !== "public" && intentValue["value"] !== "private") ||
      (intentValue["source"] !== "manifest" && intentValue["source"] !== "workspace") ||
      typeof intentValue["fingerprint"] !== "string"
    ) {
      return undefined;
    }
    intent = {
      value: intentValue["value"],
      source: intentValue["source"],
      fingerprint: intentValue["fingerprint"],
    };
  }
  const packValue = value["pack"];
  let pack: PreviewDescriptor["pack"];
  if (packValue !== undefined) {
    if (!isRecord(packValue) || !Array.isArray(packValue["dependencies"])) return undefined;
    const dependencies: Array<PreviewDependency> = [];
    for (const dependency of packValue["dependencies"]) {
      if (
        !isRecord(dependency) ||
        typeof dependency["owner"] !== "string" ||
        typeof dependency["type"] !== "string" ||
        typeof dependency["name"] !== "string" ||
        typeof dependency["range"] !== "string"
      ) {
        return undefined;
      }
      dependencies.push({
        owner: dependency["owner"],
        type: dependency["type"],
        name: dependency["name"],
        range: dependency["range"],
      });
    }
    pack = { dependencies };
  }
  return {
    target: {
      owner: target["owner"],
      type: target["type"],
      name: target["name"],
      version: target["version"],
    },
    participation: value["participation"],
    ...(archiveSha256Hex === undefined ? {} : { archiveSha256Hex }),
    visibility: { intent, request },
    ...(pack === undefined ? {} : { pack }),
  };
};

const normalizeDescriptor = (descriptor: PreviewDescriptor): PreviewDescriptor => ({
  target: descriptor.target,
  participation: descriptor.participation,
  visibility: descriptor.visibility,
  ...(descriptor.archiveSha256Hex === undefined
    ? {}
    : { archiveSha256Hex: descriptor.archiveSha256Hex }),
  ...(descriptor.pack === undefined
    ? {}
    : {
        pack: {
          dependencies: [...descriptor.pack.dependencies].sort(
            (left, right) =>
              compareText(left.owner, right.owner) ||
              compareText(left.type, right.type) ||
              compareText(left.name, right.name) ||
              compareText(left.range, right.range),
          ),
        },
      }),
});

const sha256Json = (value: unknown): string =>
  crypto.createHash("sha256").update(JSON.stringify(value)).digest("hex");

const descriptorDigest = (descriptor: PreviewDescriptor): string =>
  sha256Json({ contract: "publication-set-v2", descriptor: normalizeDescriptor(descriptor) });

const publicationSetDigest = (descriptors: ReadonlyArray<PreviewDescriptor>): string =>
  sha256Json({
    contract: "publication-set-v2",
    candidates: descriptors
      .map(normalizeDescriptor)
      .sort(
        (left, right) =>
          compareText(left.target.owner, right.target.owner) ||
          compareText(left.target.type, right.target.type) ||
          compareText(left.target.name, right.target.name) ||
          compareText(left.target.version, right.target.version),
      ),
  });

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
  const previewBindings = new Map<
    string,
    { readonly condition: string; readonly setDigest: string; readonly descriptorDigest: string }
  >();
  const publishes: Array<PublishRecord> = [];
  const pendingPublishFailures = new Set(options.failPublishOnce ?? []);
  const requests: Array<RequestRecord> = [];
  const tokenOwners: Readonly<Record<string, string>> = {
    "e2e-test-token": TEST_OWNER,
    ...options.tokenOwners,
  };

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
        authorization: request.headers.authorization,
        userAgent: request.headers["user-agent"],
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
            kind: "StepUpRequiredError",
            type: "https://axm.dev/problems/step-up-required",
            title: "Step-up verification required",
            status: 401,
            detail: "Complete step-up verification before creating the token.",
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
          id: "tok_01h455vb4pexka56gq5w2r7cpc",
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
        if (options.publishPreviewMode === "service-unavailable") {
          sendJson(response, 503, {
            type: "about:blank",
            title: "Service Unavailable",
            status: 503,
            detail: "Publish admission is temporarily unavailable.",
            code: "service_unavailable",
            requestId: "req_preview_503",
            internalDiagnostic: "must-not-leak",
          });
          return;
        }
        const body: unknown = JSON.parse((await readBody(request)).toString("utf8"));
        if (!isRecord(body) || !Array.isArray(body["candidates"])) {
          sendProblem(response, 400, "Publish preview candidates are required.");
          return;
        }
        const descriptors = body["candidates"].map(parsePreviewDescriptor);
        if (descriptors.some((descriptor) => descriptor === undefined)) {
          sendProblem(response, 400, "Invalid publication descriptor.");
          return;
        }
        const completeDescriptors = descriptors.flatMap((descriptor) =>
          descriptor === undefined ? [] : [descriptor],
        );
        const setDigest = publicationSetDigest(completeDescriptors);
        const previews = completeDescriptors.map((candidate) => {
          const { owner, type, name, version } = candidate.target;
          const plural = Object.entries(TYPE_BY_PLURAL).find(([, value]) => value === type)?.[0];
          if (plural === undefined) throw new Error(`Unknown extension type ${type}`);
          const extensionKey = key(owner, plural, name);
          const existingVisibility = extensionVisibilities.get(extensionKey);
          const desiredVisibility =
            candidate.visibility.intent?.value ?? candidate.visibility.request ?? "public";
          const visibility =
            existingVisibility === undefined
              ? {
                  value: desiredVisibility,
                  disposition: "establish",
                  source:
                    candidate.visibility.intent?.source ??
                    (candidate.visibility.request === null ? "platform" : "explicit"),
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
          const candidateDigest = descriptorDigest(candidate);
          if (candidate.participation === "publish") {
            previewBindings.set(targetKey(owner, plural, name, version), {
              condition,
              setDigest,
              descriptorDigest: candidateDigest,
            });
          }
          return {
            kind: "resolved",
            target: { owner, type, name, version },
            participation: candidate.participation,
            descriptorDigest: candidateDigest,
            visibility: {
              target: `${owner}/${plural}/${name}`,
              intent: candidate.visibility.intent,
              request: candidate.visibility.request,
              resolved: visibility,
              actual:
                existingVisibility === undefined
                  ? null
                  : { value: existingVisibility, revision: '"e2e-visibility-revision"' },
              comparison:
                existingVisibility === undefined
                  ? "not-established"
                  : candidate.visibility.intent === null && candidate.visibility.request === null
                    ? "unconfigured"
                    : desiredVisibility === existingVisibility
                      ? "match"
                      : "drift",
              findings: [],
            },
            ...(candidate.participation === "publish" ? { condition } : {}),
          };
        });
        const packs = completeDescriptors
          .filter(
            (descriptor) =>
              descriptor.target.type === "pack" && descriptor.participation === "publish",
          )
          .map((descriptor) => ({
            target: descriptor.target,
            status: "admitted",
            findings: [],
            resolutions: (descriptor.pack?.dependencies ?? []).flatMap((dependency) => {
              const selected = completeDescriptors.find(
                (candidate) =>
                  candidate.target.owner === dependency.owner &&
                  candidate.target.type === dependency.type &&
                  candidate.target.name === dependency.name,
              );
              return selected === undefined
                ? []
                : [{ dependency, effectiveVersion: selected.target.version }];
            }),
          }));
        if (options.publishPreviewMode === "unavailable") {
          sendJson(response, 200, {
            contract: "publication-set-v2",
            publicationSetDigest: setDigest,
            status: "blocked",
            candidates: previews.map((preview) => ({
              kind: "unavailable",
              target: preview.target,
              participation: preview.participation,
              descriptorDigest: preview.descriptorDigest,
              code: "publish/target-unavailable",
              visibility: {
                target: preview.visibility.target,
                unavailable: true,
                findings: [
                  {
                    code: "visibility/unavailable",
                    severity: "error",
                    message: "Visibility is unavailable.",
                  },
                ],
              },
            })),
            packs,
          });
          return;
        }
        sendJson(response, 200, {
          contract: "publication-set-v2",
          publicationSetDigest: setDigest,
          status: "admitted",
          candidates:
            options.publishPreviewMode === "incomplete" ? previews.slice(0, -1) : previews,
          packs,
        });
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
        const expectedBinding = previewBindings.get(targetKey(owner, plural, name, version));
        if (
          expectedBinding === undefined ||
          request.headers["if-match"] !== expectedBinding.condition ||
          request.headers["x-axm-publication-set-digest"] !== expectedBinding.setDigest ||
          request.headers["x-axm-publication-descriptor-digest"] !==
            expectedBinding.descriptorDigest
        ) {
          sendProblem(response, 412, "Publish preview condition is missing or stale.");
          return;
        }

        const archive = await readBody(request);
        const integrity = sha512Integrity(archive);
        const failureKey = `${plural}/${name}`;
        if (pendingPublishFailures.delete(failureKey)) {
          sendProblem(response, 500, `Injected one-time publish failure for ${failureKey}.`);
          return;
        }
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
        const published = "2026-01-01T00:00:00.000Z";
        const existingVisibility = extensionVisibilities.get(extensionKey);
        const requestedVisibility = url.searchParams.get("visibility");
        if (existingVisibility !== undefined && requestedVisibility !== null) {
          sendProblem(response, 409, "Initial visibility is only valid for a new extension.");
          return;
        }
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
          publicationSetDigest: request.headers["x-axm-publication-set-digest"],
          publicationDescriptorDigest: request.headers["x-axm-publication-descriptor-digest"],
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

      const requesterOwner = (() => {
        const authorization = request.headers.authorization;
        if (authorization === undefined || !authorization.startsWith("Bearer ")) return undefined;
        return tokenOwners[authorization.slice("Bearer ".length)];
      })();
      const canRead = (owner: string, plural: string, name: string): boolean =>
        extensionVisibilities.get(key(owner, plural, name)) !== "private" ||
        requesterOwner === owner;

      const archiveMatch = ARCHIVE_PATH.exec(pathname);
      if (archiveMatch !== null) {
        const [, owner = "", plural = "", name = "", version = ""] = archiveMatch;
        const stored = extensions
          .get(key(owner, plural, name))
          ?.find((entry) => entry.version === version);
        if (stored === undefined || !canRead(owner, plural, name)) {
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

      const versionMatch = VERSION_PATH.exec(pathname);
      if (versionMatch !== null) {
        const [, owner = "", plural = "", name = "", version = ""] = versionMatch;
        const type = TYPE_BY_PLURAL[plural];
        const stored = extensions
          .get(key(owner, plural, name))
          ?.find((entry) => entry.version === version);
        if (type === undefined || stored === undefined || !canRead(owner, plural, name)) {
          sendProblem(response, 404, `No version for ${plural}/${name}@${version}`);
          return;
        }
        sendJson(response, 200, {
          name,
          owner,
          type,
          version: stored.version,
          published: stored.published,
          integrity: stored.integrity,
          yanked_at: stored.yankedAt,
          visibility: extensionVisibilities.get(key(owner, plural, name)) ?? "public",
        });
        return;
      }

      const indexMatch = INDEX_PATH.exec(pathname);
      if (indexMatch !== null) {
        const [, owner = "", plural = "", name = ""] = indexMatch;
        const type = TYPE_BY_PLURAL[plural];
        const versions = extensions.get(key(owner, plural, name));
        if (
          type === undefined ||
          versions === undefined ||
          versions.length === 0 ||
          !canRead(owner, plural, name)
        ) {
          sendProblem(response, 404, `No extension ${plural}/${name}`);
          return;
        }
        sendJson(response, 200, {
          name,
          owner,
          type,
          publisher_binding_id: "hbnd_e2e",
          visibility: extensionVisibilities.get(key(owner, plural, name)) ?? "public",
          deprecation: null,
          versions: versions.map((entry) => ({
            version: entry.version,
            published: entry.published,
            integrity: entry.integrity,
            yanked_at: entry.yankedAt,
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
    copyVersion: (owner, plural, name, sourceVersion, targetVersion) => {
      const extensionKey = key(owner, plural, name);
      const versions = extensions.get(extensionKey) ?? [];
      const source = versions.find((entry) => entry.version === sourceVersion);
      if (source === undefined) throw new Error(`No source version ${sourceVersion}`);
      const entries = unzipSync(source.archive);
      const type = TYPE_BY_PLURAL[plural];
      if (type === undefined) throw new Error(`Unknown extension type segment "${plural}"`);
      const manifestName = type === "mcp-server" ? "mcp.json" : `${type}.json`;
      const manifestBytes = entries[manifestName];
      if (manifestBytes === undefined) throw new Error(`No ${manifestName} in source archive`);
      const manifest: unknown = JSON.parse(new TextDecoder().decode(manifestBytes));
      if (!isRecord(manifest)) throw new Error(`Invalid ${manifestName} in source archive`);
      manifest["version"] = targetVersion;
      entries[manifestName] = new TextEncoder().encode(JSON.stringify(manifest, null, 2));
      const archive = Buffer.from(zipSync(entries));
      extensions.set(extensionKey, [
        ...versions,
        {
          ...source,
          version: targetVersion,
          integrity: sha512Integrity(archive),
          archive,
          published: "2026-01-02T00:00:00.000Z",
        },
      ]);
    },
    yank: (owner, plural, name, version) => {
      const extensionKey = key(owner, plural, name);
      const versions = extensions.get(extensionKey) ?? [];
      extensions.set(
        extensionKey,
        versions.map((entry) =>
          entry.version === version ? { ...entry, yankedAt: "2026-01-02T00:00:00.000Z" } : entry,
        ),
      );
    },
    close: () =>
      new Promise<void>((resolve, reject) => {
        server.close((error) => (error ? reject(error) : resolve()));
      }),
  };
};
