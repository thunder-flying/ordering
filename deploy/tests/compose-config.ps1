$ErrorActionPreference = "Stop"

$repositoryRoot = (Resolve-Path (Join-Path $PSScriptRoot "../..")).Path
$composeFile = Join-Path $repositoryRoot "deploy/docker-compose.prod.yml"
$offlineComposeFile = Join-Path $repositoryRoot "deploy/docker-compose.offline.yml"
$environmentFile = Join-Path $repositoryRoot "deploy/env/production.env.example"

if (-not (Test-Path -LiteralPath $composeFile)) {
  throw "Production Compose file is missing: $composeFile"
}
if (-not (Test-Path -LiteralPath $offlineComposeFile)) {
  throw "Offline Compose override is missing: $offlineComposeFile"
}
if (-not (Test-Path -LiteralPath $environmentFile)) {
  throw "Production environment example is missing: $environmentFile"
}

$testEnvironment = @{
  MYSQL_ROOT_PASSWORD = "compose-policy-root-password"
  MYSQL_PASSWORD = "compose-policy-app-password"
  OPENID_HMAC_SECRET = "compose-policy-openid-secret-32-bytes"
  WECHAT_APP_SECRET = "compose-policy-wechat-secret"
  USER_SESSION_PEPPER = "compose-policy-user-pepper-32-bytes"
  ADMIN_PASSWORD_HASH = '$argon2id$v=19$m=19456,t=2,p=1$dGVzdHNhbHQ$dGVzdGhhc2g'
  ADMIN_SESSION_SECRET = "compose-policy-admin-secret-32-bytes"
  RESTIC_PASSWORD = "compose-policy-restic-password"
}

try {
  foreach ($entry in $testEnvironment.GetEnumerator()) {
    Set-Item -LiteralPath "Env:$($entry.Key)" -Value $entry.Value
  }

  Push-Location $repositoryRoot
  try {
    $rendered = & docker compose --profile '*' --env-file $environmentFile -f $composeFile config --format json 2>&1
    if ($LASTEXITCODE -ne 0) {
      throw "docker compose config failed:`n$($rendered -join [Environment]::NewLine)"
    }
  } finally {
    Pop-Location
  }

  $config = ($rendered -join [Environment]::NewLine) | ConvertFrom-Json

  Push-Location $repositoryRoot
  try {
    $offlineRendered = & docker compose --profile '*' --env-file $environmentFile -f $composeFile -f $offlineComposeFile config --format json 2>&1
    if ($LASTEXITCODE -ne 0) {
      throw "offline docker compose config failed:`n$($offlineRendered -join [Environment]::NewLine)"
    }
  } finally {
    Pop-Location
  }

  $offlineConfig = ($offlineRendered -join [Environment]::NewLine) | ConvertFrom-Json
  $expectedOfflineImages = @{
    mysql = "kaifanla-mysql:8.4-b3b90af2"
    nginx = "kaifanla-nginx:stable-1e0bd91d"
    "nginx-bootstrap" = "kaifanla-nginx:stable-1e0bd91d"
    certbot = "kaifanla-certbot:latest-34ee91d2"
  }
  foreach ($entry in $expectedOfflineImages.GetEnumerator()) {
    if ($offlineConfig.services.($entry.Key).image -cne $entry.Value) {
      throw "Offline image mismatch for $($entry.Key)"
    }
  }
  foreach ($serviceName in @("mysql", "server", "nginx", "nginx-bootstrap", "certbot")) {
    if (-not $config.services.PSObject.Properties[$serviceName]) {
      throw "Missing production service: $serviceName"
    }
  }

  if ($config.services.mysql.ports) { throw "Production MySQL must not publish ports" }
  if ($config.services.server.ports) { throw "Next.js must not publish a host port" }
  if (-not $config.services.server.healthcheck) { throw "Server healthcheck is required" }
  if (-not $config.services.mysql.healthcheck) { throw "MySQL healthcheck is required" }
  if (-not $config.services.mysql.volumes) { throw "MySQL persistence is required" }
  if (-not $config.services.server.volumes) { throw "Upload persistence is required" }
  if (-not $config.services.server.read_only) { throw "Server root filesystem must be read-only" }
  if ($config.services.server.user -ne "10001:10001") { throw "Server must use UID/GID 10001" }

  $published = @($config.services.nginx.ports | ForEach-Object { [int]$_.published })
  if (80 -notin $published -or 443 -notin $published) {
    throw "Nginx must publish ports 80 and 443"
  }

  if (-not $config.networks.internal.internal) { throw "Application network must be internal" }
  foreach ($volumeName in @("mysql-data", "uploads", "nginx-acme", "nginx-certs")) {
    if (-not $config.volumes.PSObject.Properties[$volumeName]) {
      throw "Missing persistent volume: $volumeName"
    }
  }

  Write-Output "Production Compose policy passed"
} finally {
  foreach ($key in $testEnvironment.Keys) {
    Remove-Item -LiteralPath "Env:$key" -ErrorAction SilentlyContinue
  }
}
