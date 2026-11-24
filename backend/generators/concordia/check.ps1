# backend/generators/concordia/check.ps1 - the generator's isolated craft gate.
# Runs from the generator venv. ruff/mypy skip sim/ + cli.py (concordia imports);
# black + pytest cover the whole tree. Green here is the bar for generator commits.
$here = Split-Path -Parent $MyInvocation.MyCommand.Path
$py = Join-Path $here ".venv\Scripts"
$fail = $false
Push-Location $here
try {
  Write-Host "`n=== ruff ===" -ForegroundColor Cyan
  & "$py\ruff.exe" check . --exclude sim --exclude cli.py
  if ($LASTEXITCODE -ne 0) { $fail = $true }
  Write-Host "`n=== black --check ===" -ForegroundColor Cyan
  & "$py\black.exe" --check .
  if ($LASTEXITCODE -ne 0) { $fail = $true }
  Write-Host "`n=== mypy ===" -ForegroundColor Cyan
  & "$py\mypy.exe" . --exclude 'sim/' --exclude 'cli\.py'
  if ($LASTEXITCODE -ne 0) { $fail = $true }
  Write-Host "`n=== pytest ===" -ForegroundColor Cyan
  & "$py\python.exe" -m pytest -q
  if ($LASTEXITCODE -ne 0) { $fail = $true }
}
finally { Pop-Location }
if ($fail) { Write-Host "`nGENERATOR GATE: RED" -ForegroundColor Red; exit 1 }
Write-Host "`nGENERATOR GATE: GREEN" -ForegroundColor Green; exit 0
