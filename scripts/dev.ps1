# scripts/dev.ps1 - supervised dev-stack starter for Fraud Forensic Replay
#
# WHY THIS EXISTS:
# A non-reloading uvicorn held port 8000 for ~3 hours; a restart attempt silently
# failed to bind; the banner detector never fired because boot_id never changed.
# This script prevents the incident class by:
#   (1) Refusing to start into a held port - loud fail, named holder PID
#   (2) Always starting the backend with --reload (code-on-disk != code-in-process is fatal)
#   (3) Printing the boot_id after start so the operator has the restart-detection baseline
#   (4) Providing 'status' that warns loudly when a port-8000 holder lacks --reload
#   (5) Providing 'stop' that kills by PID (the confirmed port holder and the process tree
#       under it), never by name pattern, then reads the port back and exits 1 if it is
#       still held (FIX: 2026-11-13; the tree rules are tested in scripts/dev.tests.ps1)
#
# Spawn note: both processes are launched via 'cmd.exe /c' so that .CMD extensions
# (npm.cmd, uvicorn.exe wrappers) are resolved through PATHEXT the same way an
# interactive shell would. Start-Process with a bare 'npm' silently fails on PS 5.1
# because it does not do PATHEXT resolution. (FIX: 2026-06-12)
# Logs: .dev-logs\backend.log and .dev-logs\frontend.log capture child output; start
# creates the folder, and .gitignore keeps it out of the repository.
#
# Usage: powershell -ExecutionPolicy Bypass -File scripts/dev.ps1 [-Action start|stop|status]
# Default action: start
#
# Requirements: Windows PowerShell 5.1; run from repo root

param(
    [ValidateSet("start","stop","status")]
    [string]$Action = "start"
)

$BACKEND_PORT  = 8000
$FRONTEND_PORT = 5173
# venv python -m uvicorn, NOT the uvicorn.exe pip shim: the shim glob-expands
# wildcard args on Windows (setargv), which mangles --reload-exclude patterns
# into file lists (FIX: 2026-07-04). python.exe never globs argv.
$UVICORN       = "backend\.venv\Scripts\python.exe"
$LOG_DIR       = ".dev-logs"
$BACKEND_LOG   = "$LOG_DIR\backend.log"
$FRONTEND_LOG  = "$LOG_DIR\frontend.log"

function Get-PortHolder {
    param([int]$Port)
    $conn = Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue
    if (-not $conn) { return $null }
    $pid_ = $conn[0].OwningProcess
    $proc = Get-Process -Id $pid_ -ErrorAction SilentlyContinue
    $wmi  = Get-WmiObject Win32_Process -Filter "ProcessId=$pid_" -ErrorAction SilentlyContinue
    return [PSCustomObject]@{
        PID         = $pid_
        Name        = if ($proc) { $proc.Name } else { "(unknown)" }
        CreationDate = if ($wmi) { $wmi.ConvertToDateTime($wmi.CreationDate) } else { "(unknown)" }
        CommandLine = if ($wmi) { $wmi.CommandLine } else { "(unknown)" }
        ListenSince = $conn[0].CreationTime
    }
}

# The processes `stop` takes down for one port holder, holder first. Pure when
# -Processes is given: scripts/dev.tests.ps1 feeds it made-up process tables.
#
# The tree: the holder when it is alive, then everything created under it. Win32_Process
# keeps a dead process's PID in its children's ParentProcessId, and Windows reuses PIDs,
# so a child counts only when it cannot be left over from an earlier owner of that PID:
#   live holder or branch: the child was created at or after the process it hangs under;
#   dead holder:           the child's own command line names the holder, the shape of
#                          uvicorn's --reload worker: spawn_main(parent_pid=<holder>, ...)
# A process that sits at the holder's PID but is younger than the listener is itself a
# reused PID: it is left alone, and so is everything it started. The TCP table stamps a
# listener in whole seconds (measured 2026-11-13: vite's process read 13 ms younger than
# its own listener), hence two seconds of slack before a holder counts as younger.
# Only python and node are ever started by this script. A live holder of any other kind
# keeps the old, narrow treatment: that one PID, nothing under it.
function Get-StopTargets {
    param(
        [int]$HolderPid,
        $Processes = $null,
        $ListenSince = $null
    )
    if ($null -eq $Processes) {
        $Processes = @(Get-CimInstance Win32_Process -ErrorAction SilentlyContinue)
    }
    $byId = @{}
    foreach ($p in $Processes) { $byId[[int]$p.ProcessId] = $p }

    $holder = $byId[$HolderPid]
    $reuser = $null
    if ($holder -and $ListenSince -and $holder.CreationDate -gt ([datetime]$ListenSince).AddSeconds(2)) {
        $reuser = $holder
        $holder = $null
    }

    $targets = New-Object System.Collections.ArrayList
    $queue   = New-Object System.Collections.Queue
    $seen    = @{}
    $queue.Enqueue($HolderPid)
    while ($queue.Count -gt 0) {
        $id = [int]$queue.Dequeue()
        if ($seen.ContainsKey($id)) { continue }
        $seen[$id] = $true
        $node = if ($id -eq $HolderPid) { $holder } else { $byId[$id] }
        if ($node) { [void]$targets.Add($node) }
        foreach ($p in $Processes) {
            if ([int]$p.ParentProcessId -ne $id) { continue }
            if ($node) {
                if ($p.CreationDate -lt $node.CreationDate) { continue }
            } else {
                if ("$($p.CommandLine)" -notmatch "parent_pid=$id\b") { continue }
                if ($reuser -and $p.CreationDate -ge $reuser.CreationDate) { continue }
            }
            $queue.Enqueue([int]$p.ProcessId)
        }
    }
    if ($holder -and "$($holder.Name)" -notmatch '^(python|node)(\.exe)?$') {
        return $holder
    }
    return $targets
}

