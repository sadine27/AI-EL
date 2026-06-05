$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$root = Split-Path -Parent $scriptDir
. (Join-Path $scriptDir "server-common.ps1")
$port = 8091
$listener = [System.Net.Sockets.TcpListener]::new([System.Net.IPAddress]::Any, $port)
$listener.Start()

Write-Host "Smart Parking LAN server running on port $port"

function Get-ContentType([string]$path) {
  switch ([IO.Path]::GetExtension($path).ToLowerInvariant()) {
    ".html" { return "text/html; charset=utf-8" }
    ".css" { return "text/css; charset=utf-8" }
    ".js" { return "text/javascript; charset=utf-8" }
    ".json" { return "application/json; charset=utf-8" }
    ".png" { return "image/png" }
    ".jpg" { return "image/jpeg" }
    ".jpeg" { return "image/jpeg" }
    ".svg" { return "image/svg+xml" }
    default { return "application/octet-stream" }
  }
}

function Get-RuntimeConfigBody {
  $envPath = Join-Path $root ".env"
  $config = [ordered]@{
    googleMapsApiKey = ""
    geocoding = ""
  }

  if (Test-Path $envPath -PathType Leaf) {
    foreach ($line in Get-Content -LiteralPath $envPath) {
      $trimmed = $line.Trim()
      if ([string]::IsNullOrWhiteSpace($trimmed) -or $trimmed.StartsWith("#") -or -not $trimmed.Contains("=")) {
        continue
      }

      $parts = $trimmed.Split("=", 2)
      $name = $parts[0].Trim()
      $value = $parts[1].Trim().Trim('"').Trim("'")
      if ($name -in @("GOOGLE_MAPS_API_KEY", "GOOGLE_API_KEY", "GOOGLE_PLACES_API_KEY")) {
        $config.googleMapsApiKey = $value
      }
      if ($name -in @("geocoding", "GEOCODING_API_KEY")) {
        $config.geocoding = $value
      }
    }
  }

  return [Text.Encoding]::UTF8.GetBytes(($config | ConvertTo-Json -Compress))
}

try {
  while ($true) {
    $client = $listener.AcceptTcpClient()
    try {
      $stream = $client.GetStream()
      $reader = [System.IO.StreamReader]::new($stream)
      $requestLine = $reader.ReadLine()
      if ([string]::IsNullOrWhiteSpace($requestLine)) { continue }

      while ($true) {
        $headerLine = $reader.ReadLine()
        if ([string]::IsNullOrEmpty($headerLine)) { break }
      }

      $parts = $requestLine.Split(" ")
      $relative = if ($parts.Length -ge 2) { Get-SafeRelativePath $parts[1] } else { "index.html" }

      if ($relative -eq "runtime-config.json") {
        $bytes = Get-RuntimeConfigBody
        $headers = @(
          "HTTP/1.1 200 OK",
          "Content-Type: application/json; charset=utf-8",
          "Content-Length: $($bytes.Length)",
          "Cache-Control: no-store",
          "Connection: close",
          "",
          ""
        ) -join "`r`n"
        $headerBytes = [Text.Encoding]::ASCII.GetBytes($headers)
        $stream.Write($headerBytes, 0, $headerBytes.Length)
        $stream.Write($bytes, 0, $bytes.Length)
        $stream.Flush()
        continue
      }

      if (Test-HiddenRelativePath $relative) {
        $body = [Text.Encoding]::UTF8.GetBytes("Not found")
        $headers = @(
          "HTTP/1.1 404 Not Found",
          "Content-Type: text/plain; charset=utf-8",
          "Content-Length: $($body.Length)",
          "Connection: close",
          "",
          ""
        ) -join "`r`n"
        $headerBytes = [Text.Encoding]::ASCII.GetBytes($headers)
        $stream.Write($headerBytes, 0, $headerBytes.Length)
        $stream.Write($body, 0, $body.Length)
        $stream.Flush()
        continue
      }

      $file = Resolve-StaticFilePath $root $relative

      if ($file -and (Test-Path $file -PathType Leaf)) {
        $bytes = [IO.File]::ReadAllBytes($file)
        $headers = @(
          "HTTP/1.1 200 OK",
          "Content-Type: $(Get-ContentType $file)",
          "Content-Length: $($bytes.Length)",
          "Connection: close",
          "",
          ""
        ) -join "`r`n"
        $headerBytes = [Text.Encoding]::ASCII.GetBytes($headers)
        $stream.Write($headerBytes, 0, $headerBytes.Length)
        $stream.Write($bytes, 0, $bytes.Length)
      }
      else {
        $body = [Text.Encoding]::UTF8.GetBytes("Not found")
        $headers = @(
          "HTTP/1.1 404 Not Found",
          "Content-Type: text/plain; charset=utf-8",
          "Content-Length: $($body.Length)",
          "Connection: close",
          "",
          ""
        ) -join "`r`n"
        $headerBytes = [Text.Encoding]::ASCII.GetBytes($headers)
        $stream.Write($headerBytes, 0, $headerBytes.Length)
        $stream.Write($body, 0, $body.Length)
      }

      $stream.Flush()
    }
    finally {
      $client.Close()
    }
  }
}
finally {
  $listener.Stop()
}
