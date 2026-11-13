# Reviewed observability evidence archives

This retained set covers 245 completed scenarios and four reserved byte-comparison failures:249 unique scenarios. It is not full acceptance closure or a repeated timing campaign.

`index.json` maps ten checkpoint archives to original reports, product binaries, harness identities and case classifications. Three readable payload indexes preserve exact file hashes, omitted-host-file reasons and privacy projections; corresponding privacy reviews record the audits. Both prior checkpoint indexes remain unchanged.

The adoption scenario now passes disabled, summary and detail comparison with two receiver inspections in archive10. Its earlier remaining-113 comparison failure and two verifier failures remain historical failures in archives7–9; they are not additional current scenarios. The first verifier attempt did not capture the raw diagnostic; the second did. Archive10 retains independent single-native-entry preparation proof and raw diagnostics for all four subjects.

| Archive                                                                                          | Completed / reserved / historical adoption failure | Payload files |   Bytes | SHA-256                                                            |
| ------------------------------------------------------------------------------------------------ | -------------------------------------------------: | ------------: | ------: | ------------------------------------------------------------------ |
| [run-01-full-preflight-08befbe16.tar.gz](run-01-full-preflight-08befbe16.tar.gz)                 |                                         13 / 0 / 0 |           604 |  248955 | `edf383f1ccb4b14121bb7c6a7f6cd159aae4b0bb9ca4e4db8fcd7bfd9aaf9769` |
| [run-02-remaining-preflight-99856a289.tar.gz](run-02-remaining-preflight-99856a289.tar.gz)       |                                         38 / 0 / 0 |          1782 | 3150511 | `3d9bcf68e8d398646a751c2fbad487b18bcc792efb2e530e59568f08f59808b5` |
| [run-03-handoff-and-scaling-99856a289.tar.gz](run-03-handoff-and-scaling-99856a289.tar.gz)       |                                          1 / 0 / 0 |            76 |  384007 | `8f53023afbde3152dbcdadd5fd994db3a2fc5d3f3b0feb04949b88e16ad389e1` |
| [run-04-scaling-50-2cf3580d3.tar.gz](run-04-scaling-50-2cf3580d3.tar.gz)                         |                                          1 / 0 / 0 |            60 |  482274 | `8545f70139ee6a54f9730d92693add962d0935ce4beb72a4931882ed1386c8d2` |
| [run-05-remaining-196-2cf3580d3.tar.gz](run-05-remaining-196-2cf3580d3.tar.gz)                   |                                          1 / 0 / 0 |            76 |  277749 | `0b097c2c8e72bfd7c058d5d3ddd481db8e6139b0cec0e8af6a190efc4a8c4be9` |
| [run-06-remaining-195-2cf3580d3.tar.gz](run-06-remaining-195-2cf3580d3.tar.gz)                   |                                         78 / 4 / 0 |          5006 | 7917638 | `7a1ab581216ce913dfaf48818cae637a71bc6caffc5c34ae30342ce33f402603` |
| [run-07-remaining-113-4d8344c40.tar.gz](run-07-remaining-113-4d8344c40.tar.gz)                   |                                        112 / 0 / 1 |          6959 | 7444752 | `a2be9d28adc2ad03a02e96f06ae946c121543737c4cba247fe206c27998ed114` |
| [run-08-adoption-diagnostic-4d8344c40.tar.gz](run-08-adoption-diagnostic-4d8344c40.tar.gz)       |                                          0 / 0 / 1 |            20 |   94420 | `1d15f189631355715736831f4897666f4137e889f32cf848ff455831cb524f32` |
| [run-09-adoption-diagnostic2-4d8344c40.tar.gz](run-09-adoption-diagnostic2-4d8344c40.tar.gz)     |                                          0 / 0 / 1 |            21 |   95053 | `612b408fc05863506c0223e7601b0f12606957d8e8a8be15ab604043b7f3cc0b` |
| [run-10-adoption-single-target-4d8344c40.tar.gz](run-10-adoption-single-target-4d8344c40.tar.gz) |                                          1 / 0 / 0 |            94 |  233995 | `1b98b65ffb2e81de9d354e8b9efad39ee961990b6b4491b3e22e7f82ba1a3563` |

Extract a selected archive into an empty directory using `tar -xzf <archive> -C <empty-directory>`. Paths inside each new archive retain the original run-relative artifact layout under a unique `runs/<checkpoint>/` prefix. The payload index maps every retained path to its original artifact, byte length and SHA-256. Archive members use sorted paths, owner/group0, mode0644 and timestamp0; gzip carries no filename and timestamp0.

Every new archive entry was read back and checked against its staged hash. The seven prior archives are byte-identical to their previous reviewed set. Host process snapshots are omitted with original compressed/raw hashes and reasons. No whole fixture homes, private configurations, binaries or receiver storage are included.

All raw benchmark reports and payloads preserve their exact bytes, including `complete:false` and original errors. Six verification logs use distinctly named public projections replacing only the absolute checkout prefix; original/projected hashes, affected line numbers and occurrence counts appear in `payload-index-adoption.json`. The remaining three verification logs are exact copies. Logged task command lines establish only commands printed by those logs; unrecorded top-level environment and shell invocations are not invented.

Global planned counts in raw reports describe the full inventory; the adjacent original selections and actual per-run records define these single-scenario captures. No uninspected trace is claimed verified, and no timing qualification is claimed.
