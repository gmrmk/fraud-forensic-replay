# Regression tests for backend/check.ps1.
# Run with Windows PowerShell 5.1:
#   powershell -NoProfile -ExecutionPolicy Bypass -File backend/check.tests.ps1

$ErrorActionPreference = "Stop"

$scriptUnderTest = Join-Path $PSScriptRoot "check.ps1"
$powershellExe = Join-Path $env:SystemRoot "System32\WindowsPowerShell\v1.0\powershell.exe"
$testRoot = Join-Path ([IO.Path]::GetTempPath()) ("ffr-backend-check-" + [guid]::NewGuid().ToString("N"))
$passed = 0
$failed = 0

function Assert-Equal {
  param(
    [Parameter(Mandatory = $true)]$Expected,
    [Parameter(Mandatory = $true)]$Actual,
    [Parameter(Mandatory = $true)][string]$Message
  )

  if ($Expected -ne $Actual) {
    throw "$Message (expected '$Expected', got '$Actual')"
  }
}

function Assert-Contains {
  param(
    [Parameter(Mandatory = $true)][string]$Text,
    [Parameter(Mandatory = $true)][string]$Needle,
    [Parameter(Mandatory = $true)][string]$Message
  )

  if (-not $Text.Contains($Needle)) {
    throw "$Message (missing '$Needle')"
  }
}

function Assert-NotContains {
  param(
    [Parameter(Mandatory = $true)][string]$Text,
    [Parameter(Mandatory = $true)][string]$Needle,
    [Parameter(Mandatory = $true)][string]$Message
  )

  if ($Text.Contains($Needle)) {
    throw "$Message (unexpected '$Needle')"
  }
}

function New-TestFixture {
  param(
    [Parameter(Mandatory = $true)][string]$Name,
    [string[]]$MissingTools = @(),
    [string[]]$UnstartableTools = @(),
    [string]$ExitCodes = ""
  )

  $fixtureRoot = Join-Path $testRoot $Name
  $scriptsDir = Join-Path $fixtureRoot ".venv\Scripts"
  New-Item -ItemType Directory -Path $scriptsDir -Force | Out-Null
  Copy-Item -LiteralPath $scriptUnderTest -Destination (Join-Path $fixtureRoot "check.ps1")

  $helperSource = @"
using System;
using System.IO;

public static class CraftGateStageTool
{
    public static int Main(string[] args)
    {
        string tool = Path.GetFileNameWithoutExtension(Environment.GetCommandLineArgs()[0]);
        string log = Environment.GetEnvironmentVariable("FFR_CRAFT_GATE_TEST_LOG");
        if (!String.IsNullOrEmpty(log))
        {
            File.AppendAllText(log, tool + Environment.NewLine);
        }

        string exits = Environment.GetEnvironmentVariable("FFR_CRAFT_GATE_TEST_EXITS") ?? "";
        foreach (string entry in exits.Split(new[] { ',' }, StringSplitOptions.RemoveEmptyEntries))
        {
            string[] parts = entry.Split('=');
            int code;
            if (parts.Length == 2 &&
                String.Equals(parts[0], tool, StringComparison.OrdinalIgnoreCase) &&
                Int32.TryParse(parts[1], out code))
            {
                return code;
            }
        }
        return 0;
    }
}
"@
  $helperExe = Join-Path $fixtureRoot "stage-tool.exe"
  Add-Type -TypeDefinition $helperSource -Language CSharp -OutputAssembly $helperExe -OutputType ConsoleApplication

  foreach ($tool in @("ruff", "black", "mypy", "python")) {
    $toolPath = Join-Path $scriptsDir ($tool + ".exe")
    if ($MissingTools -contains $tool) {
      continue
    }
    if ($UnstartableTools -contains $tool) {
      [IO.File]::WriteAllText($toolPath, "not a Windows executable")
      continue
    }
    Copy-Item -LiteralPath $helperExe -Destination $toolPath
  }

  return [pscustomobject]@{
    Root = $fixtureRoot
    Script = Join-Path $fixtureRoot "check.ps1"
    Log = Join-Path $fixtureRoot "stage-order.log"
    ExitCodes = $ExitCodes
  }
}

