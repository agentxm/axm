# Root-cause research summary

The checkout preview fails because the generated client converts the service
problem response into a generic transport exception before the command adapter
can inspect it. The accepted correction is to decode the service problem once
at the transport boundary and preserve its status through the command adapter.

This derived summary intentionally does not contain the initiating monitoring
identifier or URL.
