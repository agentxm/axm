// swift-tools-version: 6.0
//
// AgentXMExampleTinyFlags — a tiny feature flags library used by the AXM
// companion-package Swift example. The package is intentionally simple and
// depends only on Foundation. Tests use XCTest for portability across the
// command-line Swift toolchain and Xcode (Swift Testing is an idiomatic
// alternative when a maintainer has a toolchain that bundles it).
//
// The placeholder dependency URL used by AXM detection in the consumer app is
// `https://example.com/agentxm/example-tinyflags-swift.git` — see this
// directory's README.md for why we use `example.com` rather than a real host.
import PackageDescription

let package = Package(
    name: "AgentXMExampleTinyFlags",
    products: [
        .library(
            name: "AgentXMExampleTinyFlags",
            targets: ["AgentXMExampleTinyFlags"]
        )
    ],
    targets: [
        .target(
            name: "AgentXMExampleTinyFlags",
            path: "Sources/AgentXMExampleTinyFlags"
        ),
        .testTarget(
            name: "AgentXMExampleTinyFlagsTests",
            dependencies: ["AgentXMExampleTinyFlags"],
            path: "Tests/AgentXMExampleTinyFlagsTests"
        ),
    ]
)
