#Requires -Version 5.1
<#
.SYNOPSIS
  Local IAS "tool" — OAuth + SCIM. Loads repo-root .env / .env.local at runtime (never pass secrets on the command line).

  The Cursor agent should RUN this script and read ONLY stdout — never Read() .env files.

  Usage (from repo root):
    .\scripts\ias-scim.ps1 -Action ListUsers
    .\scripts\ias-scim.ps1 -Action ListGroups
    .\scripts\ias-scim.ps1 -Action Token
    .\scripts\ias-scim.ps1 -Action OpenIdMetadata
    .\scripts\ias-scim.ps1 -Action UserOidcClaims
    .\scripts\ias-scim.ps1 -Action GetUser -UserName "user@example.com"
    .\scripts\ias-scim.ps1 -Action CreateUser -UserName "bob@yourdomain.com" -GivenName Bob -FamilyName Procurement -Department procurement
    # Optional: -InitialPassword "..." if your tenant requires a password on create (do not commit passwords)

    .\scripts\ias-scim.ps1 -Action SetPassword -UserName "bob@yourdomain.com" -NewPassword "..."
    # Or set env IAS_BOOTSTRAP_PASSWORD and omit -NewPassword (avoid committing passwords)

  Required keys (in .env or environment): IAS_CLIENT_ID, IAS_CLIENT_SECRET, IAS_TOKEN_URL, IAS_SCIM_BASE

  Optional: IAS_TOKEN_RESOURCE — tenant base URL (e.g. https://<id>.trial-accounts.ondemand.com) appended to
  the token POST as &resource=… if SCIM returns 401 with Bearer-only tokens.

  OpenIdMetadata — GET /.well-known/openid-configuration (no SCIM token). Needs IAS_TOKEN_URL.

  UserOidcClaims — Resource Owner Password grant (if enabled on tenant) + decode JWT + optional UserInfo.
  Set IAS_ROPC_USER and IAS_ROPC_PASSWORD in .env (gitignored). Never commit passwords.
  Prints a summary: whether top-level claims include `dept` vs `customAttribute1` (IAS often keeps the directory name).
  For the subscribed app JWT, verify `xs.user.attributes.dept` by decoding the access token (browser Network tab for a CAP request, or scripts/decode-jwt.ps1) — that is XSUAA, not raw IAS.
  If ROPC is disabled, use browser Network tab id_token or access token decode instead.
#>
param(
  [ValidateSet('ListUsers', 'ListGroups', 'Token', 'GetUser', 'CreateUser', 'SetPassword', 'OpenIdMetadata', 'UserOidcClaims')]
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

function Get-IasTenantBaseUrl {
  if ([string]::IsNullOrWhiteSpace($env:IAS_TOKEN_URL)) {
    Write-Error 'IAS_TOKEN_URL is required (e.g. https://<tenant>.trial-accounts.ondemand.com/oauth2/token).'
  }
  $u = $env:IAS_TOKEN_URL.Trim()
  if ($u -match '^(https?://[^/]+)') {
    return $matches[1]
  }
  Write-Error 'Cannot derive tenant base URL from IAS_TOKEN_URL.'
}

function Decode-JwtPayloadToObject {
  param([string]$Jwt)
  if ([string]::IsNullOrWhiteSpace($Jwt)) { return $null }
  $parts = $Jwt.Split('.')
  if ($parts.Length -lt 2) { return $null }
  $payload = $parts[1]
  $rem = $payload.Length % 4
  if ($rem -gt 0) { $payload += ('=' * (4 - $rem)) }
  $b64 = $payload.Replace('-', '+').Replace('_', '/')
  try {
    $bytes = [Convert]::FromBase64String($b64)
    $json = [Text.Encoding]::UTF8.GetString($bytes)
    return ($json | ConvertFrom-Json)
  } catch {
    return $null
  }
}

function Write-OidcClaimSummary {
  param([string] $Label, $Payload)
  if ($null -eq $Payload) {
    Write-Host "# $Label : (empty)"
    return
  }
  $keys = @($Payload.PSObject.Properties | ForEach-Object { $_.Name })
  Write-Host "# --- $Label ---"
  Write-Host "# Top-level claim keys: $($keys -join ', ')"
  $watch = @('dept', 'customAttribute1', 'department', 'Department')
  foreach ($wk in $watch) {
    if ($keys -contains $wk) {
      $val = $Payload.($wk)
      if ($null -eq $val) {
        $shown = 'null'
      } elseif ($val -is [string] -or $val -is [int] -or $val -is [long] -or $val -is [bool]) {
        $shown = "$val"
      } else {
        $shown = ($val | ConvertTo-Json -Compress -Depth 4)
      }
      Write-Host "# Found claim '$wk' = $shown"
    }
  }
  $hasDept = $keys -contains 'dept'
  $hasC1 = $keys -contains 'customAttribute1'
  if ($hasDept -and -not $hasC1) {
    Write-Host '# Summary: top-level dept present; no customAttribute1 (unusual unless IAS maps claim names explicitly).'
  } elseif ($hasC1 -and -not $hasDept) {
    Write-Host '# Summary: customAttribute1 present; no top-level dept (typical for raw IAS). XSUAA dept comes from BTP Trust mapping.'
  } elseif ($hasDept -and $hasC1) {
    Write-Host '# Summary: both dept and customAttribute1 present — compare values.'
  } else {
    Write-Host '# Summary: neither dept nor customAttribute1 at top level (see UserInfo JSON below).'
  }
}

# --- OIDC discovery / user token (no SCIM client_credentials) ---------------------------------
if ($Action -eq 'OpenIdMetadata') {
  if ([string]::IsNullOrWhiteSpace($env:IAS_TOKEN_URL)) {
    Write-Error 'OpenIdMetadata requires IAS_TOKEN_URL to derive the tenant host.'
  }
  $tenantBase = Get-IasTenantBaseUrl
  $wellKnown = "$tenantBase/.well-known/openid-configuration"
  try {
    $meta = Invoke-RestMethod -Uri $wellKnown -Method Get -Headers @{ Accept = 'application/json' }
    Write-Host "# OpenID Connect discovery: $wellKnown"
    $meta | ConvertTo-Json -Depth 10
  } catch {
    Write-Error "OpenID discovery failed: $($_.Exception.Message)"
  }
  exit 0
}

if ($Action -eq 'UserOidcClaims') {
  $req = @('IAS_CLIENT_ID', 'IAS_CLIENT_SECRET', 'IAS_TOKEN_URL', 'IAS_ROPC_USER', 'IAS_ROPC_PASSWORD')
  foreach ($name in $req) {
    if (-not [string]::IsNullOrEmpty((Get-Item -Path "Env:$name" -ErrorAction SilentlyContinue).Value)) { continue }
    Write-Error "UserOidcClaims requires $name in .env. ROPC must be allowed for your OAuth client (often disabled in production)."
  }
  $cid2 = $env:IAS_CLIENT_ID
  $sec2 = $env:IAS_CLIENT_SECRET
  $pair2 = [Convert]::ToBase64String([Text.Encoding]::ASCII.GetBytes("${cid2}:${sec2}"))
  $scope = $env:IAS_OIDC_SCOPE
  if ([string]::IsNullOrWhiteSpace($scope)) { $scope = 'openid profile email' }
  $rb = 'grant_type=password' +
    '&username=' + [Uri]::EscapeDataString($env:IAS_ROPC_USER.Trim()) +
    '&password=' + [Uri]::EscapeDataString($env:IAS_ROPC_PASSWORD) +
    '&scope=' + [Uri]::EscapeDataString($scope)
  if (-not [string]::IsNullOrWhiteSpace($env:IAS_TOKEN_RESOURCE)) {
    $rb += '&resource=' + [Uri]::EscapeDataString($env:IAS_TOKEN_RESOURCE.Trim())
  }
  try {
    $ut = Invoke-RestMethod -Uri $env:IAS_TOKEN_URL -Method Post `
      -Headers @{ Authorization = "Basic $pair2" } `
      -Body $rb `
      -ContentType 'application/x-www-form-urlencoded'
  } catch {
    Write-Error "User token (ROPC) failed: $($_.Exception.Message). If disabled, decode id_token from browser login instead."
  }
  $jwtSrc = $ut.id_token
  if ([string]::IsNullOrWhiteSpace($jwtSrc)) { $jwtSrc = $ut.access_token }
  $claims = Decode-JwtPayloadToObject -Jwt $jwtSrc
  if ($null -eq $claims) {
    Write-Error 'Could not decode id_token/access_token payload (not a JWT or empty).'
  }
  Write-Host '# IAS OIDC (ROPC): id_token payload summary (raw tokens not printed)'
  Write-OidcClaimSummary -Label 'id_token (or access_token if no id_token)' -Payload $claims

  if (-not [string]::IsNullOrWhiteSpace($ut.access_token)) {
    $tenantBase = Get-IasTenantBaseUrl
    try {
      $oidcMeta = Invoke-RestMethod -Uri "$tenantBase/.well-known/openid-configuration" -Method Get -Headers @{ Accept = 'application/json' }
      $ue = $oidcMeta.userinfo_endpoint
      if (-not [string]::IsNullOrWhiteSpace($ue)) {
        $ui = Invoke-RestMethod -Uri $ue -Method Get -Headers @{ Authorization = "Bearer $($ut.access_token)"; Accept = 'application/json' }
        Write-OidcClaimSummary -Label 'UserInfo endpoint' -Payload $ui
      }
    } catch {
      Write-Host "# UserInfo skipped or failed: $($_.Exception.Message)"
    }
  }

  Write-Host '# Full id_token payload JSON (decoded only):'
  $claims | ConvertTo-Json -Depth 15
  exit 0
}

# --- SCIM API (client_credentials) ------------------------------------------------------------
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
