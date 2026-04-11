#Requires -Version 5.1
<#
.SYNOPSIS
  Local IAS "tool" — OAuth + SCIM. Loads repo-root .env / .env.local at runtime (never pass secrets on the command line).

  The Cursor agent should RUN this script and read ONLY stdout — never Read() .env files.

  Usage (from repo root):
    .\scripts\ias-scim.ps1 -Action ListUsers
    .\scripts\ias-scim.ps1 -Action ListGroups
    .\scripts\ias-scim.ps1 -Action Token
    .\scripts\ias-scim.ps1 -Action GetUser -UserName "user@example.com"
    .\scripts\ias-scim.ps1 -Action CreateUser -UserName "bob@yourdomain.com" -GivenName Bob -FamilyName Procurement -Department procurement
    # Optional: -InitialPassword "..." if your tenant requires a password on create (do not commit passwords)

    .\scripts\ias-scim.ps1 -Action SetPassword -UserName "bob@yourdomain.com" -NewPassword "..."
    # Or set env IAS_BOOTSTRAP_PASSWORD and omit -NewPassword (avoid committing passwords)

  Required keys (in .env or environment): IAS_CLIENT_ID, IAS_CLIENT_SECRET, IAS_TOKEN_URL, IAS_SCIM_BASE

  Optional: IAS_TOKEN_RESOURCE — tenant base URL (e.g. https://<id>.trial-accounts.ondemand.com) appended to
  the token POST as &resource=… if SCIM returns 401 with Bearer-only tokens.
#>
param(
  [ValidateSet('ListUsers', 'ListGroups', 'Token', 'GetUser', 'CreateUser', 'SetPassword')]
  [string] $Action = 'ListUsers',
  [string] $UserName = '',
  [string] $GivenName = '',
  [string] $FamilyName = '',
  [string] $Department = '',
  [string] $InitialPassword = '',
  [string] $NewPassword = ''
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
  # Order: .env then .env.local (later overrides) — matches common dotenv practice
  Import-DotEnvFile (Join-Path $root '.env')
  Import-DotEnvFile (Join-Path $root '.env.local')
}

Import-DotEnvFiles

$required = @('IAS_CLIENT_ID', 'IAS_CLIENT_SECRET', 'IAS_TOKEN_URL', 'IAS_SCIM_BASE')
foreach ($name in $required) {
  if (-not [string]::IsNullOrEmpty((Get-Item -Path "Env:$name" -ErrorAction SilentlyContinue).Value)) { continue }
  Write-Error "Missing $name. Add it to repo-root .env or .env.local (gitignored), or set process env vars."
}

$cid = $env:IAS_CLIENT_ID
$sec = $env:IAS_CLIENT_SECRET
$pair = [Convert]::ToBase64String([Text.Encoding]::ASCII.GetBytes("${cid}:${sec}"))

$tokenBody = 'grant_type=client_credentials'
if (-not [string]::IsNullOrWhiteSpace($env:IAS_TOKEN_RESOURCE)) {
  $tokenBody = "grant_type=client_credentials&resource=$([Uri]::EscapeDataString($env:IAS_TOKEN_RESOURCE.Trim()))"
}
try {
  $tok = Invoke-RestMethod -Uri $env:IAS_TOKEN_URL -Method Post `
    -Headers @{ Authorization = "Basic $pair" } `
    -Body $tokenBody `
    -ContentType 'application/x-www-form-urlencoded'
} catch {
  Write-Error "Token request failed: $($_.Exception.Message)"
}

$access = $tok.access_token
if (-not $access) {
  Write-Error 'No access_token in response.'
}

if ($Action -eq 'Token') {
  $len = $access.Length
  Write-Host "OK: access_token received (length $len). expires_in: $($tok.expires_in)"
  exit 0
}

$base = $env:IAS_SCIM_BASE.TrimEnd('/')
$hBearer = @{ Authorization = "Bearer $access"; Accept = 'application/scim+json' }
$hBasic = @{ Authorization = "Basic $pair"; Accept = 'application/scim+json' }

function Invoke-ScimGet {
  param([string]$Uri)
  try {
    return Invoke-RestMethod -Uri $Uri -Method Get -Headers $hBearer
  } catch {
    $status = $null
    if ($null -ne $_.Exception.Response) { $status = [int]$_.Exception.Response.StatusCode }
    if ($status -eq 401) {
      return Invoke-RestMethod -Uri $Uri -Method Get -Headers $hBasic
    }
    throw
  }
}

function Invoke-ScimPost {
  param([string]$Uri, [string]$JsonBody)
  $hPostB = @{
    Authorization  = $hBearer.Authorization
    Accept         = $hBearer.Accept
    'Content-Type' = 'application/scim+json'
  }
  $hPostBasic = @{
    Authorization  = $hBasic.Authorization
    Accept         = $hBasic.Accept
    'Content-Type' = 'application/scim+json'
  }
  try {
    return Invoke-RestMethod -Uri $Uri -Method Post -Headers $hPostB -Body $JsonBody
  } catch {
    $status = $null
    if ($null -ne $_.Exception.Response) { $status = [int]$_.Exception.Response.StatusCode }
    if ($status -eq 401) {
      return Invoke-RestMethod -Uri $Uri -Method Post -Headers $hPostBasic -Body $JsonBody
    }
    throw
  }
}

function Invoke-ScimPut {
  param([string]$Uri, [string]$JsonBody)
  $hPutB = @{
    Authorization  = $hBearer.Authorization
    Accept         = $hBearer.Accept
    'Content-Type' = 'application/scim+json'
  }
  $hPutBasic = @{
    Authorization  = $hBasic.Authorization
    Accept         = $hBasic.Accept
    'Content-Type' = 'application/scim+json'
  }
  try {
    return Invoke-RestMethod -Uri $Uri -Method Put -Headers $hPutB -Body $JsonBody
  } catch {
    $status = $null
    if ($null -ne $_.Exception.Response) { $status = [int]$_.Exception.Response.StatusCode }
    if ($status -eq 401) {
      return Invoke-RestMethod -Uri $Uri -Method Put -Headers $hPutBasic -Body $JsonBody
    }
    throw
  }
}

try {
  switch ($Action) {
    'ListUsers' {
      $r = Invoke-ScimGet -Uri "$base/Users"
      $r | ConvertTo-Json -Depth 15
    }
    'ListGroups' {
      $r = Invoke-ScimGet -Uri "$base/Groups"
      $r | ConvertTo-Json -Depth 15
    }
    'GetUser' {
      if ([string]::IsNullOrWhiteSpace($UserName)) {
        Write-Error 'GetUser requires -UserName (e.g. email or login).'
      }
      $safe = $UserName.Replace('"', '')
      $filter = "userName eq `"$safe`""
      $q = [Uri]::EscapeDataString($filter)
      $r = Invoke-ScimGet -Uri "$base/Users?filter=$q"
      $r | ConvertTo-Json -Depth 15
    }
    'CreateUser' {
      if ([string]::IsNullOrWhiteSpace($UserName)) {
        Write-Error 'CreateUser requires -UserName (login / email).'
      }
      $login = $UserName.Trim()
      $schemaList = @('urn:ietf:params:scim:schemas:core:2.0:User')
      if (-not [string]::IsNullOrWhiteSpace($Department)) {
        $schemaList += 'urn:sap:cloud:scim:schemas:extension:custom:2.0:User'
      }
      $body = [ordered]@{
        schemas  = $schemaList
        userName = $login
        active   = $true
        emails   = @(@{ value = $login; primary = $true })
        name     = @{
          givenName  = $(if ($GivenName) { $GivenName.Trim() } else { 'User' })
          familyName = $(if ($FamilyName) { $FamilyName.Trim() } else { '' })
        }
      }
      if (-not [string]::IsNullOrWhiteSpace($Department)) {
        $body['urn:sap:cloud:scim:schemas:extension:custom:2.0:User'] = @{
          attributes = @(@{ name = 'customAttribute1'; value = $Department.Trim() })
        }
      }
      if (-not [string]::IsNullOrWhiteSpace($InitialPassword)) {
        $body['password'] = $InitialPassword
      }
      $json = $body | ConvertTo-Json -Depth 10 -Compress
      $r = Invoke-ScimPost -Uri "$base/Users" -JsonBody $json
      $r | ConvertTo-Json -Depth 15
    }
    'SetPassword' {
      if ([string]::IsNullOrWhiteSpace($UserName)) {
        Write-Error 'SetPassword requires -UserName.'
      }
      $pwd = $NewPassword
      if ([string]::IsNullOrWhiteSpace($pwd)) { $pwd = $env:IAS_BOOTSTRAP_PASSWORD }
      if ([string]::IsNullOrWhiteSpace($pwd)) {
        Write-Error 'SetPassword: use -NewPassword or env IAS_BOOTSTRAP_PASSWORD (do not commit).'
      }
      $safe = $UserName.Trim().Replace('"', '')
      $filter = "userName eq `"$safe`""
      $q = [Uri]::EscapeDataString($filter)
      $found = Invoke-ScimGet -Uri "$base/Users?filter=$q"
      $uid = $found.Resources[0].id
      if ([string]::IsNullOrWhiteSpace($uid)) {
        Write-Error "No SCIM user found for userName=$safe"
      }
      # SAP Note 3001615 / SCIM update user resource — productive password
      $putBody = (@{
          id             = $uid
          passwordStatus = 'enabled'
          password       = $pwd
        } | ConvertTo-Json -Compress)
      $r = Invoke-ScimPut -Uri "$base/Users/$uid" -JsonBody $putBody
      $r | ConvertTo-Json -Depth 15
    }
  }
} catch {
  Write-Error "SCIM request failed ($Action): $($_.Exception.Message)"
}
