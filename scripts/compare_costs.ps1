param(
    [string]$xlsxPath = "F:\MedicaPharmacy\imports\DanhSachSanPham_KV08112026-223343-897.xlsx",
    [string]$medJsonPath = "F:\MedicaPharmacy\data\medicines.json"
)

Add-Type -AssemblyName System.IO.Compression.FileSystem
$tmp = Join-Path $env:TEMP ('kv_cmp_' + (Get-Random))
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

# Load Excel products
# Map by Code and also by BaseCode
$excelItems = @{}
$excelSubUnits = @{}

for ($i = 1; $i -lt $rows.Count; $i++) {
    $r = $rows[$i]
    $cells = @{}
    foreach ($c in $r.c) { $cells[$c.r -replace '\d+', ''] = $c }

    $code = Get-Val $cells['C']
    if ([string]::IsNullOrWhiteSpace($code) -or $code -eq 'Mã hàng') { continue }

    $baseCode = Get-Val $cells['P']
    $name     = Get-Val $cells['E']
    $unit     = Get-Val $cells['O']
    $ratio = 1.0; try { $val = Get-Val $cells['Q']; if ($val) { $ratio = [double]$val } } catch {}
    $stock = 0.0; try { $val = Get-Val $cells['J']; if ($val) { $stock = [double]$val } } catch {}
    $cost  = 0.0; try { $val = Get-Val $cells['I']; if ($val) { $cost  = [double]$val } } catch {}
    $price = 0.0; try { $val = Get-Val $cells['H']; if ($val) { $price = [double]$val } } catch {}

    if ([string]::IsNullOrWhiteSpace($baseCode)) {
        $excelItems[$code] = @{
            code = $code
            name = $name
            unit = $unit
            cost = $cost
            stock = $stock
            price = $price
        }
    } else {
        if (-not $excelSubUnits.ContainsKey($baseCode)) {
            $excelSubUnits[$baseCode] = [System.Collections.Generic.List[hashtable]]::new()
        }
        $excelSubUnits[$baseCode].Add(@{
            code = $code
            baseCode = $baseCode
            name = $name
            unit = $unit
            ratio = $ratio
            cost = $cost
            stock = $stock
            price = $price
        })
    }
}
Remove-Item $tmp -Recurse -Force

Write-Host "Excel base items: $($excelItems.Count)"
Write-Host "Excel items with sub-units: $($excelSubUnits.Count)"

# Load current medicines.json
$medicines = Get-Content $medJsonPath -Raw | ConvertFrom-Json
Write-Host "Current medicines in json: $($medicines.Count)"

# Check cost differences
$diffs = [System.Collections.Generic.List[PSCustomObject]]::new()

foreach ($m in $medicines) {
    $code = $m.id
    if (-not $excelItems.ContainsKey($code)) {
        continue
    }

    $b = $excelItems[$code]
    # In MedicaPharmacy:
    # m.costPrice is the cost of m.packUnit!
    # If the item has subUnits in Excel:
    $expectedCost = $b.cost
    if ($excelSubUnits.ContainsKey($code)) {
        $subs = $excelSubUnits[$code]
        # find the sub matching m.packUnit
        $packSub = $subs | Where-Object { $_.unit -eq $m.packUnit }
        if ($packSub -and $packSub.cost -gt 0) {
            $expectedCost = $packSub.cost
        } elseif ($b.cost -gt 0 -and $m.packRatio -gt 1) {
            $expectedCost = $b.cost * $m.packRatio
        }
    }

    $curCost = [double]$m.costPrice
    $diff = [Math]::Abs($curCost - $expectedCost)

    if ($diff -gt 0.01) {
        $diffs.Add([PSCustomObject]@{
            Id = $m.id
            Name = $m.name
            PackUnit = $m.packUnit
            BaseUnit = $m.baseUnit
            PackRatio = $m.packRatio
            CurCostInJson = $curCost
            ExcelBaseCost = $b.cost
            ExpectedCost = $expectedCost
            Diff = $diff
        })
    }
}

Write-Host "`nTotal items with cost difference: $($diffs.Count)"
Write-Host "Sample 20 differences:"
$diffs | Select-Object -First 20 | Format-Table Id, Name, PackUnit, PackRatio, CurCostInJson, ExpectedCost, Diff -AutoSize
