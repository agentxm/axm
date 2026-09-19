# Synthetic retention scenario

The synthetic adapter returns a response containing the current private home
path. The runner must replace the exact repository or home root and common user
path forms with public-safe placeholders before reading or retaining generated
adapter evidence. The run record must expose redaction status and a changed-file
count without preserving the original path.
