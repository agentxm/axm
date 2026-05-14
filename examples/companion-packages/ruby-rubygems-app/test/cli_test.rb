# frozen_string_literal: true

require_relative "test_helper"
require "stringio"

class PawmatchCliTest < Minitest::Test
  def run_cli(args)
    out = StringIO.new
    err = StringIO.new
    status = Pawmatch::Cli.run(args.dup, stdout: out, stderr: err)
    [status, out.string, err.string]
  end

  def test_no_args_prints_usage
    status, out, _err = run_cli([])
    assert_equal 0, status
    assert_includes out, "pawmatch"
    assert_includes out, "Commands:"
  end

  def test_fees_exit_zero
    status, out, _err = run_cli(%w[fees])
    assert_equal 0, status
    assert_includes out, "Adoption fees"
  end

  def test_browse_lists_pets
    status, out, _err = run_cli(%w[browse])
    assert_equal 0, status
    assert_includes out, "Biscuit"
  end

  def test_browse_species_filter
    status, out, _err = run_cli(%w[browse --species cat])
    assert_equal 0, status
    assert_includes out, "Pepper"
    refute_includes out, "Biscuit"
  end

  def test_browse_unknown_species
    status, out, _err = run_cli(%w[browse --species dragon])
    assert_equal 0, status
    assert_includes out, "No adoptable pets found"
  end

  def test_show_known_pet
    status, out, _err = run_cli(%w[show pepper])
    assert_equal 0, status
    assert_includes out, "Pepper"
    assert_includes out, "Needs:"
  end

  def test_show_unknown_pet
    status, _out, err = run_cli(%w[show nope])
    assert_equal 1, status
    assert_includes err, "Unknown pet"
  end

  def test_match_with_flags
    status, out, _err = run_cli(%w[match --has-kids --active])
    assert_equal 0, status
    assert_includes out, "Strategy:"
    assert_includes out, "Quiz depth:"
  end

  def test_apply_known_pet
    status, out, _err = run_cli(%w[apply biscuit])
    assert_equal 0, status
    assert_includes out, "Adoption application for Biscuit"
    assert_includes out, "Meet-and-greet"
  end

  def test_apply_unknown_pet
    status, _out, err = run_cli(%w[apply nope])
    assert_equal 1, status
    assert_includes err, "Unknown pet"
  end

  def test_return_support
    status, out, _err = run_cli(["return-support"])
    assert_equal 0, status
    assert_includes out, "Return support"
    assert_includes out, "No-judgment"
  end

  def test_donate_lists_charities
    status, out, _err = run_cli(%w[donate])
    assert_equal 0, status
    assert_includes out, "Animal-welfare charities"
    assert_includes out, "Best Friends"
  end

  def test_donate_focus_filter
    status, out, _err = run_cli(%w[donate --focus rescue])
    assert_equal 0, status
    assert_includes out, "Brother Wolf"
    refute_includes out, "Best Friends Animal Society"
  end

  def test_donate_known_slug
    status, out, _err = run_cli(%w[donate brother-wolf])
    assert_equal 0, status
    assert_includes out, "Brother Wolf"
  end

  def test_donate_unknown_slug
    status, _out, err = run_cli(%w[donate not-a-charity])
    assert_equal 1, status
    assert_includes err, "Unknown charity"
  end

  def test_unknown_command
    status, _out, err = run_cli(%w[teleport])
    assert_equal 1, status
    assert_includes err, "Unknown command"
  end
end
