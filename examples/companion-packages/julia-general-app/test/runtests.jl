using Test
using AgentXMExamplePawMatch

"""
    run_cli(args) -> (status, out, err)

Drive the CLI with captured IO buffers for assertion.
"""
function run_cli(args)
    out = IOBuffer()
    err = IOBuffer()
    status = AgentXMExamplePawMatch.Cli.run_cli(copy(args); stdout=out, stderr=err)
    return status, String(take!(out)), String(take!(err))
end

@testset "PawMatch CLI" begin
    @testset "no args prints usage" begin
        status, out, _ = run_cli(String[])
        @test status == 0
        @test occursin("pawmatch", out)
        @test occursin("Commands:", out)
    end

    @testset "fees exits zero" begin
        status, out, _ = run_cli(["fees"])
        @test status == 0
        @test occursin("Adoption fees", out)
    end

    @testset "browse lists pets" begin
        status, out, _ = run_cli(["browse"])
        @test status == 0
        @test occursin("Biscuit", out)
    end

    @testset "browse --species cat" begin
        status, out, _ = run_cli(["browse", "--species", "cat"])
        @test status == 0
        @test occursin("Pepper", out)
        @test !occursin("Biscuit", out)
    end

    @testset "browse --species unknown" begin
        status, out, _ = run_cli(["browse", "--species", "dragon"])
        @test status == 0
        @test occursin("No adoptable pets found", out)
    end

    @testset "show known pet" begin
        status, out, _ = run_cli(["show", "pepper"])
        @test status == 0
        @test occursin("Pepper", out)
        @test occursin("Needs:", out)
    end

    @testset "show unknown pet" begin
        status, _, err = run_cli(["show", "nope"])
        @test status == 1
        @test occursin("Unknown pet", err)
    end

    @testset "match with flags" begin
        status, out, _ = run_cli(["match", "--has-kids", "--active"])
        @test status == 0
        @test occursin("Strategy:", out)
        @test occursin("Quiz depth:", out)
    end

    @testset "apply known pet" begin
        status, out, _ = run_cli(["apply", "biscuit"])
        @test status == 0
        @test occursin("Adoption application for Biscuit", out)
        @test occursin("Meet-and-greet", out)
    end

    @testset "apply unknown pet" begin
        status, _, err = run_cli(["apply", "nope"])
        @test status == 1
        @test occursin("Unknown pet", err)
    end

    @testset "return-support" begin
        status, out, _ = run_cli(["return-support"])
        @test status == 0
        @test occursin("Return support", out)
        @test occursin("No-judgment", out)
    end

    @testset "donate lists charities" begin
        status, out, _ = run_cli(["donate"])
        @test status == 0
        @test occursin("Animal-welfare charities", out)
        @test occursin("Best Friends", out)
    end

    @testset "donate --focus rescue" begin
        status, out, _ = run_cli(["donate", "--focus", "rescue"])
        @test status == 0
        @test occursin("Brother Wolf", out)
        @test !occursin("Best Friends Animal Society", out)
    end

    @testset "donate known slug" begin
        status, out, _ = run_cli(["donate", "brother-wolf"])
        @test status == 0
        @test occursin("Brother Wolf", out)
    end

    @testset "donate unknown slug" begin
        status, _, err = run_cli(["donate", "not-a-charity"])
        @test status == 1
        @test occursin("Unknown charity", err)
    end

    @testset "unknown command" begin
        status, _, err = run_cli(["teleport"])
        @test status == 1
        @test occursin("Unknown command", err)
    end
end
