#include "pawmatch/cli.hpp"

#include <catch2/catch_test_macros.hpp>

#include <sstream>
#include <string>
#include <vector>

using agentxm::tinyflags::Context;
using pawmatch::Cli;

namespace {

struct CliRun {
    int code;
    std::string out;
    std::string err;
};

CliRun run_cli(const std::vector<std::string>& args, const std::string& session) {
    std::ostringstream out;
    std::ostringstream err;
    Cli cli(out, err);
    cli.with_context(Context(session));
    cli.with_open_url([](const std::string&) { return true; });
    const int code = cli.run(args);
    return {code, out.str(), err.str()};
}

bool contains(const std::string& haystack, const std::string& needle) {
    return haystack.find(needle) != std::string::npos;
}

}  // namespace

TEST_CASE("usage with no args prints help and exits non-zero", "[cli][usage]") {
    auto result = run_cli({}, "tester");
    REQUIRE(result.code == 1);
    REQUIRE(contains(result.out, "pawmatch"));
    REQUIRE(contains(result.out, "browse"));
}

TEST_CASE("browse lists all pets by default", "[cli][browse]") {
    auto result = run_cli({"browse"}, "tester");
    REQUIRE(result.code == 0);
    REQUIRE(contains(result.out, "Biscuit"));
    REQUIRE(contains(result.out, "Pepper"));
}

TEST_CASE("browse with --species filters", "[cli][browse]") {
    auto result = run_cli({"browse", "--species", "cat"}, "tester");
    REQUIRE(result.code == 0);
    REQUIRE(contains(result.out, "Pepper"));
    REQUIRE_FALSE(contains(result.out, "Biscuit"));
}

TEST_CASE("show prints pet detail", "[cli][show]") {
    auto result = run_cli({"show", "pepper"}, "tester");
    REQUIRE(result.code == 0);
    REQUIRE(contains(result.out, "Pepper"));
    REQUIRE(contains(result.out, "Days in shelter"));
}

TEST_CASE("show unknown pet exits non-zero", "[cli][show]") {
    auto result = run_cli({"show", "nope"}, "tester");
    REQUIRE(result.code == 1);
    REQUIRE(contains(result.err, "Unknown pet"));
}

TEST_CASE("match runs without preferences", "[cli][match]") {
    auto result = run_cli({"match"}, "tester");
    REQUIRE(result.code == 0);
    REQUIRE(contains(result.out, "Strategy"));
    REQUIRE(contains(result.out, "Adoption is a conversation"));
}

TEST_CASE("match runs with preferences", "[cli][match]") {
    auto result = run_cli({"match", "--has-kids", "--active"}, "tester");
    REQUIRE(result.code == 0);
    REQUIRE(contains(result.out, "factor(s) considered"));
}

TEST_CASE("apply prints next steps", "[cli][apply]") {
    auto result = run_cli({"apply", "biscuit"}, "tester");
    REQUIRE(result.code == 0);
    REQUIRE(contains(result.out, "Biscuit"));
    REQUIRE(contains(result.out, "Next steps"));
    REQUIRE(contains(result.out, "Returns are always accepted"));
}

TEST_CASE("fees command emits subsidy disclosure", "[cli][fees]") {
    auto result = run_cli({"fees"}, "tester");
    REQUIRE(result.code == 0);
    REQUIRE(contains(result.out, "Adoption fees"));
    REQUIRE(contains(result.out, "subsidy fund"));
}

TEST_CASE("return-support is informational", "[cli][return-support]") {
    auto result = run_cli({"return-support"}, "tester");
    REQUIRE(result.code == 0);
    REQUIRE(contains(result.out, "No-judgment returns"));
}

TEST_CASE("donate lists charities", "[cli][donate]") {
    auto result = run_cli({"donate"}, "tester");
    REQUIRE(result.code == 0);
    REQUIRE(contains(result.out, "Animal-welfare charities"));
    REQUIRE(contains(result.out, "Best Friends"));
    REQUIRE(contains(result.out, "verify"));
}

TEST_CASE("donate --focus filters", "[cli][donate]") {
    auto result = run_cli({"donate", "--focus", "policy"}, "tester");
    REQUIRE(result.code == 0);
    REQUIRE(contains(result.out, "Animal Welfare Institute"));
    REQUIRE_FALSE(contains(result.out, "Best Friends"));
}

TEST_CASE("donate <slug> --open invokes opener", "[cli][donate][open]") {
    std::string opened_url;
    std::ostringstream out;
    std::ostringstream err;
    Cli cli(out, err);
    cli.with_context(Context("tester"));
    cli.with_open_url([&](const std::string& url) {
        opened_url = url;
        return true;
    });
    const int code = cli.run({"donate", "brother-wolf", "--open"});
    REQUIRE(code == 0);
    REQUIRE(opened_url == "https://bwar.org/donate");
}

TEST_CASE("unknown command returns 2", "[cli][error]") {
    auto result = run_cli({"frobnicate"}, "tester");
    REQUIRE(result.code == 2);
    REQUIRE(contains(result.err, "unknown command"));
}
