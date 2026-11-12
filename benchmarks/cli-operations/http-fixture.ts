import type * as http from "node:http";
import * as Data from "effect/Data";
import {
  startDeviceAuthServer,
  startHttpRegistry,
  type HttpRegistryOptions,
} from "@agentxm/client-e2e-utils/registry";

/** The reference host must support this address; never fall back to the shared E2E address. */
export const benchmarkBindAddress = "127.0.0.2";

export interface FixtureRequestObservation {
  readonly method: string;
  readonly path: string;
  readonly status: number | null;
  readonly userAgent: string | undefined;
}

class BenchmarkTrafficFailure extends Data.TaggedError("BenchmarkTrafficFailure")<{
  readonly message: string;
}> {}

/** These are server observations, not process-attributed transport dispatches. */
export const benchmarkTraffic = () => {
  const observations: FixtureRequestObservation[] = [];
  const unexpected: FixtureRequestObservation[] = [];
  const observe = (
    request: http.IncomingMessage,
    response: http.ServerResponse,
    allowedPath: (path: string) => boolean = (path) => path.startsWith("/v1/"),
  ): boolean => {
    const pathname = new URL(request.url ?? "/", "http://fixture.invalid").pathname;
    const observation: {
      method: string;
      path: string;
      status: number | null;
      userAgent: string | undefined;
    } = {
      method: request.method ?? "UNKNOWN",
      path: pathname,
      status: null,
      userAgent: request.headers["user-agent"],
    };
    observations.push(observation);
    response.once("finish", () => {
      observation.status = response.statusCode;
    });
    if (/^axm-cli\/[^\s]+$/u.test(observation.userAgent ?? "") && allowedPath(pathname))
      return false;
    unexpected.push(observation);
    // 421 invites fetch to retry on a new connection; this is a final fixture refusal.
    response.writeHead(403, { "content-type": "application/json" });
    response.end(JSON.stringify({ error: "unexpected_benchmark_traffic" }));
    return true;
  };
  const assertClean = (): void => {
    if (unexpected.length > 0)
      throw new BenchmarkTrafficFailure({
        message: `Benchmark fixture received unexpected traffic: ${JSON.stringify(unexpected)}`,
      });
  };
  return { observations, observe, assertClean };
};

export const startBenchmarkRegistry = async (
  options: Omit<HttpRegistryOptions, "bindAddress"> = {},
) => {
  const traffic = benchmarkTraffic();
  const registry = await startHttpRegistry({
    ...options,
    bindAddress: benchmarkBindAddress,
    handleRequest: async (request, response) =>
      traffic.observe(request, response) ||
      (await options.handleRequest?.(request, response)) === true,
  });
  return {
    ...registry,
    get requests() {
      traffic.assertClean();
      return registry.requests;
    },
    observations: traffic.observations,
    assertTrafficClean: traffic.assertClean,
    close: async () => {
      await registry.close();
      traffic.assertClean();
    },
  };
};

export const startBenchmarkDeviceAuthServer = async (
  outcome?: Parameters<typeof startDeviceAuthServer>[0],
  handleRequest?: Parameters<typeof startDeviceAuthServer>[1],
) => {
  const traffic = benchmarkTraffic();
  const server = await startDeviceAuthServer(
    outcome,
    async (request, response) =>
      traffic.observe(request, response) || (await handleRequest?.(request, response)) === true,
    { bindAddress: benchmarkBindAddress },
  );
  return {
    ...server,
    get requests() {
      traffic.assertClean();
      return server.requests;
    },
    observations: traffic.observations,
    assertTrafficClean: traffic.assertClean,
    close: async () => {
      await server.close();
      traffic.assertClean();
    },
  };
};
