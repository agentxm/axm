// swift-tools-version: 6.0
//
// AgentXMExamplePawMatch — a tiny SwiftPM CLI that consumes
// AgentXMExampleTinyFlags. The package is intentionally not publishable; it
// exists to demonstrate how a consumer wires AXM-aware metadata.
//
// The TinyFlags library is consumed via a relative path dependency rather
// than a URL so the example can run without a registry. A real consumer would
// write `.package(url: "https://example.com/agentxm/example-tinyflags-swift.git",
// from: "0.1.0")`. The AXM Swift detector parses the URL-based form to compute
// a purl.
import PackageDescription

let package = Package(
    name: "AgentXMExamplePawMatch",
    platforms: [.macOS(.v14)],
    products: [
        .executable(name: "pawmatch", targets: ["pawmatch"])
    ],
    dependencies: [
        .package(path: "../swift-spm-lib"),
        .package(url: "https://github.com/apple/swift-argument-parser.git", from: "1.3.0"),
    ],
    targets: [
        .target(
            name: "PawMatchKit",
            dependencies: [
                .product(name: "AgentXMExampleTinyFlags", package: "swift-spm-lib"),
                .product(name: "ArgumentParser", package: "swift-argument-parser"),
            ],
            path: "Sources/PawMatchKit"
        ),
        .executableTarget(
            name: "pawmatch",
            dependencies: [
                "PawMatchKit",
                .product(name: "ArgumentParser", package: "swift-argument-parser"),
            ],
            path: "Sources/PawMatchCLI"
        ),
        .testTarget(
            name: "PawMatchTests",
            dependencies: ["PawMatchKit"],
            path: "Tests/PawMatchTests"
        ),
    ]
)
