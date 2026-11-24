# backend/check.ps1 - the deep craft gate.
#
# Runs the full craft toolchain against the backend and exits non-zero if any
# stage fails. This is the commit-of-record gate for backend code: green here is
# the bar. It runs the tools from the backend venv so versions match
# requirements-dev.txt exactly.
#
#   ruff - lint: real footguns (B), unused/undefined (F), import order (I)
#   black - format conformance (--check; non-mutating)
#   mypy - static types
#   pytest - the suite
#
# Usage:  powershell -ExecutionPolicy Bypass -File backend/check.ps1
# Exit:   0 = GREEN (gate passes), 1 = RED (fix before commit-of-record).

$here = Split-Path -Parent $MyInvocation.MyCommand.Path
$venv = Join-Path $here ".venv\Scripts"
$fail = $false

function Invoke-CraftStage {
  param(
    [Parameter(Mandatory = $true)][string]$Header,
    [Parameter(Mandatory = $true)][string]$Executable,
    [Parameter(Mandatory = $true)][string[]]$Arguments,
    [Parameter(Mandatory = $true)][ref]$GateFailed
  )

  Write-Host "`n=== $Header ===" -ForegroundColor Cyan
  if (-not (Test-Path -LiteralPath $Executable -PathType Leaf)) {
    Write-Host "CRAFT STAGE FAILED: required tool is missing: $Executable" -ForegroundColor Red
    $GateFailed.Value = $true
    return
  }

  try {
    $ErrorActionPreference = "Stop"
    & $Executable @Arguments
    if ($LASTEXITCODE -ne 0) {
      Write-Host "CRAFT STAGE FAILED: $Executable exited $LASTEXITCODE" -ForegroundColor Red
      $GateFailed.Value = $true
    }
  }
  catch {
    Write-Host "CRAFT STAGE FAILED: could not start ${Executable}: $($_.Exception.Message)" -ForegroundColor Red
    $GateFailed.Value = $true
  }
}

Push-Location $here
try {
  Invoke-CraftStage "ruff (lint)" "$venv\ruff.exe" @("check", ".") ([ref]$fail)
  Invoke-CraftStage "black (format check)" "$venv\black.exe" @("--check", ".") ([ref]$fail)
  Invoke-CraftStage "mypy (types)" "$venv\mypy.exe" @(".") ([ref]$fail)
  Invoke-CraftStage "pytest (suite)" "$venv\python.exe" @("-m", "pytest", "-q") ([ref]$fail)
}
finally {
  Pop-Location
}

if ($fail) {
  Write-Host "`nCRAFT GATE: RED - fix the above before commit-of-record." -ForegroundColor Red
  exit 1
}
Write-Host "`nCRAFT GATE: GREEN" -ForegroundColor Green
exit 0
