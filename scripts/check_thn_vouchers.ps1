$v = [System.IO.File]::ReadAllText('f:\MedicaPharmacy\data\vouchers_2026.json') | ConvertFrom-Json
$thn = @($v | Where-Object { $_.refId -like 'THN*' -or $_.note -like '*THN*' })
Write-Host "Vouchers with THN: $($thn.Count)"
if ($thn.Count -gt 0) {
    $thn | Select-Object -First 5 | Format-Table id, type, paymentMethod, amount, recipientName, refId, note
}
