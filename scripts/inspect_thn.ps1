$xlsxPath = "C:\Users\qoffe\.gemini\antigravity\brain\d37817d0-d77b-4e5e-85fe-68b9f7c78692\.user_uploaded\media_1794081928382_aa3c4a53.xlsx"
$tmpDir = "$env:TEMP\thn_check_$(Get-Random)"
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
Write-Host "Shared strings: $($strings.Count)"

[xml]$ws = Get-Content "$tmpDir\xl\worksheets\sheet2.xml" -Encoding UTF8
$rows = $ws.worksheet.sheetData.row
Write-Host "Total rows (incl header): $($rows.Count)"

function Get-CellVal($c) {
    if ($null -eq $c) { return '' }
    $v = $c.v
    if ($null -eq $v) { return '' }
    if ($c.t -eq 's' -and $strings.Count -gt 0) { return $strings[[int]$v] }
    return $v
}

Write-Host "`nRow 1 (Header):"
foreach ($c in $rows[0].c) {
    Write-Host "  $($c.r): $(Get-CellVal $c)"
}

Write-Host "`nRow 2 (Sample data):"
foreach ($c in $rows[1].c) {
    Write-Host "  $($c.r): $(Get-CellVal $c)"
}

Remove-Item $tmpDir -Recurse -Force
