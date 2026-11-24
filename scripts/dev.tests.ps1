# Regression tests for what `scripts/dev.ps1 -Action stop` decides to kill.
# Run with Windows PowerShell 5.1:
#   powershell -NoProfile -ExecutionPolicy Bypass -File scripts/dev.tests.ps1
#
# dev.ps1 is never dot-sourced here: its default action is "start". The function under
# test, Get-StopTargets, is read out of the script's syntax tree instead, so no action
# runs. The tests use made-up process tables; no real process is started, stopped or
# looked up. Not covered here, and proven on a live stack instead (see the fix log):
# the kill itself, the port read-back and the exit code.

$ErrorActionPreference = "Stop"

$scriptUnderTest = Join-Path $PSScriptRoot "dev.ps1"
$passed = 0
$failed = 0

$ast = [System.Management.Automation.Language.Parser]::ParseFile($scriptUnderTest, [ref]$null, [ref]$null)
$fn = $ast.Find({
    param($node)
    $node -is [System.Management.Automation.Language.FunctionDefinitionAst] -and $node.Name -eq "Get-StopTargets"
  }, $true)
if (-not $fn) {
  Write-Host "FAIL Get-StopTargets is not defined in scripts/dev.ps1" -ForegroundColor Red
  exit 1
}
$fnText = $fn.Extent.Text
. ([scriptblock]::Create($fnText))

$t0 = Get-Date "2026-01-01T12:00:00"

# One row of a process table, typed as the live Win32_Process rows are: UInt32 ids,
# a DateTime creation date, an executable name.
function New-Proc {
  param([int]$Id, [int]$Parent, [double]$Age = 0, [string]$Cmd = "", [string]$Name = "python.exe")
  [PSCustomObject]@{
    ProcessId       = [uint32]$Id
    ParentProcessId = [uint32]$Parent
    CreationDate    = $t0.AddSeconds($Age)
    CommandLine     = $Cmd
    Name            = $Name
  }
}

# The PIDs stop would kill for $Holder, in kill order. $ListenAge is when the port's
# listener was created, in seconds after $t0 (omitted: the TCP table gave no time).
function Get-TargetIds {
  param([int]$Holder, $Table, $ListenAge = $null)
  $since = if ($null -ne $ListenAge) { $t0.AddSeconds($ListenAge) } else { $null }
  (@(Get-StopTargets -HolderPid $Holder -Processes $Table -ListenSince $since) |
    ForEach-Object { $_.ProcessId }) -join ","
}

function Assert-Equal {
  param($Expected, $Actual, [string]$Message)
  if ($Expected -ne $Actual) {
    throw "$Message (expected '$Expected', got '$Actual')"
  }
}

function Invoke-Test {
  param([string]$Name, [scriptblock]$Body)
  try {
    & $Body
    $script:passed++
    Write-Host "PASS $Name" -ForegroundColor Green
  } catch {
    $script:failed++
    Write-Host "FAIL $Name`n  $($_.Exception.Message)" -ForegroundColor Red
  }
}

$spawn = '"python.exe" "-B" "-c" "from multiprocessing.spawn import spawn_main; ' +
  'spawn_main(parent_pid={0}, pipe_handle=812)" "--multiprocessing-fork"'

Invoke-Test "a live holder brings its children and grandchildren, holder first" {
  $table = @(
    (New-Proc 100 1 0 "python -m uvicorn main:app --reload"),
    (New-Proc 200 100 5 "the worker"),
    (New-Proc 300 200 6 "the worker's child"),
    (New-Proc 400 1 0 "unrelated")
  )
  Assert-Equal "100,200,300" (Get-TargetIds 100 $table) "tree under a live holder"
}

Invoke-Test "a process older than its recorded parent is a reused PID, not a child" {
  $table = @(
    (New-Proc 100 1 60 "the holder, created after the two below"),
    (New-Proc 200 100 0 "left behind by an earlier owner of PID 100"),
    (New-Proc 300 200 1 "its child")
  )
  Assert-Equal "100" (Get-TargetIds 100 $table) "tree with a stale parent PID in the table"
}

