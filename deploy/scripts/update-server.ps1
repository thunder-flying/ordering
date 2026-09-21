[CmdletBinding()]
param(
  [string] $ServerHost = "8.137.174.33",
  [int] $SshPort = 22,
  [string] $SshUser = "root",
  [string] $IdentityFile = (Join-Path $env:USERPROFILE ".ssh\ordering_aliyun_ed25519"),
  [string] $RemoteRoot = "/opt/kaifanla",
  [string] $RemoteEnvFile = "/etc/kaifanla/production.env",
  [string] $ReleaseId = ((Get-Date).ToUniversalTime().ToString("yyyyMMddTHHmmssZ")),
  [string] $Platform = "linux/amd64",
  [switch] $SkipChecks,
  [switch] $KeepArtifacts
)

$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest

function Invoke-External {
  param(
    [Parameter(Mandatory)] [string] $FilePath,
    [Parameter(Mandatory)] [string[]] $Arguments,
    [Parameter(Mandatory)] [string] $FailureMessage
  )

  & $FilePath @Arguments
  if ($LASTEXITCODE -ne 0) {
    throw "${FailureMessage}; exit code: $LASTEXITCODE"
  }
}

function Assert-Command {
  param([Parameter(Mandatory)] [string] $Name)

  if (-not (Get-Command $Name -ErrorAction SilentlyContinue)) {
    throw "Required command is missing: $Name"
  }
}

function ConvertTo-ShellLiteral {
  param([Parameter(Mandatory)] [string] $Value)

  return "'" + $Value.Replace("'", "'\''") + "'"
}

function Compress-Gzip {
  param(
    [Parameter(Mandatory)] [string] $InputPath,
    [Parameter(Mandatory)] [string] $OutputPath
  )

  $inputStream = [IO.File]::OpenRead($InputPath)
  $outputStream = [IO.File]::Create($OutputPath)
  $gzipStream = [IO.Compression.GZipStream]::new(
    $outputStream,
    [IO.Compression.CompressionMode]::Compress
  )

  try {
    $inputStream.CopyTo($gzipStream)
  }
  finally {
    $gzipStream.Dispose()
    $inputStream.Dispose()
    $outputStream.Dispose()
  }
}

function Assert-TemporaryPath {
  param([Parameter(Mandatory)] [string] $Path)

  $resolvedPath = [IO.Path]::GetFullPath($Path).TrimEnd([IO.Path]::DirectorySeparatorChar)
  $systemTemp = [IO.Path]::GetFullPath([IO.Path]::GetTempPath()).TrimEnd([IO.Path]::DirectorySeparatorChar)
  if (-not $resolvedPath.StartsWith($systemTemp + [IO.Path]::DirectorySeparatorChar, [StringComparison]::OrdinalIgnoreCase)) {
    throw "Refusing to clean a path outside the system temp directory: $resolvedPath"
  }
}

if ($SshPort -lt 1 -or $SshPort -gt 65535) {
  throw "SshPort must be between 1 and 65535"
}
if ($ServerHost -notmatch '^[A-Za-z0-9.-]+$') {
  throw "ServerHost contains unsupported characters"
}
if ($SshUser -notmatch '^[A-Za-z_][A-Za-z0-9_-]*$') {
  throw "SshUser contains unsupported characters"
}
if ($RemoteRoot -notmatch '^/[A-Za-z0-9._/-]+$' -or $RemoteRoot.Contains("..")) {
  throw "RemoteRoot must be a simple absolute POSIX path"
}
$RemoteRoot = $RemoteRoot.TrimEnd("/")
if ($RemoteEnvFile -notmatch '^/[A-Za-z0-9._/-]+$' -or $RemoteEnvFile.Contains("..")) {
  throw "RemoteEnvFile must be a simple absolute POSIX path"
}
if ([string]::IsNullOrWhiteSpace($ReleaseId) -or $ReleaseId -notmatch '^[A-Za-z0-9][A-Za-z0-9._-]*$') {
  throw "ReleaseId contains unsupported characters"
}
if ($Platform -notmatch '^[A-Za-z0-9._/-]+$') {
  throw "Platform contains unsupported characters"
}

$repositoryRoot = (Resolve-Path (Join-Path $PSScriptRoot "../..")).Path
$dockerfilePath = Join-Path $repositoryRoot "apps/server/Dockerfile"
$composePath = Join-Path $repositoryRoot "deploy/docker-compose.prod.yml"
$deployScriptPath = Join-Path $repositoryRoot "deploy/scripts/deploy.sh"
$healthScriptPath = Join-Path $repositoryRoot "deploy/scripts/health-check.sh"
$nginxTemplatesPath = Join-Path $repositoryRoot "deploy/nginx/templates"
$nginxSnippetsPath = Join-Path $repositoryRoot "deploy/nginx/snippets"

foreach ($requiredPath in @(
  $dockerfilePath,
  $composePath,
  $deployScriptPath,
  $healthScriptPath,
  $nginxTemplatesPath,
  $nginxSnippetsPath
)) {
  if (-not (Test-Path -LiteralPath $requiredPath)) {
    throw "Required deployment file is missing: $requiredPath"
  }
}
if (-not (Test-Path -LiteralPath $IdentityFile -PathType Leaf)) {
  throw "SSH private key is missing: $IdentityFile"
}

foreach ($commandName in @("docker", "pnpm", "ssh", "scp")) {
  Assert-Command $commandName
}

