/** Loopback Registry backed by the deterministic file Registry fixture. */

import * as fs from "node:fs";
import * as http from "node:http";
import * as path from "node:path";

interface RequestRecord {
  readonly method: string;
  readonly path: string;
  readonly status: number;
  readonly responseBytes: number;
  readonly archiveBody: boolean;
}

export interface RequestMetrics {
  readonly requests: number;
  readonly uniqueKeys: number;
  readonly repeatedKeys: number;
  readonly retryAttempts: number;
  readonly archiveBodies: number;
  readonly archiveBytes: number;
  readonly peakActiveArchiveBodies: number;
  readonly byStatus: Readonly<Record<string, number>>;
}

export interface LifecycleRegistry {
  readonly url: string;
  readonly reset: (record: boolean) => void;
  readonly failNextMetadata: (name: string) => void;
  readonly metrics: () => RequestMetrics | null;
  readonly close: () => Promise<void>;
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const indexBody = (file: string): unknown => {
  const parsed: unknown = JSON.parse(fs.readFileSync(file, "utf8"));
  if (!isRecord(parsed) || !Array.isArray(parsed["versions"])) {
    throw new Error("Invalid benchmark Registry index.");
  }
  return {
    owner: parsed["owner"],
    type: parsed["type"],
    name: parsed["name"],
    publisher_binding_id: parsed["publisherBindingId"],
    visibility: "public",
    archival: parsed["archival"],
    deprecation: parsed["deprecation"],
    versions: parsed["versions"],
  };
};

export const startLifecycleRegistry = async (
  fixtureRoot: string,
  archiveBodyDelayMs: number,
): Promise<LifecycleRegistry> => {
  let recording = false;
  let records: Array<RequestRecord> = [];
  let activeArchiveBodies = 0;
  let peakActiveArchiveBodies = 0;
  const failNextMetadata = new Set<string>();
  const server = http.createServer((request, response) => {
    const url = new URL(request.url ?? "/", "http://benchmark.test");
    const segments = url.pathname.split("/").filter(Boolean).map(decodeURIComponent);
    const method = request.method ?? "UNKNOWN";
    const finish = (status: number, bytes: number, archiveBody: boolean): void => {
      if (recording) {
        records.push({ method, path: url.pathname, status, responseBytes: bytes, archiveBody });
      }
    };
    const send = (
      status: number,
      body: string | Buffer,
      contentType: string,
      archiveBody = false,
    ) => {
      const byteLength = Buffer.byteLength(body);
      if (archiveBody && method === "GET") {
        activeArchiveBodies += 1;
        peakActiveArchiveBodies = Math.max(peakActiveArchiveBodies, activeArchiveBodies);
      }
      response.once("finish", () => {
        if (archiveBody && method === "GET") activeArchiveBodies -= 1;
        finish(status, method === "HEAD" ? 0 : byteLength, archiveBody && method === "GET");
      });
      response.writeHead(status, {
        "content-type": contentType,
        "content-length": String(byteLength),
      });
      if (archiveBody && method === "GET" && archiveBodyDelayMs > 0) {
        setTimeout(() => response.end(body), archiveBodyDelayMs);
      } else {
        response.end(method === "HEAD" ? undefined : body);
      }
    };
    if (method !== "GET" && method !== "HEAD") {
      send(
        405,
        JSON.stringify({ title: "Method not allowed", status: 405 }),
        "application/problem+json",
      );
      return;
    }
    if (segments.length < 5 || segments[0] !== "v1" || segments[1] !== "extensions") {
      send(404, JSON.stringify({ title: "Not found", status: 404 }), "application/problem+json");
      return;
    }
    const owner = segments[2];
    const plural = segments[3];
    const name = segments[4];
    if (
      owner !== "@acme" ||
      (plural !== "skills" && plural !== "packs") ||
      name === undefined ||
      !/^bench-(?:\d{3}|pack-[ab])$/.test(name)
    ) {
      send(404, JSON.stringify({ title: "Not found", status: 404 }), "application/problem+json");
      return;
    }
    const directory = path.join(fixtureRoot, "extensions", owner, plural, name);
    const indexPath = path.join(directory, "index.json");
    if (!fs.existsSync(indexPath)) {
      send(404, JSON.stringify({ title: "Not found", status: 404 }), "application/problem+json");
      return;
    }
    try {
      const index = indexBody(indexPath);
      if (segments.length === 5) {
        if (failNextMetadata.delete(name)) {
          send(
            503,
            JSON.stringify({ title: "Temporary fixture failure", status: 503 }),
            "application/problem+json",
          );
          return;
        }
        send(200, JSON.stringify(index), "application/json");
        return;
      }
      const version = segments[5];
      if (version === undefined || !/^\d+\.\d+\.\d+$/.test(version)) {
        send(404, JSON.stringify({ title: "Not found", status: 404 }), "application/problem+json");
        return;
      }
      if (segments.length === 7 && segments[6] === "archive") {
        const archivePath = path.join(directory, `${version}.zip`);
        if (!fs.existsSync(archivePath)) {
          send(
            404,
            JSON.stringify({ title: "Not found", status: 404 }),
            "application/problem+json",
          );
          return;
        }
        send(200, fs.readFileSync(archivePath), "application/zip", true);
        return;
      }
      if (segments.length === 6 && isRecord(index) && Array.isArray(index["versions"])) {
        const selected = index["versions"].find(
          (entry: unknown) => isRecord(entry) && entry["version"] === version,
        );
        if (isRecord(selected)) {
          send(
            200,
            JSON.stringify({
              name,
              owner,
              type: plural === "skills" ? "skill" : "pack",
              version,
              published: selected["published"],
              integrity: selected["integrity"],
              yanked_at: selected["yanked_at"],
              visibility: "public",
            }),
            "application/json",
          );
          return;
        }
      }
      send(404, JSON.stringify({ title: "Not found", status: 404 }), "application/problem+json");
    } catch {
      send(
        500,
        JSON.stringify({ title: "Fixture failure", status: 500 }),
        "application/problem+json",
      );
    }
  });
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  const address = server.address();
  if (address === null || typeof address === "string") {
    throw new Error("Could not determine benchmark Registry address.");
  }
  return {
    url: `http://127.0.0.1:${address.port}`,
    reset: (record) => {
      recording = record;
      records = [];
      activeArchiveBodies = 0;
      peakActiveArchiveBodies = 0;
    },
    failNextMetadata: (name) => {
      failNextMetadata.add(name);
    },
    metrics: () => {
      if (!recording) return null;
      const keys = new Set(records.map((record) => `${record.method} ${record.path}`));
      const latestStatuses = new Map<string, number>();
      let retryAttempts = 0;
      for (const record of records) {
        const key = `${record.method} ${record.path}`;
        const previous = latestStatuses.get(key);
        if (previous !== undefined && (previous === 408 || previous === 429 || previous >= 500)) {
          retryAttempts += 1;
        }
        latestStatuses.set(key, record.status);
      }
      return {
        requests: records.length,
        uniqueKeys: keys.size,
        repeatedKeys: records.length - keys.size,
        retryAttempts,
        archiveBodies: records.filter((record) => record.archiveBody).length,
        archiveBytes: records
          .filter((record) => record.archiveBody)
          .reduce((bytes, record) => bytes + record.responseBytes, 0),
        peakActiveArchiveBodies,
        byStatus: Object.fromEntries(
          [...new Set(records.map((record) => record.status))].map((status) => [
            String(status),
            records.filter((record) => record.status === status).length,
          ]),
        ),
      };
    },
    close: () =>
      new Promise<void>((resolve, reject) =>
        server.close((error) => (error ? reject(error) : resolve())),
      ),
  };
};
