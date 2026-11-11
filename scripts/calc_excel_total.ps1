param(
    [string]$xlsxPath = "F:\MedicaPharmacy\imports\DanhSachSanPham_KV08112026-223343-897.xlsx",
    [string]$medJsonPath = "F:\MedicaPharmacy\data\medicines.json"
)

Add-Type -AssemblyName System.IO.Compression.FileSystem
$tmp = Join-Path $env:TEMP ('kv_val_' + (Get-Random))
$tempZip = Join-Path $env:TEMP ('kv_zip_' + (Get-Random) + '.zip')
Copy-Item $xlsxPath $tempZip
[System.IO.Compression.ZipFile]::ExtractToDirectory($tempZip, $tmp)
Remove-Item $tempZip

$ssFile = Join-Path $tmp 'xl\sharedStrings.xml'
[xml]$ssXml = Get-Content $ssFile -Encoding UTF8
$strArr = @($ssXml.sst.si | ForEach-Object {
    if ($_.t) { $_.t } elseif ($_.r) { ($_.r | ForEach-Object { $_.t }) -join '' } else { '' }
})

function Get-Val($cell) {
    if ($null -eq $cell) { return '' }
    if ($cell.is -and $cell.is.t) { return $cell.is.t }
    $v = $cell.v
    if ($null -eq $v -or $v -eq '') { return '' }
    if ($cell.t -eq 's' -and $strArr -and $strArr.Count -gt [int]$v) { return $strArr[[int]$v] }
    return $v
}

$sheetFile = (Get-ChildItem (Join-Path $tmp 'xl\worksheets') -Filter 'sheet*.xml' | Sort-Object Length -Descending)[0].FullName
[xml]$ws = Get-Content $sheetFile -Encoding UTF8
$rows = $ws.worksheet.sheetData.row

$excelTotalVal = 0.0
$excelItems = @{}
$excelSubCosts = @{}

for ($i = 1; $i -lt $rows.Count; $i++) {
    $r = $rows[$i]
    $cells = @{}
    foreach ($c in $r.c) { $cells[$c.r -replace '\d+', ''] = $c }

    $code = Get-Val $cells['C']
    if ([string]::IsNullOrWhiteSpace($code) -or $code -eq 'Mã hàng') { continue }

    $baseCode = Get-Val $cells['P']
    $name     = Get-Val $cells['E']
    $unit     = Get-Val $cells['O']
    $cost  = 0.0; try { $val = Get-Val $cells['I'];  if ($val) { $cost  = [double]$val } } catch {}
    $stock = 0.0; try { $val = Get-Val $cells['J']; if ($val) { $stock = [double]$val } } catch {}
    $ratio = 1.0; try { $val = Get-Val $cells['Q']; if ($val) { $ratio = [double]$val } } catch {}

    if ([string]::IsNullOrWhiteSpace($baseCode)) {
        $excelItems[$code] = @{
            code = $code
            name = $name
            unit = $unit
            cost = $cost
            stock = $stock
        }
        if ($stock -gt 0 -and $cost -gt 0) {
            $excelTotalVal += ($stock * $cost)
        }
    } else {
        if (-not $excelSubCosts.ContainsKey($baseCode)) {
            $excelSubCosts[$baseCode] = @{}
        }
        $excelSubCosts[$baseCode][$unit] = @{
            code = $code
            unit = $unit
            ratio = $ratio
            cost = $cost
        }
    }
}
Remove-Item $tmp -Recurse -Force

Write-Host "KiotViet Excel Total Inventory Value (Exact sum of BaseStock * BaseCost):"
Write-Host "  $([Math]::Round($excelTotalVal, 2).ToString('N2')) đ"

# Now calculate on current medicines.json
$meds = Get-Content $medJsonPath -Raw | ConvertFrom-Json
$jsonTotalVal = 0.0

foreach ($m in $meds) {
    $stock = [double]$m.stockUnits
    $packRatio = if ([double]$m.packRatio -gt 0) { [double]$m.packRatio } else { 1.0 }
    $costPrice = [double]$m.costPrice
    $unitCost = $costPrice / $packRatio
    if ($stock -gt 0 -and $costPrice -gt 0) {
        $jsonTotalVal += ($stock * $unitCost)
    }
}

Write-Host "`nCurrent medicines.json Total Inventory Value:"
Write-Host "  $([Math]::Round($jsonTotalVal, 2).ToString('N2')) đ"
Write-Host "`nDifference (JSON - Excel): $([Math]::Round($jsonTotalVal - $excelTotalVal, 2).ToString('N2')) đ"