$artifactRoot = Join-Path ([IO.Path]::GetTempPath()) ("kaifanla-release-" + $ReleaseId + "-" + [Guid]::NewGuid().ToString("N"))
$imageTarPath = Join-Path $artifactRoot "images.tar"
$imageArchivePath = Join-Path $artifactRoot "images.tar.gz"
$appImage = "kaifanla-server:$ReleaseId"
$toolingImage = "kaifanla-tooling:$ReleaseId"
$remoteReleaseRoot = "$RemoteRoot/incoming/$ReleaseId"
$remoteTargetPrefix = "${SshUser}@${ServerHost}"
$sshOptions = @(
  "-p", $SshPort.ToString(),
  "-i", $IdentityFile,
  "-o", "BatchMode=yes",
  "-o", "IdentitiesOnly=yes"
)
$scpOptions = @(
  "-P", $SshPort.ToString(),
  "-i", $IdentityFile,
  "-o", "BatchMode=yes",
  "-o", "IdentitiesOnly=yes"
)

try {
  New-Item -ItemType Directory -Path $artifactRoot -Force | Out-Null

  if (-not $SkipChecks) {
    Write-Output "Running server verification..."
    Invoke-External "pnpm" @("run", "verify:server") "Server verification failed"
  }

  Write-Output "Building application image: $appImage"
  Invoke-External "docker" @(
    "build", "--platform", $Platform,
    "--tag", $appImage,
    "--file", $dockerfilePath,
    $repositoryRoot
  ) "Application image build failed"

  Write-Output "Building tooling image: $toolingImage"
  Invoke-External "docker" @(
    "build", "--platform", $Platform,
    "--target", "tooling",
    "--tag", $toolingImage,
    "--file", $dockerfilePath,
    $repositoryRoot
  ) "Tooling image build failed"

  Write-Output "Exporting images..."
  Invoke-External "docker" @(
    "save", "--output", $imageTarPath,
    $appImage, $toolingImage
  ) "Docker image export failed"
  Compress-Gzip -InputPath $imageTarPath -OutputPath $imageArchivePath
  Remove-Item -LiteralPath $imageTarPath -Force

  $remoteMkdirCommand = @(
    "set -eu",
    "mkdir -p -- $(ConvertTo-ShellLiteral $remoteReleaseRoot)",
    "mkdir -p -- $(ConvertTo-ShellLiteral "$remoteReleaseRoot/nginx/templates")",
    "mkdir -p -- $(ConvertTo-ShellLiteral "$remoteReleaseRoot/nginx/snippets")"
  ) -join "; "
  Invoke-External "ssh" ($sshOptions + @(
    "$remoteTargetPrefix",
    $remoteMkdirCommand
  )) "Failed to prepare the server release directory"

  $uploads = @(
    @{ Local = $imageArchivePath; Remote = "$remoteReleaseRoot/images.tar.gz" },
    @{ Local = $composePath; Remote = "$remoteReleaseRoot/docker-compose.prod.yml" },
    @{ Local = $deployScriptPath; Remote = "$remoteReleaseRoot/deploy.sh" },
    @{ Local = $healthScriptPath; Remote = "$remoteReleaseRoot/health-check.sh" }
  )
  foreach ($template in Get-ChildItem -LiteralPath $nginxTemplatesPath -File) {
    $uploads += @{ Local = $template.FullName; Remote = "$remoteReleaseRoot/nginx/templates/$($template.Name)" }
  }
  foreach ($snippet in Get-ChildItem -LiteralPath $nginxSnippetsPath -File) {
    $uploads += @{ Local = $snippet.FullName; Remote = "$remoteReleaseRoot/nginx/snippets/$($snippet.Name)" }
  }

  foreach ($upload in $uploads) {
    Write-Output "Uploading $([IO.Path]::GetFileName($upload.Local))..."
    Invoke-External "scp" ($scpOptions + @(
      $upload.Local,
      "${remoteTargetPrefix}:$($upload.Remote)"
    )) "Failed to upload $($upload.Local)"
  }

  $remoteDeployCommand = @(
    "bash $(ConvertTo-ShellLiteral "$remoteReleaseRoot/deploy.sh")",
    "--release-dir $(ConvertTo-ShellLiteral $remoteReleaseRoot)",
    "--app-root $(ConvertTo-ShellLiteral $RemoteRoot)",
    "--env-file $(ConvertTo-ShellLiteral $RemoteEnvFile)",
    "--app-image $(ConvertTo-ShellLiteral $appImage)",
    "--tooling-image $(ConvertTo-ShellLiteral $toolingImage)"
  ) -join " "
  $remoteDeployCommand = "set -eu; $remoteDeployCommand"
  Invoke-External "ssh" ($sshOptions + @(
    "$remoteTargetPrefix",
    $remoteDeployCommand
  )) "Remote deployment failed"

  Write-Output "Deployment succeeded: $ReleaseId"
}
finally {
  if (-not $KeepArtifacts -and (Test-Path -LiteralPath $artifactRoot)) {
    Assert-TemporaryPath $artifactRoot
    Remove-Item -LiteralPath $artifactRoot -Recurse -Force
  }
  elseif ($KeepArtifacts -and (Test-Path -LiteralPath $artifactRoot)) {
    Write-Output "Artifacts kept at: $artifactRoot"
  }
}
