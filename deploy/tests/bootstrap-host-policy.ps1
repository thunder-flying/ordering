$ErrorActionPreference = "Stop"

$repositoryRoot = (Resolve-Path (Join-Path $PSScriptRoot "../..")).Path
$scriptPath = Join-Path $repositoryRoot "deploy/scripts/bootstrap-host.sh"
if (-not (Test-Path -LiteralPath $scriptPath)) {
  throw "Host bootstrap script is missing: $scriptPath"
}

$text = Get-Content -Raw -LiteralPath $scriptPath
foreach ($required in @(
  'ID" != "alinux',
  'fallocate -l 2G /swapfile',
  '/swapfile none swap sw 0 0',
  'vm.swappiness=10',
  'mirrors.cloud.aliyuncs.com/docker-ce/linux/centos/docker-ce.repo',
  'dnf-plugin-releasever-adapter',
  'docker-compose-plugin',
  '--add-service=ssh',
  '--add-service=http',
  '--add-service=https',
  '/opt/kaifanla',
  '/var/lib/kaifanla/uploads',
  '/var/backups/kaifanla',
  '/etc/kaifanla',
  '/var/log/kaifanla',
  '"max-size": "10m"',
  '"max-file": "5"'
)) {
  if (-not $text.Contains($required)) {
    throw "Host bootstrap policy is missing: $required"
  }
}

if ($text.Contains('get.docker.com')) { throw "Host bootstrap must not use get.docker.com" }
if ($text -notmatch 'list-ports.*(?:3000|3306)') { throw "Host bootstrap must reject existing 3000/3306 firewall ports" }

Write-Output "Host bootstrap policy passed"
