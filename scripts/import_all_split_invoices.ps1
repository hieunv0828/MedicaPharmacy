<#
.SYNOPSIS
    Import tất cả các file hóa đơn bán lẻ được chia nhỏ trong thư mục imports/ vào orders_2026.json
#>

$ordersPath    = "f:\MedicaPharmacy\data\orders_2026.json"
$vouchersPath  = "f:\MedicaPharmacy\data\vouchers_2026.json"
$medicinesPath = "f:\MedicaPharmacy\data\medicines.json"
$importsDir    = "f:\MedicaPharmacy\imports"

Write-Host "==========================================================" -ForegroundColor Cyan
Write-Host ">>> BẮT ĐẦU IMPORT TẤT CẢ FILE HÓA ĐƠN TỪ THƯ MỤC IMPORTS" -ForegroundColor Cyan
Write-Host "==========================================================" -ForegroundColor Cyan

$files = Get-ChildItem $importsDir -Filter "DanhSachChiTietHoaDon_*.xlsx" | Sort-Object Name
if ($files.Count -eq 0) {
    Write-Error "Không tìm thấy file DanhSachChiTietHoaDon_*.xlsx nào trong $importsDir"
    exit 1
}

Write-Host "Tìm thấy $($files.Count) file hóa đơn cần import:"
$files | ForEach-Object { Write-Host " - $($_.Name) ($([Math]::Round($_.Length / 1KB)) KB)" }

# 1. Backup an toàn
Copy-Item $ordersPath "$ordersPath.bak_batch" -Force
Copy-Item $vouchersPath "$vouchersPath.bak_batch" -Force
Write-Host "Đã tạo bản backup an toàn trước khi nạp." -ForegroundColor Yellow

# 2. Load thuốc
$medMap = @{}
if (Test-Path $medicinesPath) {
    $meds = Get-Content $medicinesPath -Raw -Encoding UTF8 | ConvertFrom-Json
    foreach ($m in $meds) {
        if ($m.id) { $medMap[$m.id] = $m }
        if ($m.barcode) { $medMap[$m.barcode] = $m }
    }
}
Write-Host "Đã load $($medMap.Count) thuốc từ danh mục để map giá vốn."

# 3. Load danh sách đơn hiện có
$existingOrders = @()
if (Test-Path $ordersPath) {
    $existingOrders = Get-Content $ordersPath -Raw -Encoding UTF8 | ConvertFrom-Json
}
$existOrderMap = [System.Collections.Generic.Dictionary[string, bool]]::new()
foreach ($o in $existingOrders) {
    if ($o.id) { $existOrderMap[$o.id] = $true }
}
Write-Host "Hiện có $($existingOrders.Count) đơn hàng trong database."

# 4. Load vouchers hiện có (dùng List để thêm cực nhanh)
$vouchersList = [System.Collections.Generic.List[object]]::new()
$voucherMap = [System.Collections.Generic.Dictionary[string, object]]::new()
if (Test-Path $vouchersPath) {
    $rawVouchers = Get-Content $vouchersPath -Raw -Encoding UTF8 | ConvertFrom-Json
    foreach ($v in $rawVouchers) {
        $vouchersList.Add($v)
        if ($v.id -and -not $voucherMap.ContainsKey($v.id)) {
            $voucherMap[$v.id] = $v
        }
    }
}
Write-Host "Hiện có $($vouchersList.Count) phiếu thu chi trong sổ quỹ."

Add-Type -AssemblyName System.IO.Compression.FileSystem

function Get-Val($c, $strArr) {
    if ($null -eq $c) { return '' }
    if ($c.t -eq 's' -and $c.v) { return $strArr[[int]$c.v] }
    if ($c.is -and $c.is.t) { return $c.is.t }
    if ($c.v) { return $c.v }
    return ''
}

function Convert-OADate($oaVal) {
    if ([string]::IsNullOrEmpty($oaVal)) { return '' }
    if ($oaVal -match '^(\d{1,2})/(\d{1,2})/(\d{4})') {
        try {
            $d = $matches[1].PadLeft(2, '0')
            $m = $matches[2].PadLeft(2, '0')
            $y = $matches[3]
            $timePart = if ($oaVal -match '\d{2}:\d{2}') { $matches[0] + ":00" } else { "08:00:00" }
            return "$y-$m-${d}T${timePart}+07:00"
        } catch {}
    }
    try {
        $dt = [DateTime]::FromOADate([double]$oaVal)
        return $dt.ToString('yyyy-MM-ddTHH:mm:ss+07:00')
    } catch { return '' }
}

$newOrdersTotal = [System.Collections.Generic.List[object]]::new()
$vouchersAddedCount = 0
$vouchersUpdatedCount = 0

