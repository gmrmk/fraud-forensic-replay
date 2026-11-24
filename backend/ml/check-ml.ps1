# backend/ml/check-ml.ps1 - the ML determinism + correctness gate.
#
# A SIBLING gate (not in backend/check.ps1, by owner decision): training twice
# on every commit would slow the commit-of-record gate. Run this whenever ML
# code (ml/*, the model artifact, the feature module) changes.
#
#   powershell -ExecutionPolicy Bypass -File backend/ml/check-ml.ps1
#   Exit: 0 = GREEN, 1 = RED.
#
# It proves the claim the model card makes: the artifact is BYTE-reproducible.
# Two independent trains on identical data must SHA-256-match (single-thread
# BLAS, int seeds, no early-stopping). Then it runs the ml unit tests (features
# leakage + reason-code additivity + content-addressed version).

# -ReplayDb overrides the corpus path. check-ml.tests.ps1 uses it to prove the gate
# fails closed when the corpus is missing.
param([string]$ReplayDb)

$ErrorActionPreference = "Stop"
$here = Split-Path -Parent $MyInvocation.MyCommand.Path      # backend/ml
$backend = Split-Path -Parent $here                          # backend
$venvPy = Join-Path $backend ".venv\Scripts\python.exe"
$replay = if ($ReplayDb) { $ReplayDb } else { Join-Path $backend "..\data\replay.db" }
$fail = $false

# Single-thread BLAS: sklearn documents no thread-count reproducibility, so we
# engineer it here too (mirrors ml/train.py's in-process env defaults).
$env:OMP_NUM_THREADS = "1"
$env:OPENBLAS_NUM_THREADS = "1"
$env:MKL_NUM_THREADS = "1"

Push-Location $backend
try {
  Write-Host "`n=== ml unit tests (features + train) ===" -ForegroundColor Cyan
  & $venvPy -m pytest tests/test_ml_features.py tests/test_ml_train.py -q
  if ($LASTEXITCODE -ne 0) { $fail = $true }

  Write-Host "`n=== artifact determinism (train twice, SHA-256 compare) ===" -ForegroundColor Cyan
  if (-not (Test-Path $replay)) {
    # An absent corpus is RED: a gate that skips its main check must not print GREEN.
    Write-Host "corpus absent at $replay; the determinism check cannot run." -ForegroundColor Red
    Write-Host 'Build it with: cd backend; .venv\Scripts\python.exe -c "import seed; seed.main(with_population=True)"' -ForegroundColor Yellow
    $fail = $true
  }
  else {
    $tmp = Join-Path $env:TEMP ("mlgate_" + [System.Guid]::NewGuid().ToString("N").Substring(0, 8))
    New-Item -ItemType Directory -Force -Path $tmp | Out-Null
    try {
      # Both copies keep the name replay.db. The artifact file name is a function of the
      # database stem (scorer.artifact_path_for_db), and this gate proves the replay
      # pack's own path (FIX-2026-11-13-ml-gate-crashes-on-per-pack-artifact-name).
      foreach ($side in @("a", "b")) {
        New-Item -ItemType Directory -Force -Path (Join-Path $tmp $side) | Out-Null
        Copy-Item $replay (Join-Path $tmp "$side\replay.db")
        & $venvPy -m ml.train --db (Join-Path $tmp "$side\replay.db") --out (Join-Path $tmp "out_$side") | Out-Null
        if ($LASTEXITCODE -ne 0) { throw "ml.train failed on copy $side (exit $LASTEXITCODE)" }
      }
      foreach ($f in @("card_fraud_scorecard.joblib", "metrics.json")) {
        $ha = (Get-FileHash (Join-Path $tmp "out_a\$f") -Algorithm SHA256).Hash
        $hb = (Get-FileHash (Join-Path $tmp "out_b\$f") -Algorithm SHA256).Hash
        if ($ha -eq $hb) {
          Write-Host "  $f : MATCH ($($ha.Substring(0,12)))" -ForegroundColor Green
        }
        else {
          Write-Host "  $f : MISMATCH ($($ha.Substring(0,12)) != $($hb.Substring(0,12)))" -ForegroundColor Red
          $fail = $true
        }
      }
    }
    finally {
      Remove-Item -Recurse -Force $tmp -ErrorAction SilentlyContinue
    }
  }
}
catch {
  # Any failure inside the gate is RED with a verdict line, never a bare crash.
  Write-Host "gate error: $($_.Exception.Message)" -ForegroundColor Red
  $fail = $true
}
finally {
  Pop-Location
}

if ($fail) {
  Write-Host "`nML GATE: RED" -ForegroundColor Red
  exit 1
}
Write-Host "`nML GATE: GREEN" -ForegroundColor Green
exit 0
