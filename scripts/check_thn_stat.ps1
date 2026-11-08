$xlsxPath = "C:\Users\qoffe\.gemini\antigravity\brain\d37817d0-d77b-4e5e-85fe-68b9f7c78692\.user_uploaded\media_1794081928382_aa3c4a53.xlsx"
$tmpDir = "$env:TEMP\thn_stat_$(Get-Random)"
Add-Type -AssemblyName System.IO.Compression.FileSystem
[System.IO.Compression.ZipFile]::ExtractToDirectory($xlsxPath, $tmpDir)

$ssFile = "$tmpDir\xl\sharedStrings.xml"
$strings = @()
if (Test-Path $ssFile) {
    [xml]$ss = Get-Content $ssFile -Encoding UTF8
    $strings = @($ss.sst.si | ForEach-Object {
        $si = $_
        if ($si.r) {
            ($si.r | ForEach-Object { $_.t } | Where-Object { $_ -ne $null }) -join ''
        } elseif ($si.t -ne $null) {
            $t = $si.t
            if ($t -is [System.Xml.XmlElement]) { $t.'#text' } else { $t }
        } else { '' }
    })
}

[xml]$ws = Get-Content "$tmpDir\xl\worksheets\sheet2.xml" -Encoding UTF8
$rows = $ws.worksheet.sheetData.row

function Get-CellVal($c) {
    if ($null -eq $c) { return '' }
    $v = $c.v
    if ($null -eq $v) { return '' }
    if ($c.t -eq 's' -and $strings.Count -gt 0) { return $strings[[int]$v] }
    return $v
}

$thnOrders = @{}
$skipFirst = $true

foreach ($row in $rows) {
    if ($skipFirst) { $skipFirst = $false; continue }
    $cells = @{}
    foreach ($c in $row.c) {
        $col = $c.r -replace '\d+', ''
        $cells[$col] = $c
    }

    $thnId = Get-CellVal $cells['B']
    if (-not $thnId) { continue }

    if (-not $thnOrders.ContainsKey($thnId)) {
        $oa = Get-CellVal $cells['C']
        $dt = ''
        if ($oa) { $dt = [DateTime]::FromOADate([double]$oa).ToString('yyyy-MM-dd HH:mm:ss') }
        $thnOrders[$thnId] = @{
            id = $thnId
            date = $dt
            sup = Get-CellVal $cells['F']
            total = Get-CellVal $cells['L']
            items = 0
        }
    }
    $thnOrders[$thnId].items++
}

Write-Host "Total rows: $($rows.Count - 1)"
Write-Host "Unique THN orders: $($thnOrders.Count)"
$sorted = $thnOrders.Values | Sort-Object date
Write-Host "Earliest: $($sorted[0].id) on $($sorted[0].date)"
Write-Host "Latest: $($sorted[-1].id) on $($sorted[-1].date)"

Remove-Item $tmpDir -Recurse -Force
