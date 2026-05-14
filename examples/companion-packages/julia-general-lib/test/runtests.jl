using Test
using AgentXMExampleTinyFlags

@testset "AgentXMExampleTinyFlags" begin
    @testset "BooleanFlag defaults" begin
        reg = Registry(Dict(
            "checkout_redesign" => BooleanFlag(default=true),
        ))
        @test tf_bool(reg, "checkout_redesign"; context=Context(user_id="user-1")) === true
    end

    @testset "BooleanFlag rollout 0 is always off" begin
        reg = Registry(Dict(
            "experiment" => BooleanFlag(default=false, rollout=0),
        ))
        @test tf_bool(reg, "experiment"; context=Context(user_id="user-1")) === false
        @test tf_bool(reg, "experiment"; context=Context(user_id="user-42")) === false
    end

    @testset "BooleanFlag rollout 100 is always on" begin
        reg = Registry(Dict(
            "experiment" => BooleanFlag(default=false, rollout=100),
        ))
        @test tf_bool(reg, "experiment"; context=Context(user_id="user-1")) === true
        @test tf_bool(reg, "experiment"; context=Context(user_id="user-42")) === true
    end

    @testset "BooleanFlag rollout is deterministic per context" begin
        reg = Registry(Dict(
            "experiment" => BooleanFlag(default=false, rollout=50),
        ))
        ctx = Context(user_id="user-1")
        first = tf_bool(reg, "experiment"; context=ctx)
        @test tf_bool(reg, "experiment"; context=ctx) === first
        @test tf_bool(reg, "experiment"; context=ctx) === first
    end

    @testset "BooleanFlag rollout 50% boundary" begin
        # Sample 200 distinct user ids — at ~50% rollout we expect roughly half
        # to bucket on. Allow a wide envelope to keep this stable.
        reg = Registry(Dict(
            "experiment" => BooleanFlag(default=false, rollout=50),
        ))
        on_count = count(i -> tf_bool(reg, "experiment"; context=Context(user_id="user-$i")), 0:199)
        @test 70 <= on_count <= 130
    end

    @testset "VariantFlag default with no rollout" begin
        reg = Registry(Dict(
            "search_ranking" => VariantFlag(
                variants=["classic", "semantic"],
                default="classic",
            ),
        ))
        @test tf_variant(reg, "search_ranking"; context=Context(user_id="user-1")) == "classic"
    end

    @testset "VariantFlag 0% allocation returns default" begin
        reg = Registry(Dict(
            "search_ranking" => VariantFlag(
                variants=["classic", "semantic"],
                default="classic",
                rollout=Dict("semantic" => 0),
            ),
        ))
        @test tf_variant(reg, "search_ranking"; context=Context(user_id="user-1")) == "classic"
    end

    @testset "VariantFlag 100% allocation returns the variant" begin
        reg = Registry(Dict(
            "search_ranking" => VariantFlag(
                variants=["classic", "semantic"],
                default="classic",
                rollout=Dict("semantic" => 100),
            ),
        ))
        @test tf_variant(reg, "search_ranking"; context=Context(user_id="user-1")) == "semantic"
    end

    @testset "VariantFlag is deterministic per context" begin
        reg = Registry(Dict(
            "search_ranking" => VariantFlag(
                variants=["classic", "semantic", "personalized"],
                default="classic",
                rollout=Dict("semantic" => 33, "personalized" => 33),
            ),
        ))
        ctx = Context(user_id="user-1")
        @test tf_variant(reg, "search_ranking"; context=ctx) ==
              tf_variant(reg, "search_ranking"; context=ctx)
    end

    @testset "validation errors" begin
        @test_throws ArgumentError BooleanFlag(rollout=101)
        @test_throws ArgumentError BooleanFlag(rollout=-1)
        @test_throws ArgumentError BooleanFlag(rollout=true)
        @test_throws ArgumentError VariantFlag(variants=String[], default="classic")
        @test_throws ArgumentError VariantFlag(
            variants=["classic", "semantic"],
            default="personalized",
        )
        @test_throws ArgumentError VariantFlag(
            variants=["classic", "semantic"],
            default="classic",
            rollout=Dict("semantic" => 80, "classic" => 30),
        )
        @test_throws ArgumentError VariantFlag(
            variants=["classic", "semantic"],
            default="classic",
            rollout=Dict("personalized" => 10),
        )
    end

    @testset "unknown flag lookup raises" begin
        reg = Registry(Dict{String,Any}())
        @test_throws KeyError tf_bool(reg, "missing")
    end

    @testset "tf_evaluate dispatches on kind" begin
        reg = Registry(Dict(
            "checkout_redesign" => BooleanFlag(default=true),
            "search_ranking" => VariantFlag(
                variants=["classic", "semantic"],
                default="classic",
            ),
        ))
        @test tf_evaluate(reg, "checkout_redesign") === true
        @test tf_evaluate(reg, "search_ranking") == "classic"
    end
end
