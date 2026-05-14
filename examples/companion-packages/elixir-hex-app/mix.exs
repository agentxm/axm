defmodule AgentXM.Examples.PawMatch.MixProject do
  use Mix.Project

  @version "0.1.0"

  def project do
    [
      app: :agentxm_example_pawmatch,
      version: @version,
      elixir: "~> 1.16",
      start_permanent: Mix.env() == :prod,
      deps: deps(),
      escript: escript(),
      name: "AgentXM Example PawMatch",
      description:
        "Reference consumer of agentxm_example_tinyflags — community pet adoption CLI."
      # Not publishable — this app exists to demonstrate consumption only.
    ]
  end

  def application do
    [extra_applications: [:logger]]
  end

  defp deps do
    [
      # The library has not been published to Hex; reference it via a path so
      # the example builds and tests as a single workspace.
      {:agentxm_example_tinyflags, path: "../elixir-hex-lib"}
    ]
  end

  defp escript do
    [
      main_module: AgentXM.Examples.PawMatch.CLI,
      name: "pawmatch"
    ]
  end
end
