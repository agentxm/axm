#!/usr/bin/env bash
# Host lifecycle for an otherwise ordinary, fresh workspace-kernel test target.
set -euo pipefail
fixture=$(mktemp -d "${RUNNER_TEMP:-/tmp}/axm-casefold-XXXXXX")
image="$fixture/volume.img"
mountpoint="$fixture/mount"
mounted=false
cleanup() {
  status=$?
  trap - EXIT
  if [[ "$mounted" == true ]]; then
    sudo -n umount "$mountpoint" || exit 1
  fi
  # Both paths are private children of the freshly allocated fixture.
  rm "$image"
  rmdir "$mountpoint" "$fixture"
  exit "$status"
}
trap cleanup EXIT
mkdir "$mountpoint"
truncate -s 64M "$image"
mkfs.ext4 -q -O casefold "$image"
sudo -n mount -o loop "$image" "$mountpoint"
mounted=true
sudo -n chown "$(id -u):$(id -g)" "$mountpoint"
mkdir "$mountpoint/names"
chattr +F "$mountpoint/names"
export AXM_CASEFOLD_FIXTURE="$mountpoint/names"
pnpm exec nx run workspace-kernel:test --skip-nx-cache --args="src/locations/folding-native-path.test.ts --maxWorkers=1" --outputStyle=static
