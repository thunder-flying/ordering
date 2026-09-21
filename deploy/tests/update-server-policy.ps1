$ErrorActionPreference = "Stop"

$repositoryRoot = (Resolve-Path (Join-Path $PSScriptRoot "../..")).Path
$localScript = Join-Path $repositoryRoot "deploy/scripts/update-server.ps1"
$remoteScript = Join-Path $repositoryRoot "deploy/scripts/deploy.sh"

foreach ($requiredFile in @($localScript, $remoteScript)) {
  if (-not (Test-Path -LiteralPath $requiredFile)) {
    throw "Deployment update script is missing: $requiredFile"
  }
}

$localText = Get-Content -Raw -LiteralPath $localScript
$remoteText = Get-Content -Raw -LiteralPath $remoteScript

foreach ($required in @(
  'Invoke-External "docker"',
  '"build", "--platform"',
  '"save", "--output"',
  'Invoke-External "ssh"',
  'Invoke-External "scp"',
  'deploy/docker-compose.prod.yml',
  'deploy/nginx/templates',
  'deploy/nginx/snippets',
  'production.env',
  'private key'
)) {
  if (-not $localText.Contains($required)) {
    throw "Local update script is missing required behavior: $required"
  }
}

foreach ($forbidden in @(
  'DEPLOYMENT.md',
  'production.env.example',
  '.env.local',
  '.env.production',
  'source.env.upload',
  'ordering_aliyun_ed25519.pub',
  'git add',
  'git commit'
)) {
  if ($localText.Contains($forbidden)) {
    throw "Local update script must not upload or execute: $forbidden"
  }
}

foreach ($required in @(
  'stat -c ''%a'' "$ENV_FILE"',
  'docker load',
  'docker compose',
  'config',
  'prisma',
  'migrate',
  'health-check.sh',
  'APP_IMAGE',
  'TOOLING_IMAGE',
  'production.env'
)) {
  if (-not $remoteText.Contains($required)) {
    throw "Remote deployment script is missing required behavior: $required"
  }
}

foreach ($forbidden in @(
  'docker compose down',
  'docker system prune',
  'docker volume rm',
  'git pull',
  'git clone'
)) {
  if ($remoteText.Contains($forbidden)) {
    throw "Remote deployment script must not perform destructive or source-pulling action: $forbidden"
  }
}

Write-Output "Deployment update policy passed"
