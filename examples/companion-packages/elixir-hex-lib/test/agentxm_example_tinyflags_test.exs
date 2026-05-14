defmodule AgentXM.Examples.TinyFlagsTest do
  use ExUnit.Case, async: true

  alias AgentXM.Examples.TinyFlags
  alias AgentXM.Examples.TinyFlags.{BooleanFlag, VariantFlag}

  describe "boolean defaults" do
    test "returns the default when no rollout is configured" do
      flags = TinyFlags.new!(%{"checkout-redesign" => BooleanFlag.new!(default: true)})

      assert {:ok, true} = TinyFlags.enabled(flags, "checkout-redesign", %{id: "user-1"})
    end

    test "defaults to false when :default is omitted" do
      flags = TinyFlags.new!(%{"experiment" => BooleanFlag.new!()})

      assert {:ok, false} = TinyFlags.enabled(flags, "experiment", %{id: "user-1"})
    end
  end

  describe "boolean rollout boundaries" do
    test "rollout 0 returns false (the not-default branch is never taken)" do
      flags = TinyFlags.new!(%{"off" => BooleanFlag.new!(default: false, rollout: 0)})

      for id <- ["user-1", "alice", "bob", "carol", "dave", "eve", ""] do
        assert {:ok, false} = TinyFlags.enabled(flags, "off", %{id: id})
      end
    end

    test "rollout 100 returns true for every caller" do
      flags = TinyFlags.new!(%{"on" => BooleanFlag.new!(default: false, rollout: 100)})

      for id <- ["user-1", "alice", "bob", "carol", "dave", "eve", ""] do
        assert {:ok, true} = TinyFlags.enabled(flags, "on", %{id: id})
      end
    end

    test "rollout decisions are deterministic for the same context" do
      flags = TinyFlags.new!(%{"experiment" => BooleanFlag.new!(default: false, rollout: 37)})
      ctx = %{id: "user-42"}

      {:ok, first} = TinyFlags.enabled(flags, "experiment", ctx)

      for _ <- 1..100 do
        assert {:ok, ^first} = TinyFlags.enabled(flags, "experiment", ctx)
      end
    end

    test "rollout 50 splits roughly evenly across synthetic ids" do
      flags = TinyFlags.new!(%{"half" => BooleanFlag.new!(default: false, rollout: 50)})

      count =
        Enum.count(0..999, fn i ->
          {:ok, on} = TinyFlags.enabled(flags, "half", %{id: "user-#{i}"})
          on
        end)

      assert count >= 250 and count <= 750,
             "50% rollout produced #{count}/1000 enabled — looks skewed"
    end
  end

  describe "variant defaults" do
    test "returns the default variant when no rollout is configured" do
      flags =
        TinyFlags.new!(%{
          "search-ranking" =>
            VariantFlag.new!(["classic", "semantic"], default: "classic")
        })

      assert {:ok, "classic"} = TinyFlags.variant(flags, "search-ranking", %{id: "user-1"})
    end

    test "first variant becomes the default when :default is omitted" do
      flags = TinyFlags.new!(%{"ranking" => VariantFlag.new!(["a", "b", "c"])})

      assert {:ok, "a"} = TinyFlags.variant(flags, "ranking", %{id: "user-1"})
    end
  end

  describe "variant rollout" do
    test "rollout of 100% routes every caller to that variant" do
      flags =
        TinyFlags.new!(%{
          "search-ranking" =>
            VariantFlag.new!(
              ["classic", "semantic"],
              default: "classic",
              rollout: %{"semantic" => 100}
            )
        })

      for id <- ["alice", "bob", "carol", "dave"] do
        assert {:ok, "semantic"} = TinyFlags.variant(flags, "search-ranking", %{id: id})
      end
    end

    test "rollout of 0% falls back to the default" do
      flags =
        TinyFlags.new!(%{
          "search-ranking" =>
            VariantFlag.new!(
              ["classic", "semantic"],
              default: "classic",
              rollout: %{"semantic" => 0}
            )
        })

      assert {:ok, "classic"} = TinyFlags.variant(flags, "search-ranking", %{id: "user-1"})
    end

    test "variant decisions are deterministic for the same context" do
      flags =
        TinyFlags.new!(%{
          "strategy" =>
            VariantFlag.new!(
              ["a", "b", "c"],
              default: "a",
              rollout: %{"b" => 25, "c" => 25}
            )
        })

      ctx = %{id: "user-7"}
      {:ok, first} = TinyFlags.variant(flags, "strategy", ctx)

      for _ <- 1..100 do
        assert {:ok, ^first} = TinyFlags.variant(flags, "strategy", ctx)
      end
    end
  end

  describe "variant validation" do
    test "rejects an unknown default" do
      assert {:error, message} =
               VariantFlag.new(["classic", "semantic"], default: "personalized")

      assert message =~ "default"
    end

    test "rejects rollout keys not in the variant list" do
      assert {:error, _} =
               VariantFlag.new(["classic", "semantic"],
                 rollout: %{"personalized" => 50}
               )
    end

    test "rejects rollout totals over 100" do
      assert {:error, message} =
               VariantFlag.new(["classic", "semantic"],
                 rollout: %{"classic" => 80, "semantic" => 30}
               )

      assert message =~ "exceeds 100"
    end

    test "rejects duplicate variants" do
      assert {:error, _} = VariantFlag.new(["a", "a"])
    end

    test "rejects an empty variant list" do
      assert {:error, _} = VariantFlag.new([])
    end

    test "rejects rollout percentages outside 0..100" do
      assert {:error, _} = VariantFlag.new(["a", "b"], rollout: %{"a" => -1})
      assert {:error, _} = VariantFlag.new(["a", "b"], rollout: %{"a" => 101})
    end
  end

  describe "boolean validation" do
    test "rejects rollout percentages outside 0..100" do
      assert {:error, _} = BooleanFlag.new(rollout: -1)
      assert {:error, _} = BooleanFlag.new(rollout: 101)
    end

    test "rejects non-boolean defaults" do
      assert {:error, _} = BooleanFlag.new(default: "yes")
    end
  end

  describe "type dispatch errors" do
    test "enabled/3 on a variant flag is an error" do
      flags = TinyFlags.new!(%{"strategy" => VariantFlag.new!(["a", "b"])})

      assert {:error, _} = TinyFlags.enabled(flags, "strategy", %{id: "x"})
    end

    test "variant/3 on a boolean flag is an error" do
      flags = TinyFlags.new!(%{"toggle" => BooleanFlag.new!(default: true)})

      assert {:error, _} = TinyFlags.variant(flags, "toggle", %{id: "x"})
    end

    test "unknown flags surface a clear error" do
      flags = TinyFlags.new!(%{})

      assert {:error, _} = TinyFlags.enabled(flags, "missing", %{})
      assert {:error, _} = TinyFlags.variant(flags, "missing", %{})
      assert {:error, _} = TinyFlags.evaluate(flags, "missing", %{})
    end
  end

  describe "evaluate/3" do
    test "dispatches by flag kind" do
      flags =
        TinyFlags.new!(%{
          "toggle" => BooleanFlag.new!(default: true),
          "strategy" => VariantFlag.new!(["a", "b"], default: "b")
        })

      assert {:ok, {:boolean, true}} = TinyFlags.evaluate(flags, "toggle", %{id: "x"})
      assert {:ok, {:variant, "b"}} = TinyFlags.evaluate(flags, "strategy", %{id: "x"})
    end
  end

  describe "names/1" do
    test "returns flag names sorted lexicographically" do
      flags =
        TinyFlags.new!(%{
          "b" => BooleanFlag.new!(),
          "a" => BooleanFlag.new!(),
          "c" => VariantFlag.new!(["x"])
        })

      assert TinyFlags.names(flags) == ["a", "b", "c"]
    end
  end
end
