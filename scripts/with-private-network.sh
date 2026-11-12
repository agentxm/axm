#!/usr/bin/env bash
# Whole-process network isolation; setup happens before the supplied command starts.
set -euo pipefail

if [[ $(uname -s) != Linux ]]; then
  echo 'AXM reference benchmarks require Linux network namespaces; no fallback is permitted.' >&2
  exit 2
fi
if (( $# == 0 )); then
  echo 'Usage: with-private-network.sh COMMAND [ARGUMENT ...]' >&2
  exit 2
fi
for tool in unshare ip setpriv readlink id; do
  command -v "$tool" >/dev/null || {
    echo "AXM network isolation requires $tool; no command was started." >&2
    exit 2
  }
done
parent_namespace=$(readlink /proc/self/ns/net)
parent_uid=$(id -u)
parent_gid=$(id -g)

exec unshare --user --map-current-user --net --keep-caps /bin/sh -eu -c '
  parent_namespace=$1
  parent_uid=$2
  parent_gid=$3
  shift 3
  ip link set dev lo up
  namespace=$(readlink /proc/self/ns/net)
  if [ "$namespace" = "$parent_namespace" ]; then
    echo "AXM network namespace was not isolated; command refused." >&2
    exit 2
  fi
  if [ "$(id -u)" != "$parent_uid" ] || [ "$(id -g)" != "$parent_gid" ]; then
    echo "AXM network setup changed the primary user or group; command refused." >&2
    exit 2
  fi
  export AXM_BENCHMARK_NETWORK_PROFILE=linux-user-netns-v1
  export AXM_BENCHMARK_PARENT_NETNS="$parent_namespace"
  export AXM_BENCHMARK_NETNS="$namespace"
  export AXM_BENCHMARK_PARENT_UID="$parent_uid"
  export AXM_BENCHMARK_PARENT_GID="$parent_gid"
  exec setpriv --bounding-set=-all --inh-caps=-all --ambient-caps=-all -- "$@"
' axm-private-network "$parent_namespace" "$parent_uid" "$parent_gid" "$@"