# True once nothing listens on $Port. A stopped process's socket leaves the TCP table a
# moment after the kill, so a single immediate read would raise a false alarm.
function Wait-PortFree {
    param([int]$Port, [int]$MaxSeconds = 5)
    $deadline = (Get-Date).AddSeconds($MaxSeconds)
    do {
        if (-not (Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue)) {
            return $true
        }
        Start-Sleep -Milliseconds 250
    } while ((Get-Date) -lt $deadline)
    return $false
}

function Wait-Http {
    param([string]$Url, [int]$MaxSeconds = 15)
    $deadline = (Get-Date).AddSeconds($MaxSeconds)
    while ((Get-Date) -lt $deadline) {
        try {
            $resp = Invoke-WebRequest -Uri $Url -UseBasicParsing -TimeoutSec 2 -ErrorAction Stop
            if ($resp.StatusCode -eq 200) { return $resp.Content }
        } catch { }
        Start-Sleep -Milliseconds 500
    }
    return $null
}

# ── START ──────────────────────────────────────────────────────────────────────
if ($Action -eq "start") {

    # --- Backend ---
    $holder = Get-PortHolder -Port $BACKEND_PORT
    if ($holder) {
        Write-Host ""
        Write-Host "ERROR: port $BACKEND_PORT is already held. A restart into a held port is the 2026-06-11 incident class." -ForegroundColor Red
        Write-Host "  Holder PID         : $($holder.PID)" -ForegroundColor Red
        Write-Host "  Holder process     : $($holder.Name)" -ForegroundColor Red
        Write-Host "  Holder created     : $($holder.CreationDate)" -ForegroundColor Red
        Write-Host "  Holder command     : $($holder.CommandLine)" -ForegroundColor Red
        Write-Host ""
        Write-Host "Run: powershell -ExecutionPolicy Bypass -File scripts/dev.ps1 -Action stop" -ForegroundColor Yellow
        Write-Host "Then re-run start." -ForegroundColor Yellow
        exit 1
    }

    if (-not (Test-Path $UVICORN)) {
        Write-Host "ERROR: uvicorn not found at $UVICORN - make the environment first: uv venv --python 3.12 backend/.venv; uv pip install --python backend/.venv -r backend/requirements.txt -r backend/requirements-dev.txt" -ForegroundColor Red
        exit 1
    }

    if (-not (Test-Path $LOG_DIR)) { New-Item -ItemType Directory -Path $LOG_DIR | Out-Null }

    Write-Host "Starting backend (uvicorn --reload) on port $BACKEND_PORT ..." -ForegroundColor Cyan
    # cmd.exe strips the OUTER quote pair when the /c payload begins with a quote and
    # contains another quoted token (here the exe path AND the log path). Without the
    # extra wrapping pair below, cmd mangles the command line, runs nothing, and creates
    # no log - a silent backend-spawn failure surfaced only by the 30s health timeout.
    # Wrapping the whole payload in one more quote pair is the standard `cmd /c ""prog" args"`
    # idiom. The frontend spawn dodges this only because it begins with `cd`. (FIX: 2026-06-14)
    # --reload-dir backend: without it WatchFiles watches the CWD (repo root) -
    # six stale worktree backends + the entire backend/.venv site-packages -
    # and a mass file-churn event (post-reboot AV/indexer sweep) kills the
    # reloader silently, taking the server with it (FIX: 2026-07-04).
    # The exclude is a LITERAL directory, never a glob: something in this
    # spawn path expands wildcards into file lists before uvicorn parses
    # argv, and uvicorn treats a real-directory exclude as an ignored
    # subtree anyway (config.py resolve_reload_patterns is_dir branch).
    $backendArgs = "/c `"`"$UVICORN`" -m uvicorn main:app --app-dir backend --port $BACKEND_PORT --reload --reload-dir backend --reload-exclude backend/.venv >> `"$BACKEND_LOG`" 2>&1`""
    Start-Process -FilePath "cmd.exe" `
        -ArgumentList $backendArgs `
        -WindowStyle Minimized

    # Probe via literal 127.0.0.1, NOT "localhost": on this box localhost resolves
    # ::1 (IPv6) first, but uvicorn binds its default 127.0.0.1 (IPv4) only, so a
    # localhost probe hits [::1]:8000 and false-negatives the 30s health wait even
    # when the backend is healthy. A literal IPv4 address does no DNS lookup and
    # matches the bind exactly. (FIX: 2026-06-14 loopback-family mismatch)
    $healthContent = Wait-Http -Url "http://127.0.0.1:$BACKEND_PORT/api/health" -MaxSeconds 30
    if ($null -eq $healthContent) {
        Write-Host "WARN: backend did not answer /api/health within 30s - see $BACKEND_LOG for errors." -ForegroundColor Yellow
    } else {
        Write-Host "Backend healthy." -ForegroundColor Green
        Write-Host "  boot_id (restart baseline): $healthContent" -ForegroundColor Green
        Write-Host "  Record this. If /api/health later shows the same boot_id after a code change, the restart did NOT take." -ForegroundColor DarkGray
    }

    # --- Frontend ---
    $holderFe = Get-PortHolder -Port $FRONTEND_PORT
    if ($holderFe) {
        Write-Host ""
        Write-Host "ERROR: port $FRONTEND_PORT is already held - same incident class, different port." -ForegroundColor Red
        Write-Host "  Holder PID     : $($holderFe.PID)" -ForegroundColor Red
        Write-Host "  Holder created : $($holderFe.CreationDate)" -ForegroundColor Red
        Write-Host "  Holder command : $($holderFe.CommandLine)" -ForegroundColor Red
        Write-Host ""
        Write-Host "Run: powershell -ExecutionPolicy Bypass -File scripts/dev.ps1 -Action stop" -ForegroundColor Yellow
        exit 1
    }

    Write-Host "Starting frontend (vite) on port $FRONTEND_PORT ..." -ForegroundColor Cyan
    $feDir      = (Resolve-Path "frontend\investigator").Path
    $feLogAbs   = (Join-Path (Get-Location) $FRONTEND_LOG)
    $frontendArgs = "/c cd /d `"$feDir`" && npm run dev >> `"$feLogAbs`" 2>&1"
    Start-Process -FilePath "cmd.exe" `
        -ArgumentList $frontendArgs `
        -WindowStyle Minimized

    # Probe 127.0.0.1 (IPv4) first like the backend, then fall back to [::1] (IPv6).
    # "localhost" resolves ::1-first on this box, so a localhost-only probe
    # false-negatives an IPv4-only Vite bind even when Vite is healthy. Probing both
    # loopback families matches whichever Vite actually bound.
    $feContent = Wait-Http -Url "http://127.0.0.1:$FRONTEND_PORT" -MaxSeconds 30
    if ($null -eq $feContent) {
        $feContent = Wait-Http -Url "http://[::1]:$FRONTEND_PORT" -MaxSeconds 5
    }
    if ($null -eq $feContent) {
        Write-Host "WARN: frontend did not answer on 127.0.0.1 or [::1]:$FRONTEND_PORT within 35s - see $FRONTEND_LOG for errors." -ForegroundColor Yellow
    } else {
        Write-Host "Frontend healthy on port $FRONTEND_PORT" -ForegroundColor Green
    }
}

