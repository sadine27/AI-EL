function Get-SafeRelativePath([string]$rawPath, [string]$defaultPath = "index.html") {
  $pathOnly = ($rawPath -split "\?")[0]
  $relative = [Uri]::UnescapeDataString($pathOnly).TrimStart("/", "\")
  if ([string]::IsNullOrWhiteSpace($relative)) {
    return $defaultPath
  }
  return $relative -replace "/", "\"
}

function Test-HiddenRelativePath([string]$relative) {
  return ($relative -split "[\\/]" | Where-Object { $_.StartsWith(".") }).Count -gt 0
}

function Resolve-StaticFilePath([string]$root, [string]$relative) {
  $rootFull = [IO.Path]::GetFullPath($root)
  if (-not $rootFull.EndsWith([IO.Path]::DirectorySeparatorChar)) {
    $rootFull = $rootFull + [IO.Path]::DirectorySeparatorChar
  }

  $candidate = [IO.Path]::GetFullPath((Join-Path $rootFull $relative))
  if (-not $candidate.StartsWith($rootFull, [StringComparison]::OrdinalIgnoreCase)) {
    return $null
  }
  return $candidate
}
