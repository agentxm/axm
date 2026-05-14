defmodule AgentXM.Examples.PawMatchTest do
  use ExUnit.Case, async: true

  alias AgentXM.Examples.PawMatch.{Charities, CLI, Flags}

  # ── helpers ────────────────────────────────────────────────────────────

  # Run the CLI with StringIO-backed stdout and stderr so tests can assert on
  # output without grabbing the group leader. Returns
  # `{exit_code, stdout_string, stderr_string, opened_url_or_nil}`.
  defp run_cli(args, overrides \\ %{}) do
    {:ok, out_pid} = StringIO.open("")
    {:ok, err_pid} = StringIO.open("")
    {:ok, opener_pid} = Agent.start_link(fn -> nil end)

    open_url = fn url ->
      Agent.update(opener_pid, fn _ -> url end)
      :ok
    end

    opts =
      Map.merge(
        %{
          flags: Flags.build(),
          context: %{id: "test-session"},
          out: out_pid,
          err: err_pid,
          open_url: open_url
        },
        overrides
      )

    code = CLI.run(args, opts)

    {_, out} = StringIO.contents(out_pid)
    {_, err} = StringIO.contents(err_pid)
    opened = Agent.get(opener_pid, & &1)

    :ok = StringIO.close(out_pid) |> normalize_close()
    :ok = StringIO.close(err_pid) |> normalize_close()
    :ok = Agent.stop(opener_pid)

    {code, out, err, opened}
  end

  defp normalize_close({:ok, _}), do: :ok
  defp normalize_close(:ok), do: :ok

  # ── tests ──────────────────────────────────────────────────────────────

  describe "fees" do
    test "exits 0 and prints the header" do
      {code, out, _err, _} = run_cli(["fees"])
      assert code == 0
      assert out =~ "Adoption fees"
    end
  end

  describe "return-support" do
    test "exits 0 and prints the header" do
      {code, out, _err, _} = run_cli(["return-support"])
      assert code == 0
      assert out =~ "Return support"
    end
  end

  describe "browse" do
    test "lists adoptable pets by default" do
      {code, out, _err, _} = run_cli(["browse"])
      assert code == 0

      for name <- ["Biscuit", "Pepper", "Marigold"] do
        assert out =~ name
      end
    end

    test "filters by species" do
      {code, out, _err, _} = run_cli(["browse", "--species", "cat"])
      assert code == 0
      assert out =~ "Pepper"
      refute out =~ "Biscuit"
    end
  end

  describe "show" do
    test "prints details for a known pet" do
      {code, out, _err, _} = run_cli(["show", "biscuit"])
      assert code == 0
      assert out =~ "Biscuit"
    end

    test "exits 1 for an unknown pet" do
      {code, _out, err, _} = run_cli(["show", "no-such-pet"])
      assert code == 1
      assert err =~ "Unknown pet"
    end
  end

  describe "match" do
    test "without prefs hints at the available factor flags" do
      {code, out, _err, _} = run_cli(["match"])
      assert code == 0
      assert out =~ "Strategy:"
      assert out =~ "(no preference flags provided"
    end

    test "with prefs does not show the no-flags hint" do
      {code, out, _err, _} = run_cli(["match", "--has-kids", "--quiet-home"])
      assert code == 0
      refute out =~ "(no preference flags provided"
    end
  end

  describe "apply" do
    test "prints next steps for a known pet" do
      {code, out, _err, _} = run_cli(["apply", "biscuit"])
      assert code == 0
      assert out =~ "Adoption application for Biscuit"
    end

    test "exits 1 for an unknown pet" do
      {code, _out, err, _} = run_cli(["apply", "no-such-pet"])
      assert code == 1
      assert err =~ "Unknown pet"
    end
  end

  describe "donate" do
    test "lists charities and includes the disclaimer" do
      {code, out, _err, _} = run_cli(["donate"])
      assert code == 0
      assert out =~ "Animal-welfare charities"
      assert out =~ Charities.disclaimer()
    end

    test "filters by focus" do
      {code, out, _err, _} = run_cli(["donate", "--focus", "rescue"])
      assert code == 0
      assert out =~ "Brother Wolf"
      refute out =~ "ASPCA"
    end

    test "--open invokes the configured opener" do
      {code, _out, _err, opened} = run_cli(["donate", "brother-wolf", "--open"])
      assert code == 0
      assert is_binary(opened)
      assert opened =~ "bwar.org"
    end

    test "exits 1 for an unknown charity" do
      {code, _out, err, _} = run_cli(["donate", "no-such-charity"])
      assert code == 1
      assert err =~ "Unknown charity"
    end
  end

  describe "dispatch" do
    test "no args exits 1 and prints usage" do
      {code, out, _err, _} = run_cli([])
      assert code == 1
      assert out =~ "pawmatch — community pet adoption CLI."
    end

    test "unknown command exits 2 with a message on stderr" do
      {code, _out, err, _} = run_cli(["nonsense"])
      assert code == 2
      assert err =~ "unknown command"
    end

    test "--help exits 0 with the usage block" do
      {code, out, _err, _} = run_cli(["--help"])
      assert code == 0
      assert out =~ "pawmatch — community pet adoption CLI."
    end
  end
end