# ── STOP ───────────────────────────────────────────────────────────────────────
if ($Action -eq "stop") {
    $stillHeld = $false
    foreach ($port in @($BACKEND_PORT, $FRONTEND_PORT)) {
        $holder = Get-PortHolder -Port $port
        if (-not $holder) {
            Write-Host "Port $port : nothing listening." -ForegroundColor DarkGray
            continue
        }
        Write-Host "Stopping port $port holder and the process tree under it ..." -ForegroundColor Cyan
        Write-Host "  PID         : $($holder.PID)" -ForegroundColor DarkGray
        Write-Host "  Created     : $($holder.CreationDate)" -ForegroundColor DarkGray
        Write-Host "  CommandLine : $($holder.CommandLine)" -ForegroundColor DarkGray

        # ONE snapshot of the process table, taken before the first kill. uvicorn --reload
        # is a reloader (the PID the TCP table names) plus a worker that inherits the
        # listening socket; stopping the reloader alone leaves the worker serving the old
        # code on the port (FIX: 2026-06-13, FIX: 2026-11-13).
        $procs = @(Get-CimInstance Win32_Process -ErrorAction SilentlyContinue)
        if ($procs.Count -eq 0) {
            # No process table (WMI down or timed out): no tree can be built and no reused
            # PID can be told apart. Fall back to what stop did before: the holder PID.
            Write-Host "  WARN: the process table could not be read; stopping PID $($holder.PID) alone." -ForegroundColor Yellow
            $targets = @([PSCustomObject]@{ ProcessId = $holder.PID; Name = $holder.Name })
        } else {
            $targets = @(Get-StopTargets -HolderPid $holder.PID -Processes $procs -ListenSince $holder.ListenSince)
            if ($targets.Count -eq 0) {
                Write-Host "  Nothing to stop: PID $($holder.PID) no longer holds this listener and no process it left behind was found." -ForegroundColor Yellow
            } elseif ($targets.Count -eq 1 -and "$($targets[0].Name)" -notmatch '^(python|node)(\.exe)?$') {
                Write-Host "  NOTE: the holder is $($targets[0].Name), not a python or node process this script starts. Stopping that PID alone, nothing under it." -ForegroundColor Yellow
            }
        }
        # Holder first: a reloader that is gone cannot start another worker.
        foreach ($p in $targets) {
            Write-Host "  Stopping PID $($p.ProcessId) ($($p.Name)) ..." -ForegroundColor DarkGray
            Stop-Process -Id $p.ProcessId -Force -ErrorAction SilentlyContinue
        }

        # Read the port back: a kill is a claim until the listener is gone.
        if (Wait-PortFree -Port $port -MaxSeconds 5) {
            Write-Host "  Port $port is free." -ForegroundColor Green
        } else {
            Write-Host "  ERROR: port $port is still held after stop." -ForegroundColor Red
            $owners = @(Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue |
                Select-Object -ExpandProperty OwningProcess -Unique)
            foreach ($owner in $owners) {
                $live = Get-Process -Id $owner -ErrorAction SilentlyContinue
                $what = if ($live) { $live.Name } else { "not running" }
                Write-Host "  TCP table owner : PID $owner ($what)" -ForegroundColor Red
            }
            Write-Host "  An owner that is not running: a process that inherited its socket is still alive." -ForegroundColor Yellow
            Write-Host "    Find it by elimination: docs/fixes/FIX-2026-06-13-stale-backend-orphaned-worker.md" -ForegroundColor Yellow
            Write-Host "  An owner that is running: it was outside what this stop took down (a second listener on" -ForegroundColor Yellow
            Write-Host "    the port, or a worker started during the stop). Run stop again, or stop it by PID." -ForegroundColor Yellow
            $stillHeld = $true
        }
    }
    if ($stillHeld) { exit 1 }
}

