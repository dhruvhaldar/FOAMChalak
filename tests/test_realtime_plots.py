import os
import re
import tempfile
from pathlib import Path
import pytest
from unittest.mock import patch

import numpy as np

from backend.plots.realtime_plots import OpenFOAMFieldParser, get_available_fields


def test_get_time_directories(tmp_path):
    # Create some directories with numerical and non-numerical names
    (tmp_path / "0.01").mkdir()
    (tmp_path / "1").mkdir()
    (tmp_path / "foo").mkdir()
    (tmp_path / "2.5").mkdir()

    parser = OpenFOAMFieldParser(tmp_path)
    times = parser.get_time_directories()
    # Should return sorted numerical directory names
    assert times == ['0.01', '1', '2.5']


def test_parse_scalar_field_uniform_and_nonuniform(tmp_path):
    uniform_file = tmp_path / "uniform_field"
    uniform_file.write_text("class volScalarField;\ninternalField uniform 10;")

    nonuniform_file = tmp_path / "nonuniform_field"
    
    nonuniform_file.write_text(
    "class volScalarField;\ninternalField nonuniform List<double> (\n1\n2\n3\n4\n5\n);")

    parser = OpenFOAMFieldParser(tmp_path)
    val_uniform = parser.parse_scalar_field(uniform_file)
    val_nonuniform = parser.parse_scalar_field(nonuniform_file)

    assert val_uniform == 10.0
    assert pytest.approx(val_nonuniform, 0.0001) == 3.0


def test_parse_vector_field_uniform_and_nonuniform(tmp_path):
    # Uniform vector field
    uniform_file = tmp_path / "uniform_vector"
    uniform_file.write_text("class volVectorField;\ninternalField uniform (1 2 3);")

    # Nonuniform vector field
    nonuniform_file = tmp_path / "nonuniform_vector"
    nonuniform_file.write_text(
        "class volVectorField;\ninternalField nonuniform List<vector> (\n"
        "(1 2 3)\n"
        "(4 5 6)\n"
        "(7 8 9)\n"
        ");"
    )

    parser = OpenFOAMFieldParser(tmp_path)

    # Test uniform vector parsing
    ux_u, uy_u, uz_u = parser.parse_vector_field(uniform_file)
    assert ux_u == 1
    assert uy_u == 2
    assert uz_u == 3

    # Test nonuniform vector parsing – should return mean components
    expected_ux = (1 + 4 + 7) / 3
    expected_uy = (2 + 5 + 8) / 3
    expected_uz = (3 + 6 + 9) / 3

    ux_n, uy_n, uz_n = parser.parse_vector_field(nonuniform_file)
    assert pytest.approx(ux_n) == expected_ux
    assert pytest.approx(uy_n) == expected_uy
    assert pytest.approx(uz_n) == expected_uz

def test_get_latest_time_data(tmp_path):
    # Create time dirs with some fields
    (tmp_path / "0.1").mkdir()
    (tmp_path / "1").mkdir()

    # Create file "p" inside latest time dir
    p_file = tmp_path / "1" / "p"
    p_file.parent.mkdir(parents=True, exist_ok=True)
    p_file.write_text("class volScalarField;\ninternalField uniform 5;")

    # Create velocity field U
    u_file = tmp_path / "1" / "U"
    u_file.write_text("class volVectorField;\ninternalField uniform (3 4 0);")

    parser = OpenFOAMFieldParser(tmp_path)
    latest_data = parser.get_latest_time_data()

    assert latest_data["time"] == 1.0
    assert latest_data["p"] == 5.0
    assert latest_data["Ux"] == 3.0
    assert latest_data["Uy"] == 4.0
    assert latest_data["Uz"] == 0.0
    assert latest_data["U_mag"] == pytest.approx(5.0)


def test_get_all_time_series_data(tmp_path):
    # Create 3 time directories
    for t in ["0.1", "0.2", "0.3"]:
        (tmp_path / t).mkdir(parents=True)

    # Create scalar field p files with values in each time dir
    for idx, t in enumerate(["0.1", "0.2", "0.3"]):
        f = tmp_path / t / "p"
        f.parent.mkdir(parents=True, exist_ok=True)
        f.write_text(f"class volScalarField;\ninternalField uniform {idx + 1};")

    parser = OpenFOAMFieldParser(tmp_path)
    data = parser.get_all_time_series_data()

    assert data["time"] == [0.1, 0.2, 0.3]
    assert data["p"] == [1, 2, 3]


def test_calculate_pressure_coefficient():
    parser = OpenFOAMFieldParser("dummy")
    p_field = 101325
    cp = parser.calculate_pressure_coefficient(p_field)
    assert pytest.approx(cp) == 0

    p_field = 101425
    cp = parser.calculate_pressure_coefficient(p_field)
    expected = (p_field - 101325) / (0.5 * 1.225 * 1.0**2)
    assert pytest.approx(cp) == expected


def test_get_residuals_from_log(tmp_path):
    log_content = """
Time = 0.1
smoothSolver:  Solving for Ux, Initial residual = 0.1
smoothSolver:  Solving for Uy, Initial residual = 0.2
smoothSolver:  Solving for Uz, Initial residual = 0.3
smoothSolver:  Solving for p, Initial residual = 0.05
"""
    log_file = tmp_path / "log.foamRun"
    log_file.write_text(log_content)

    parser = OpenFOAMFieldParser(tmp_path)
    residuals = parser.get_residuals_from_log()

    assert list(residuals["time"]) == [0.1]
    assert list(residuals["Ux"]) == [0.1]
    assert list(residuals["Uy"]) == [0.2]
    assert list(residuals["Uz"]) == [0.3]
    assert list(residuals["p"]) == [0.05]


def test_get_available_fields(tmp_path):
    time_dir = tmp_path / "0.1"
    time_dir.mkdir()
    file1 = time_dir / "p"
    file2 = time_dir / "U"
    hidden_file = time_dir / ".hidden"

    file1.write_text("dummy")
    file2.write_text("dummy")
    hidden_file.write_text("dummy")

    fields = get_available_fields(tmp_path)
    assert "p" in fields
    assert "U" in fields
    assert ".hidden" not in fields

def test_get_residuals_from_log_incremental(tmp_path):
    log_file = tmp_path / "log.foamRun"
    parser = OpenFOAMFieldParser(tmp_path)

    # Chunk 1
    chunk1 = "Time = 1\nSolving for Ux, Initial residual = 0.1\n"
    log_file.write_text(chunk1)

    # First call
    res1 = parser.get_residuals_from_log("log.foamRun")
    assert list(res1["time"]) == [1.0]
    assert list(res1["Ux"]) == [0.1]

    # Chunk 2 (Append)
    chunk2 = "Time = 2\nSolving for Ux, Initial residual = 0.05\n"
    with open(log_file, "a") as f:
        f.write(chunk2)

    # Second call
    res2 = parser.get_residuals_from_log("log.foamRun")
    assert list(res2["time"]) == [1.0, 2.0]
    assert list(res2["Ux"]) == [0.1, 0.05]
