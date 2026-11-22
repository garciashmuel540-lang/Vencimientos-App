# Windows PowerShell 5.1+; run inside the store network.
$ErrorActionPreference = 'Stop'
foreach ($key in 'RMH_CONNECTION','VIGIA_URL','VIGIA_PUBLIC_KEY','VIGIA_SYNC_EMAIL','VIGIA_SYNC_PASSWORD') {
    if (-not [Environment]::GetEnvironmentVariable($key)) { throw "Falta $key" }
}
$base = $env:VIGIA_URL.TrimEnd('/')
if (([uri]$base).Scheme -ne 'https') { throw 'VIGIA_URL requiere HTTPS.' }
$headers = @{ apikey = $env:VIGIA_PUBLIC_KEY }
$login = @{ email = $env:VIGIA_SYNC_EMAIL; password = $env:VIGIA_SYNC_PASSWORD } | ConvertTo-Json -Compress
$session = Invoke-RestMethod -Method Post -Uri "$base/auth/v1/token?grant_type=password" -Headers $headers -ContentType 'application/json' -Body $login
$store = $session.user.app_metadata.rmh_store
if (-not $store -or $session.user.app_metadata.rmh_publisher -ne $true) { throw 'La cuenta no tiene autorización para publicar esta tienda.' }

$captured = [DateTime]::UtcNow.ToString('o')
$conn = New-Object System.Data.SqlClient.SqlConnection($env:RMH_CONNECTION)
$items = [System.Collections.Generic.List[object]]::new()
$seen = [System.Collections.Generic.HashSet[string]]::new([StringComparer]::Ordinal)
try {
    $conn.Open()
    $cmd = $conn.CreateCommand()
    $cmd.CommandText = 'SELECT barcode, name, price, stock FROM dbo.VigiaCatalog'
    $reader = $cmd.ExecuteReader()
    while ($reader.Read()) {
        $code = ([string]$reader['barcode']).Trim()
        $name = ([string]$reader['name']).Trim()
        if (-not $code -or -not $name -or -not $seen.Add($code)) { throw 'Nombre o código vacío, o código duplicado en la vista.' }
        $price = if (-not $reader.IsDBNull(2)) { [decimal]$reader.GetValue(2) }
        $stock = if (-not $reader.IsDBNull(3)) { [decimal]$reader.GetValue(3) }
        if ($null -ne $price -and $price -lt 0) { throw 'Precio negativo en la vista.' }
        $items.Add(@{barcode=$code; name=$name; price=$price; stock=$stock})
    }
} finally { $conn.Dispose() }
if (-not $items.Count) { throw 'La vista está vacía. Se conserva el catálogo anterior.' }
$body = @{store_id=$store; captured_at=$captured; products=$items.ToArray()} | ConvertTo-Json -Depth 4 -Compress
$headers.Authorization = "Bearer $($session.access_token)"
$headers.Prefer = 'resolution=merge-duplicates,return=minimal'
Invoke-RestMethod -Method Post -Uri "$base/rest/v1/rmh_catalogs?on_conflict=store_id" -Headers $headers -ContentType 'application/json; charset=utf-8' -Body ([Text.Encoding]::UTF8.GetBytes($body)) | Out-Null
Write-Output "Tienda $store - $($items.Count) artículos publicados."