function Invoke-TestFixture {
  param([Parameter(Mandatory = $true)]$Fixture)

  $oldLog = $env:FFR_CRAFT_GATE_TEST_LOG
  $oldExits = $env:FFR_CRAFT_GATE_TEST_EXITS
  try {
    $env:FFR_CRAFT_GATE_TEST_LOG = $Fixture.Log
    $env:FFR_CRAFT_GATE_TEST_EXITS = $Fixture.ExitCodes
    $escapedScript = $Fixture.Script.Replace("'", "''")
    $command = "`$ErrorActionPreference = 'Stop'; & '$escapedScript'"
    $encoded = [Convert]::ToBase64String([Text.Encoding]::Unicode.GetBytes($command))
    $lines = @(& $powershellExe -NoProfile -NonInteractive -ExecutionPolicy Bypass -EncodedCommand $encoded 2>&1 |
      ForEach-Object { $_.ToString() })
    $exitCode = $LASTEXITCODE
  }
  finally {
    $env:FFR_CRAFT_GATE_TEST_LOG = $oldLog
    $env:FFR_CRAFT_GATE_TEST_EXITS = $oldExits
  }

  $invocations = @()
  if (Test-Path -LiteralPath $Fixture.Log -PathType Leaf) {
    $invocations = @(Get-Content -LiteralPath $Fixture.Log)
  }
  return [pscustomobject]@{
    ExitCode = $exitCode
    Output = ($lines -join "`n")
    Invocations = ($invocations -join ",")
  }
}

function Invoke-Test {
  param(
    [Parameter(Mandatory = $true)][string]$Name,
    [Parameter(Mandatory = $true)][scriptblock]$Body
  )

  try {
    & $Body
    $script:passed++
    Write-Host "PASS $Name" -ForegroundColor Green
  }
  catch {
    $script:failed++
    Write-Host "FAIL $Name`n  $($_.Exception.Message)" -ForegroundColor Red
  }
}

New-Item -ItemType Directory -Path $testRoot -Force | Out-Null
try {
  Invoke-Test "missing tool fails closed and later stages still run" {
    $result = Invoke-TestFixture (New-TestFixture -Name "missing" -MissingTools @("ruff"))
    Assert-Equal 1 $result.ExitCode "A missing required tool must make the gate fail"
    Assert-Contains $result.Output "CRAFT GATE: RED" "The failure result must be explicit"
    Assert-NotContains $result.Output "CRAFT GATE: GREEN" "A launch exception must never print GREEN"
    Assert-Contains $result.Output "=== pytest (suite) ===" "A failed stage must not skip later stages"
    Assert-Equal "black,mypy,python" $result.Invocations "Every startable later stage must run"
  }

  Invoke-Test "unstartable tool fails closed and later stages still run" {
    $result = Invoke-TestFixture (New-TestFixture -Name "unstartable" -UnstartableTools @("black"))
    Assert-Equal 1 $result.ExitCode "An unstartable required tool must make the gate fail"
    Assert-Contains $result.Output "CRAFT GATE: RED" "The failure result must be explicit"
    Assert-NotContains $result.Output "CRAFT GATE: GREEN" "A launch exception must never print GREEN"
    Assert-Equal "ruff,mypy,python" $result.Invocations "Startable stages around the exception must run"
  }

  Invoke-Test "nonzero genuine stages aggregate without short-circuiting" {
    $fixture = New-TestFixture -Name "aggregate" -ExitCodes "ruff=3,mypy=4"
    $result = Invoke-TestFixture $fixture
    Assert-Equal 1 $result.ExitCode "Any nonzero stage must make the gate fail"
    Assert-Contains $result.Output "CRAFT GATE: RED" "Aggregated failures must end RED"
    Assert-NotContains $result.Output "CRAFT GATE: GREEN" "A failed gate must never print GREEN"
    Assert-Equal "ruff,black,mypy,python" $result.Invocations "All genuine stages must run"
  }

  Invoke-Test "all successful genuine stages end green" {
    $result = Invoke-TestFixture (New-TestFixture -Name "green")
    Assert-Equal 0 $result.ExitCode "All successful stages must make the gate pass"
    Assert-Contains $result.Output "CRAFT GATE: GREEN" "A passing gate must print GREEN"
    Assert-NotContains $result.Output "CRAFT GATE: RED" "A passing gate must not print RED"
    Assert-Equal "ruff,black,mypy,python" $result.Invocations "The passing gate must run all stages"
  }
}
finally {
  if (Test-Path -LiteralPath $testRoot) {
    Remove-Item -LiteralPath $testRoot -Recurse -Force
  }
}

Write-Host "`n$passed passed, $failed failed"
if ($failed -ne 0) { exit 1 }
exit 0