# ── STATUS ─────────────────────────────────────────────────────────────────────
if ($Action -eq "status") {
    foreach ($port in @($BACKEND_PORT, $FRONTEND_PORT)) {
        Write-Host ""
        Write-Host "--- Port $port ---" -ForegroundColor Cyan
        $holder = Get-PortHolder -Port $port
        if (-not $holder) {
            Write-Host "  Nothing listening on port $port." -ForegroundColor DarkGray
            continue
        }
        Write-Host "  Listener PID : $($holder.PID)"
        Write-Host "  Created      : $($holder.CreationDate)"
        Write-Host "  CommandLine  : $($holder.CommandLine)"

        if ($port -eq $BACKEND_PORT) {
            $hasReload = ($holder.CommandLine -match "--reload")
            if (-not $hasReload) {
                Write-Host ""
                Write-Host "  WARN: port $BACKEND_PORT holder does NOT have --reload in its command line." -ForegroundColor Red
                Write-Host "  WARN: this is the 2026-06-11 incident class: unsupervised non-reloading backend." -ForegroundColor Red
                Write-Host "  WARN: code changes on disk are invisible to the running process." -ForegroundColor Red
                Write-Host "  Action: run -Action stop, then -Action start to replace with a --reload supervised process." -ForegroundColor Yellow
            } else {
                Write-Host "  --reload: present (ok)" -ForegroundColor Green
            }

            # 127.0.0.1 (IPv4), not localhost (resolves ::1-first here) - see start-action note.
            $healthContent = Wait-Http -Url "http://127.0.0.1:$BACKEND_PORT/api/health" -MaxSeconds 5
            if ($null -eq $healthContent) {
                Write-Host "  /api/health: not reachable within 5s" -ForegroundColor Yellow
            } else {
                Write-Host "  /api/health boot_id: $healthContent" -ForegroundColor Green
            }
        }
    }
    Write-Host ""
}
