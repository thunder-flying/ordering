$ErrorActionPreference = "Stop"

$repositoryRoot = (Resolve-Path (Join-Path $PSScriptRoot "..\..")).Path
$scriptPath = Join-Path $repositoryRoot "deploy\scripts\seed-production.sh"

if (-not (Test-Path -LiteralPath $scriptPath -PathType Leaf)) {
  throw "Production seed script is missing: $scriptPath"
}

$script = Get-Content -Raw -LiteralPath $scriptPath

foreach ($required in @(
  'set -euo pipefail',
  '/opt/kaifanla',
  '/etc/kaifanla/production.env',
  'docker compose',
  '--profile tools',
  'ps -q mysql',
  '--no-deps',
  'docker image inspect "$tooling_image"',
  '--entrypoint /bin/sh',
  '--workdir /app/apps/server',
  'exec node node_modules/tsx/dist/cli.mjs prisma/seed.ts',
  'UPLOAD_VOLUME=kaifanla_uploads',
  '/var/lib/kaifanla/uploads'
)) {
  if (-not $script.Contains($required)) {
    throw "Production seed script is missing required behavior: $required"
  }
}

if ($script -match '--pull|docker compose.*down|docker volume rm|docker system prune|git (pull|reset|checkout)') {
  throw "Production seed script contains an unsafe destructive or source-changing command"
}

Write-Output "Production seed policy passed"
