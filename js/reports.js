/**
 * MedicaPharmacy - Monthly Sales & Analytics Module
 * Tổng hợp doanh số theo tháng, tách bạch Tiền mặt vs Chuyển khoản, Biểu đồ Chart.js
 */

const ReportsModule = {
    selectedMonth: new Date().getMonth() + 1, // 1-12
    selectedYear: new Date().getFullYear(),
    chartRevenueDaily: null,
    chartPaymentRatio: null,
    chartTopMedicines: null,
    currentReportData: null,
    selectedDetailDate: null,

    init() {
        this.populateMonthYearSelectors();
        this.bindEvents();
        this.loadMonthlyReport();

        Store.on('orders:changed', () => {
            this.loadMonthlyReport();
        });

        Store.on('vouchers:changed', () => {
            this.loadMonthlyReport();
        });

        Store.on('stockin:changed', () => {
            this.loadMonthlyReport();
        });
    },

    populateMonthYearSelectors() {
        const monthSel = document.getElementById('report-select-month');
        const yearSel = document.getElementById('report-select-year');
        if (!monthSel || !yearSel) return;

        let mHtml = '';
        for (let m = 1; m <= 12; m++) {
            mHtml += `<option value="${m}" ${m === this.selectedMonth ? 'selected' : ''}>Tháng ${m}</option>`;
        }
        monthSel.innerHTML = mHtml;

        let yHtml = '';
        const curY = new Date().getFullYear();
        for (let y = curY - 2; y <= curY + 2; y++) {
            yHtml += `<option value="${y}" ${y === this.selectedYear ? 'selected' : ''}>Năm ${y}</option>`;
        }
        yearSel.innerHTML = yHtml;
    },

    bindEvents() {
        const monthSel = document.getElementById('report-select-month');
        const yearSel = document.getElementById('report-select-year');

        if (monthSel) {
            monthSel.addEventListener('change', (e) => {
                this.selectedMonth = parseInt(e.target.value);
                this.loadMonthlyReport();
            });
        }

        if (yearSel) {
            yearSel.addEventListener('change', (e) => {
                this.selectedYear = parseInt(e.target.value);
                this.loadMonthlyReport();
            });
        }
    },

    // Tính toán số liệu tháng
    calculateMonthlyData(month, year) {
        const allOrders = Store.getOrders();
        const monthPrefix = `${year}-${String(month).padStart(2, '0')}`;

        // Lọc các đơn trong tháng và KHÔNG bị hủy
        const monthOrders = allOrders.filter(o => 
            !o.isCancelled && 
            o.createdAt && 
            o.createdAt.startsWith(monthPrefix)
        );

        let totalRevenue = 0;
        let cashRevenue = 0;
        let transferRevenue = 0;
        let totalCost = 0;
        let cashOrdersCount = 0;
        let transferOrdersCount = 0;

        // Thống kê theo từng ngày trong tháng
        const daysInMonth = new Date(year, month, 0).getDate();
        const dailyMap = {};

        for (let d = 1; d <= daysInMonth; d++) {
            const dateStr = `${year}-${String(month).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
            dailyMap[dateStr] = {
                day: d,
                fullDate: dateStr,
                dateStr: `${String(d).padStart(2, '0')}/${String(month).padStart(2, '0')}`,
                orderCount: 0,
                cashRevenue: 0,
                transferRevenue: 0,
                totalRevenue: 0,
                totalCost: 0,
                profit: 0
            };
        }

        // Thống kê Top thuốc bán chạy
        const medicineSalesMap = {};

        monthOrders.forEach(o => {
            const rawAmount = o.totalAmount || 0;
            const refundAmount = o.totalRefunded || 0;
            const netAmount = Math.max(0, rawAmount - refundAmount);
            totalRevenue += netAmount;

            const isCash = o.paymentMethod === 'cash';
            if (isCash) {
                cashRevenue += (rawAmount - refundAmount);
                cashOrdersCount++;
            } else {
                transferRevenue += rawAmount;
                // Nếu đơn chuyển khoản nhưng có trả hàng, tiền trả được hoàn từ quỹ tiền mặt
                if (refundAmount > 0) {
                    cashRevenue -= refundAmount;
                }
                transferOrdersCount++;
            }

            // Tính tiền vốn của đơn hàng (đã trừ thuốc trả lại nếu có)
            let orderCost = 0;
            if (o.items && Array.isArray(o.items)) {
                o.items.forEach(item => {
                    // Số lượng đã hoàn trả của món này
                    const returnedQty = (o.returns || []).reduce((sum, r) => {
                        const ri = (r.items || []).find(x => x.medicineId === item.medicineId && x.unit === item.unit);
                        return sum + (ri ? ri.quantity : 0);
                    }, 0);
                    const netQty = Math.max(0, (item.quantity || 1) - returnedQty);

                    const lineCost = (item.costPrice || 0) * netQty;
                    orderCost += lineCost;

                    // Cộng dồn vào top thuốc (chỉ cộng số lượng thực bán)
                    if (netQty > 0) {
                        const medId = item.medicineId || item.medicineName;
                        if (!medicineSalesMap[medId]) {
                            medicineSalesMap[medId] = {
                                id: item.medicineId,
                                name: item.medicineName,
                                unit: item.unit,
                                totalQty: 0,
                                totalAmount: 0
                            };
                        }
                        medicineSalesMap[medId].totalQty += netQty;
                        medicineSalesMap[medId].totalAmount += (item.price * netQty);
                    }
                });
            }
            totalCost += orderCost;

            // Đưa vào ngày tương ứng
            const orderDateStr = o.createdAt.slice(0, 10);
            if (dailyMap[orderDateStr]) {
                dailyMap[orderDateStr].orderCount += 1;
                dailyMap[orderDateStr].totalRevenue += netAmount;
                dailyMap[orderDateStr].totalCost += orderCost;
                dailyMap[orderDateStr].profit += (netAmount - orderCost);
                if (isCash) {
                    dailyMap[orderDateStr].cashRevenue += (rawAmount - refundAmount);
                } else {
                    dailyMap[orderDateStr].transferRevenue += rawAmount;
                    if (refundAmount > 0) {
                        dailyMap[orderDateStr].cashRevenue -= refundAmount;
                    }
                }
            }
        });

        const grossProfit = totalRevenue - totalCost;
        const profitMargin = totalRevenue > 0 ? ((grossProfit / totalRevenue) * 100).toFixed(1) : 0;
        const avgOrderValue = monthOrders.length > 0 ? Math.round(totalRevenue / monthOrders.length) : 0;

        // Chi phí hoạt động & thu nhập khác từ sổ quỹ thu chi (có hạch toán kinh doanh)
        const allVouchers = (typeof Store.getVouchers === 'function') ? Store.getVouchers() : [];
        const monthVouchers = allVouchers.filter(v => 
            v.isAccounting !== false && 
            v.createdAt && 
            v.createdAt.startsWith(monthPrefix)
        );

        let operatingExpenses = 0;
        let otherIncome = 0;

        monthVouchers.forEach(v => {
            if (v.type === 'payment') {
                operatingExpenses += (v.amount || 0);
            } else if (v.type === 'receipt') {
                otherIncome += (v.amount || 0);
            }
        });

        const netProfit = grossProfit + otherIncome - operatingExpenses;

        // Top thuốc sắp xếp giảm dần theo doanh số
        const topMedicines = Object.values(medicineSalesMap)
            .sort((a, b) => b.totalAmount - a.totalAmount)
            .slice(0, 10);

        const dailyBreakdown = Object.values(dailyMap);

        return {
            month,
            year,
            totalRevenue,
            cashRevenue,
            transferRevenue,
            cashOrdersCount,
            transferOrdersCount,
            totalCost,
            grossProfit,
            operatingExpenses,
            otherIncome,
            netProfit,
            profitMargin,
            totalOrders: monthOrders.length,
            avgOrderValue,
            dailyBreakdown,
            topMedicines
        };
    },

    loadMonthlyReport() {
        const report = this.calculateMonthlyData(this.selectedMonth, this.selectedYear);
        this.currentReportData = report;

        this.renderKpiCards(report);
        this.renderDailyTable(report);
        this.renderCharts(report);

        // Mặc định chọn ngày hôm nay hoặc ngày gần nhất có doanh thu trong tháng
        const todayStr = new Date().toISOString().slice(0, 10);
        const prefix = `${this.selectedYear}-${String(this.selectedMonth).padStart(2, '0')}`;
        if (todayStr.startsWith(prefix)) {
            this.selectedDetailDate = todayStr;
        } else {
            const daysWithSales = report.dailyBreakdown.filter(d => d.totalRevenue > 0);
            if (daysWithSales.length > 0) {
                this.selectedDetailDate = daysWithSales[daysWithSales.length - 1].fullDate;
            } else {
                this.selectedDetailDate = `${prefix}-01`;
            }
        }
        this.renderSelectedDateSales(this.selectedDetailDate);
    },

    selectDateForDetails(dateStr) {
        if (!dateStr) return;
        this.selectedDetailDate = dateStr;
        this.renderSelectedDateSales(dateStr);
        this.renderDailyTable(this.currentReportData);

        const box = document.getElementById('rep-selected-date-box');
        if (box) {
            box.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        }
    },

    renderSelectedDateSales(dateStr) {
        if (!dateStr) return;
        this.selectedDetailDate = dateStr;

        const lbl = document.getElementById('rep-selected-date-label');
        if (lbl) {
            const parts = dateStr.split('-');
            lbl.innerText = `${parts[2]}/${parts[1]}/${parts[0]}`;
        }
        const picker = document.getElementById('rep-detail-date-picker');
        if (picker) {
            picker.value = dateStr;
        }

        const orders = Store.getOrders();
        const dayOrders = orders.filter(o => !o.isCancelled && o.createdAt && o.createdAt.startsWith(dateStr));

        const itemsMap = {};
        let dayRevenue = 0;
        let dayCost = 0;

        dayOrders.forEach(o => {
            (o.items || []).forEach(item => {
                const returnedQty = (o.returns || []).reduce((sum, r) => {
                    const ri = (r.items || []).find(x => x.medicineId === item.medicineId && x.unit === item.unit);
                    return sum + (ri ? ri.quantity : 0);
                }, 0);
                const netQty = Math.max(0, (item.quantity || 1) - returnedQty);
                if (netQty > 0 || returnedQty > 0) {
                    const key = `${item.medicineId || item.medicineName}_${item.unit}`;
                    if (!itemsMap[key]) {
                        itemsMap[key] = {
                            medicineId: item.medicineId || '---',
                            medicineName: item.medicineName,
                            unit: item.unit,
                            quantity: 0,
                            returnedQuantity: 0,
                            price: item.price || 0,
                            costPrice: item.costPrice || 0,
                            revenue: 0,
                            cost: 0,
                            orderIds: []
                        };
                    }
                    itemsMap[key].quantity += netQty;
                    itemsMap[key].returnedQuantity += returnedQty;
                    itemsMap[key].revenue += (netQty * (item.price || 0));
                    itemsMap[key].cost += (netQty * (item.costPrice || 0));
                    if (!itemsMap[key].orderIds.includes(o.id)) {
                        itemsMap[key].orderIds.push(o.id);
                    }
                }
            });
        });

        const itemsList = Object.values(itemsMap);
        itemsList.forEach(i => {
            dayRevenue += i.revenue;
            dayCost += i.cost;
        });
        const dayProfit = dayRevenue - dayCost;

        const elOrderCount = document.getElementById('rep-detail-order-count');
        const elItemCount = document.getElementById('rep-detail-item-count');
        const elRevenue = document.getElementById('rep-detail-day-revenue');
        const elCost = document.getElementById('rep-detail-day-cost');
        const elProfit = document.getElementById('rep-detail-day-profit');

        if (elOrderCount) elOrderCount.innerText = `${dayOrders.length} hóa đơn`;
        if (elItemCount) elItemCount.innerText = `${itemsList.length} mặt hàng`;
        if (elRevenue) elRevenue.innerText = AppUtils.formatVND(dayRevenue);
        if (elCost) elCost.innerText = AppUtils.formatVND(dayCost);
        if (elProfit) elProfit.innerText = AppUtils.formatVND(dayProfit);

        const tbody = document.getElementById('rep-selected-date-items-tbody');
        if (!tbody) return;

        if (itemsList.length === 0) {
            tbody.innerHTML = `
                <tr>
                    <td colspan="9" class="text-center py-8 text-slate-400 text-xs">
                        <i data-lucide="package-x" class="w-8 h-8 mx-auto mb-1 opacity-40"></i>
                        Không có mặt hàng thuốc nào được bán vào ngày ${AppUtils.formatDate(dateStr)}. Chọn ngày khác từ bảng doanh thu để xem.
                    </td>
                </tr>
            `;
            if (window.lucide) lucide.createIcons();
            return;
        }

        let html = '';
        itemsList.sort((a, b) => b.revenue - a.revenue).forEach((item, idx) => {
            const margin = item.revenue > 0 ? (((item.revenue - item.cost) / item.revenue) * 100).toFixed(1) : 0;
            const ordersBadge = item.orderIds.map(id => `<span onclick="OrdersModule.openOrderDetailsModal('${id}')" class="cursor-pointer hover:underline text-emerald-700 font-mono text-[11px] font-bold bg-emerald-50 px-1.5 py-0.5 rounded border border-emerald-200 mr-1">${id}</span>`).join('');

            html += `
                <tr class="border-b border-slate-100 hover:bg-slate-50 text-xs">
                    <td class="py-2.5 px-3 text-center text-slate-400 font-mono">${idx + 1}</td>
                    <td class="py-2.5 px-3 font-mono font-bold text-emerald-800">${item.medicineId}</td>
                    <td class="py-2.5 px-3 font-semibold text-slate-800">
                        <button type="button" onclick="InventoryModule.openMedicineHistoryModal('${item.medicineId}')" class="text-left font-bold text-emerald-800 hover:text-emerald-950 hover:underline inline-flex items-center gap-1 group cursor-pointer" title="Xem lịch sử xuất nhập & tồn kho">
                            <span>${item.medicineName}</span>
                            <i data-lucide="external-link" class="w-3.5 h-3.5 opacity-60 group-hover:opacity-100 text-emerald-600 shrink-0"></i>
                        </button>
                        <span class="text-slate-400 font-normal">(${item.unit})</span>
                    </td>
                    <td class="py-2.5 px-3 text-center font-bold text-slate-800">
                        ${item.quantity} ${item.unit}
                        ${item.returnedQuantity > 0 ? `<div class="text-[10px] text-rose-600 font-bold">(Đã trả: ${item.returnedQuantity})</div>` : ''}
                    </td>
                    <td class="py-2.5 px-3 text-right text-slate-700">${AppUtils.formatVND(item.price)}</td>
                    <td class="py-2.5 px-3 text-right font-bold text-emerald-700 font-mono">${AppUtils.formatVND(item.revenue)}</td>
                    <td class="py-2.5 px-3 text-right text-slate-500 font-mono">${AppUtils.formatVND(item.cost)}</td>
                    <td class="py-2.5 px-3 text-right">
                        <div class="font-bold text-slate-900 font-mono">${AppUtils.formatVND(item.revenue - item.cost)}</div>
                        <div class="text-[10px] text-slate-400 font-semibold">${margin}%</div>
                    </td>
                    <td class="py-2.5 px-3">
                        <div class="flex flex-wrap gap-1">${ordersBadge}</div>
                    </td>
                </tr>
            `;
        });

        tbody.innerHTML = html;
        if (window.lucide) lucide.createIcons();
    },

    renderKpiCards(r) {
        const elTotalRev = document.getElementById('rep-kpi-total-revenue');
        const elCashRev = document.getElementById('rep-kpi-cash-revenue');
        const elCashRatio = document.getElementById('rep-kpi-cash-ratio');
        const elTransRev = document.getElementById('rep-kpi-transfer-revenue');
        const elTransRatio = document.getElementById('rep-kpi-transfer-ratio');
        const elGrossProfit = document.getElementById('rep-kpi-gross-profit');
        const elProfitMargin = document.getElementById('rep-kpi-profit-margin');
        const elTotalOrders = document.getElementById('rep-kpi-total-orders');
        const elAvgOrder = document.getElementById('rep-kpi-avg-order');

        const cashRatio = r.totalRevenue > 0 ? ((r.cashRevenue / r.totalRevenue) * 100).toFixed(1) : 0;
        const transRatio = r.totalRevenue > 0 ? ((r.transferRevenue / r.totalRevenue) * 100).toFixed(1) : 0;

        if (elTotalRev) elTotalRev.innerText = AppUtils.formatVND(r.totalRevenue);
        if (elCashRev) elCashRev.innerText = AppUtils.formatVND(r.cashRevenue);
        if (elCashRatio) elCashRatio.innerText = `${cashRatio}% (${r.cashOrdersCount} đơn)`;
        if (elTransRev) elTransRev.innerText = AppUtils.formatVND(r.transferRevenue);
        if (elTransRatio) elTransRatio.innerText = `${transRatio}% (${r.transferOrdersCount} đơn)`;
        if (elGrossProfit) elGrossProfit.innerText = AppUtils.formatVND(r.grossProfit);
        if (elProfitMargin) {
            let note = `Tỷ suất: ${r.profitMargin}% (Vốn: ${AppUtils.formatVND(r.totalCost)})`;
            if (r.operatingExpenses > 0 || r.otherIncome > 0) {
                note += ` • Ròng: ${AppUtils.formatVND(r.netProfit)}`;
            }
            elProfitMargin.innerText = note;
        }
        if (elTotalOrders) elTotalOrders.innerText = `${r.totalOrders} đơn`;
        if (elAvgOrder) elAvgOrder.innerText = `TB: ${AppUtils.formatVND(r.avgOrderValue)} / đơn`;
    },

    renderDailyTable(r) {
        const tbody = document.getElementById('rep-daily-table-tbody');
        const tfoot = document.getElementById('rep-daily-table-tfoot');
        if (!tbody) return;

        let html = '';
        r.dailyBreakdown.forEach((row, idx) => {
            const hasSales = row.totalRevenue > 0;
            const isSelected = this.selectedDetailDate === row.fullDate;
            html += `
                <tr class="border-b border-slate-100 hover:bg-emerald-50/70 cursor-pointer transition text-sm ${isSelected ? 'bg-emerald-50 border-l-4 border-l-emerald-600' : (!hasSales ? 'text-slate-400 bg-slate-50/30' : '')}" onclick="ReportsModule.selectDateForDetails('${row.fullDate}')">
                    <td class="py-2.5 px-3 font-medium text-center font-mono">
                        <span class="font-bold ${isSelected ? 'text-emerald-700 underline' : 'text-slate-800'}">${row.dateStr}</span>
                    </td>
                    <td class="py-2.5 px-3 text-center font-bold ${row.orderCount > 0 ? 'text-slate-800' : 'text-slate-300'}">${row.orderCount}</td>
                    <td class="py-2.5 px-3 text-right font-medium text-amber-700">${AppUtils.formatVND(row.cashRevenue)}</td>
                    <td class="py-2.5 px-3 text-right font-medium text-blue-700">${AppUtils.formatVND(row.transferRevenue)}</td>
                    <td class="py-2.5 px-3 text-right font-bold text-emerald-700">${AppUtils.formatVND(row.totalRevenue)}</td>
                    <td class="py-2.5 px-3 text-right text-slate-500 text-xs">${AppUtils.formatVND(row.totalCost)}</td>
                    <td class="py-2.5 px-3 text-right font-bold text-slate-800">${AppUtils.formatVND(row.profit)}</td>
                    <td class="py-2.5 px-3 text-center">
                        <button type="button" onclick="event.stopPropagation(); ReportsModule.selectDateForDetails('${row.fullDate}')" class="px-2 py-0.5 rounded text-[11px] font-semibold bg-white hover:bg-emerald-600 hover:text-white text-emerald-700 border border-emerald-300 inline-flex items-center gap-1 shadow-sm transition">
                            <i data-lucide="package-search" class="w-3 h-3"></i>
                            <span>Xem thuốc</span>
                        </button>
                    </td>
                </tr>
            `;
        });
        tbody.innerHTML = html;

        if (tfoot) {
            tfoot.innerHTML = `
                <tr class="bg-emerald-50 text-emerald-950 font-extrabold text-sm border-t-2 border-emerald-300">
                    <td class="py-3 px-3 text-center">TỔNG CỘNG THÁNG</td>
                    <td class="py-3 px-3 text-center">${r.totalOrders} đơn</td>
                    <td class="py-3 px-3 text-right text-amber-800">${AppUtils.formatVND(r.cashRevenue)}</td>
                    <td class="py-3 px-3 text-right text-blue-800">${AppUtils.formatVND(r.transferRevenue)}</td>
                    <td class="py-3 px-3 text-right text-emerald-800 text-base">${AppUtils.formatVND(r.totalRevenue)}</td>
                    <td class="py-3 px-3 text-right text-slate-700">${AppUtils.formatVND(r.totalCost)}</td>
                    <td class="py-3 px-3 text-right text-emerald-900 text-base">${AppUtils.formatVND(r.grossProfit)}</td>
                    <td class="py-3 px-3 text-center text-xs text-emerald-800 font-bold">${r.dailyBreakdown.filter(d => d.totalRevenue > 0).length} ngày bán</td>
                </tr>
            `;
        }
        if (window.lucide) lucide.createIcons();
    },

    renderCharts(r) {
        if (typeof Chart === 'undefined') {
            console.warn('Thư viện Chart.js chưa sẵn sàng.');
            return;
        }

        // 1. Biểu đồ diễn biến doanh thu ngày (Stacked Bar Chart: Tiền mặt + Chuyển khoản)
        const ctxDaily = document.getElementById('chart-revenue-daily')?.getContext('2d');
        if (ctxDaily) {
            if (this.chartRevenueDaily) this.chartRevenueDaily.destroy();

            const labels = r.dailyBreakdown.map(d => d.day);
            const cashData = r.dailyBreakdown.map(d => d.cashRevenue);
            const transferData = r.dailyBreakdown.map(d => d.transferRevenue);

            this.chartRevenueDaily = new Chart(ctxDaily, {
                type: 'bar',
                data: {
                    labels: labels,
                    datasets: [
                        {
                            label: 'Tiền Mặt (đ)',
                            data: cashData,
                            backgroundColor: '#f59e0b',
                            borderRadius: 4,
                            stack: 'revenue'
                        },
                        {
                            label: 'Chuyển Khoản / VietQR (đ)',
                            data: transferData,
                            backgroundColor: '#0284c7',
                            borderRadius: 4,
                            stack: 'revenue'
                        }
                    ]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    plugins: {
                        legend: { position: 'top' },
                        tooltip: {
                            callbacks: {
                                label: function(context) {
                                    return context.dataset.label + ': ' + AppUtils.formatVND(context.raw);
                                }
                            }
                        }
                    },
                    scales: {
                        x: {
                            title: { display: true, text: 'Ngày trong tháng' },
                            grid: { display: false }
                        },
                        y: {
                            title: { display: true, text: 'Doanh thu (VNĐ)' },
                            ticks: {
                                callback: val => (val >= 1000000 ? (val / 1000000) + ' Tr' : (val / 1000) + 'k')
                            }
                        }
                    }
                }
            });
        }

        // 2. Biểu đồ cơ cấu thanh toán Tiền mặt vs Chuyển khoản (Doughnut)
        const ctxRatio = document.getElementById('chart-payment-ratio')?.getContext('2d');
        if (ctxRatio) {
            if (this.chartPaymentRatio) this.chartPaymentRatio.destroy();

            const hasData = (r.cashRevenue + r.transferRevenue) > 0;

            this.chartPaymentRatio = new Chart(ctxRatio, {
                type: 'doughnut',
                data: {
                    labels: ['Tiền Mặt', 'Chuyển Khoản (VietQR)'],
                    datasets: [{
                        data: hasData ? [r.cashRevenue, r.transferRevenue] : [1, 0],
                        backgroundColor: hasData ? ['#f59e0b', '#0284c7'] : ['#e2e8f0', '#cbd5e1'],
                        borderWidth: 2,
                        borderColor: '#ffffff'
                    }]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    cutout: '70%',
                    plugins: {
                        legend: { position: 'bottom' },
                        tooltip: {
                            callbacks: {
                                label: function(context) {
                                    if (!hasData) return 'Chưa có doanh số';
                                    return context.label + ': ' + AppUtils.formatVND(context.raw);
                                }
                            }
                        }
                    }
                }
            });
        }

        // 3. Biểu đồ Top 5 Thuốc Bán Chạy Nhất (Horizontal Bar)
        const ctxTop = document.getElementById('chart-top-medicines')?.getContext('2d');
        if (ctxTop) {
            if (this.chartTopMedicines) this.chartTopMedicines.destroy();

            const top5 = r.topMedicines.slice(0, 5);
            const medLabels = top5.map(m => m.name.length > 20 ? m.name.slice(0, 20) + '...' : m.name);
            const medAmounts = top5.map(m => m.totalAmount);

            this.chartTopMedicines = new Chart(ctxTop, {
                type: 'bar',
                data: {
                    labels: medLabels,
                    datasets: [{
                        label: 'Doanh thu (đ)',
                        data: medAmounts,
                        backgroundColor: '#10b981',
                        borderRadius: 6
                    }]
                },
                options: {
                    indexAxis: 'y',
                    responsive: true,
                    maintainAspectRatio: false,
                    plugins: {
                        legend: { display: false },
                        tooltip: {
                            callbacks: {
                                label: context => 'Doanh thu: ' + AppUtils.formatVND(context.raw)
                            }
                        }
                    },
                    scales: {
                        x: {
                            ticks: {
                                callback: val => (val >= 1000000 ? (val / 1000000) + ' Tr' : (val / 1000) + 'k')
                            }
                        }
                    }
                }
            });
        }
    },

    exportExcel() {
        if (!this.currentReportData) return;
        ExportService.exportMonthlyRevenue(this.selectedMonth, this.selectedYear, this.currentReportData);
    },

    printMonthlyReport() {
        window.print();
    }
};

window.ReportsModule = ReportsModule;

