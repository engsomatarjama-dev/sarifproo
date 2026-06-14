param(
  [string]$PackageName = "com.sarifpro",
  [string]$Serial = $env:ANDROID_SERIAL,
  [int]$Cycles = 5,
  [string]$OutputDir = "$PSScriptRoot\..\tmp"
)

$ErrorActionPreference = "Stop"

function Require-Command($Name) {
  if (-not (Get-Command $Name -ErrorAction SilentlyContinue)) {
    throw "Required command not found: $Name"
  }
}

Require-Command adb

$pythonCmd = Get-Command python -ErrorAction SilentlyContinue
$PythonCommand = if ($pythonCmd) { $pythonCmd.Source } else { $null }
if (-not $PythonCommand) {
  $pyCmd = Get-Command py -ErrorAction SilentlyContinue
  $PythonCommand = if ($pyCmd) { $pyCmd.Source } else { $null }
}
if (-not $PythonCommand) {
  $bundledPython = Join-Path $HOME ".cache\codex-runtimes\codex-primary-runtime\dependencies\python\python.exe"
  if (Test-Path $bundledPython) {
    $PythonCommand = $bundledPython
  }
}
if (-not $PythonCommand) {
  throw "Required command not found: python"
}

$adbPrefix = @()
if ($Serial) {
  $adbPrefix = @("-s", $Serial)
}

$devices = adb devices | Select-String -Pattern "device$"
if ($devices.Count -eq 0) {
  throw "No ADB device is connected. Connect the physical phone and enable USB debugging."
}
if (-not $Serial -and $devices.Count -gt 1) {
  throw "More than one ADB device is connected. Pass -Serial <device_serial> or set ANDROID_SERIAL."
}

New-Item -ItemType Directory -Force -Path $OutputDir | Out-Null
$dbPath = Join-Path $OutputDir "sarifpro-timing.db"

if (Test-Path $dbPath) {
  Remove-Item -LiteralPath $dbPath -Force
}

