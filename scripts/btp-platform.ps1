#Requires -Version 5.1
<#
.SYNOPSIS
  Local BTP "tool" — runs `btp` with subaccount targeting from repo-root `.env` / `.env.local`.

  The Cursor agent should RUN this script and read ONLY stdout/stderr — never Read() `.env`.

  Prerequisite: `btp login` completed on this machine (interactive; credentials are not read from .env).

  Usage (from repo root):
    .\scripts\btp-platform.ps1 -Action Target
    .\scripts\btp-platform.ps1 -Action ListRoleCollections
    .\scripts\btp-platform.ps1 -Action ListTrust
    .\scripts\btp-platform.ps1 -Action ListUsers
    .\scripts\btp-platform.ps1 -Action CheckLogin
    .\scripts\btp-platform.ps1 -Action AssignRoleCollection -RoleCollection "ACP Chat User" -UserEmail "a@b.com" -IdpOrigin "optional-ias-origin"

  Env (in `.env`, gitignored):
    BTP_SUBACCOUNT_ID   — subaccount UUID (Cockpit URL or `btp list accounts/subaccount`)
  Optional:
    BTP_IDP_ORIGIN                — default for AssignRoleCollection if -IdpOrigin omitted (IAS trust origin)
    BTP_GLOBAL_ACCOUNT_SUBDOMAIN — trial global account subdomain (for CheckLogin / listing subaccounts)
#>
param(
  [ValidateSet('Target', 'ListRoleCollections', 'ListTrust', 'ListUsers', 'AssignRoleCollection', 'CheckLogin')]
  [string] $Action = 'CheckLogin',
  [string] $RoleCollection = '',
  [string] $UserEmail = '',
  [string] $IdpOrigin = ''
)

$ErrorActionPreference = 'Stop'

function Import-DotEnvFile {
  param([string] $Path)
  if (-not (Test-Path $Path)) { return }
  Get-Content -LiteralPath $Path | ForEach-Object {
    $line = $_.Trim()
    if ($line -match '^\s*#' -or $line -eq '') { return }
    $eq = $line.IndexOf('=')
    if ($eq -lt 1) { return }
    $k = $line.Substring(0, $eq).Trim()
    $v = $line.Substring($eq + 1).Trim().Trim('"').Trim("'")
    Set-Item -Path "Env:$k" -Value $v
  }
}

$root = Split-Path $PSScriptRoot -Parent
Import-DotEnvFile (Join-Path $root '.env')
Import-DotEnvFile (Join-Path $root '.env.local')

function Assert-Btp {
  if (-not (Get-Command btp -ErrorAction SilentlyContinue)) {
    Write-Error "btp CLI not found on PATH. Install: winget install SAP.btp"
  }
}

Assert-Btp

switch ($Action) {
  'CheckLogin' {
    cmd /c "btp --version 2>&1"
    if (-not [string]::IsNullOrWhiteSpace($env:BTP_GLOBAL_ACCOUNT_SUBDOMAIN)) {
      & btp list accounts/subaccount --global-account $env:BTP_GLOBAL_ACCOUNT_SUBDOMAIN.Trim()
    } else {
      Write-Output "Set BTP_GLOBAL_ACCOUNT_SUBDOMAIN in .env to list subaccounts, or run: btp list accounts/subaccount --global-account <subdomain>"
    }
  }
  'Target' {
    if ([string]::IsNullOrWhiteSpace($env:BTP_SUBACCOUNT_ID)) {
      Write-Error 'Set BTP_SUBACCOUNT_ID in .env (subaccount UUID from Cockpit URL or btp list).'
    }
    & btp target --subaccount $env:BTP_SUBACCOUNT_ID.Trim()
  }
  'ListRoleCollections' {
    # Use active `btp target` (run -Action Target first). Do not pass --subaccount here — CLI v2 rejected it in this position for some builds.
    & btp list security/role-collection
  }
  'ListTrust' {
    & btp list security/trust
  }
  'ListUsers' {
    & btp list security/user
  }
  'AssignRoleCollection' {
    if ([string]::IsNullOrWhiteSpace($RoleCollection) -or [string]::IsNullOrWhiteSpace($UserEmail)) {
      Write-Error 'AssignRoleCollection requires -RoleCollection and -UserEmail.'
    }
    $origin = $IdpOrigin
    if ([string]::IsNullOrWhiteSpace($origin)) { $origin = $env:BTP_IDP_ORIGIN }
    if ([string]::IsNullOrWhiteSpace($origin)) { $origin = 'sap.default' }
    # Order per `btp help assign security/role-collection` examples
    $a = @('assign', 'security/role-collection', $RoleCollection)
    if (-not [string]::IsNullOrWhiteSpace($env:BTP_SUBACCOUNT_ID)) {
      $a += @('--subaccount', $env:BTP_SUBACCOUNT_ID.Trim())
    }
    $a += @('--of-idp', $origin.Trim(), '--to-user', $UserEmail.Trim())
    Write-Host "Running: btp $($a -join ' ')" -ForegroundColor DarkGray
    & btp @a
  }
}
