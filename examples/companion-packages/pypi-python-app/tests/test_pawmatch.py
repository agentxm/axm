"""Smoke tests for the pawmatch CLI."""

from typer.testing import CliRunner

from agentxm_example_pawmatch.cli import app

runner = CliRunner()


def test_fees_exit_zero() -> None:
    result = runner.invoke(app, ["fees"])
    assert result.exit_code == 0
    assert "Adoption fees" in result.stdout