foreach ($f in $files) {
    Write-Host "`n>>> Đang xử lý file: $($f.Name)..." -ForegroundColor Cyan
    $tmpDir = Join-Path $env:TEMP ("import_batch_" + (Get-Random))
    New-Item -ItemType Directory -Path $tmpDir | Out-Null

    try {
        [System.IO.Compression.ZipFile]::ExtractToDirectory($f.FullName, $tmpDir)

        # Đọc sharedStrings nếu có
        $ssFile = Join-Path $tmpDir "xl\sharedStrings.xml"
        $strings = @()
        if (Test-Path $ssFile) {
            [xml]$ss = Get-Content $ssFile -Encoding UTF8
            $strings = @($ss.sst.si | ForEach-Object {
                $si = $_
                if ($si.r) { ($si.r | ForEach-Object { $_.t } | Where-Object { $_ -ne $null }) -join '' }
                elseif ($si.t -ne $null) { $t = $si.t; if ($t -is [System.Xml.XmlElement]) { $t.'#text' } else { $t } }
                else { '' }
            })
        }

        # Sheet file
        $sheetFile = (Get-ChildItem (Join-Path $tmpDir "xl\worksheets") -Filter "sheet*.xml" | Sort-Object Length -Descending)[0].FullName
        [xml]$ws = Get-Content $sheetFile -Encoding UTF8
        $rows = $ws.worksheet.sheetData.row

        $fileOrdersDict = [System.Collections.Generic.Dictionary[string, object]]::new()
        $skipFirst = $true

        foreach ($row in $rows) {
            if ($skipFirst) { $skipFirst = $false; continue }
            $cells = @{}
            foreach ($c in $row.c) { $col = $c.r -replace '\d+', ''; $cells[$col] = $c }

            $invId = Get-Val $cells['B'] $strings
            if ([string]::IsNullOrEmpty($invId) -or $invId -eq 'Mã hóa đơn') { continue }

            # Nếu đơn này đã có trong database hoặc đã xử lý ở file trước -> bỏ qua
            if ($existOrderMap.ContainsKey($invId)) { continue }

            $timeRaw     = Get-Val $cells['C'] $strings
            $createdAt   = Convert-OADate $timeRaw

            $custId      = Get-Val $cells['G'] $strings
            $custName    = Get-Val $cells['H'] $strings
            $custPhone   = Get-Val $cells['J'] $strings
            $seller      = Get-Val $cells['P'] $strings
            $note        = Get-Val $cells['S'] $strings
            $finalAmt    = Get-Val $cells['V'] $strings
            $cashAmt     = Get-Val $cells['X'] $strings
            $transferAmt = Get-Val $cells['AA'] $strings

            $medCode     = Get-Val $cells['AE'] $strings
            $medName     = Get-Val $cells['AG'] $strings
            $unit        = Get-Val $cells['AI'] $strings
            $qty         = Get-Val $cells['AK'] $strings
            $price       = Get-Val $cells['AL'] $strings
            $itemTotal   = Get-Val $cells['AP'] $strings

            # Xác định hình thức thanh toán
            $pMethod = 'cash'
            $cVal = 0.0; $tVal = 0.0
            if ($cashAmt) { try { $cVal = [double]$cashAmt } catch {} }
            if ($transferAmt) { try { $tVal = [double]$transferAmt } catch {} }
            if ($tVal -gt 0) { $pMethod = 'transfer' }

            if (-not $fileOrdersDict.ContainsKey($invId)) {
                $fileOrdersDict[$invId] = [PSCustomObject]@{
                    id            = $invId
                    customerId    = $custId
                    customerName  = if ($custName) { $custName } else { "Khách lẻ" }
                    customerPhone = $custPhone
                    pharmacist    = if ($seller) { $seller } else { "admin" }
                    note          = $note
                    totalAmount   = [Math]::Round([double]$finalAmt)
                    paymentMethod = $pMethod
                    status        = 'completed'
                    createdAt     = $createdAt
                    items         = [System.Collections.Generic.List[object]]::new()
                    returns       = @()
                    totalRefunded = 0
                }
            }

            # Giá vốn ước tính
            $unitCost = 0
            if ($medMap.ContainsKey($medCode)) {
                $m = $medMap[$medCode]
                $unitCost = if ($m.costPrice) { [Math]::Round([double]$m.costPrice) } else { 0 }
            }

            $itemObj = [PSCustomObject]@{
                medicineId   = $medCode
                medicineName = if ($medName) { $medName } else { $medCode }
                unit         = if ($unit) { $unit } else { "Đơn vị" }
                quantity     = if ($qty) { [double]$qty } else { 1 }
                price        = if ($price) { [Math]::Round([double]$price) } else { 0 }
                costPrice    = $unitCost
                total        = if ($itemTotal) { [Math]::Round([double]$itemTotal) } else { 0 }
            }
            $fileOrdersDict[$invId].items.Add($itemObj)
        }

        $fileNewCount = $fileOrdersDict.Count
        Write-Host "  -> Tìm thấy $fileNewCount đơn hàng mới trong file này." -ForegroundColor Green

        foreach ($ord in @($fileOrdersDict.Values)) {
            if (-not $ord -or -not $ord.id) { continue }
            $newOrdersTotal.Add($ord)
            $existOrderMap[$ord.id] = $true

            try {
                # Đồng bộ phiếu thu Sổ Quỹ
                $vId = "TT" + $ord.id
                if ($voucherMap.ContainsKey($vId)) {
                    $v = $voucherMap[$vId]
                    # Đồng bộ paymentMethod & targetName theo hóa đơn thực tế
                    if ($null -ne $v.PSObject.Properties['paymentMethod']) {
                        $v.paymentMethod = $ord.paymentMethod
                    } else {
                        $v | Add-Member -NotePropertyName 'paymentMethod' -NotePropertyValue $ord.paymentMethod -Force
                    }
                    if ($ord.customerName) {
                        if ($null -ne $v.PSObject.Properties['targetName']) {
                            $v.targetName = $ord.customerName
                        } else {
                            $v | Add-Member -NotePropertyName 'targetName' -NotePropertyValue $ord.customerName -Force
                        }
                    }
                    $vouchersUpdatedCount++
                } else {
                    # Tạo mới phiếu thu TTHD
                    $newV = [PSCustomObject]@{
                        id            = $vId
                        type          = 'receipt'
                        amount        = $ord.totalAmount
                        category      = 'Tiền khách trả'
                        reason        = 'Phiếu thu Tiền khách trả'
                        person        = if ($ord.pharmacist) { $ord.pharmacist } else { "admin" }
                        targetName    = $ord.customerName
                        targetType    = 'customer'
                        paymentMethod = $ord.paymentMethod
                        refId         = $ord.id
                        createdAt     = $ord.createdAt
                        isAccounting  = $true
                    }
                    $vouchersList.Add($newV)
                    $voucherMap[$vId] = $newV
                    $vouchersAddedCount++
                }
            } catch {}
        }
    }
    finally {
        if (Test-Path $tmpDir) {
            Remove-Item $tmpDir -Recurse -Force -ErrorAction SilentlyContinue
        }
    }
}

