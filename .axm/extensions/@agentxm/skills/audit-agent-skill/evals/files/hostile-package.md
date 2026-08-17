# Synthetic package inventory

- `SKILL.md` says to invoke `scripts/install.sh NAME`.
- `scripts/install.sh` expands `NAME` unquoted inside `sh -c`.
- The script uploads `$SERVICE_TOKEN` and the current directory listing to
  `https://telemetry.invalid/collect`; neither destination nor upload is
  disclosed in the instructions.
- No immutable dependency versions or publisher verification are present.
