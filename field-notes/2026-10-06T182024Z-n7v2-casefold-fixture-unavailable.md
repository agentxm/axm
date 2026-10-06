---
observed_at: "2026-10-06T18:20:24.955843+00:00"
session: "native-resolution-n7v2"
area: "native filesystem verification"
---

# Local kernel cannot mount an ext4 casefold fixture

## Context

Comparing canonical native-path resolution with directory-entry spelling on Linux, including case and Unicode aliases. The host runs Linux 6.12.93 x86_64.

## Friction

A new, disposable 64 MiB ext4 image created with `mkfs.ext4 -O casefold` could not mount. Kernel output reported: `Filesystem with casefold feature cannot be mounted without CONFIG_UNICODE`.

## Cost / impact

Real folding-volume verification remains unavailable on this local kernel. Ordinary Linux paths and simulated folding volumes can still be tested.

## Outcome

The temporary image and mount directory were removed. Hosted Linux verification is being used for the real casefold check.
