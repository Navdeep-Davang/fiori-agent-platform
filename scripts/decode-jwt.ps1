#Requires -Version 5.1
<#
.SYNOPSIS
  Decode JWT payload (no signature verification). Pass token from browser Network tab
  (Authorization: Bearer ...) or App Router flow — NOT cf oauth-token (wrong token type for xs.user.attributes).

  Usage:
    .\scripts\decode-jwt.ps1 -Jwt "<paste_access_token>"
    .\scripts\decode-jwt.ps1   # reads one line from stdin (paste token, Enter, Ctrl+Z on Windows)
#>
param([string]$Jwt = '')

$ErrorActionPreference = 'Stop'

if ([string]::IsNullOrWhiteSpace($Jwt)) {
  $Jwt = [Console]::In.ReadToEnd().Trim()
}
$Jwt = $Jwt.Trim().TrimStart("Bearer ").Trim()
if ([string]::IsNullOrWhiteSpace($Jwt)) {
  Write-Error 'Provide -Jwt "<token>" or pipe token on stdin.'
}

$parts = $Jwt.Split('.')
if ($parts.Length -lt 2) {
  Write-Error 'Not a JWT string.'
}
$payload = $parts[1]
$rem = $payload.Length % 4
if ($rem -gt 0) { $payload += ('=' * (4 - $rem)) }
$b64 = $payload.Replace('-', '+').Replace('_', '/')
$bytes = [Convert]::FromBase64String($b64)
$json = [Text.Encoding]::UTF8.GetString($bytes)
$obj = $json | ConvertFrom-Json

Write-Host '# issuer (iss):' $obj.iss
Write-Host '# client_id (azp):' $obj.azp
if ($obj.'xs.user.attributes') {
  Write-Host '# xs.user.attributes:'
  $obj.'xs.user.attributes' | ConvertTo-Json -Depth 10
} else {
  Write-Host '# xs.user.attributes: (not present — wrong token type or attribute not mapped)'
}
Write-Host '# Full payload JSON:'
$obj | ConvertTo-Json -Depth 15