Invoke-Test "a dead holder's worker is found by the holder's PID in the worker's command line" {
  $table = @(
    (New-Proc 200 29888 0 ($spawn -f 29888)),
    (New-Proc 300 200 1 "the worker's child"),
    (New-Proc 400 29888 0 "another process whose recorded parent PID happens to match"),
    (New-Proc 500 29888 0 "python server.py --port 29888"),
    (New-Proc 600 29888 0 "node C:\tmp\29888\run.js" "node.exe")
  )
  Assert-Equal "200,300" (Get-TargetIds 29888 $table) "tree under a dead holder"
}

Invoke-Test "a dead holder's PID is matched as a whole number" {
  $table = @(
    (New-Proc 300 29888 0 ($spawn -f 298881)),
    (New-Proc 400 29888 0 ($spawn -f 2988)),
    (New-Proc 500 2988 0 ($spawn -f 29888))
  )
  Assert-Equal "" (Get-TargetIds 29888 $table) "tree under a dead holder with near-miss PIDs"
}

Invoke-Test "a process recorded as its own parent does not loop" {
  # Run apart with a time limit, so a loop fails this test instead of hanging the run.
  $table = @(
    (New-Proc 4 4 0 "System"),
    (New-Proc 8 4 1 "child")
  )
  $ps = [powershell]::Create()
  try {
    [void]$ps.AddScript($fnText).AddStatement().AddScript(
      'param($table) (@(Get-StopTargets -HolderPid 4 -Processes $table) | ForEach-Object { $_.ProcessId }) -join ","'
    ).AddArgument($table)
    $pending = $ps.BeginInvoke()
    if (-not $pending.AsyncWaitHandle.WaitOne(15000)) {
      $ps.Stop()
      throw "Get-StopTargets did not return within 15 s on a self-parented process"
    }
    Assert-Equal "4,8" ("$($ps.EndInvoke($pending))") "tree with a self-parented holder"
  } finally {
    $ps.Dispose()
  }
}

Invoke-Test "nothing to find gives nothing to stop" {
  Assert-Equal "" (Get-TargetIds 999 @((New-Proc 100 1 0 "unrelated"))) "targets for a PID nobody has"
}

Invoke-Test "a holder that reads a fraction of a second younger than its listener is still the holder" {
  # The TCP table stamps listeners in whole seconds: a process created at 12:00:00.9 that
  # binds in the same second owns a listener stamped 12:00:00.
  $table = @(
    (New-Proc 100 1 0.9 "node vite.js" "node.exe"),
    (New-Proc 200 100 1.5 "esbuild" "esbuild.exe")
  )
  Assert-Equal "100,200" (Get-TargetIds 100 $table 0) "holder created inside its listener's second"
}

Invoke-Test "a process far younger than the listener is a reused PID: it and what it started are left alone" {
  $table = @(
    (New-Proc 200 100 5 ($spawn -f 100)),
    (New-Proc 300 200 6 "the old worker's child"),
    (New-Proc 100 1 600 "python another_program.py"),
    (New-Proc 500 100 601 ($spawn -f 100)),
    (New-Proc 700 100 602 "a plain child of the new owner of PID 100")
  )
  Assert-Equal "200,300" (Get-TargetIds 100 $table 0) "dead holder whose PID was taken by a younger process"
}

Invoke-Test "without a listener time, the process at the holder's PID is taken as the holder" {
  $table = @(
    (New-Proc 100 1 600 "python -m uvicorn main:app --reload"),
    (New-Proc 200 100 601 ($spawn -f 100))
  )
  Assert-Equal "100,200" (Get-TargetIds 100 $table) "holder when the TCP table gave no creation time"
}

Invoke-Test "a live holder that is neither python nor node is stopped alone" {
  $table = @(
    (New-Proc 100 1 0 "a container runtime's port proxy" "com.docker.backend.exe"),
    (New-Proc 200 100 5 "one of its children" "vpnkit.exe"),
    (New-Proc 300 200 6 "a grandchild")
  )
  Assert-Equal "100" (Get-TargetIds 100 $table 0) "foreign holder"
}

Invoke-Test "a node holder brings its tree" {
  $table = @(
    (New-Proc 100 1 0 "node vite.js" "node.exe"),
    (New-Proc 200 100 2 "esbuild --service" "esbuild.exe")
  )
  Assert-Equal "100,200" (Get-TargetIds 100 $table 0) "vite and its helper"
}

Write-Host "`n$passed passed, $failed failed"
if ($failed -ne 0) { exit 1 }
exit 0
