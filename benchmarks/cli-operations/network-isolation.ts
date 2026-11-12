import * as fs from "node:fs/promises";
import * as Data from "effect/Data";
import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";

export const NetworkIsolationSchema = Schema.Struct({
  profile: Schema.Literal("linux-user-netns-v1"),
  parentNamespace: Schema.String,
  namespace: Schema.String,
  uid: Schema.Number,
  gid: Schema.Number,
  supplementaryGroups: Schema.Array(Schema.Number),
  uidMap: Schema.String,
  gidMap: Schema.String,
  capabilities: Schema.Record(Schema.String, Schema.String),
  recordedAt: Schema.String,
});

class NetworkIsolationFailed extends Data.TaggedError("NetworkIsolationFailed")<{
  readonly message: string;
  readonly cause?: unknown;
}> {}

/** Check once before collection; per-launch inode evidence is excluded from comparable host identity. */
export const readNetworkIsolation = Effect.tryPromise({
  try: async () => {
    if (process.platform !== "linux")
      throw new NetworkIsolationFailed({ message: "Whole-CLI reference collection requires Linux network isolation" });
    const [namespace, status, uidMap, gidMap] = await Promise.all([
      fs.readlink("/proc/self/ns/net"),
      fs.readFile("/proc/self/status", "utf8"),
      fs.readFile("/proc/self/uid_map", "utf8"),
      fs.readFile("/proc/self/gid_map", "utf8"),
    ]);
    const parentNamespace = process.env["AXM_BENCHMARK_PARENT_NETNS"];
    const uid = process.getuid?.();
    const gid = process.getgid?.();
    const capabilities = Object.fromEntries(
      ["CapInh", "CapPrm", "CapEff", "CapBnd", "CapAmb"].map((name) => [
        name, status.split("\n").find((line) => line.startsWith(`${name}:`))?.split(":")[1]?.trim() ?? "missing",
      ]),
    );
    if (
      process.env["AXM_BENCHMARK_NETWORK_PROFILE"] !== "linux-user-netns-v1" ||
      parentNamespace === undefined || !/^net:\[\d+\]$/u.test(parentNamespace) ||
      parentNamespace === namespace || process.env["AXM_BENCHMARK_NETNS"] !== namespace ||
      uid === undefined || gid === undefined ||
      String(uid) !== process.env["AXM_BENCHMARK_PARENT_UID"] ||
      String(gid) !== process.env["AXM_BENCHMARK_PARENT_GID"] ||
      Object.values(capabilities).some((value) => !/^0+$/u.test(value))
    ) throw new NetworkIsolationFailed({
      message: "Benchmark runner requires the private network launcher, unchanged primary IDs, and zero capabilities; collection refused",
    });
    return Schema.decodeUnknownSync(NetworkIsolationSchema)({
      profile: "linux-user-netns-v1", parentNamespace, namespace, uid, gid,
      supplementaryGroups: process.getgroups?.() ?? [], uidMap: uidMap.trim(), gidMap: gidMap.trim(),
      capabilities, recordedAt: new Date().toISOString(),
    });
  },
  catch: (cause) => cause instanceof NetworkIsolationFailed ? cause : new NetworkIsolationFailed({
    message: "Cannot establish benchmark network isolation provenance", cause,
  }),
});
