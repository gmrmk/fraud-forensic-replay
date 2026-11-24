# backend/ml/check-ml.tests.ps1 - the ML gate must fail closed when its corpus is missing.
#
#   powershell -ExecutionPolicy Bypass -File backend/ml/check-ml.tests.ps1
#   Exit: 0 = pass, 1 = fail.
#
# A gate that prints GREEN after skipping its main check is a false green (the September
# uncertainty ledger, QUAL-003). This runs the gate against a corpus path that does not
# exist and requires RED with exit code 1.

$here = Split-Path -Parent $MyInvocation.MyCommand.Path
$missing = Join-Path $env:TEMP ("no-such-corpus-" + [System.Guid]::NewGuid().ToString("N") + ".db")

$out = & powershell -NoProfile -ExecutionPolicy Bypass -File (Join-Path $here "check-ml.ps1") -ReplayDb $missing 2>&1 | Out-String
$code = $LASTEXITCODE

if ($code -ne 1 -or $out -notmatch "ML GATE: RED") {
  Write-Host "FAIL: the ML gate exited $code with a missing corpus (want exit 1 and RED)" -ForegroundColor Red
  exit 1
}
Write-Host "PASS: a missing corpus fails the ML gate" -ForegroundColor Green
exit 0
