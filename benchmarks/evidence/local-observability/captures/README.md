# Reviewed observability evidence archives

This retained evidence contains 244 completed scenarios, four reserved byte-comparison failures and one failed adoption comparison requiring replay. It does not establish full acceptance closure or a timing campaign.

`index.json` maps seven checkpoint archives to their original reports, source/binary identities and case classifications. The two readable `payload-index*.json` manifests preserve exact file hashes and withheld-host-file reasons; their corresponding `privacy-review*.json` files record the completed content audits. The prior checkpoint index remains unchanged beside them.

| Archive                                                                                    | Completed / reserved / failed | Payload files |   Bytes | SHA-256                                                            |
| ------------------------------------------------------------------------------------------ | ----------------------------: | ------------: | ------: | ------------------------------------------------------------------ |
| [run-01-full-preflight-08befbe16.tar.gz](run-01-full-preflight-08befbe16.tar.gz)           |                    13 / 0 / 0 |           604 |  248955 | `edf383f1ccb4b14121bb7c6a7f6cd159aae4b0bb9ca4e4db8fcd7bfd9aaf9769` |
| [run-02-remaining-preflight-99856a289.tar.gz](run-02-remaining-preflight-99856a289.tar.gz) |                    38 / 0 / 0 |          1782 | 3150511 | `3d9bcf68e8d398646a751c2fbad487b18bcc792efb2e530e59568f08f59808b5` |
| [run-03-handoff-and-scaling-99856a289.tar.gz](run-03-handoff-and-scaling-99856a289.tar.gz) |                     1 / 0 / 0 |            76 |  384007 | `8f53023afbde3152dbcdadd5fd994db3a2fc5d3f3b0feb04949b88e16ad389e1` |
| [run-04-scaling-50-2cf3580d3.tar.gz](run-04-scaling-50-2cf3580d3.tar.gz)                   |                     1 / 0 / 0 |            60 |  482274 | `8545f70139ee6a54f9730d92693add962d0935ce4beb72a4931882ed1386c8d2` |
| [run-05-remaining-196-2cf3580d3.tar.gz](run-05-remaining-196-2cf3580d3.tar.gz)             |                     1 / 0 / 0 |            76 |  277749 | `0b097c2c8e72bfd7c058d5d3ddd481db8e6139b0cec0e8af6a190efc4a8c4be9` |
| [run-06-remaining-195-2cf3580d3.tar.gz](run-06-remaining-195-2cf3580d3.tar.gz)             |                    78 / 4 / 0 |          5006 | 7917638 | `7a1ab581216ce913dfaf48818cae637a71bc6caffc5c34ae30342ce33f402603` |
| [run-07-remaining-113-4d8344c40.tar.gz](run-07-remaining-113-4d8344c40.tar.gz)             |                   112 / 0 / 1 |          6959 | 7444752 | `a2be9d28adc2ad03a02e96f06ae946c121543737c4cba247fe206c27998ed114` |

Extract a needed checkpoint with ordinary `tar -xzf <archive> -C <empty-directory>`. Relative `completed/`, `reserved/`, `failed/` and `runs/` paths preserve the classifications and original run records. Cross-run applicability provenance remains outside the archives.

Archive 7 includes the exact terminal-run candidate/baseline manifests and continuation selection. Its adoption failure had no raw generated diagnostic captured; no replacement document is supplied or claimed. Original report failure/completion flags remain exact.

All archives have sorted paths, file mode 0644, uid/gid 0, empty owner names, and tar/gzip mtime 0. Every new payload was read back against its staged SHA-256; the prior six archives were verified byte-identical. Existing per-sample gzip bytes were not recompressed individually.

Additional corrected replay evidence requires its own content audit and manifest update.
