# Start each Python microservice in its own PowerShell window.
# Each window echoes to its console and writes repoRoot\.log\<service>-<port>.log as UTF-8 (live lines),
# with a timestamp prefix on every line. On launch, all *.log files under .log are removed so this
# run does not mix with prior sessions; each child writes a fresh session banner then appends timestamped lines.
# On normal exit / window teardown, run-python-single-service.ps1 deletes that session's log file.

$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$pythonDir = Join-Path $repoRoot "python"
$venvPython = Join-Path $pythonDir "venv\Scripts\python.exe"
$runner = Join-Path $PSScriptRoot "run-python-single-service.ps1"

$logDir = Join-Path $repoRoot ".log"
if (-not (Test-Path -LiteralPath $logDir)) {
    New-Item -ItemType Directory -Path $logDir | Out-Null
}
else {
    $priorLogs = @(Get-ChildItem -Path $logDir -Filter "*.log" -ErrorAction SilentlyContinue)
    if ($priorLogs.Count -gt 0) {
        $priorLogs | Remove-Item -Force -ErrorAction SilentlyContinue
        Write-Host "Removed $($priorLogs.Count) prior log file(s) under .log (fresh run)." -ForegroundColor DarkGray
    }
}

if (-not (Test-Path -LiteralPath $venvPython)) {
    Write-Error "Venv Python not found: $venvPython. Create and populate python\\venv before running."
    exit 1
}

# List of services: (DisplayName, UvicornAppPath, Port)
$services = @(
    @("MCP-Gateway", "apps.mcp_gateway.app.main:app", 8000),
    @("MCP-Server-Procurement", "apps.mcp_server.procurement.app.main:app", 8001),
    @("MCP-Server-Finance", "apps.mcp_server.finance.app.main:app", 8002),
    @("Python-API-Server", "apps.server.app.main:app", 8003),
    @("Orchestrator-Engine", "apps.orchestrator.app.main:app", 8004),
    @("MCP-Client", "apps.mcp_client.app.main:app", 8005)
)

foreach ($service in $services) {
    $name = $service[0]
    $appPath = $service[1]
    $port = $service[2]

    Write-Host "Starting $name on port $port (logging under $logDir)..." -ForegroundColor Cyan

    Start-Process powershell.exe -ArgumentList @(
        "-NoExit",
        "-NoProfile",
        "-ExecutionPolicy", "Bypass",
        "-File", $runner,
        "-Root", $repoRoot,
        "-ServiceName", $name,
        "-AppPath", $appPath,
        "-Port", "$port"
    ) -WorkingDirectory $repoRoot
}

Write-Host ""
Write-Host "All services started. Tail files under:" -ForegroundColor Green
Write-Host "  $logDir" -ForegroundColor Green
