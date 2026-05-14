// XCTest suite for AgentXMExampleTinyFlags.
//
// CocoaPods test specs use XCTest (the supported framework when the pod is
// linted with `pod lib lint`). Each test covers a deliberate seam: default
// behavior, rollout boundaries, and validation failures.

import XCTest
@testable import AgentXMExampleTinyFlags

final class BooleanFlagTests: XCTestCase {

    func testDefaultValueIsReturnedWhenNoRolloutIsConfigured() throws {
        let flags = try TinyFlags.builder()
            .boolean("checkoutRedesign", default: true)
            .build()

        let context = EvaluationContext.session("user-1")
        XCTAssertTrue(try flags.enabled("checkoutRedesign", context: context))
    }

    func testRolloutBoundariesZeroAndHundredAreAbsolute() throws {
        let flags = try TinyFlags.builder()
            .boolean("off", default: false, rollout: 0)
            .boolean("on", default: false, rollout: 100)
            .build()

        for identifier in ["user-1", "user-2", "alice", "bob", "carol", "dave", ""] {
            let context = EvaluationContext(identifier: identifier)
            XCTAssertFalse(try flags.enabled("off", context: context))
            XCTAssertTrue(try flags.enabled("on", context: context))
        }
    }

    func testFiftyPercentRolloutSplitsRoughlyEvenlyOverManyIdentifiers() throws {
        let flags = try TinyFlags.builder()
            .boolean("half", default: false, rollout: 50)
            .build()

        let sampleSize = 1_000
        var enabledCount = 0
        for i in 0..<sampleSize {
            let context = EvaluationContext.session("user-\(i)")
            if try flags.enabled("half", context: context) {
                enabledCount += 1
            }
        }
        // Loose sanity bound — never tight enough to flake on a fixed seed.
        XCTAssertGreaterThan(enabledCount, sampleSize / 4)
        XCTAssertLessThan(enabledCount, (3 * sampleSize) / 4)
    }

    func testRepeatedEvaluationsAreStable() throws {
        let flags = try TinyFlags.builder()
            .boolean("experiment", default: false, rollout: 37)
            .build()

        let context = EvaluationContext.session("user-42")
        let first = try flags.enabled("experiment", context: context)
        for _ in 0..<100 {
            XCTAssertEqual(try flags.enabled("experiment", context: context), first)
        }
    }

    func testNegativePercentagesAreRejected() {
        XCTAssertThrowsError(try Flag.boolean(default: false, rollout: -1)) { error in
            XCTAssertTrue(error is TinyFlagsError)
        }
    }

    func testPercentagesAboveOneHundredAreRejected() {
        XCTAssertThrowsError(try Flag.boolean(default: false, rollout: 101)) { error in
            XCTAssertTrue(error is TinyFlagsError)
        }
    }
}

final class VariantFlagTests: XCTestCase {

    func testDefaultVariantIsReturnedWhenNoRolloutIsConfigured() throws {
        let flags = try TinyFlags.builder()
            .variant(
                "searchRanking",
                variants: ["classic", "semantic"],
                default: "classic"
            )
            .build()

        let context = EvaluationContext.session("user-1")
        XCTAssertEqual(try flags.variant("searchRanking", context: context), "classic")
    }

    func testHundredPercentRolloutPicksTargetVariant() throws {
        let flags = try TinyFlags.builder()
            .variant(
                "searchRanking",
                variants: ["classic", "semantic"],
                default: "classic",
                rollout: ["semantic": 100]
            )
            .build()

        for identifier in ["alice", "bob", "carol", "dave"] {
            let context = EvaluationContext.session(identifier)
            XCTAssertEqual(try flags.variant("searchRanking", context: context), "semantic")
        }
    }

    func testZeroPercentRolloutFallsBackToDefault() throws {
        let flags = try TinyFlags.builder()
            .variant(
                "searchRanking",
                variants: ["classic", "semantic"],
                default: "classic",
                rollout: ["semantic": 0]
            )
            .build()

        let context = EvaluationContext.session("user-1")
        XCTAssertEqual(try flags.variant("searchRanking", context: context), "classic")
    }

