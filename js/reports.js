/**
 * MedicaPharmacy - Monthly Sales, Analytics & P&L Module
 * - Báo cáo hoạt động kinh doanh (P&L chuẩn KiotViet)
 * - Bảng báo cáo theo ngày chuyển sang Hóa Đơn thay vì Mã sản phẩm
 * - Bảng kê chi tiết theo tháng (12 tháng trong năm)
 */

const ReportsModule = {
    currentSubTab: 'daily', // 'daily', 'monthly', 'pnl'
    dailyDetailViewMode: 'orders', // 'orders' (mặc định), 'items'
    
    // Sub-tab 1: Theo ngày trong tháng
    selectedMonth: new Date().getMonth() + 1, // 1-12
    selectedYear: new Date().getFullYear(),
    chartRevenueDaily: null,
    chartPaymentRatio: null,
    chartTopMedicines: null,
    currentReportData: null,
    selectedDetailDate: null,

    // Sub-tab 2: Bảng kê chi tiết theo tháng (Năm)
    selectedYearForMonthly: new Date().getFullYear(),
    chartYearlyMonthly: null,
    currentYearlyData: null,

    // Sub-tab 3: Báo cáo kết quả hoạt động kinh doanh (P&L)
    pnlRange: 'this_month',
    pnlDateFrom: '',
    pnlDateTo: '',
    currentPnLData: null,

    init() {
        this.populateMonthYearSelectors();
        this.populateYearlyYearSelector();
        this.initPnLDates();
        this.bindEvents();

        // Nạp dữ liệu mặc định
        this.loadMonthlyReport();

        Store.on('orders:changed', () => {
            this.refreshCurrentSubTab();
        });

        Store.on('vouchers:changed', () => {
            this.refreshCurrentSubTab();
        });

        Store.on('stockin:changed', () => {
            this.refreshCurrentSubTab();
        });
    },

    refreshCurrentSubTab() {
        if (this.currentSubTab === 'monthly') {
            this.loadYearlyReport();
        } else if (this.currentSubTab === 'pnl') {
            this.loadPnLReport();
        } else {
            this.loadMonthlyReport();
        }
    },

    // --- CHUYỂN ĐỔI SUB-TABS (KIOTVIET STYLE) ---
    switchSubTab(tabName) {
        this.currentSubTab = tabName;
        const tabs = ['daily', 'monthly', 'pnl'];

        tabs.forEach(t => {
            const btn = document.getElementById(`rep-subtab-btn-${t}`);
            const content = document.getElementById(`rep-subtab-content-${t}`);
            if (btn && content) {
                if (t === tabName) {
                    btn.className = 'rep-subtab-btn px-3.5 py-1.5 text-xs font-bold rounded-lg transition bg-white text-emerald-800 shadow-xs flex items-center gap-2 cursor-pointer';
                    const icon = btn.querySelector('svg, i');
                    if (icon) icon.className = 'w-4 h-4 text-emerald-600';
                    content.classList.remove('hidden');
                } else {
                    btn.className = 'rep-subtab-btn px-3.5 py-1.5 text-xs font-bold rounded-lg transition text-slate-600 hover:text-slate-900 flex items-center gap-2 cursor-pointer';
                    const icon = btn.querySelector('svg, i');
                    if (icon) icon.className = 'w-4 h-4 text-slate-400';
                    content.classList.add('hidden');
                }
            }
        });

        if (tabName === 'monthly') {
            this.loadYearlyReport();
        } else if (tabName === 'pnl') {
            this.loadPnLReport();
        } else {
            this.loadMonthlyReport();
        }

        if (window.lucide) lucide.createIcons();
    },

    // --- TOGGLE CHẾ ĐỘ XEM CHI TIẾT NGÀY: THEO HÓA ĐƠN VS THEO MẶT HÀNG ---
    setDailyDetailViewMode(mode) {
        this.dailyDetailViewMode = mode;
        const btnOrders = document.getElementById('rep-viewmode-orders-btn');
        const btnItems = document.getElementById('rep-viewmode-items-btn');
        const containerOrders = document.getElementById('rep-selected-date-orders-container');
        const containerItems = document.getElementById('rep-selected-date-items-container');

        if (mode === 'orders') {
            if (btnOrders) btnOrders.className = 'px-3 py-1.5 rounded-lg transition bg-white text-emerald-800 shadow-xs flex items-center gap-1.5 cursor-pointer font-bold';
            if (btnItems) btnItems.className = 'px-3 py-1.5 rounded-lg transition text-slate-600 hover:text-slate-900 flex items-center gap-1.5 cursor-pointer font-medium';
            if (containerOrders) containerOrders.classList.remove('hidden');
            if (containerItems) containerItems.classList.add('hidden');
        } else {
            if (btnOrders) btnOrders.className = 'px-3 py-1.5 rounded-lg transition text-slate-600 hover:text-slate-900 flex items-center gap-1.5 cursor-pointer font-medium';
            if (btnItems) btnItems.className = 'px-3 py-1.5 rounded-lg transition bg-white text-emerald-800 shadow-xs flex items-center gap-1.5 cursor-pointer font-bold';
            if (containerOrders) containerOrders.classList.add('hidden');
            if (containerItems) containerItems.classList.remove('hidden');
        }
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

    populateYearlyYearSelector() {
        const sel = document.getElementById('rep-yearly-select-year');
        if (!sel) return;
        const curY = new Date().getFullYear();
        let html = '';
        for (let y = curY - 3; y <= curY + 1; y++) {
            html += `<option value="${y}" ${y === this.selectedYearForMonthly ? 'selected' : ''}>Năm ${y}</option>`;
        }
        sel.innerHTML = html;
    },

    initPnLDates() {
        const now = new Date();
        const year = now.getFullYear();
        const month = now.getMonth() + 1;
        const daysInMonth = new Date(year, month, 0).getDate();

        this.pnlDateFrom = `${year}-${String(month).padStart(2, '0')}-01`;
        this.pnlDateTo = `${year}-${String(month).padStart(2, '0')}-${String(daysInMonth).padStart(2, '0')}`;

        const inputFrom = document.getElementById('rep-pnl-date-from');
        const inputTo = document.getElementById('rep-pnl-date-to');
        if (inputFrom) inputFrom.value = this.pnlDateFrom;
        if (inputTo) inputTo.value = this.pnlDateTo;
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

    // =========================================================================
    // SUB-TAB 1: TÍNH TOÁN VÀ RENDER DOANH SỐ THEO NGÀY & DANH SÁCH HÓA ĐƠN
    // =========================================================================
    calculateMonthlyData(month, year) {
        const allOrders = Store.getOrders();
        const monthPrefix = `${year}-${String(month).padStart(2, '0')}`;

        // Lọc các đơn trong tháng và KHÔNG bị hủy (bỏ qua đơn trả hàng vì đã khấu trừ từ Sổ Quỹ)
        const monthOrders = allOrders.filter(o => 
            !o.isCancelled && 
            !o.isReturn &&
            o.type !== 'return' &&
            o.orderType !== 'return' &&
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
                customerRefund: 0,
                customerReturnCost: 0,
                cashRefund: 0,
                transferRefund: 0,
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
                if (refundAmount > 0) {
                    cashRevenue -= refundAmount;
                }
                transferOrdersCount++;
            }

            // Tính tiền vốn của đơn hàng (đã trừ thuốc trả lại nếu có)
            let orderCost = 0;
            if (o.items && Array.isArray(o.items)) {
                o.items.forEach(item => {
                    const returnedQty = (o.returns || []).reduce((sum, r) => {
                        const ri = (r.items || []).find(x => x.medicineId === item.medicineId && x.unit === item.unit);
                        return sum + (ri ? ri.quantity : 0);
                    }, 0);
                    
                    let rawQty = (typeof item.quantity === 'number') ? item.quantity : Number(item.quantity);
                    if (isNaN(rawQty) || (rawQty <= 0 && item.lineTotal > 0 && item.price > 0)) {
                        rawQty = item.price > 0 ? (item.lineTotal / item.price) : 0;
                    }
                    const netQty = Math.max(0, rawQty - returnedQty);

                    let unitCost = 0;
                    const med = Store.getMedicineById(item.medicineId) || (Store._medicineMap ? (Store._medicineMap[item.medicineCode] || Store._medicineMap[item.medicineId]) : null);
                    if (med) {
                        unitCost = Store.getMedicineUnitCost(med, item.unit);
                    }
                    if (unitCost <= 0) {
                        unitCost = item.costPrice || 0;
                    }
                    const lineCost = unitCost * netQty;
                    orderCost += lineCost;

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
                        let lineTotal = (typeof item.lineTotal === 'number' && item.lineTotal > 0) ? item.lineTotal : (netQty * (item.price || 0));
                        medicineSalesMap[medId].totalAmount += lineTotal;
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

        // 2. Thu thập các khoản khách hàng trả hàng hoàn tiền trong tháng từ Sổ Quỹ
        const allVouchers = (typeof Store.getVouchers === 'function') ? Store.getVouchers() : [];
        const monthReturnVouchers = allVouchers.filter(v => 
            !v.isCancelled && 
            v.type === 'payment' && 
            (
                (v.category && (v.category.includes('trả khách') || v.category.includes('trả lại hàng'))) || 
                (v.reason && (v.reason.includes('trả khách') || v.reason.includes('trả lại hàng'))) || 
                (v.id && v.id.startsWith('TTTH'))
            ) &&
            v.createdAt && v.createdAt.startsWith(monthPrefix)
        );

        let totalCustomerRefund = 0;
        let totalCustomerReturnCost = 0;
        let cashCustomerRefund = 0;
        let transferCustomerRefund = 0;

        monthReturnVouchers.forEach(v => {
            const amt = Math.abs(Number(v.amount) || 0);
            totalCustomerRefund += amt;
            const isCash = v.paymentMethod === 'cash';
            if (isCash) {
                cashCustomerRefund += amt;
            } else {
                transferCustomerRefund += amt;
            }

            let vCost = 0;
            if (typeof v.returnCost === 'number' && v.returnCost > 0) {
                vCost = v.returnCost;
            } else if (v.returnedItems && Array.isArray(v.returnedItems) && v.returnedItems.length > 0) {
                vCost = v.returnedItems.reduce((sum, item) => sum + (item.totalCost || (item.costPrice * (item.quantity || 1)) || 0), 0);
            } else if (v.refId) {
                const order = (typeof Store.getOrderById === 'function') ? Store.getOrderById(v.refId) : null;
                if (order && order.items) {
                    const matchedItem = order.items.find(it => (it.total === amt || it.price === amt || it.lineTotal === amt));
                    if (matchedItem) {
                        const qty = matchedItem.price > 0 ? (amt / matchedItem.price) : 1;
                        let uCost = 0;
                        const med = Store.getMedicineById(matchedItem.medicineId) || (Store._medicineMap ? (Store._medicineMap[matchedItem.medicineCode] || Store._medicineMap[matchedItem.medicineId]) : null);
                        if (med) uCost = Store.getMedicineUnitCost(med, matchedItem.unit);
                        if (uCost <= 0) uCost = matchedItem.costPrice || 0;
                        vCost = Math.round(qty * uCost);
                    }
                }
            }
            totalCustomerReturnCost += vCost;

            const dateStr = v.createdAt.slice(0, 10);
            if (dailyMap[dateStr]) {
                dailyMap[dateStr].customerRefund = (dailyMap[dateStr].customerRefund || 0) + amt;
                dailyMap[dateStr].customerReturnCost = (dailyMap[dateStr].customerReturnCost || 0) + vCost;
                if (isCash) {
                    dailyMap[dateStr].cashRefund = (dailyMap[dateStr].cashRefund || 0) + amt;
                } else {
                    dailyMap[dateStr].transferRefund = (dailyMap[dateStr].transferRefund || 0) + amt;
                }
                if (!dailyMap[dateStr].returnVouchers) dailyMap[dateStr].returnVouchers = [];
                dailyMap[dateStr].returnVouchers.push(v);
            }
        });

        // Áp dụng khoản giảm trừ doanh thu và tiền vốn do khách trả hàng vào từng ngày
        Object.values(dailyMap).forEach(d => {
            const refund = d.customerRefund || 0;
            const returnCost = d.customerReturnCost || 0;
            d.grossRevenue = Math.round(d.totalRevenue);
            d.grossCost = Math.round(d.totalCost);
            d.totalRevenue = Math.round(Math.max(0, d.totalRevenue - refund));
            d.totalCost = Math.round(Math.max(0, d.totalCost - returnCost));
            d.cashRevenue = Math.round(Math.max(0, d.cashRevenue - (d.cashRefund || 0)));
            d.transferRevenue = Math.round(Math.max(0, d.transferRevenue - (d.transferRefund || 0)));
            d.profit = Math.round(d.totalRevenue - d.totalCost);
        });

        const grossRevenue = Math.round(totalRevenue);
        const grossCost = Math.round(totalCost);
        totalRevenue = Math.round(Math.max(0, grossRevenue - totalCustomerRefund));
        totalCost = Math.round(Math.max(0, grossCost - totalCustomerReturnCost));
        cashRevenue = Math.round(Math.max(0, cashRevenue - cashCustomerRefund));
        transferRevenue = Math.round(Math.max(0, transferRevenue - transferCustomerRefund));
        const grossProfit = Math.round(totalRevenue - totalCost);
        const profitMargin = totalRevenue > 0 ? ((grossProfit / totalRevenue) * 100).toFixed(1) : 0;
        const avgOrderValue = monthOrders.length > 0 ? Math.round(totalRevenue / monthOrders.length) : 0;

        // Chi phí hoạt động & thu nhập khác từ sổ quỹ thu chi (có hạch toán kinh doanh)
        const monthVouchers = allVouchers.filter(v => 
            v.isAccounting !== false && 
            !v.isCancelled &&
            v.createdAt && 
            v.createdAt.startsWith(monthPrefix)
        );

        let operatingExpenses = 0;
        let otherIncome = 0;

        monthVouchers.forEach(v => {
            const amt = Math.abs(Number(v.amount) || 0);
            const cat = (v.category || '').toLowerCase();
            const reason = (v.reason || '').toLowerCase();
            const vId = (v.id || '');

            if (cat.includes('chuyển/rút') || cat.includes('chuyển rút') || reason.includes('chuyển/rút')) {
                return;
            }

            if (v.type === 'payment') {
                if (cat.includes('tiền trả ncc') || cat.includes('chi tiền hàng') || vId.startsWith('PCPN') || (v.refId && v.refId.startsWith('PN'))) {
                    return;
                }
                if (cat.includes('trả khách') || cat.includes('trả lại hàng') || vId.startsWith('TTTH') || reason.includes('trả khách')) {
                    return;
                }
                operatingExpenses += amt;
            } else if (v.type === 'receipt') {
                if (cat.includes('tiền khách trả') || cat.includes('tiền bán thuốc') || vId.startsWith('TTHD')) {
                    return;
                }
                if (cat.includes('ncc hoàn trả') || vId.startsWith('PTTHN')) {
                    return;
                }
                otherIncome += amt;
            }
        });

        const netProfit = grossProfit + otherIncome - operatingExpenses;

        const topMedicines = Object.values(medicineSalesMap)
            .sort((a, b) => b.totalAmount - a.totalAmount)
            .slice(0, 10);

        const dailyBreakdown = Object.values(dailyMap);

        return {
            month,
            year,
            grossRevenue: Math.round(grossRevenue),
            grossCost: Math.round(grossCost),
            totalCustomerRefund: Math.round(totalCustomerRefund),
            totalCustomerReturnCost: Math.round(totalCustomerReturnCost),
            customerRefundCount: monthReturnVouchers.length,
            totalRevenue: Math.round(totalRevenue),
            cashRevenue: Math.round(cashRevenue),
            transferRevenue: Math.round(transferRevenue),
            cashOrdersCount,
            transferOrdersCount,
            totalCost: Math.round(totalCost),
            grossProfit: Math.round(grossProfit),
            operatingExpenses: Math.round(operatingExpenses),
            otherIncome: Math.round(otherIncome),
            netProfit: Math.round(netProfit),
            profitMargin,
            totalOrders: monthOrders.length,
            avgOrderValue,
            dailyBreakdown,
            topMedicines
        };
    },

    loadMonthlyReport() {
        if (window.AuthModule && !AuthModule.canAccessTab('reports')) {
            return;
        }
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

    // RENDER CHI TIẾT NGÀY: THEO HÓA ĐƠN HOẶC THEO MẶT HÀNG
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
        const dayOrders = orders.filter(o => 
            !o.isCancelled && 
            !o.isReturn && 
            o.type !== 'return' && 
            o.orderType !== 'return' && 
            o.createdAt && 
            o.createdAt.startsWith(dateStr)
        );

        // Sắp xếp đơn theo thời gian mới nhất lên đầu
        dayOrders.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

        const itemsMap = {};
        let dayRevenue = 0;
        let dayCost = 0;

        const processedOrders = dayOrders.map(o => {
            const rawAmount = o.totalAmount || 0;
            const refundAmount = o.totalRefunded || 0;
            const netRevenue = Math.max(0, rawAmount - refundAmount);

            const orderSubTotal = o.subTotal || (o.items || []).reduce((s, it) => s + (it.lineTotal || (it.quantity * it.price) || 0), 0);
            const discountFactor = (orderSubTotal > 0 && o.discount > 0 && o.totalAmount) ? (o.totalAmount / orderSubTotal) : 1;

            let orderCost = 0;
            (o.items || []).forEach(item => {
                const returnedQty = (o.returns || []).reduce((sum, r) => {
                    const ri = (r.items || []).find(x => x.medicineId === item.medicineId && x.unit === item.unit);
                    return sum + (ri ? ri.quantity : 0);
                }, 0);
                
                let rawQty = (typeof item.quantity === 'number') ? item.quantity : Number(item.quantity);
                if (isNaN(rawQty) || (rawQty <= 0 && item.lineTotal > 0 && item.price > 0)) {
                    rawQty = item.price > 0 ? (item.lineTotal / item.price) : 0;
                }
                const netQty = Math.max(0, rawQty - returnedQty);

                let unitCost = 0;
                const med = Store.getMedicineById(item.medicineId) || (Store._medicineMap ? (Store._medicineMap[item.medicineCode] || Store._medicineMap[item.medicineId]) : null);
                if (med) {
                    unitCost = Store.getMedicineUnitCost(med, item.unit);
                }
                if (unitCost <= 0) {
                    unitCost = item.costPrice || 0;
                }
                const lineCost = unitCost * netQty;
                orderCost += lineCost;

                if (netQty > 0 || returnedQty > 0) {
                    const effectiveMedId = (med ? med.id : '') || item.medicineId || item.medicineCode || '---';
                    const key = `${effectiveMedId}_${item.unit}`;
                    if (!itemsMap[key]) {
                        itemsMap[key] = {
                            medicineId: effectiveMedId,
                            medicineName: item.medicineName,
                            unit: item.unit,
                            quantity: 0,
                            returnedQuantity: 0,
                            price: item.price || 0,
                            costPrice: unitCost,
                            revenue: 0,
                            cost: 0,
                            orderIds: []
                        };
                    }
                    let baseLineTotal = (typeof item.lineTotal === 'number' && item.lineTotal > 0) ? item.lineTotal : (rawQty * (item.price || 0));
                    const effectiveLineRevenue = (rawQty > 0 ? (netQty / rawQty) * baseLineTotal : baseLineTotal) * discountFactor;
                    const effectiveLineCost = netQty * unitCost;

                    itemsMap[key].quantity += netQty;
                    itemsMap[key].returnedQuantity += returnedQty;
                    itemsMap[key].revenue += effectiveLineRevenue;
                    itemsMap[key].cost += effectiveLineCost;
                    if (!itemsMap[key].orderIds.includes(o.id)) {
                        itemsMap[key].orderIds.push(o.id);
                    }
                }
            });

            dayRevenue += netRevenue;
            dayCost += orderCost;

            const orderProfit = netRevenue - orderCost;
            const orderMargin = netRevenue > 0 ? ((orderProfit / netRevenue) * 100).toFixed(1) : 0;

            return {
                ...o,
                netRevenue,
                orderCost,
                orderProfit,
                orderMargin
            };
        });

        const itemsList = Object.values(itemsMap);

        // Tìm các phiếu hoàn tiền khách trả hàng trong ngày từ Sổ Quỹ
        const allVouchers = (typeof Store.getVouchers === 'function') ? Store.getVouchers() : [];
        const dayReturnVouchers = allVouchers.filter(v => 
            !v.isCancelled && 
            v.type === 'payment' && 
            (
                (v.category && (v.category.includes('trả khách') || v.category.includes('trả lại hàng'))) || 
                (v.reason && (v.reason.includes('trả khách') || v.reason.includes('trả lại hàng'))) || 
                (v.id && v.id.startsWith('TTTH'))
            ) &&
            v.createdAt && v.createdAt.startsWith(dateStr)
        );

        const dayCustomerRefund = dayReturnVouchers.reduce((sum, v) => sum + Math.abs(Number(v.amount) || 0), 0);
        const dayCustomerReturnCost = dayReturnVouchers.reduce((sum, v) => {
            let vCost = 0;
            if (typeof v.returnCost === 'number' && v.returnCost > 0) {
                vCost = v.returnCost;
            } else if (v.returnedItems && Array.isArray(v.returnedItems) && v.returnedItems.length > 0) {
                vCost = v.returnedItems.reduce((s, it) => s + (it.totalCost || (it.costPrice * (it.quantity || 1)) || 0), 0);
            }
            return sum + vCost;
        }, 0);

        const dayData = this.currentReportData?.dailyBreakdown?.find(d => d.fullDate === dateStr);
        const finalDayRevenue = dayData ? dayData.totalRevenue : Math.max(0, dayRevenue - dayCustomerRefund);
        const finalDayCost = dayData ? dayData.totalCost : Math.max(0, dayCost - dayCustomerReturnCost);
        const finalDayProfit = dayData ? dayData.profit : (finalDayRevenue - finalDayCost);
        const finalGrossRevenue = dayData ? (dayData.grossRevenue || dayRevenue) : dayRevenue;
        const finalGrossCost = dayData ? (dayData.grossCost || dayCost) : dayCost;
        const finalRefund = dayData ? (dayData.customerRefund || 0) : dayCustomerRefund;
        const finalReturnCost = dayData ? (dayData.customerReturnCost || 0) : dayCustomerReturnCost;

        // Cập nhật 5 thẻ KPI ngày
        const elOrderCount = document.getElementById('rep-detail-order-count');
        const elItemCount = document.getElementById('rep-detail-item-count');
        const elRevenue = document.getElementById('rep-detail-day-revenue');
        const elCost = document.getElementById('rep-detail-day-cost');
        const elProfit = document.getElementById('rep-detail-day-profit');

        if (elOrderCount) {
            if (dayReturnVouchers.length > 0) {
                elOrderCount.innerHTML = `${dayOrders.length} hóa đơn<span class="text-[10px] text-rose-600 font-semibold block font-sans">(+ ${dayReturnVouchers.length} phiếu trả hàng)</span>`;
            } else {
                elOrderCount.innerText = `${dayOrders.length} hóa đơn`;
            }
        }
        if (elItemCount) elItemCount.innerText = `${itemsList.length} mặt hàng`;
        if (elRevenue) {
            if (finalRefund > 0) {
                elRevenue.innerHTML = `${AppUtils.formatVND(finalDayRevenue)}<span class="text-[10px] text-rose-600 font-semibold block font-sans">Bán: ${AppUtils.formatVND(finalGrossRevenue)} | Trả: -${AppUtils.formatVND(finalRefund)}</span>`;
            } else {
                elRevenue.innerText = AppUtils.formatVND(finalDayRevenue);
            }
        }
        if (elCost) {
            if (finalReturnCost > 0) {
                elCost.innerHTML = `${AppUtils.formatVND(finalDayCost)}<span class="text-[10px] text-rose-600 font-semibold block font-sans">Xuất: ${AppUtils.formatVND(finalGrossCost)} | Trả: -${AppUtils.formatVND(finalReturnCost)}</span>`;
            } else {
                elCost.innerText = AppUtils.formatVND(finalDayCost);
            }
        }
        if (elProfit) elProfit.innerText = AppUtils.formatVND(finalDayProfit);

        // Hiển thị danh sách phiếu khách trả hàng trong ngày nếu có
        const returnsBox = document.getElementById('rep-detail-day-returns-box');
        if (returnsBox) {
            if (dayReturnVouchers.length > 0) {
                let rHtml = `
                    <div class="p-3 sm:p-3.5 bg-rose-50/90 text-xs">
                        <div class="flex flex-col sm:flex-row sm:items-center sm:justify-between text-rose-900 font-bold mb-2 gap-1">
                            <div class="flex items-center gap-1.5">
                                <i data-lucide="rotate-ccw" class="w-4 h-4 text-rose-600"></i>
                                <span class="uppercase tracking-wide">Phiếu Khách Trả Hàng Hoàn Tiền Trong Ngày (${dayReturnVouchers.length} phiếu)</span>
                            </div>
                            <div class="flex items-center gap-2 text-xs flex-wrap">
                                <span class="text-rose-700 font-mono font-black">Tổng hoàn tiền: -${AppUtils.formatVND(dayCustomerRefund)}</span>
                                ${finalReturnCost > 0 ? `<span class="text-emerald-800 font-mono font-bold">| Giảm vốn: -${AppUtils.formatVND(finalReturnCost)}</span>` : ''}
                            </div>
                        </div>
                        <div class="grid grid-cols-1 sm:grid-cols-2 gap-2">
                `;
                dayReturnVouchers.forEach(v => {
                    const method = v.paymentMethod === 'transfer' ? 'Chuyển khoản' : 'Tiền mặt';
                    const time = v.createdAt ? v.createdAt.slice(11, 16) : '';
                    const vCost = v.returnCost || 0;
                    rHtml += `
                        <div class="bg-white p-2.5 rounded-lg border border-rose-200 shadow-sm flex flex-col justify-between gap-1.5">
                            <div class="flex items-start justify-between gap-2">
                                <div>
                                    <div class="font-mono font-bold text-slate-800 flex items-center gap-1.5">
                                        <span>${v.id}</span>
                                        <span class="text-[10px] text-slate-400 font-normal">(${time})</span>
                                        ${v.refId ? `<span class="text-[10px] bg-slate-100 text-slate-600 px-1 py-0.2 rounded font-mono">Đơn: ${v.refId}</span>` : ''}
                                    </div>
                                    <div class="text-[11px] text-slate-600 truncate max-w-[200px] mt-0.5">${v.person || v.targetName || 'Khách lẻ'} • <span class="text-amber-800 font-medium">${method}</span></div>
                                </div>
                                <div class="text-right whitespace-nowrap">
                                    <div class="font-mono font-black text-rose-700">-${AppUtils.formatVND(Math.abs(Number(v.amount) || 0))}</div>
                                    ${(vCost > 0) ? `<div class="font-mono text-[11px] text-slate-500 font-semibold">Vốn: -${AppUtils.formatVND(vCost)}</div>` : ''}
                                </div>
                            </div>
                        </div>
                    `;
                });
                rHtml += `</div></div>`;
                returnsBox.innerHTML = rHtml;
                returnsBox.classList.remove('hidden');
            } else {
                returnsBox.innerHTML = '';
                returnsBox.classList.add('hidden');
            }
        }

        // =====================================================================
        // BẢNG 1: RENDER THEO DANH SÁCH HÓA ĐƠN (YÊU CẦU CỦA NGƯỜI DÙNG)
        // =====================================================================
        const ordersTbody = document.getElementById('rep-selected-date-orders-tbody');
        if (ordersTbody) {
            if (processedOrders.length === 0) {
                ordersTbody.innerHTML = `
                    <tr>
                        <td colspan="10" class="text-center py-10 text-slate-400 text-xs">
                            <i data-lucide="receipt" class="w-8 h-8 mx-auto mb-1.5 opacity-40"></i>
                            Không có hóa đơn nào được xuất vào ngày ${AppUtils.formatDate(dateStr)}.
                        </td>
                    </tr>
                `;
            } else {
                let oHtml = '';
                processedOrders.forEach((o, idx) => {
                    const time = o.createdAt ? o.createdAt.slice(11, 16) : '--:--';
                    const isCash = (o.paymentMethod === 'cash');
                    const paymentBadge = isCash
                        ? '<span class="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold bg-amber-50 text-amber-700 border border-amber-200">Tiền mặt</span>'
                        : '<span class="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold bg-sky-50 text-sky-700 border border-sky-200">VietQR CK</span>';

                    // Tóm tắt danh sách mặt hàng
                    const itemsSummary = (o.items || []).map(it => {
                        return `${it.medicineName} (${it.quantity} ${it.unit || ''})`.trim();
                    }).join(', ');

                    const itemsCountText = `${(o.items || []).length} loại thuốc`;

                    oHtml += `
                        <tr class="border-b border-slate-100 hover:bg-slate-50 text-xs transition-colors">
                            <td class="py-2.5 px-3 text-center text-slate-400 font-mono">${idx + 1}</td>
                            <td class="py-2.5 px-3 whitespace-nowrap">
                                <button type="button" onclick="OrdersModule.openOrderDetailsModal('${o.id}')" class="font-mono font-bold text-emerald-800 hover:text-emerald-950 hover:underline cursor-pointer flex items-center gap-1 group">
                                    <span>${o.id}</span>
                                    <i data-lucide="external-link" class="w-3 h-3 opacity-50 group-hover:opacity-100 shrink-0"></i>
                                </button>
                            </td>
                            <td class="py-2.5 px-3 text-center font-mono text-slate-500 whitespace-nowrap">${time}</td>
                            <td class="py-2.5 px-3">
                                <div class="font-semibold text-slate-800 truncate max-w-[140px]" title="${o.customerName || 'Khách vãng lai'}">${o.customerName || 'Khách vãng lai'}</div>
                                ${o.customerPhone ? `<div class="text-[10px] text-slate-400 font-mono">${o.customerPhone}</div>` : ''}
                            </td>
                            <td class="py-2.5 px-3 max-w-xs">
                                <div class="text-slate-700 truncate" title="${itemsSummary}">${itemsSummary || '---'}</div>
                                <div class="text-[10px] text-slate-400 mt-0.5 font-medium">${itemsCountText}</div>
                            </td>
                            <td class="py-2.5 px-3 text-center whitespace-nowrap">${paymentBadge}</td>
                            <td class="py-2.5 px-3 text-right font-bold text-emerald-800 font-mono whitespace-nowrap">
                                ${AppUtils.formatVND(o.netRevenue)}
                                ${o.totalRefunded > 0 ? `<div class="text-[10px] text-rose-600 font-medium font-sans">Đã hoàn: -${AppUtils.formatVND(o.totalRefunded)}</div>` : ''}
                            </td>
                            <td class="py-2.5 px-3 text-right text-slate-600 font-mono whitespace-nowrap">${AppUtils.formatVND(Math.round(o.orderCost))}</td>
                            <td class="py-2.5 px-3 text-right whitespace-nowrap">
                                <div class="font-bold text-slate-900 font-mono">${AppUtils.formatVND(Math.round(o.orderProfit))}</div>
                                <div class="text-[10px] text-slate-400 font-semibold">${o.orderMargin}%</div>
                            </td>
                            <td class="py-2.5 px-3 text-center whitespace-nowrap">
                                <div class="flex items-center justify-center gap-1">
                                    <button type="button" onclick="OrdersModule.openOrderDetailsModal('${o.id}')" title="Xem chi tiết hóa đơn" class="p-1 text-slate-500 hover:text-emerald-700 hover:bg-emerald-50 rounded transition cursor-pointer">
                                        <i data-lucide="eye" class="w-3.5 h-3.5"></i>
                                    </button>
                                    <button type="button" onclick="OrdersModule.reprintOrder('${o.id}')" title="In lại hóa đơn" class="p-1 text-slate-500 hover:text-sky-700 hover:bg-sky-50 rounded transition cursor-pointer">
                                        <i data-lucide="printer" class="w-3.5 h-3.5"></i>
                                    </button>
                                </div>
                            </td>
                        </tr>
                    `;
                });
                ordersTbody.innerHTML = oHtml;
            }
        }

        // =====================================================================
        // BẢNG 2: RENDER THEO MẶT HÀNG (PHỤ TRỢ KHI NGƯỜI DÙNG MUỐN XEM THEO THUỐC)
        // =====================================================================
        const itemsTbody = document.getElementById('rep-selected-date-items-tbody');
        if (itemsTbody) {
            if (itemsList.length === 0) {
                itemsTbody.innerHTML = `
                    <tr>
                        <td colspan="9" class="text-center py-8 text-slate-400 text-xs">
                            <i data-lucide="package-x" class="w-8 h-8 mx-auto mb-1 opacity-40"></i>
                            Không có mặt hàng thuốc nào được bán vào ngày ${AppUtils.formatDate(dateStr)}.
                        </td>
                    </tr>
                `;
            } else {
                let iHtml = '';
                itemsList.sort((a, b) => b.revenue - a.revenue).forEach((item, idx) => {
                    const displayQty = (Number.isInteger(item.quantity)) ? item.quantity : (Math.round(item.quantity * 1000) / 1000);
                    const margin = item.revenue > 0 ? (((item.revenue - item.cost) / item.revenue) * 100).toFixed(1) : 0;
                    const ordersBadge = item.orderIds.map(id => `<span onclick="OrdersModule.openOrderDetailsModal('${id}')" class="cursor-pointer hover:underline text-emerald-700 font-mono text-[11px] font-bold bg-emerald-50 px-1.5 py-0.5 rounded border border-emerald-200 mr-1">${id}</span>`).join('');

                    iHtml += `
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
                                ${displayQty} ${item.unit}
                                ${item.returnedQuantity > 0 ? `<div class="text-[10px] text-rose-600 font-bold">(Đã trả: ${item.returnedQuantity})</div>` : ''}
                            </td>
                            <td class="py-2.5 px-3 text-right text-slate-700">${AppUtils.formatVND(item.price)}</td>
                            <td class="py-2.5 px-3 text-right font-bold text-emerald-700 font-mono">${AppUtils.formatVND(Math.round(item.revenue))}</td>
                            <td class="py-2.5 px-3 text-right text-slate-500 font-mono">${AppUtils.formatVND(Math.round(item.cost))}</td>
                            <td class="py-2.5 px-3 text-right">
                                <div class="font-bold text-slate-900 font-mono">${AppUtils.formatVND(Math.round(item.revenue - item.cost))}</div>
                                <div class="text-[10px] text-slate-400 font-semibold">${margin}%</div>
                            </td>
                            <td class="py-2.5 px-3">
                                <div class="flex flex-wrap gap-1">${ordersBadge}</div>
                            </td>
                        </tr>
                    `;
                });
                itemsTbody.innerHTML = iHtml;
            }
        }

        // Cập nhật chế độ hiển thị đang chọn
        this.setDailyDetailViewMode(this.dailyDetailViewMode);

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

        if (elTotalRev) {
            if (r.totalCustomerRefund > 0) {
                elTotalRev.innerHTML = `${AppUtils.formatVND(r.totalRevenue)}<span class="text-[11px] text-emerald-200 block font-normal mt-0.5 font-sans">Bán: ${AppUtils.formatVND(r.grossRevenue)} • Trả: -${AppUtils.formatVND(r.totalCustomerRefund)}</span>`;
            } else {
                elTotalRev.innerText = AppUtils.formatVND(r.totalRevenue);
            }
        }
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
        if (elTotalOrders) {
            elTotalOrders.innerText = `${r.totalOrders} đơn bán${r.customerRefundCount > 0 ? ` • ${r.customerRefundCount} phiếu trả` : ' hoàn tất'}`;
        }
        if (elAvgOrder) elAvgOrder.innerText = `TB: ${AppUtils.formatVND(r.avgOrderValue)} / đơn`;
    },

    renderDailyTable(r) {
        const tbody = document.getElementById('rep-daily-table-tbody');
        const tfoot = document.getElementById('rep-daily-table-tfoot');
        if (!tbody) return;

        let html = '';
        r.dailyBreakdown.forEach((row, idx) => {
            const hasSales = row.totalRevenue > 0 || (row.grossRevenue && row.grossRevenue > 0) || (row.customerRefund && row.customerRefund > 0);
            const isSelected = this.selectedDetailDate === row.fullDate;
            const refundInfo = (row.customerRefund > 0)
                ? `<div class="text-[10px] text-rose-600 font-semibold leading-tight">-${AppUtils.formatVND(row.customerRefund)} trả</div>`
                : '';
            const returnCostInfo = (row.customerReturnCost > 0)
                ? `<div class="text-[10px] text-rose-600 font-semibold leading-tight">-${AppUtils.formatVND(row.customerReturnCost)} trả</div>`
                : '';
            const orderInfo = (row.returnVouchers && row.returnVouchers.length > 0)
                ? `${row.orderCount} <span class="text-[10px] text-rose-600 font-normal block">(+${row.returnVouchers.length} trả)</span>`
                : `${row.orderCount}`;

            html += `
                <tr onclick="ReportsModule.selectDateForDetails('${row.fullDate}')" 
                    class="cursor-pointer transition-colors border-b border-slate-100 ${isSelected ? 'bg-emerald-100/70 font-semibold text-emerald-950 ring-1 ring-inset ring-emerald-400' : (hasSales ? 'hover:bg-slate-50' : 'opacity-40 hover:opacity-80')} text-xs">
                    <td class="py-2.5 px-3 text-center whitespace-nowrap font-medium flex items-center justify-center gap-1">
                        ${isSelected ? '<i data-lucide="chevron-right" class="w-3.5 h-3.5 text-emerald-700"></i>' : ''}
                        <span>${row.dateStr}</span>
                    </td>
                    <td class="py-2.5 px-3 text-center font-mono">${orderInfo}</td>
                    <td class="py-2.5 px-3 text-right font-mono text-slate-700">${AppUtils.formatVND(row.cashRevenue)}</td>
                    <td class="py-2.5 px-3 text-right font-mono text-slate-700">${AppUtils.formatVND(row.transferRevenue)}</td>
                    <td class="py-2.5 px-3 text-right font-bold text-emerald-800 font-mono">
                        ${AppUtils.formatVND(row.totalRevenue)}
                        ${refundInfo}
                    </td>
                    <td class="py-2.5 px-3 text-right font-mono text-slate-500">
                        ${AppUtils.formatVND(row.totalCost)}
                        ${returnCostInfo}
                    </td>
                    <td class="py-2.5 px-3 text-right font-bold font-mono ${row.profit >= 0 ? 'text-emerald-700' : 'text-rose-600'}">
                        ${AppUtils.formatVND(row.profit)}
                    </td>
                    <td class="py-2.5 px-3 text-center">
                        <button type="button" class="px-2 py-0.5 rounded text-[10px] font-bold ${isSelected ? 'bg-emerald-700 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}">
                            ${isSelected ? 'Đang xem' : 'Xem đơn'}
                        </button>
                    </td>
                </tr>
            `;
        });
        tbody.innerHTML = html;

        if (tfoot) {
            tfoot.innerHTML = `
                <tr class="bg-emerald-50/80 font-bold text-xs text-slate-800 border-t-2 border-emerald-300">
                    <td class="py-3 px-3 text-center uppercase tracking-wider text-emerald-900">Tổng Tháng ${r.month}</td>
                    <td class="py-3 px-3 text-center font-mono">${r.totalOrders} ${r.customerRefundCount > 0 ? `(+${r.customerRefundCount} trả)` : ''}</td>
                    <td class="py-3 px-3 text-right font-mono text-amber-700">${AppUtils.formatVND(r.cashRevenue)}</td>
                    <td class="py-3 px-3 text-right font-mono text-sky-700">${AppUtils.formatVND(r.transferRevenue)}</td>
                    <td class="py-3 px-3 text-right font-mono text-emerald-800 font-extrabold">
                        ${AppUtils.formatVND(r.totalRevenue)}
                        ${r.totalCustomerRefund > 0 ? `<div class="text-[10px] text-rose-600 font-normal">-${AppUtils.formatVND(r.totalCustomerRefund)} trả</div>` : ''}
                    </td>
                    <td class="py-3 px-3 text-right font-mono text-slate-600">
                        ${AppUtils.formatVND(r.totalCost)}
                        ${r.totalCustomerReturnCost > 0 ? `<div class="text-[10px] text-rose-600 font-normal">-${AppUtils.formatVND(r.totalCustomerReturnCost)} vốn trả</div>` : ''}
                    </td>
                    <td class="py-3 px-3 text-right font-mono text-emerald-800 font-extrabold">${AppUtils.formatVND(r.grossProfit)}</td>
                    <td class="py-3 px-3 text-center text-[11px] text-slate-400">---</td>
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

        // 1. Biểu đồ Doanh Thu Từng Ngày (Tiền mặt vs CK)
        const ctxDaily = document.getElementById('chart-revenue-daily')?.getContext('2d');
        if (ctxDaily) {
            if (this.chartRevenueDaily) this.chartRevenueDaily.destroy();

            const labels = r.dailyBreakdown.map(d => d.dateStr);
            const cashData = r.dailyBreakdown.map(d => d.cashRevenue);
            const transferData = r.dailyBreakdown.map(d => d.transferRevenue);

            this.chartRevenueDaily = new Chart(ctxDaily, {
                type: 'bar',
                data: {
                    labels: labels,
                    datasets: [
                        {
                            label: 'Tiền mặt (đ)',
                            data: cashData,
                            backgroundColor: '#f59e0b',
                            borderRadius: 4
                        },
                        {
                            label: 'Chuyển khoản (đ)',
                            data: transferData,
                            backgroundColor: '#0284c7',
                            borderRadius: 4
                        }
                    ]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    scales: {
                        x: { stacked: true, grid: { display: false } },
                        y: {
                            stacked: true,
                            ticks: {
                                callback: val => (val >= 1000000 ? (val / 1000000) + ' Tr' : (val / 1000) + 'k')
                            }
                        }
                    },
                    plugins: {
                        tooltip: {
                            callbacks: {
                                label: context => `${context.dataset.label}: ${AppUtils.formatVND(context.raw)}`
                            }
                        }
                    }
                }
            });
        }

        // 2. Biểu đồ Tỷ Trọng Thanh Toán (Donut)
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
    },

    // =========================================================================
    // SUB-TAB 2: BẢNG KÊ CHI TIẾT THEO THÁNG (12 THÁNG TRONG NĂM)
    // =========================================================================
    changeYearlyYear(year) {
        this.selectedYearForMonthly = parseInt(year);
        this.loadYearlyReport();
    },

    calculateYearlyData(year) {
        const monthsData = [];
        let totalRevenue = 0;
        let cashRevenue = 0;
        let transferRevenue = 0;
        let totalCost = 0;
        let grossProfit = 0;
        let totalOrders = 0;
        let totalExpenses = 0;
        let netProfit = 0;

        for (let m = 1; m <= 12; m++) {
            const mData = this.calculateMonthlyData(m, year);
            mData.totalRevenue = Math.round(mData.totalRevenue || 0);
            mData.cashRevenue = Math.round(mData.cashRevenue || 0);
            mData.transferRevenue = Math.round(mData.transferRevenue || 0);
            mData.totalCost = Math.round(mData.totalCost || 0);
            mData.grossProfit = Math.round(mData.grossProfit || 0);
            mData.operatingExpenses = Math.round(mData.operatingExpenses || 0);
            mData.netProfit = Math.round(mData.netProfit || 0);

            monthsData.push(mData);

            totalRevenue += mData.totalRevenue;
            cashRevenue += mData.cashRevenue;
            transferRevenue += mData.transferRevenue;
            totalCost += mData.totalCost;
            grossProfit += mData.grossProfit;
            totalOrders += mData.totalOrders;
            totalExpenses += mData.operatingExpenses;
            netProfit += mData.netProfit;
        }

        totalRevenue = Math.round(totalRevenue);
        totalCost = Math.round(totalCost);
        grossProfit = Math.round(grossProfit);
        totalExpenses = Math.round(totalExpenses);
        netProfit = Math.round(netProfit);

        const overallMargin = totalRevenue > 0 ? ((grossProfit / totalRevenue) * 100).toFixed(1) : 0;
        const costRatio = totalRevenue > 0 ? ((totalCost / totalRevenue) * 100).toFixed(1) : 0;

        return {
            year,
            months: monthsData,
            totals: {
                totalRevenue,
                cashRevenue,
                transferRevenue,
                totalCost,
                grossProfit,
                totalOrders,
                totalExpenses,
                netProfit,
                overallMargin,
                costRatio
            }
        };
    },

    loadYearlyReport() {
        const yData = this.calculateYearlyData(this.selectedYearForMonthly);
        this.currentYearlyData = yData;

        // Render 4 KPI Card Năm
        const elRev = document.getElementById('rep-yearly-kpi-revenue');
        const elOrders = document.getElementById('rep-yearly-kpi-orders');
        const elCost = document.getElementById('rep-yearly-kpi-cost');
        const elCostRatio = document.getElementById('rep-yearly-kpi-cost-ratio');
        const elGross = document.getElementById('rep-yearly-kpi-gross-profit');
        const elMargin = document.getElementById('rep-yearly-kpi-margin');
        const elNet = document.getElementById('rep-yearly-kpi-net-profit');
        const elExp = document.getElementById('rep-yearly-kpi-expenses');

        if (elRev) elRev.innerText = AppUtils.formatVND(Math.round(yData.totals.totalRevenue));
        if (elOrders) elOrders.innerText = `${yData.totals.totalOrders} hóa đơn hoàn tất`;
        if (elCost) elCost.innerText = AppUtils.formatVND(Math.round(yData.totals.totalCost));
        if (elCostRatio) elCostRatio.innerText = `Chiếm ${yData.totals.costRatio}% doanh thu`;
        if (elGross) elGross.innerText = AppUtils.formatVND(Math.round(yData.totals.grossProfit));
        if (elMargin) elMargin.innerText = `Tỷ suất gộp: ${yData.totals.overallMargin}%`;
        if (elNet) elNet.innerText = AppUtils.formatVND(Math.round(yData.totals.netProfit));
        if (elExp) elExp.innerText = `Chi phí vận hành: ${AppUtils.formatVND(Math.round(yData.totals.totalExpenses))}`;

        // Render Bảng kê 12 tháng
        const tbody = document.getElementById('rep-yearly-table-tbody');
        const tfoot = document.getElementById('rep-yearly-table-tfoot');

        if (tbody) {
            let html = '';
            yData.months.forEach(m => {
                const hasData = m.totalRevenue > 0 || m.totalOrders > 0;
                html += `
                    <tr class="border-b border-slate-100 hover:bg-slate-50 transition ${hasData ? '' : 'opacity-40'}">
                        <td class="py-2.5 px-3.5 text-center font-bold text-slate-800 whitespace-nowrap">Tháng ${String(m.month).padStart(2, '0')}/${m.year}</td>
                        <td class="py-2.5 px-3 text-center font-mono font-semibold whitespace-nowrap">${m.totalOrders}</td>
                        <td class="py-2.5 px-3.5 text-right font-mono text-amber-700 whitespace-nowrap">${AppUtils.formatVND(Math.round(m.cashRevenue))}</td>
                        <td class="py-2.5 px-3.5 text-right font-mono text-sky-700 whitespace-nowrap">${AppUtils.formatVND(Math.round(m.transferRevenue))}</td>
                        <td class="py-2.5 px-3.5 text-right font-black font-mono text-emerald-800 whitespace-nowrap">${AppUtils.formatVND(Math.round(m.totalRevenue))}</td>
                        <td class="py-2.5 px-3.5 text-right font-mono text-slate-600 whitespace-nowrap">${AppUtils.formatVND(Math.round(m.totalCost))}</td>
                        <td class="py-2.5 px-3.5 text-right font-bold font-mono text-emerald-700 whitespace-nowrap">${AppUtils.formatVND(Math.round(m.grossProfit))}</td>
                        <td class="py-2.5 px-3 text-center font-semibold text-slate-600 whitespace-nowrap">${m.profitMargin}%</td>
                        <td class="py-2.5 px-3.5 text-right font-mono text-rose-700 whitespace-nowrap">${AppUtils.formatVND(Math.round(m.operatingExpenses))}</td>
                        <td class="py-2.5 px-3.5 text-right font-black font-mono ${m.netProfit >= 0 ? 'text-blue-800' : 'text-rose-600'} whitespace-nowrap">${AppUtils.formatVND(Math.round(m.netProfit))}</td>
                        <td class="py-2.5 px-3 text-center whitespace-nowrap">
                            <button type="button" onclick="ReportsModule.jumpToMonth(${m.month}, ${m.year})" class="px-2.5 py-1 bg-emerald-50 hover:bg-emerald-100 text-emerald-800 rounded-lg font-bold border border-emerald-200 transition cursor-pointer text-[11px]">
                                Xem chi tiết
                            </button>
                        </td>
                    </tr>
                `;
            });
            tbody.innerHTML = html;
        }

        if (tfoot) {
            tfoot.innerHTML = `
                <tr class="text-slate-800">
                    <td class="py-3 px-3.5 text-center uppercase tracking-wider text-emerald-900 font-black whitespace-nowrap">CẢ NĂM ${yData.year}</td>
                    <td class="py-3 px-3 text-center font-mono font-black whitespace-nowrap">${yData.totals.totalOrders}</td>
                    <td class="py-3 px-3.5 text-right font-mono text-amber-800 font-bold whitespace-nowrap">${AppUtils.formatVND(Math.round(yData.totals.cashRevenue))}</td>
                    <td class="py-3 px-3.5 text-right font-mono text-sky-800 font-bold whitespace-nowrap">${AppUtils.formatVND(Math.round(yData.totals.transferRevenue))}</td>
                    <td class="py-3 px-3.5 text-right font-mono text-emerald-950 font-black text-sm whitespace-nowrap">${AppUtils.formatVND(Math.round(yData.totals.totalRevenue))}</td>
                    <td class="py-3 px-3.5 text-right font-mono text-slate-700 font-bold whitespace-nowrap">${AppUtils.formatVND(Math.round(yData.totals.totalCost))}</td>
                    <td class="py-3 px-3.5 text-right font-mono text-emerald-800 font-black text-sm whitespace-nowrap">${AppUtils.formatVND(Math.round(yData.totals.grossProfit))}</td>
                    <td class="py-3 px-3 text-center font-bold text-emerald-900 whitespace-nowrap">${yData.totals.overallMargin}%</td>
                    <td class="py-3 px-3.5 text-right font-mono text-rose-800 font-black whitespace-nowrap">${AppUtils.formatVND(Math.round(yData.totals.totalExpenses))}</td>
                    <td class="py-3 px-3.5 text-right font-mono text-blue-900 font-black text-sm whitespace-nowrap">${AppUtils.formatVND(Math.round(yData.totals.netProfit))}</td>
                    <td class="py-3 px-3 text-center text-slate-400 whitespace-nowrap">---</td>
                </tr>
            `;
        }

        // Render Biểu đồ 12 Tháng
        this.renderYearlyChart(yData);
    },

    jumpToMonth(m, y) {
        this.selectedMonth = m;
        this.selectedYear = y;

        const mSel = document.getElementById('report-select-month');
        const ySel = document.getElementById('report-select-year');
        if (mSel) mSel.value = m;
        if (ySel) ySel.value = y;

        this.switchSubTab('daily');
    },

    renderYearlyChart(yData) {
        if (typeof Chart === 'undefined') return;
        const ctx = document.getElementById('chart-yearly-monthly')?.getContext('2d');
        if (!ctx) return;

        if (this.chartYearlyMonthly) this.chartYearlyMonthly.destroy();

        const labels = yData.months.map(m => `T${m.month}`);
        const revData = yData.months.map(m => m.totalRevenue);
        const costData = yData.months.map(m => m.totalCost);
        const profitData = yData.months.map(m => m.grossProfit);

        this.chartYearlyMonthly = new Chart(ctx, {
            type: 'bar',
            data: {
                labels: labels,
                datasets: [
                    {
                        type: 'line',
                        label: 'Lợi Nhuận Gộp (đ)',
                        data: profitData,
                        borderColor: '#059669',
                        backgroundColor: '#059669',
                        borderWidth: 2.5,
                        tension: 0.2,
                        pointRadius: 4,
                        yAxisID: 'y'
                    },
                    {
                        type: 'bar',
                        label: 'Tổng Doanh Thu (đ)',
                        data: revData,
                        backgroundColor: '#10b981',
                        borderRadius: 4,
                        yAxisID: 'y'
                    },
                    {
                        type: 'bar',
                        label: 'Tiền Vốn (đ)',
                        data: costData,
                        backgroundColor: '#cbd5e1',
                        borderRadius: 4,
                        yAxisID: 'y'
                    }
                ]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                scales: {
                    x: { grid: { display: false } },
                    y: {
                        ticks: {
                            callback: val => (val >= 1000000 ? (val / 1000000) + ' Tr' : (val / 1000) + 'k')
                        }
                    }
                },
                plugins: {
                    tooltip: {
                        callbacks: {
                            label: context => `${context.dataset.label}: ${AppUtils.formatVND(context.raw)}`
                        }
                    }
                }
            }
        });
    },

    exportYearlyExcel() {
        if (!this.currentYearlyData) return;
        const d = this.currentYearlyData;
        const rows = [
            ['BANG KE CHI TIET DOANH SO & LOI NHUAN THEO THANG - NAM ' + d.year],
            ['Nha thuoc: Medica Trung Kinh - 127 Trung Kinh, Cau Giay, Ha Noi'],
            ['Ngay xuat:', new Date().toLocaleString('vi-VN')],
            [],
            ['Thang', 'So Don', 'Doanh Thu Tien Mat', 'Doanh Thu Chuyen Khoan', 'Tong Doanh Thu Thuan', 'Tien Von Ban Hang', 'Loi Nhuan Gop', 'Ty Suat Gop (%)', 'Chi Phi Van Hanh', 'Loi Nhuan Thuan (Rong)']
        ];

        d.months.forEach(m => {
            rows.push([
                `Thang ${m.month}/${m.year}`,
                m.totalOrders,
                m.cashRevenue,
                m.transferRevenue,
                m.totalRevenue,
                m.totalCost,
                m.grossProfit,
                m.profitMargin + '%',
                m.operatingExpenses,
                m.netProfit
            ]);
        });

        rows.push([
            'TONG CONG CA NAM ' + d.year,
            d.totals.totalOrders,
            d.totals.cashRevenue,
            d.totals.transferRevenue,
            d.totals.totalRevenue,
            d.totals.totalCost,
            d.totals.grossProfit,
            d.totals.overallMargin + '%',
            d.totals.totalExpenses,
            d.totals.netProfit
        ]);

        const csvContent = '\uFEFF' + rows.map(e => e.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(',')).join('\n');
        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        const link = document.createElement('a');
        link.href = URL.createObjectURL(blob);
        link.download = `BangKe_DoanhSo_Nam_${d.year}.csv`;
        link.click();
    },

    // =========================================================================
    // SUB-TAB 3: BÁO CÁO KẾT QUẢ HOẠT ĐỘNG KINH DOANH (P&L CHUẨN KIOTVIET)
    // =========================================================================
    changePnLRange(range) {
        this.pnlRange = range;
        const customBox = document.getElementById('rep-pnl-custom-date-box');
        const now = new Date();
        const year = now.getFullYear();
        const month = now.getMonth() + 1;

        if (range === 'custom') {
            if (customBox) customBox.classList.remove('hidden');
            return;
        } else {
            if (customBox) customBox.classList.add('hidden');
        }

        if (range === 'this_month') {
            const lastDay = new Date(year, month, 0).getDate();
            this.pnlDateFrom = `${year}-${String(month).padStart(2, '0')}-01`;
            this.pnlDateTo = `${year}-${String(month).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;
        } else if (range === 'last_month') {
            const prevM = month === 1 ? 12 : month - 1;
            const prevY = month === 1 ? year - 1 : year;
            const lastDay = new Date(prevY, prevM, 0).getDate();
            this.pnlDateFrom = `${prevY}-${String(prevM).padStart(2, '0')}-01`;
            this.pnlDateTo = `${prevY}-${String(prevM).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;
        } else if (range === 'this_quarter') {
            const q = Math.floor((month - 1) / 3);
            const startM = q * 3 + 1;
            const endM = startM + 2;
            const lastDay = new Date(year, endM, 0).getDate();
            this.pnlDateFrom = `${year}-${String(startM).padStart(2, '0')}-01`;
            this.pnlDateTo = `${year}-${String(endM).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;
        } else if (range === 'this_year') {
            this.pnlDateFrom = `${year}-01-01`;
            this.pnlDateTo = `${year}-12-31`;
        }

        const inputFrom = document.getElementById('rep-pnl-date-from');
        const inputTo = document.getElementById('rep-pnl-date-to');
        if (inputFrom) inputFrom.value = this.pnlDateFrom;
        if (inputTo) inputTo.value = this.pnlDateTo;

        this.loadPnLReport();
    },

    applyPnLCustomDates() {
        const from = document.getElementById('rep-pnl-date-from')?.value;
        const to = document.getElementById('rep-pnl-date-to')?.value;
        if (!from || !to) {
            alert('Vui lòng chọn đầy đủ ngày bắt đầu và ngày kết thúc!');
            return;
        }
        if (from > to) {
            alert('Ngày bắt đầu không được lớn hơn ngày kết thúc!');
            return;
        }
        this.pnlDateFrom = from;
        this.pnlDateTo = to;
        this.loadPnLReport();
    },

    calculatePnLData(startDate, endDate) {
        const allOrders = Store.getOrders();
        const allVouchers = (typeof Store.getVouchers === 'function') ? Store.getVouchers() : [];

        // Lọc hóa đơn trong khoảng ngày
        const orders = allOrders.filter(o => 
            !o.isCancelled && 
            !o.isReturn &&
            o.type !== 'return' &&
            o.orderType !== 'return' &&
            o.createdAt &&
            o.createdAt.slice(0, 10) >= startDate &&
            o.createdAt.slice(0, 10) <= endDate
        );

        let grossSales = 0;       // Doanh thu bán hàng (1)
        let orderDiscount = 0;    // Chiết khấu hóa đơn (2.1)
        let totalCost = 0;        // Giá vốn hàng bán (4)

        orders.forEach(o => {
            const rawAmount = o.totalAmount || 0;
            const subTotal = o.subTotal || (o.items || []).reduce((s, it) => s + (it.lineTotal || (it.quantity * it.price) || 0), 0);
            const disc = o.discount || 0;

            grossSales += (subTotal > 0 ? subTotal : (rawAmount + disc));
            orderDiscount += disc;

            // Tính tiền vốn đơn
            if (o.items && Array.isArray(o.items)) {
                o.items.forEach(item => {
                    const returnedQty = (o.returns || []).reduce((sum, r) => {
                        const ri = (r.items || []).find(x => x.medicineId === item.medicineId && x.unit === item.unit);
                        return sum + (ri ? ri.quantity : 0);
                    }, 0);
                    let rawQty = (typeof item.quantity === 'number') ? item.quantity : Number(item.quantity);
                    if (isNaN(rawQty) || (rawQty <= 0 && item.lineTotal > 0 && item.price > 0)) {
                        rawQty = item.price > 0 ? (item.lineTotal / item.price) : 0;
                    }
                    const netQty = Math.max(0, rawQty - returnedQty);

                    let unitCost = 0;
                    const med = Store.getMedicineById(item.medicineId) || (Store._medicineMap ? (Store._medicineMap[item.medicineCode] || Store._medicineMap[item.medicineId]) : null);
                    if (med) {
                        unitCost = Store.getMedicineUnitCost(med, item.unit);
                    }
                    if (unitCost <= 0) {
                        unitCost = item.costPrice || 0;
                    }
                    totalCost += (unitCost * netQty);
                });
            }
        });

        // Lọc các khoản hoàn trả khách trong kỳ (2.2)
        const returnVouchers = allVouchers.filter(v => 
            !v.isCancelled && 
            v.type === 'payment' && 
            (
                (v.category && (v.category.includes('trả khách') || v.category.includes('trả lại hàng'))) || 
                (v.reason && (v.reason.includes('trả khách') || v.reason.includes('trả lại hàng'))) || 
                (v.id && v.id.startsWith('TTTH'))
            ) &&
            v.createdAt &&
            v.createdAt.slice(0, 10) >= startDate &&
            v.createdAt.slice(0, 10) <= endDate
        );

        let customerRefund = 0;       // Giá trị hàng bán bị trả lại (2.2)
        let customerReturnCost = 0;   // Giảm giá vốn hàng bị trả lại

        returnVouchers.forEach(v => {
            const amt = Math.abs(Number(v.amount) || 0);
            customerRefund += amt;
            let vCost = 0;
            if (typeof v.returnCost === 'number' && v.returnCost > 0) {
                vCost = v.returnCost;
            } else if (v.returnedItems && Array.isArray(v.returnedItems) && v.returnedItems.length > 0) {
                vCost = v.returnedItems.reduce((s, it) => s + (it.totalCost || (it.costPrice * (it.quantity || 1)) || 0), 0);
            }
            customerReturnCost += vCost;
        });

        // 2. Giảm trừ Doanh thu (2 = 2.1 + 2.2)
        const totalDeductions = orderDiscount + customerRefund;

        // 3. Doanh thu thuần (3 = 1 - 2)
        const netRevenue = Math.max(0, grossSales - totalDeductions);

        // 4. Giá vốn hàng bán (4) (Đã trừ vốn hàng bị trả lại)
        const netCost = Math.max(0, totalCost - customerReturnCost);

        // 5. Lợi nhuận gộp về bán hàng (5 = 3 - 4)
        const grossProfit = netRevenue - netCost;

        // 6. Chi phí (6): Phân loại chi tiết từ Sổ Quỹ
        const periodVouchers = allVouchers.filter(v => 
            v.isAccounting !== false && 
            !v.isCancelled &&
            v.createdAt &&
            v.createdAt.slice(0, 10) >= startDate &&
            v.createdAt.slice(0, 10) <= endDate
        );

        const expenseCategoriesMap = {};
        let totalExpenses = 0;

        const otherIncomeCategoriesMap = {};
        let totalOtherIncome = 0;

        periodVouchers.forEach(v => {
            const amt = Math.abs(Number(v.amount) || 0);
            const cat = (v.category || '').trim();
            const reason = (v.reason || '').toLowerCase();
            const vId = (v.id || '');

            if (cat.toLowerCase().includes('chuyển/rút') || cat.toLowerCase().includes('chuyển rút') || reason.includes('chuyển/rút')) {
                return;
            }

            if (v.type === 'payment') {
                if (cat.toLowerCase().includes('tiền trả ncc') || cat.toLowerCase().includes('chi tiền hàng') || vId.startsWith('PCPN') || (v.refId && v.refId.startsWith('PN'))) {
                    return;
                }
                if (cat.toLowerCase().includes('trả khách') || cat.toLowerCase().includes('trả lại hàng') || vId.startsWith('TTTH') || reason.includes('trả khách')) {
                    return; // Đã tính tại 2.2
                }

                const catName = cat || 'Chi phí hoạt động khác';
                expenseCategoriesMap[catName] = (expenseCategoriesMap[catName] || 0) + amt;
                totalExpenses += amt;
            } else if (v.type === 'receipt') {
                if (cat.toLowerCase().includes('tiền khách trả') || cat.toLowerCase().includes('tiền bán thuốc') || vId.startsWith('TTHD')) {
                    return;
                }
                if (cat.toLowerCase().includes('ncc hoàn trả') || vId.startsWith('PTTHN')) {
                    return;
                }

                const catName = cat || 'Thu nhập khác';
                otherIncomeCategoriesMap[catName] = (otherIncomeCategoriesMap[catName] || 0) + amt;
                totalOtherIncome += amt;
            }
        });

        // 7. Lợi nhuận từ hoạt động kinh doanh (7 = 5 - 6)
        const operatingProfit = grossProfit - totalExpenses;

        // 9. Lợi nhuận thuần trước thuế (9 = 7 + 8)
        const netProfitBeforeTax = operatingProfit + totalOtherIncome;

        return {
            startDate,
            endDate,
            grossSales: Math.round(grossSales),
            orderDiscount: Math.round(orderDiscount),
            customerRefund: Math.round(customerRefund),
            totalDeductions: Math.round(totalDeductions),
            netRevenue: Math.round(netRevenue),
            netCost: Math.round(netCost),
            grossProfit: Math.round(grossProfit),
            expenseCategories: expenseCategoriesMap,
            totalExpenses: Math.round(totalExpenses),
            operatingProfit: Math.round(operatingProfit),
            otherIncomeCategories: otherIncomeCategoriesMap,
            totalOtherIncome: Math.round(totalOtherIncome),
            netProfitBeforeTax: Math.round(netProfitBeforeTax)
        };
    },

    loadPnLReport() {
        if (!this.pnlDateFrom || !this.pnlDateTo) {
            this.initPnLDates();
        }

        const pnl = this.calculatePnLData(this.pnlDateFrom, this.pnlDateTo);
        this.currentPnLData = pnl;

        // Header Báo Cáo
        const now = new Date();
        const elCreatedAt = document.getElementById('pnl-created-at');
        if (elCreatedAt) {
            elCreatedAt.innerText = `${AppUtils.formatDate(now.toISOString().slice(0, 10))} ${now.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })}`;
        }

        const elFrom = document.getElementById('pnl-period-from');
        const elTo = document.getElementById('pnl-period-to');
        if (elFrom) elFrom.innerText = AppUtils.formatDate(pnl.startDate);
        if (elTo) elTo.innerText = AppUtils.formatDate(pnl.endDate);

        // Body Bảng Báo Cáo P&L (Chuẩn format KiotViet như ảnh người dùng gửi)
        const tbody = document.getElementById('pnl-report-tbody');
        if (!tbody) return;

        let rowsHtml = '';

        // Dòng 1: Doanh thu bán hàng (1)
        rowsHtml += `
            <tr class="hover:bg-slate-50/80">
                <td class="py-2.5 px-4 font-semibold text-slate-900">Doanh thu bán hàng (1)</td>
                <td class="py-2.5 px-4 text-right font-mono font-bold text-blue-900">${AppUtils.formatVND(pnl.grossSales)}</td>
            </tr>
        `;

        // Dòng 2: Giảm trừ Doanh thu (2 = 2.1 + 2.2)
        rowsHtml += `
            <tr class="hover:bg-slate-50/80">
                <td class="py-2 px-4 text-slate-800">Giảm trừ Doanh thu (2 = 2.1 + 2.2)</td>
                <td class="py-2 px-4 text-right font-mono font-semibold text-slate-700">${AppUtils.formatVND(pnl.totalDeductions)}</td>
            </tr>
            <tr class="hover:bg-slate-50/80 text-slate-600">
                <td class="py-1.5 px-4 pl-8 text-xs">Chiết khấu hóa đơn (2.1)</td>
                <td class="py-1.5 px-4 text-right font-mono text-xs text-blue-800">${AppUtils.formatVND(pnl.orderDiscount)}</td>
            </tr>
            <tr class="hover:bg-slate-50/80 text-slate-600">
                <td class="py-1.5 px-4 pl-8 text-xs">Giá trị hàng bán bị trả lại (2.2)</td>
                <td class="py-1.5 px-4 text-right font-mono text-xs text-blue-800">${AppUtils.formatVND(pnl.customerRefund)}</td>
            </tr>
        `;

        // Dòng 3: Doanh thu thuần (3 = 1 - 2) (Nền xám nhạt nổi bật)
        rowsHtml += `
            <tr class="bg-slate-100/70 border-y border-slate-200">
                <td class="py-2.5 px-4 font-black text-slate-900 uppercase tracking-wide">Doanh thu thuần (3 = 1 - 2)</td>
                <td class="py-2.5 px-4 text-right font-mono font-black text-emerald-900 text-sm">${AppUtils.formatVND(pnl.netRevenue)}</td>
            </tr>
        `;

        // Dòng 4: Giá vốn hàng bán (4)
        rowsHtml += `
            <tr class="hover:bg-slate-50/80">
                <td class="py-2.5 px-4 font-semibold text-slate-900">Giá vốn hàng bán (4)</td>
                <td class="py-2.5 px-4 text-right font-mono font-bold text-slate-800">${AppUtils.formatVND(pnl.netCost)}</td>
            </tr>
        `;

        // Dòng 5: Lợi nhuận gộp về bán hàng (5 = 3 - 4) (Nền xám nhạt)
        rowsHtml += `
            <tr class="bg-slate-100/70 border-y border-slate-200">
                <td class="py-2.5 px-4 font-black text-slate-900 uppercase tracking-wide">Lợi nhuận gộp về bán hàng (5 = 3 - 4)</td>
                <td class="py-2.5 px-4 text-right font-mono font-black text-emerald-800 text-sm">${AppUtils.formatVND(pnl.grossProfit)}</td>
            </tr>
        `;

        // Dòng 6: Chi phí (6)
        rowsHtml += `
            <tr class="hover:bg-slate-50/80">
                <td class="py-2.5 px-4 font-bold text-slate-900">Chi phí (6)</td>
                <td class="py-2.5 px-4 text-right font-mono font-black text-rose-700">${AppUtils.formatVND(pnl.totalExpenses)}</td>
            </tr>
        `;

        // Chi tiết từng dòng mục chi phí
        const expKeys = Object.keys(pnl.expenseCategories).sort((a, b) => pnl.expenseCategories[b] - pnl.expenseCategories[a]);
        if (expKeys.length === 0) {
            rowsHtml += `
                <tr class="text-slate-500 italic text-xs">
                    <td class="py-1.5 px-4 pl-8">Chưa có phát sinh chi phí vận hành trong kỳ</td>
                    <td class="py-1.5 px-4 text-right font-mono">0 đ</td>
                </tr>
            `;
        } else {
            expKeys.forEach(catName => {
                rowsHtml += `
                    <tr class="hover:bg-slate-50/80 text-slate-700">
                        <td class="py-1.5 px-4 pl-8 text-xs">${catName}</td>
                        <td class="py-1.5 px-4 text-right font-mono text-xs font-medium text-slate-800">${AppUtils.formatVND(pnl.expenseCategories[catName])}</td>
                    </tr>
                `;
            });
        }

        // Dòng 7: Lợi nhuận từ hoạt động kinh doanh (7 = 5 - 6)
        const isOperatingProfitPos = pnl.operatingProfit >= 0;
        rowsHtml += `
            <tr class="bg-slate-100/70 border-y border-slate-200 font-bold">
                <td class="py-2.5 px-4 text-slate-900 uppercase tracking-wide">Lợi nhuận từ hoạt động kinh doanh (7 = 5 - 6)</td>
                <td class="py-2.5 px-4 text-right font-mono font-black ${isOperatingProfitPos ? 'text-blue-900' : 'text-rose-600'} text-sm">${AppUtils.formatVND(pnl.operatingProfit)}</td>
            </tr>
        `;

        // Dòng 8: Thu nhập khác (8)
        rowsHtml += `
            <tr class="hover:bg-slate-50/80">
                <td class="py-2.5 px-4 font-bold text-slate-900">Thu nhập khác (8)</td>
                <td class="py-2.5 px-4 text-right font-mono font-bold text-slate-800">${AppUtils.formatVND(pnl.totalOtherIncome)}</td>
            </tr>
        `;

        const otherKeys = Object.keys(pnl.otherIncomeCategories).sort((a, b) => pnl.otherIncomeCategories[b] - pnl.otherIncomeCategories[a]);
        if (otherKeys.length > 0) {
            otherKeys.forEach(catName => {
                rowsHtml += `
                    <tr class="hover:bg-slate-50/80 text-slate-600">
                        <td class="py-1.5 px-4 pl-8 text-xs">${catName}</td>
                        <td class="py-1.5 px-4 text-right font-mono text-xs text-slate-800">${AppUtils.formatVND(pnl.otherIncomeCategories[catName])}</td>
                    </tr>
                `;
            });
        }

        // Dòng 9: Lợi nhuận thuần trước thuế (9 = 7 + 8) (Nổi bật nhất)
        const isNetProfitPos = pnl.netProfitBeforeTax >= 0;
        rowsHtml += `
            <tr class="bg-emerald-50/90 border-t-2 border-emerald-400 font-black">
                <td class="py-3.5 px-4 text-slate-900 text-sm uppercase tracking-wider">Lợi nhuận thuần trước thuế (9 = 7 + 8)</td>
                <td class="py-3.5 px-4 text-right font-mono font-black text-base ${isNetProfitPos ? 'text-emerald-900' : 'text-rose-700'}">${AppUtils.formatVND(pnl.netProfitBeforeTax)}</td>
            </tr>
        `;

        tbody.innerHTML = rowsHtml;
    },

    printPnLReport() {
        const container = document.getElementById('pnl-print-container');
        if (!container) return;

        try {
            const printWin = window.open('', '_blank', 'width=900,height=800');
            if (printWin) {
                printWin.document.write(`
                    <!DOCTYPE html>
                    <html>
                    <head>
                        <meta charset="utf-8">
                        <title>Bao_Cao_Ket_Qua_Kinh_Doanh</title>
                        <script src="https://cdn.tailwindcss.com"></script>
                        <style>
                            @media print {
                                body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
                                @page { size: A4; margin: 12mm; }
                            }
                            body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Arial, sans-serif; }
                        </style>
                    </head>
                    <body class="p-6 bg-white text-slate-800 text-xs">
                        ${container.innerHTML}
                        <script>
                            window.onload = function() {
                                window.focus();
                                window.print();
                                setTimeout(function(){ window.close(); }, 500);
                            };
                        </script>
                    </body>
                    </html>
                `);
                printWin.document.close();
                return;
            }
        } catch(e) {}
        window.print();
    },

    exportPnLExcel() {
        if (!this.currentPnLData) return;
        const pnl = this.currentPnLData;

        const rows = [
            ['BAO CAO KET QUA HOAT DONG KINH DOANH'],
            ['Nha thuoc: Medica Trung Kinh - 127 Trung Kinh, Cau Giay, Ha Noi'],
            [`Tu ngay: ${pnl.startDate}  Den ngay: ${pnl.endDate}`],
            ['Ngay xuat:', new Date().toLocaleString('vi-VN')],
            [],
            ['Khoan Muc', 'Tong Tien (VND)']
        ];

        rows.push(['Doanh thu ban hang (1)', pnl.grossSales]);
        rows.push(['Giam tru Doanh thu (2 = 2.1 + 2.2)', pnl.totalDeductions]);
        rows.push(['  - Chiet khau hoa don (2.1)', pnl.orderDiscount]);
        rows.push(['  - Gia tri hang ban bi tra lai (2.2)', pnl.customerRefund]);
        rows.push(['DOANH THU THUAN (3 = 1 - 2)', pnl.netRevenue]);
        rows.push(['Gia von hang ban (4)', pnl.netCost]);
        rows.push(['LOI NHUAN GOP VE BAN HANG (5 = 3 - 4)', pnl.grossProfit]);
        rows.push(['Chi phi (6)', pnl.totalExpenses]);

        Object.keys(pnl.expenseCategories).forEach(cat => {
            rows.push([`  - ${cat}`, pnl.expenseCategories[cat]]);
        });

        rows.push(['LOI NHUAN TU HOAT DONG KINH DOANH (7 = 5 - 6)', pnl.operatingProfit]);
        rows.push(['Thu nhap khac (8)', pnl.totalOtherIncome]);

        Object.keys(pnl.otherIncomeCategories).forEach(cat => {
            rows.push([`  - ${cat}`, pnl.otherIncomeCategories[cat]]);
        });

        rows.push(['LOI NHUAN THUAN TRUOC THUE (9 = 7 + 8)', pnl.netProfitBeforeTax]);

        const csvContent = '\uFEFF' + rows.map(e => e.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(',')).join('\n');
        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        const link = document.createElement('a');
        link.href = URL.createObjectURL(blob);
        link.download = `BaoCao_KetQuaKinhDoanh_${pnl.startDate}_${pnl.endDate}.csv`;
        link.click();
    }
};

window.ReportsModule = ReportsModule;