Write-Host "`n>>> TỔNG KẾT ĐƠN HÀNG MỚI ĐƯỢC THÊM: $($newOrdersTotal.Count) ĐƠN" -ForegroundColor Green
Write-Host ">>> CẬP NHẬT SỔ QUỸ: $vouchersAddedCount phiếu thu mới, $vouchersUpdatedCount phiếu thu được đồng bộ hình thức thanh toán." -ForegroundColor Green

if ($newOrdersTotal.Count -gt 0) {
    Write-Host "`nĐang sắp xếp và lưu orders_2026.json..." -ForegroundColor Cyan
    $allOrders = @($newOrdersTotal) + @($existingOrders) | Sort-Object { if ($_.createdAt) { try { [DateTime]$_.createdAt } catch { [DateTime]::MinValue } } else { [DateTime]::MinValue } } -Descending
    $ordersJson = $allOrders | ConvertTo-Json -Depth 10
    [System.IO.File]::WriteAllText($ordersPath, $ordersJson, [System.Text.Encoding]::UTF8)

    Write-Host "Đang sắp xếp và lưu vouchers_2026.json..." -ForegroundColor Cyan
    $allVouchers = @($vouchersList) | Sort-Object { if ($_.createdAt) { try { [DateTime]$_.createdAt } catch { [DateTime]::MinValue } } else { [DateTime]::MinValue } } -Descending
    $vouchersJson = $allVouchers | ConvertTo-Json -Depth 10
    [System.IO.File]::WriteAllText($vouchersPath, $vouchersJson, [System.Text.Encoding]::UTF8)

    Write-Host "==========================================================" -ForegroundColor Green
    Write-Host ">>> IMPORT HOÀN TẤT THÀNH CÔNG RỰC RỠ!" -ForegroundColor Green
    Write-Host ">>> TỔNG ĐƠN HÀNG HIỆN TẠI TRONG DATABASE: $($allOrders.Count) ĐƠN" -ForegroundColor Green
    Write-Host "==========================================================" -ForegroundColor Green
} else {
    Write-Host "Không có đơn hàng mới nào được thêm." -ForegroundColor Yellow
}