    func testRepeatedVariantEvaluationsAreStable() throws {
        let flags = try TinyFlags.builder()
            .variant(
                "strategy",
                variants: ["a", "b", "c"],
                default: "a",
                rollout: ["b": 25, "c": 25]
            )
            .build()

        let context = EvaluationContext.session("user-7")
        let first = try flags.variant("strategy", context: context)
        for _ in 0..<100 {
            XCTAssertEqual(try flags.variant("strategy", context: context), first)
        }
    }

    func testUnknownDefaultVariantIsRejected() {
        XCTAssertThrowsError(try Flag.variant(["classic", "semantic"], default: "personalized")) { error in
            XCTAssertTrue(error is TinyFlagsError)
        }
    }

    func testUnknownRolloutKeyIsRejected() {
        XCTAssertThrowsError(
            try Flag.variant(
                ["classic", "semantic"],
                default: "classic",
                rollout: ["personalized": 50]
            )
        ) { error in
            XCTAssertTrue(error is TinyFlagsError)
        }
    }

    func testRolloutTotalsAboveHundredAreRejected() {
        XCTAssertThrowsError(
            try Flag.variant(
                ["classic", "semantic"],
                default: "classic",
                rollout: ["classic": 80, "semantic": 30]
            )
        ) { error in
            XCTAssertTrue(error is TinyFlagsError)
        }
    }

    func testDuplicateVariantNamesAreRejected() {
        XCTAssertThrowsError(try Flag.variant(["a", "a"], default: "a")) { error in
            XCTAssertTrue(error is TinyFlagsError)
        }
    }

    func testEmptyVariantListIsRejected() {
        XCTAssertThrowsError(try Flag.variant([], default: "a")) { error in
            XCTAssertTrue(error is TinyFlagsError)
        }
    }
}

final class CrossCuttingTests: XCTestCase {

    func testEnabledOnVariantFlagErrors() throws {
        let flags = try TinyFlags.builder()
            .variant("strategy", variants: ["a", "b"], default: "a")
            .build()

        XCTAssertThrowsError(try flags.enabled("strategy", context: EvaluationContext())) { error in
            XCTAssertTrue(error is TinyFlagsError)
        }
    }

    func testVariantOnBooleanFlagErrors() throws {
        let flags = try TinyFlags.builder()
            .boolean("toggle", default: true)
            .build()

        XCTAssertThrowsError(try flags.variant("toggle", context: EvaluationContext())) { error in
            XCTAssertTrue(error is TinyFlagsError)
        }
    }

    func testEvaluateDispatchesByKind() throws {
        let flags = try TinyFlags.builder()
            .boolean("toggle", default: true)
            .variant("strategy", variants: ["a", "b"], default: "b")
            .build()

        XCTAssertEqual(try flags.evaluate("toggle", context: EvaluationContext()), .bool(true))
        XCTAssertEqual(try flags.evaluate("strategy", context: EvaluationContext()), .variant("b"))
    }

    func testUnknownFlagsError() throws {
        let flags = try TinyFlags(definitions: [])

        XCTAssertThrowsError(try flags.enabled("missing", context: EvaluationContext()))
        XCTAssertThrowsError(try flags.variant("missing", context: EvaluationContext()))
        XCTAssertThrowsError(try flags.evaluate("missing", context: EvaluationContext()))
    }

    func testDuplicateFlagRegistrationIsRejected() throws {
        let builder = TinyFlags.builder()
        try builder.boolean("toggle", default: true)
        XCTAssertThrowsError(try builder.boolean("toggle", default: false)) { error in
            XCTAssertTrue(error is TinyFlagsError)
        }
    }

    func testNamesPreservesDeclarationOrder() throws {
        let flags = try TinyFlags.builder()
            .boolean("b", default: false)
            .boolean("a", default: false)
            .variant("c", variants: ["x"], default: "x")
            .build()

        XCTAssertEqual(flags.names, ["b", "a", "c"])
    }
}