$serialArgs = if ($Serial) { "-s $Serial " } else { "" }
$cmd = "adb $serialArgs exec-out run-as $PackageName cat databases/sarifpro.db > `"$dbPath`""
cmd.exe /c $cmd

if (-not (Test-Path $dbPath) -or (Get-Item $dbPath).Length -eq 0) {
  throw "Could not pull sarifpro.db. Android allows this only for a debuggable build. Install a diagnostic/debuggable APK or export logs from the app."
}

$headerLength = [Math]::Min(16, (Get-Item $dbPath).Length)
$headerBytes = [System.IO.File]::ReadAllBytes($dbPath)[0..($headerLength - 1)]
$headerText = [System.Text.Encoding]::ASCII.GetString($headerBytes)
if (-not $headerText.StartsWith("SQLite format 3")) {
  $errorText = Get-Content -LiteralPath $dbPath -Raw -ErrorAction SilentlyContinue
  throw "Pulled file is not a SQLite database. Android likely blocked app data access for this non-debuggable APK. Details: $errorText"
}

$python = @'
import datetime
import re
import sqlite3
import sys

db_path = sys.argv[1]
cycles_required = int(sys.argv[2])

keys = [
    "balance_check_started_at",
    "balance_result_detected_at",
    "balance_ok_clicked_at",
    "ussd_popup_disappeared_at",
    "session_lock_released_at",
    "next_balance_check_scheduled_at",
    "next_balance_check_started_at",
    "network_settling_entered_at",
    "network_settling_reason",
]

def fmt(ms):
    if not ms:
        return "-"
    return datetime.datetime.fromtimestamp(ms / 1000).strftime("%Y-%m-%d %H:%M:%S.%f")[:-3]

def seconds(delta):
    if delta is None:
        return "-"
    return f"{delta / 1000:.2f}s"

conn = sqlite3.connect(db_path)
conn.row_factory = sqlite3.Row
where = " OR ".join(["message LIKE ?" for _ in keys] + ["message = ?"])
params = [f"{key}=%" for key in keys] + ["Entering NETWORK_SETTLING"]
rows = conn.execute(
    f"SELECT id, type, message, timestamp FROM logs WHERE {where} ORDER BY timestamp ASC",
    params,
).fetchall()

events = []
for row in rows:
    message = row["message"]
    key = message
    value = None
    if "=" in message:
        key, value = message.split("=", 1)
    timestamp = row["timestamp"]
    if value and value.isdigit():
        timestamp = int(value)
    events.append({"key": key, "value": value, "timestamp": int(timestamp), "message": message})

starts = [event for event in events if event["key"] == "next_balance_check_started_at"]
if len(starts) < cycles_required:
    print(f"Only {len(starts)} balance cycle start log(s) found. Need {cycles_required}.")
    print("Run the app on the physical phone with balance checker interval set to 10 seconds, let 5 clean checks finish, then rerun this script.")
    sys.exit(2)

starts = starts[-cycles_required:]
cycle_reports = []

for index, start in enumerate(starts):
    cycle_start = start["timestamp"]
    next_start = starts[index + 1]["timestamp"] if index + 1 < len(starts) else None
    upper = next_start if next_start else 2**63 - 1
    window = [event for event in events if cycle_start <= event["timestamp"] < upper]
    by_key = {}
    for event in window:
        by_key.setdefault(event["key"], event)

    settling = [event for event in window if event["key"] in ("network_settling_entered_at", "Entering NETWORK_SETTLING")]
    cycle_reports.append({
        "cycle": index + 1,
        "start": cycle_start,
        "detected": by_key.get("balance_result_detected_at", {}).get("timestamp"),
        "ok": by_key.get("balance_ok_clicked_at", {}).get("timestamp"),
        "popup_gone": by_key.get("ussd_popup_disappeared_at", {}).get("timestamp"),
        "released": by_key.get("session_lock_released_at", {}).get("timestamp"),
        "scheduled": by_key.get("next_balance_check_scheduled_at", {}).get("timestamp"),
        "next_start": next_start,
        "settling": settling,
        "settling_reason": by_key.get("network_settling_reason", {}).get("value"),
    })

print("SarifPro balance checker timing report")
print("=" * 42)
print(f"Cycles analyzed: {len(cycle_reports)}")
print()

all_clean = True
for report in cycle_reports:
    missing = [
        name for name in ("detected", "ok", "popup_gone", "released")
        if report[name] is None
    ]
    if report["settling"]:
        all_clean = False
    if missing:
        all_clean = False

    gap_from_release = None
    gap_from_start = None
    if report["next_start"] and report["released"]:
        gap_from_release = report["next_start"] - report["released"]
    if report["next_start"]:
        gap_from_start = report["next_start"] - report["start"]

    print(f"Cycle {report['cycle']}")
    print(f"  next_balance_check_started_at : {fmt(report['start'])}")
    print(f"  balance_result_detected_at    : {fmt(report['detected'])}")
    print(f"  balance_ok_clicked_at         : {fmt(report['ok'])}")
    print(f"  ussd_popup_disappeared_at     : {fmt(report['popup_gone'])}")
    print(f"  session_lock_released_at      : {fmt(report['released'])}")
    print(f"  next_balance_check_scheduled_at: {fmt(report['scheduled'])}")
    print(f"  next cycle start              : {fmt(report['next_start'])}")
    print(f"  gap release -> next start     : {seconds(gap_from_release)}")
    print(f"  gap start -> next start       : {seconds(gap_from_start)}")
    print(f"  NETWORK_SETTLING entered      : {'YES' if report['settling'] else 'NO'}")
    if report["settling_reason"]:
        print(f"  network_settling_reason       : {report['settling_reason']}")
    if missing:
        print(f"  missing required logs         : {', '.join(missing)}")
    print()

print("Result")
print("------")
if all_clean:
    print("PASS: required clean-cycle logs were present and NETWORK_SETTLING was not entered.")
else:
    print("CHECK: one or more cycles entered NETWORK_SETTLING or missed required clean-cycle logs.")
'@

$scriptPath = Join-Path $OutputDir "analyze-sarifpro-balance-timing.py"
Set-Content -LiteralPath $scriptPath -Value $python -Encoding UTF8
& $PythonCommand $scriptPath $dbPath $Cycles
