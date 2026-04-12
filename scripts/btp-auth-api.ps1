#Requires -Version 5.1
<#
.SYNOPSIS
  BTP Authorization and Trust Management REST API — OAuth client_credentials + read-only discovery calls.
  Loads repo-root .env / .env.local (same parser as ias-scim.ps1). Agent should RUN and read stdout only.

  Usage (from repo root):
    .\scripts\btp-auth-api.ps1 -Action Token
    .\scripts\btp-auth-api.ps1 -Action ListRoleCollections
    .\scripts\btp-auth-api.ps1 -Action GetRoleCollection -RoleCollectionName "ACP Chat User"
    .\scripts\btp-auth-api.ps1 -Action ListApps

  Required env: BTP_AUTH_API_CLIENT_ID, BTP_AUTH_API_CLIENT_SECRET, BTP_AUTH_API_TOKEN_URL, BTP_AUTH_API_BASE_URL

  Optional: BTP_AUTH_API_TOKEN_RESOURCE — appended as &resource=… on token POST if your tenant requires it.

  API paths follow SAP Authorization API v2 (see SAP Business Accelerator Hub — Authorization API).
#>
param(
  [ValidateSet('Token', 'ListRoleCollections', 'GetRoleCollection', 'ListApps')]
  [string] $Action = 'ListRoleCollections',
  [string] $RoleCollectionName = ''
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

function Import-DotEnvFiles {
  $root = Split-Path $PSScriptRoot -Parent
  Import-DotEnvFile (Join-Path $root '.env')
  Import-DotEnvFile (Join-Path $root '.env.local')
}

Import-DotEnvFiles

$required = @('BTP_AUTH_API_CLIENT_ID', 'BTP_AUTH_API_CLIENT_SECRET', 'BTP_AUTH_API_TOKEN_URL', 'BTP_AUTH_API_BASE_URL')
foreach ($name in $required) {
  if (-not [string]::IsNullOrEmpty((Get-Item -Path "Env:$name" -ErrorAction SilentlyContinue).Value)) { continue }
  Write-Error "Missing $name. Add to repo-root .env or .env.local (gitignored)."
}

$cid = $env:BTP_AUTH_API_CLIENT_ID
$sec = $env:BTP_AUTH_API_CLIENT_SECRET
$pair = [Convert]::ToBase64String([Text.Encoding]::ASCII.GetBytes("${cid}:${sec}"))

$tokenBody = 'grant_type=client_credentials'
if (-not [string]::IsNullOrWhiteSpace($env:BTP_AUTH_API_TOKEN_RESOURCE)) {
  $tokenBody = 'grant_type=client_credentials&resource=' + [Uri]::EscapeDataString($env:BTP_AUTH_API_TOKEN_RESOURCE.Trim())
}

try {
  $tok = Invoke-RestMethod -Uri $env:BTP_AUTH_API_TOKEN_URL -Method Post `
    -Headers @{ Authorization = "Basic $pair" } `
    -Body $tokenBody `
    -ContentType 'application/x-www-form-urlencoded'
} catch {
  Write-Error "Token request failed: $($_.Exception.Message)"
}

$access = $tok.access_token
if (-not $access) {
  $type = if ($null -eq $tok) { 'null' } else { $tok.GetType().FullName }
  Write-Error "No access_token. Response type: $type. Set BTP_AUTH_API_TOKEN_URL to the OAuth token endpoint (uaa.url from service key + /oauth/token), not the REST apiurl."
}

if ($Action -eq 'Token') {
  $len = $access.Length
  Write-Host "OK: access_token received (length $len). expires_in: $($tok.expires_in)"
  exit 0
}

$base = $env:BTP_AUTH_API_BASE_URL.TrimEnd('/')
$v2 = "$base/sap/rest/authorization/v2"
$script:rcQuery = '/rolecollections?showRoles=true&showUsers=false'
$h = @{
  Authorization = "Bearer $access"
  Accept          = 'application/json'
}

function Read-ErrorBody {
  param($Exception)
  try {
    $resp = $Exception.Exception.Response
    if ($null -eq $resp) { return $Exception.Exception.Message }
    $stream = $resp.GetResponseStream()
    if ($null -eq $stream) { return $Exception.Exception.Message }
    $reader = New-Object System.IO.StreamReader($stream)
    return $reader.ReadToEnd()
  } catch {
    return $Exception.Exception.Message
  }
}

function Invoke-AuthGet {
  param([string] $Uri)
  try {
    return Invoke-RestMethod -Uri $Uri -Method Get -Headers $h
  } catch {
    $detail = Read-ErrorBody -Exception $_
    Write-Error "GET failed: $Uri - $detail"
  }
}

function Get-RoleCollectionItems {
  param($Response)
  if ($null -eq $Response) { return @() }
  if ($Response -is [Array]) { return @($Response) }
  foreach ($n in 'roleCollections', 'RoleCollections', 'value', 'resources') {
    $p = $Response.$n
    if ($null -ne $p) { return @($p) }
  }
  return @()
}

function Find-RoleCollectionByName {
  param($Items, [string] $Name)
  foreach ($item in $Items) {
    $n = $item.name
    if (-not $n) { $n = $item.roleCollectionName }
    if (-not $n) { $n = $item.Name }
    if ($n -eq $Name) { return $item }
  }
  return $null
}

try {
  switch ($Action) {
    'ListRoleCollections' {
      $uri = $v2 + $script:rcQuery
      $r = Invoke-AuthGet -Uri $uri
      $r | ConvertTo-Json -Depth 20
    }
    'GetRoleCollection' {
      if ([string]::IsNullOrWhiteSpace($RoleCollectionName)) {
        Write-Error 'GetRoleCollection requires -RoleCollectionName (exact name, e.g. ACP Chat User).'
      }
      $list = Invoke-AuthGet -Uri ($v2 + $script:rcQuery)
      $name = $RoleCollectionName.Trim()
      $items = Get-RoleCollectionItems -Response $list
      $coll = Find-RoleCollectionByName -Items $items -Name $name
      if ($null -eq $coll) {
        Write-Error "Role collection not found: $name"
      }
      $coll | ConvertTo-Json -Depth 20
    }
    'ListApps' {
      $r = Invoke-AuthGet -Uri "$v2/apps"
      $r | ConvertTo-Json -Depth 15
    }
  }
} catch {
  Write-Error "Authorization API failed ($Action): $($_.Exception.Message)"
}
