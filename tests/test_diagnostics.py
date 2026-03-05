"""Tests for the diagnostics module (--doctor command)."""

import sqlite3
import types
from unittest import mock

import pytest

from diagnostics import _info, _ok, _section, _warn, run_doctor


class TestOutputHelpers:
    """Test the formatted output helpers."""

    def test_section(self, capsys):
        _section("Test Section")
        out = capsys.readouterr().out
        assert "Test Section" in out
        assert "=" * 50 in out

    def test_ok(self, capsys):
        _ok("Label", "value")
        assert "[OK] Label: value" in capsys.readouterr().out

    def test_warn(self, capsys):
        _warn("Label", "value")
        assert "[!!] Label: value" in capsys.readouterr().out

    def test_info(self, capsys):
        _info("Label", "value")
        assert "[--] Label: value" in capsys.readouterr().out


class TestRunDoctorNoPaths:
    """Test run_doctor with missing config and database files."""

    def test_missing_config_and_db(self, capsys, tmp_path):
        config = str(tmp_path / "nonexistent.json")
        db = str(tmp_path / "nonexistent.db")
        run_doctor(config_path=config, db_path=db)
        out = capsys.readouterr().out
        assert "not found" in out
        assert "Python" in out

    def test_defaults(self, capsys):
        """run_doctor uses default paths when called with None."""
        run_doctor(config_path="/tmp/_facet_test_no_such_config.json",
                   db_path="/tmp/_facet_test_no_such_db.db")
        out = capsys.readouterr().out
        assert "Python / Platform" in out
        assert "PyTorch" in out


class TestRunDoctorWithDatabase:
    """Test run_doctor database inspection."""

    def test_valid_database(self, capsys, tmp_path):
        db_path = str(tmp_path / "test.db")
        conn = sqlite3.connect(db_path)
        conn.execute("CREATE TABLE photos (path TEXT PRIMARY KEY)")
        conn.execute("INSERT INTO photos VALUES ('/a.jpg')")
        conn.execute("INSERT INTO photos VALUES ('/b.jpg')")
        conn.commit()
        conn.close()

        run_doctor(config_path=str(tmp_path / "no.json"), db_path=db_path)
        out = capsys.readouterr().out
        assert "[OK] Photos: 2" in out

    def test_corrupt_database(self, capsys, tmp_path):
        db_path = str(tmp_path / "corrupt.db")
        with open(db_path, "w") as f:
            f.write("not a database")

        run_doctor(config_path=str(tmp_path / "no.json"), db_path=db_path)
        out = capsys.readouterr().out
        assert "[!!] Database query" in out

    def test_database_missing_table(self, capsys, tmp_path):
        db_path = str(tmp_path / "empty.db")
        conn = sqlite3.connect(db_path)
        conn.execute("CREATE TABLE other (id INTEGER)")
        conn.commit()
        conn.close()

        run_doctor(config_path=str(tmp_path / "no.json"), db_path=db_path)
        out = capsys.readouterr().out
        assert "[!!] Database query" in out


class TestRunDoctorConfigFile:
    """Test run_doctor config file inspection."""

    def test_valid_config(self, capsys, tmp_path):
        config_path = str(tmp_path / "scoring_config.json")
        with open(config_path, "w") as f:
            f.write("{}")

        run_doctor(config_path=config_path, db_path=str(tmp_path / "no.db"))
        out = capsys.readouterr().out
        assert "[OK] Config" in out
        assert "KB" in out


class TestGpuTroubleshooting:
    """Test GPU troubleshooting branch when torch exists but CUDA unavailable."""

    def test_nvidia_smi_finds_gpu(self, capsys, tmp_path):
        """When nvidia-smi sees a GPU but PyTorch can't, show pip install hint."""
        mock_torch = types.ModuleType("torch")
        mock_torch.__version__ = "2.5.0"
        mock_torch.version = types.SimpleNamespace(cuda=None)
        mock_torch.cuda = types.SimpleNamespace(is_available=lambda: False)
        mock_torch.backends = types.SimpleNamespace(
            cudnn=types.SimpleNamespace(version=lambda: None)
        )

        smi_result = types.SimpleNamespace(
            returncode=0, stdout="NVIDIA RTX 5070 Ti, 565.77\n"
        )

        with mock.patch.dict("sys.modules", {"torch": mock_torch}), \
             mock.patch("diagnostics.subprocess.run", return_value=smi_result):
            run_doctor(
                config_path=str(tmp_path / "no.json"),
                db_path=str(tmp_path / "no.db"),
            )

        out = capsys.readouterr().out
        assert "GPU found by driver" in out
        assert "pip install torch torchvision" in out
        assert "cu128" in out

    def test_nvidia_smi_not_found(self, capsys, tmp_path):
        """When nvidia-smi is missing, suggest driver installation."""
        mock_torch = types.ModuleType("torch")
        mock_torch.__version__ = "2.5.0"
        mock_torch.version = types.SimpleNamespace(cuda=None)
        mock_torch.cuda = types.SimpleNamespace(is_available=lambda: False)
        mock_torch.backends = types.SimpleNamespace(
            cudnn=types.SimpleNamespace(version=lambda: None)
        )

        with mock.patch.dict("sys.modules", {"torch": mock_torch}), \
             mock.patch("diagnostics.subprocess.run", side_effect=FileNotFoundError):
            run_doctor(
                config_path=str(tmp_path / "no.json"),
                db_path=str(tmp_path / "no.db"),
            )

        out = capsys.readouterr().out
        assert "nvidia-smi" in out
        assert "not found" in out

    def test_nvidia_smi_no_gpu(self, capsys, tmp_path):
        """When nvidia-smi runs but finds no GPU."""
        mock_torch = types.ModuleType("torch")
        mock_torch.__version__ = "2.5.0"
        mock_torch.version = types.SimpleNamespace(cuda=None)
        mock_torch.cuda = types.SimpleNamespace(is_available=lambda: False)
        mock_torch.backends = types.SimpleNamespace(
            cudnn=types.SimpleNamespace(version=lambda: None)
        )

        smi_result = types.SimpleNamespace(returncode=1, stdout="")

        with mock.patch.dict("sys.modules", {"torch": mock_torch}), \
             mock.patch("diagnostics.subprocess.run", return_value=smi_result):
            run_doctor(
                config_path=str(tmp_path / "no.json"),
                db_path=str(tmp_path / "no.db"),
            )

        out = capsys.readouterr().out
        assert "no GPU found" in out
