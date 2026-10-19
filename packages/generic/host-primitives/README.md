# Host primitives

This package owns atomic single-file replacement, filesystem absence reads, SHA-512 SRI digests, credential redaction, file locations, lexical path containment, process-environment readers, loopback host recognition, per-operation request admission, and user-home and cache-root resolution for AXM. It imports no other AXM package so every tier can consume the same host behavior. The API is unstable and unsupported; use the axm.sh CLI.
