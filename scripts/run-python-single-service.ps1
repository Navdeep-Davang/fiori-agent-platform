param(
    [Parameter(Mandatory = $true)]
    [string] $Root,
    [Parameter(Mandatory = $true)]
    [string] $ServiceName,
    [Parameter(Mandatory = $true)]
    [string] $AppPath,
    [Parameter(Mandatory = $true)]
    [int] $Port
)

$pythonDir = Join-Path $Root "python"
$venvPython = Join-Path $pythonDir "venv\Scripts\python.exe"

if (-not (Test-Path -LiteralPath $venvPython)) {
    Write-Error "Venv Python not found: $venvPython. Create venv under python\\venv first."
    exit 1
}

$logDir = Join-Path $Root ".log"
if (-not (Test-Path -LiteralPath $logDir)) {
    New-Item -ItemType Directory -Path $logDir | Out-Null
}

$safe = ($ServiceName -replace "[^\w\-]+", "_")
$logFile = Join-Path $logDir "${safe}-${Port}.log"

# Fresh log for this session (launcher removes .log\*.log before spawn; this also covers standalone runs)
if (Test-Path -LiteralPath $logFile) {
    Remove-Item -LiteralPath $logFile -Force -ErrorAction SilentlyContinue
}

$sessionBanner = "$(Get-Date -Format 'yyyy-MM-dd HH:mm:ss.fff') ========== ${ServiceName} (port ${Port}) session start =========="

Write-Host "${ServiceName} (port ${Port}) -> log: $logFile" -ForegroundColor Cyan

function Write-TimestampedLine {
    param([Parameter(ValueFromPipeline)] $InputObject)
    process {
        $ts = Get-Date -Format "yyyy-MM-dd HH:mm:ss.fff"
        $text = if ($null -eq $InputObject) {
            ""
        }
        elseif ($InputObject -is [System.Management.Automation.ErrorRecord]) {
            $InputObject.ToString()
        }
        else {
            "$InputObject"
        }
        foreach ($line in ($text -split "`r?`n")) {
            if ($line.Length -gt 0) {
                "${ts} ${line}"
            }
        }
    }
}

# Tee-Object -FilePath uses UTF-16 LE on Windows PowerShell, which corrupts logs when mixed with UTF-8 (NUL between chars in UTF-8 editors).
# Write everything as UTF-8 (with BOM so VS Code/Cursor detect encoding reliably).
$utf8WithBom = New-Object System.Text.UTF8Encoding $true

try {
    Push-Location $pythonDir
    $env:PYTHONPATH = $Root
    $env:PYTHONUNBUFFERED = "1"

    $logWriter = New-Object System.IO.StreamWriter($logFile, $false, $utf8WithBom)
    try {
        $logWriter.WriteLine($sessionBanner)
        $logWriter.Flush()

        # Merge streams so stderr (uvicorn/errors) lands in same log as stdout; prefix each line with local time
        & $venvPython -m uvicorn $AppPath --port $Port *>&1 |
            Write-TimestampedLine |
            ForEach-Object {
                Write-Host $_
                $logWriter.WriteLine($_)
                $logWriter.Flush()
            }
    }
    finally {
        $logWriter.Dispose()
    }
}
finally {
    Pop-Location -ErrorAction SilentlyContinue
    Remove-Item -LiteralPath $logFile -Force -ErrorAction SilentlyContinue
    Write-Host ('Session ended; removed log file: ' + $logFile) -ForegroundColor DarkGray
}

Read-Host 'Process exited. Press Enter to close.'
