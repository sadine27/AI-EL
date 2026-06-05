$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$root = Split-Path -Parent $scriptDir
. (Join-Path $scriptDir "server-common.ps1")
$port = 8443

$listener = [System.Net.HttpListener]::new()
$listener.Prefixes.Add("https://localhost:$port/")
$listener.Prefixes.Add("https://127.0.0.1:$port/")
$listener.Start()

Write-Host "Smart Parking website running at https://localhost:$port"

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
  while ($listener.IsListening) {
    $context = $listener.GetContext()

    try {
      $relative = Get-SafeRelativePath $context.Request.Url.PathAndQuery

      if ($relative -eq "runtime-config.json") {
        $bytes = Get-RuntimeConfigBody
        $context.Response.StatusCode = 200
        $context.Response.ContentType = "application/json; charset=utf-8"
        $context.Response.Headers["Cache-Control"] = "no-store"
        $context.Response.ContentLength64 = $bytes.Length
        $context.Response.OutputStream.Write($bytes, 0, $bytes.Length)
        continue
      }

      if (Test-HiddenRelativePath $relative) {
        $body = [Text.Encoding]::UTF8.GetBytes("Not found")
        $context.Response.StatusCode = 404
        $context.Response.ContentType = "text/plain; charset=utf-8"
        $context.Response.ContentLength64 = $body.Length
        $context.Response.OutputStream.Write($body, 0, $body.Length)
        continue
      }

      $file = Resolve-StaticFilePath $root $relative

      if ($file -and (Test-Path $file -PathType Leaf)) {
        $extension = [IO.Path]::GetExtension($file).ToLowerInvariant()
        $contentType = switch ($extension) {
          ".html" { "text/html; charset=utf-8" }
          ".css"  { "text/css; charset=utf-8" }
          ".js"   { "text/javascript; charset=utf-8" }
          ".json" { "application/json; charset=utf-8" }
          ".png"  { "image/png" }
          ".jpg"  { "image/jpeg" }
          ".jpeg" { "image/jpeg" }
          ".svg"  { "image/svg+xml" }
          default { "application/octet-stream" }
        }

        $bytes = [IO.File]::ReadAllBytes($file)
        $context.Response.StatusCode = 200
        $context.Response.ContentType = $contentType
        $context.Response.ContentLength64 = $bytes.Length
        $context.Response.OutputStream.Write($bytes, 0, $bytes.Length)
      }
      else {
        $body = [Text.Encoding]::UTF8.GetBytes("Not found")
        $context.Response.StatusCode = 404
        $context.Response.ContentType = "text/plain; charset=utf-8"
        $context.Response.ContentLength64 = $body.Length
        $context.Response.OutputStream.Write($body, 0, $body.Length)
      }
    }
    finally {
      $context.Response.OutputStream.Close()
    }
  }
}
finally {
  $listener.Stop()
  $listener.Close()
}
