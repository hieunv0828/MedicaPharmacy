/**
 * MedicaPharmacy - POS (Point of Sale / Bán Thuốc Tại Quầy)
 * Bán thuốc nhanh, tính liều dùng, hỗ trợ tách bạch Tiền Mặt vs Chuyển Khoản (VietQR)
 * In hóa đơn nhiệt K80 / K58
 */

const POSModule = {
    cart: [],
    paymentMethod: 'cash', // 'cash' hoặc 'transfer'
    discount: 0,
    pointsUsed: 0, // Điểm tích lũy sử dụng (1 điểm = 1000đ)
    POINT_VALUE: 1000, // 1 điểm = 1.000 VNĐ
    customerCash: 0,
    customerInfo: {
        name: '',
        phone: '',
        note: ''
    },
    currentSearchingIndex: -1,

    init() {
        this.bindEvents();
        this.renderCart();
        this.setupKeyboardShortcuts();
        this.selectPaymentMethod('cash');
    },

    bindEvents() {
        // Tìm kiếm thuốc
        const searchInput = document.getElementById('pos-search-input');
        const searchResults = document.getElementById('pos-search-results');

        if (searchInput) {
            searchInput.addEventListener('input', (e) => {
                this.handleSearch(e.target.value.trim());
            });

            // Khi click ra ngoài thì ẩn gợi ý
            document.addEventListener('click', (e) => {
                if (!searchInput.contains(e.target) && !searchResults.contains(e.target)) {
                    searchResults.classList.add('hidden');
                }
            });

            // Focus lại khi click
            searchInput.addEventListener('focus', () => {
                if (searchInput.value.trim().length > 0) {
                    this.handleSearch(searchInput.value.trim());
                }
            });
        }

        // Ô nhập tiền khách đưa
        const cashInput = document.getElementById('pos-cash-received');
        if (cashInput) {
            cashInput.addEventListener('input', (e) => {
                const val = parseFloat(e.target.value.replace(/[^0-9]/g, '')) || 0;
                this.customerCash = val;
                this.calculateChange();
            });
        }

        // Ô nhập giảm giá
        const discountInput = document.getElementById('pos-discount-input');
        if (discountInput) {
            discountInput.addEventListener('input', (e) => {
                const val = parseFloat(e.target.value.replace(/[^0-9]/g, '')) || 0;
                this.discount = val;
                this.updateTotals();
            });
        }

        // Ô nhập số điểm tích lũy cần sử dụng (1 điểm = 1.000đ)
        const pointsUsedInput = document.getElementById('pos-points-used-input');
        if (pointsUsedInput) {
            pointsUsedInput.addEventListener('input', (e) => {
                this.handlePointsUsedChange(e.target.value);
            });
        }

        // Ô nhập SĐT khách hàng (tra cứu & tích điểm)
        const phoneInput = document.getElementById('pos-customer-phone');
        if (phoneInput) {
            phoneInput.addEventListener('input', (e) => {
                this.handleCustomerPhoneChange(e.target.value.trim());
            });
        }
    },

    setupKeyboardShortcuts() {
        window.addEventListener('keydown', (e) => {
            // F2: Tìm thuốc
            if (e.key === 'F2') {
                e.preventDefault();
                const input = document.getElementById('pos-search-input');
                if (input) {
                    input.focus();
                    input.select();
                }
            }
            // F4: Thanh toán
            if (e.key === 'F4') {
                e.preventDefault();
                this.checkoutAndPrint();
            }
            // Esc: Đóng popup hoặc blur
            if (e.key === 'Escape') {
                const modal = document.getElementById('modal-receipt-preview');
                if (modal && !modal.classList.contains('hidden')) {
                    this.closeReceiptModal();
                } else {
                    document.getElementById('pos-search-results')?.classList.add('hidden');
                }
            }
        });
    },

    // Tìm kiếm thuốc tức thì
    handleSearch(query) {
        const resultsEl = document.getElementById('pos-search-results');
        if (!resultsEl) return;

        if (!query || query.length === 0) {
            resultsEl.classList.add('hidden');
            return;
        }

        const q = query.toLowerCase();
        const medicines = Store.getMedicines().filter(m => 
            (m.name && m.name.toLowerCase().includes(q)) ||
            (m.activeIngredient && m.activeIngredient.toLowerCase().includes(q)) ||
            (m.barcode && m.barcode.includes(q)) ||
            (m.id && m.id.toLowerCase().includes(q))
        );

        if (medicines.length === 0) {
            resultsEl.innerHTML = `
                <div class="p-4 text-center text-sm text-slate-500">
                    Không tìm thấy thuốc nào khớp với "<b>${query}</b>"
                </div>
            `;
            resultsEl.classList.remove('hidden');
            return;
        }

        let html = '';
        medicines.slice(0, 10).forEach(m => {
            const stockStatus = AppUtils.checkStockStatus(m);
            const isOutOfStock = stockStatus.status === 'out_of_stock';
            const priceBox = AppUtils.formatVND(m.priceBox);
            const priceBase = AppUtils.formatVND(m.priceBase);

            html += `
                <div onclick="POSModule.addToCart('${m.id}')" 
                     class="p-2.5 hover:bg-emerald-50 transition border-b border-slate-100 cursor-pointer flex items-center justify-between group ${isOutOfStock ? 'opacity-60 bg-slate-50' : ''}">
                    <div>
                        <div class="font-bold text-slate-800 text-sm group-hover:text-emerald-700 flex items-center gap-2 flex-wrap">
                            <span class="font-mono text-xs font-bold text-emerald-800 bg-emerald-50 px-1.5 py-0.5 rounded border border-emerald-200">${m.id}</span>
                            <span>${m.name}</span>
                            ${isOutOfStock ? '<span class="text-[10px] bg-rose-100 text-rose-700 font-semibold px-1.5 py-0.5 rounded">Hết hàng</span>' : ''}
                        </div>
                        <div class="text-xs text-slate-500 line-clamp-1 italic">${m.activeIngredient || ''}</div>
                        <div class="text-[11px] text-slate-400 mt-0.5">
                            Tồn kho: <span class="font-medium text-slate-700">${AppUtils.formatStockUnitsDisplay(m)}</span> | Lô: <span class="font-mono">${m.batchNo || '---'}</span> (HSD: ${AppUtils.formatDate(m.expiryDate)})
                        </div>
                    </div>
                    <div class="text-right pl-3">
                        <div class="font-bold text-emerald-700 text-sm">${priceBox} <span class="text-xs font-normal text-slate-500">/${m.packUnit || 'Hộp'}</span></div>
                        <div class="text-[11px] text-slate-500">${priceBase} /${m.baseUnit}</div>
                    </div>
                </div>
            `;
        });

        resultsEl.innerHTML = html;
        resultsEl.classList.remove('hidden');
    },

    // Thêm thuốc vào giỏ hàng
    addToCart(medicineId, defaultUnit = null) {
        const med = Store.getMedicineById(medicineId);
        if (!med) return;

        // Ẩn bảng kết quả tìm kiếm
        document.getElementById('pos-search-results')?.classList.add('hidden');
        const searchInput = document.getElementById('pos-search-input');
        if (searchInput) {
            searchInput.value = '';
            searchInput.focus();
        }

        // Đơn vị mặc định: ưu tiên hộp, nếu không có thì đơn vị cơ bản
        let selectedUnit = defaultUnit || med.packUnit || med.baseUnit;
        let unitPrice = med.priceBox || med.priceBase;
        if (selectedUnit === med.subUnit && med.priceSub > 0) {
            unitPrice = med.priceSub;
        } else if (selectedUnit === med.baseUnit && med.priceBase > 0) {
            unitPrice = med.priceBase;
        }
        const unitCostPrice = Store.getMedicineUnitCost(med, selectedUnit);

        // Kiểm tra xem mặt hàng cùng ID và cùng đơn vị đã có trong giỏ chưa
        const existingIndex = this.cart.findIndex(i => i.medicineId === medicineId && i.unit === selectedUnit);
        if (existingIndex >= 0) {
            this.cart[existingIndex].quantity += 1;
        } else {
            this.cart.push({
                medicineId: med.id,
                medicineName: med.name,
                activeIngredient: med.activeIngredient,
                baseUnit: med.baseUnit,
                packUnit: med.packUnit,
                packRatio: med.packRatio || 1,
                subUnit: med.subUnit,
                subRatio: med.subRatio || 1,
                unit: selectedUnit,
                quantity: 1,
                price: unitPrice,
                costPrice: unitCostPrice,
                usage: med.usageDefault || 'Uống sau ăn theo hướng dẫn của dược sĩ.',
                maxAvailableUnits: med.stockUnits || 0
            });
        }

        AppUtils.playBeepSound('beep');
        this.renderCart();
    },

    // Thay đổi đơn vị bán của dòng thuốc (Hộp / Vỉ / Viên)
    changeItemUnit(index, newUnit) {
        const item = this.cart[index];
        const med = Store.getMedicineById(item.medicineId);
        if (!item || !med) return;

        item.unit = newUnit;
        if (newUnit === med.packUnit) {
            item.price = med.priceBox || med.priceBase;
        } else if (newUnit === med.subUnit && med.priceSub > 0) {
            item.price = med.priceSub;
        } else {
            item.price = med.priceBase;
        }
        item.costPrice = Store.getMedicineUnitCost(med, newUnit);

        this.renderCart();
    },

    // Tăng giảm số lượng
    changeItemQty(index, delta) {
        const item = this.cart[index];
        if (!item) return;

        const newQty = item.quantity + delta;
        if (newQty <= 0) {
            this.removeItem(index);
            return;
        }

        item.quantity = newQty;
        this.renderCart();
    },

    // Nhập trực tiếp số lượng
    setItemQty(index, val) {
        const item = this.cart[index];
        if (!item) return;

        let qty = parseInt(val) || 1;
        if (qty <= 0) qty = 1;
        item.quantity = qty;
        this.renderCart();
    },

    // Nhập trực tiếp liều dùng
    setItemUsage(index, usageText) {
        if (this.cart[index]) {
            this.cart[index].usage = usageText;
        }
    },

    // Xóa khỏi giỏ
    removeItem(index) {
        this.cart.splice(index, 1);
        this.renderCart();
    },

    // Xóa trắng toàn bộ giỏ hàng
    clearCart() {
        if (this.cart.length === 0) return;
        if (confirm('Bạn có muốn xóa toàn bộ giỏ hàng hiện tại?')) {
            this.cart = [];
            this.discount = 0;
            this.customerCash = 0;
            document.getElementById('pos-discount-input').value = 0;
            document.getElementById('pos-cash-received').value = '';
            document.getElementById('pos-customer-name').value = '';
            document.getElementById('pos-customer-phone').value = '';
            document.getElementById('pos-customer-note').value = '';
            this.renderCart();
        }
    },

    // Chọn phương thức thanh toán: Tiền mặt vs Chuyển khoản
    selectPaymentMethod(method) {
        this.paymentMethod = method;

        const btnCash = document.getElementById('pos-btn-cash');
        const btnTransfer = document.getElementById('pos-btn-transfer');
        const panelCash = document.getElementById('pos-panel-cash');
        const panelTransfer = document.getElementById('pos-panel-transfer');

        if (method === 'cash') {
            btnCash?.classList.add('border-emerald-600', 'bg-emerald-50', 'text-emerald-800');
            btnCash?.classList.remove('border-slate-200', 'bg-white', 'text-slate-600');
            btnTransfer?.classList.remove('border-emerald-600', 'bg-emerald-50', 'text-emerald-800');
            btnTransfer?.classList.add('border-slate-200', 'bg-white', 'text-slate-600');

            panelCash?.classList.remove('hidden');
            panelTransfer?.classList.add('hidden');

            this.calculateChange();
        } else {
            btnTransfer?.classList.add('border-emerald-600', 'bg-emerald-50', 'text-emerald-800');
            btnTransfer?.classList.remove('border-slate-200', 'bg-white', 'text-slate-600');
            btnCash?.classList.remove('border-emerald-600', 'bg-emerald-50', 'text-emerald-800');
            btnCash?.classList.add('border-slate-200', 'bg-white', 'text-slate-600');

            panelCash?.classList.add('hidden');
            panelTransfer?.classList.remove('hidden');

            // Render mã VietQR ngay
            this.renderVietQRForPOS();
        }
    },

    // Điền nhanh mệnh giá tiền khách đưa
    setQuickCash(amount) {
        const total = this.calculateTotalAmount();
        let targetAmount = amount;
        if (amount === 'exact') {
            targetAmount = total;
        }

        this.customerCash = targetAmount;
        const input = document.getElementById('pos-cash-received');
        if (input) {
            input.value = targetAmount.toLocaleString('vi-VN');
        }
        this.calculateChange();
    },

    // Tính toán tiền thối lại cho khách
    calculateChange() {
        const total = this.calculateTotalAmount();
        const change = this.customerCash - total;

        const changeEl = document.getElementById('pos-change-amount');
        const warningEl = document.getElementById('pos-cash-warning');

        if (!changeEl) return;

        if (this.customerCash === 0) {
            changeEl.innerText = '0 đ';
            changeEl.className = 'text-xl font-bold text-slate-700';
            warningEl?.classList.add('hidden');
        } else if (change < 0) {
            changeEl.innerText = `Thiếu ${AppUtils.formatVND(Math.abs(change))}`;
            changeEl.className = 'text-xl font-bold text-rose-600';
            warningEl?.classList.remove('hidden');
        } else {
            changeEl.innerText = AppUtils.formatVND(change);
            changeEl.className = 'text-xl font-bold text-emerald-600';
            warningEl?.classList.add('hidden');
        }
    },

    // Render mã VietQR cho đơn hàng hiện tại
    renderVietQRForPOS() {
        const total = this.calculateTotalAmount();
        const qrContainer = document.getElementById('pos-vietqr-container');
        if (!qrContainer) return;

        if (total <= 0) {
            qrContainer.innerHTML = '<div class="text-xs text-slate-400 py-6 text-center">Giỏ hàng trống. Thêm thuốc để sinh mã QR.</div>';
            return;
        }

        const settings = Store.getSettings();
        // Sinh mã hóa đơn dự kiến
        const tempId = 'HD' + new Date().toISOString().slice(2, 10).replace(/-/g, '') + '-' + String(Math.floor(Math.random() * 900) + 100);
        const description = `MEDICA ${tempId}`;

        // Hiển thị thông tin tài khoản
        const bank = VietQRService.getBankByBin(settings.bankBin);
        const elBankInfo = document.getElementById('pos-transfer-bank-info');
        if (elBankInfo) {
            elBankInfo.innerHTML = `
                <div class="text-xs text-slate-600 space-y-1">
                    <p>Ngân hàng: <span class="font-bold text-slate-800">${bank ? bank.shortName : 'MBBank'}</span></p>
                    <p>Số tài khoản: <span class="font-mono font-bold text-emerald-700 text-sm select-all">${settings.accountNo || '---'}</span></p>
                    <p>Chủ tài khoản: <span class="font-bold text-slate-800">${settings.accountName || '---'}</span></p>
                    <p>Số tiền: <span class="font-bold text-emerald-700 text-sm">${AppUtils.formatVND(total)}</span></p>
                    <p>Nội dung CK: <span class="font-mono font-bold text-slate-800 bg-slate-100 px-1.5 py-0.5 rounded select-all">${description}</span></p>
                </div>
            `;
        }

        VietQRService.renderToElement(qrContainer, {
            bankBin: settings.bankBin || '970422',
            accountNo: settings.accountNo,
            accountName: settings.accountName,
            amount: total,
            description: description
        });
    },

    // Render giỏ hàng
    renderCart() {
        const tbody = document.getElementById('pos-cart-tbody');
        const emptyState = document.getElementById('pos-cart-empty');
        if (!tbody) return;

        if (this.cart.length === 0) {
            tbody.innerHTML = '';
            emptyState?.classList.remove('hidden');
            this.updateTotals();
            return;
        }

        emptyState?.classList.add('hidden');
        let html = '';

        this.cart.forEach((item, idx) => {
            const lineTotal = item.quantity * item.price;
            const med = Store.getMedicineById(item.medicineId);

            // Tùy chọn các đơn vị tính khả dụng
            let unitOptions = '';
            if (med) {
                if (med.packUnit) {
                    unitOptions += `<option value="${med.packUnit}" ${item.unit === med.packUnit ? 'selected' : ''}>${med.packUnit}</option>`;
                }
                if (med.subUnit && med.subRatio > 1) {
                    unitOptions += `<option value="${med.subUnit}" ${item.unit === med.subUnit ? 'selected' : ''}>${med.subUnit}</option>`;
                }
                if (med.baseUnit && med.baseUnit !== med.packUnit && med.baseUnit !== med.subUnit) {
                    unitOptions += `<option value="${med.baseUnit}" ${item.unit === med.baseUnit ? 'selected' : ''}>${med.baseUnit}</option>`;
                }
            }

            html += `
                <tr class="border-b border-slate-100 hover:bg-slate-50 transition text-sm">
                    <td class="py-2.5 px-2 text-center text-slate-400 text-xs">${idx + 1}</td>
                    <td class="py-2.5 px-2">
                        <div class="font-bold text-slate-800">${item.medicineName}</div>
                        <input type="text" value="${item.usage || ''}" 
                               onchange="POSModule.setItemUsage(${idx}, this.value)"
                               placeholder="Ghi chú liều dùng cho bệnh nhân..."
                               class="w-full text-xs text-slate-600 bg-amber-50/60 border border-amber-200 rounded px-2 py-0.5 mt-1 focus:ring-1 focus:ring-emerald-500 focus:bg-white transition" />
                    </td>
                    <td class="py-2.5 px-2">
                        <select onchange="POSModule.changeItemUnit(${idx}, this.value)" 
                                class="text-xs font-semibold bg-slate-100 border border-slate-300 rounded px-2 py-1 text-slate-700 focus:outline-none focus:ring-1 focus:ring-emerald-500">
                            ${unitOptions || `<option>${item.unit}</option>`}
                        </select>
                    </td>
                    <td class="py-2.5 px-2">
                        <div class="flex items-center justify-center border border-slate-200 rounded-lg overflow-hidden w-24">
                            <button onclick="POSModule.changeItemQty(${idx}, -1)" class="px-2 py-1 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold">-</button>
                            <input type="number" min="1" value="${item.quantity}" 
                                   onchange="POSModule.setItemQty(${idx}, this.value)" 
                                   class="w-10 text-center font-bold text-slate-800 text-sm focus:outline-none py-1" />
                            <button onclick="POSModule.changeItemQty(${idx}, 1)" class="px-2 py-1 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold">+</button>
                        </div>
                    </td>
                    <td class="py-2.5 px-2 text-right">
                        <div class="font-medium text-slate-700 text-xs">${AppUtils.formatVND(item.price)}</div>
                    </td>
                    <td class="py-2.5 px-2 text-right">
                        <div class="font-bold text-emerald-700 text-sm">${AppUtils.formatVND(lineTotal)}</div>
                    </td>
                    <td class="py-2.5 px-2 text-center">
                        <button onclick="POSModule.removeItem(${idx})" class="text-slate-400 hover:text-rose-600 p-1 transition" title="Xóa">
                            <i data-lucide="trash-2" class="w-4 h-4"></i>
                        </button>
                    </td>
                </tr>
            `;
        });

        tbody.innerHTML = html;
        this.updateTotals();
        if (window.lucide) lucide.createIcons();
    },

    calculateSubTotal() {
        return this.cart.reduce((sum, item) => sum + (item.quantity * item.price), 0);
    },

    calculatePointsDiscount() {
        return (this.pointsUsed || 0) * this.POINT_VALUE;
    },

    calculateTotalAmount() {
        const sub = this.calculateSubTotal();
        const discount = this.discount || 0;
        const pointsDiscount = this.calculatePointsDiscount();
        return Math.max(0, sub - discount - pointsDiscount);
    },

    getMaxUsablePoints() {
        const phone = document.getElementById('pos-customer-phone')?.value.trim();
        if (!phone) return 0;
        const cust = Store.getCustomerByPhone(phone);
        if (!cust || !cust.points || cust.points <= 0) return 0;

        const subTotal = this.calculateSubTotal();
        const directDiscount = this.discount || 0;
        const maxMoneyCanDiscount = Math.max(0, subTotal - directDiscount);
        const maxPointsByOrder = Math.floor(maxMoneyCanDiscount / this.POINT_VALUE);

        return Math.max(0, Math.min(cust.points, maxPointsByOrder));
    },

    handlePointsUsedChange(rawVal) {
        const maxPoints = this.getMaxUsablePoints();
        let val = parseInt(String(rawVal).replace(/[^0-9]/g, '')) || 0;
        if (val > maxPoints) {
            val = maxPoints;
        }
        if (val < 0) val = 0;

        this.pointsUsed = val;
        const input = document.getElementById('pos-points-used-input');
        if (input && input.value != val) {
            input.value = val;
        }

        this.updateTotals();
    },

    useMaxPoints() {
        const phone = document.getElementById('pos-customer-phone')?.value.trim();
        if (!phone) {
            alert('Vui lòng nhập Số điện thoại hoặc bấm "Chọn KH" để áp dụng tích điểm.');
            document.getElementById('pos-customer-phone')?.focus();
            return;
        }
        const cust = Store.getCustomerByPhone(phone);
        if (!cust || !cust.points || cust.points <= 0) {
            alert(`Khách hàng ${cust ? cust.name : phone} hiện đang có 0 điểm tích lũy.`);
            return;
        }

        const maxPoints = this.getMaxUsablePoints();
        if (maxPoints <= 0) {
            alert('Đơn hàng không còn số tiền nào để giảm trừ điểm.');
            return;
        }

        this.pointsUsed = maxPoints;
        const input = document.getElementById('pos-points-used-input');
        if (input) input.value = maxPoints;

        this.updateTotals();
        if (window.App && App.showToast) {
            App.showToast(`Đã áp dụng tối đa ${maxPoints} điểm (-${AppUtils.formatVND(maxPoints * this.POINT_VALUE)})`, 'info');
        }
    },

    updateTotals() {
        const subTotal = this.calculateSubTotal();
        const totalAmount = this.calculateTotalAmount();
        const pointsDiscount = this.calculatePointsDiscount();

        const elSubTotal = document.getElementById('pos-subtotal');
        const elTotalAmount = document.getElementById('pos-total-amount');
        const elCartCount = document.getElementById('pos-cart-count');
        const elPtsDiscountText = document.getElementById('pos-points-discount-text');

        if (elSubTotal) elSubTotal.innerText = AppUtils.formatVND(subTotal);
        if (elTotalAmount) elTotalAmount.innerText = AppUtils.formatVND(totalAmount);
        if (elCartCount) elCartCount.innerText = `${this.cart.length} món`;

        if (elPtsDiscountText) {
            if (this.pointsUsed > 0) {
                elPtsDiscountText.innerText = `-${AppUtils.formatVND(pointsDiscount)}`;
                elPtsDiscountText.className = 'font-bold text-rose-600';
            } else {
                elPtsDiscountText.innerText = '-0 đ';
                elPtsDiscountText.className = 'font-bold text-slate-400';
            }
        }

        if (this.paymentMethod === 'cash') {
            this.calculateChange();
        } else {
            this.renderVietQRForPOS();
        }

        // Cập nhật điểm tích lũy dự kiến cho đơn hiện tại
        this.updatePointsPreview();
    },

    updatePointsPreview() {
        const totalAmount = this.calculateTotalAmount();
        const pointsEarned = Store.calculatePoints(totalAmount);
        const phone = document.getElementById('pos-customer-phone')?.value.trim();

        const elPointsThisOrder = document.getElementById('pos-points-this-order');
        const elCustStatus = document.getElementById('pos-points-cust-status');
        const elCurrBalance = document.getElementById('pos-points-curr-balance');
        const elRateHint = document.getElementById('pos-points-rate-hint');
        const pointsInput = document.getElementById('pos-points-used-input');
        const btnUseMax = document.getElementById('pos-btn-use-all-points');

        if (elPointsThisOrder) {
            elPointsThisOrder.innerText = `+${pointsEarned} điểm`;
        }

        if (!phone) {
            if (elCustStatus) elCustStatus.innerHTML = 'Tích điểm: <b>100.000đ = +1 điểm</b>';
            if (elCurrBalance) elCurrBalance.innerText = 'Nhập SĐT để dùng điểm & cộng dồn cho khách';
            if (elRateHint) elRateHint.innerText = 'Quy đổi: 1 điểm = 1.000đ';
            if (pointsInput) {
                pointsInput.disabled = true;
                pointsInput.classList.add('bg-slate-100', 'cursor-not-allowed');
                if (this.pointsUsed > 0) {
                    this.pointsUsed = 0;
                    pointsInput.value = 0;
                }
            }
            if (btnUseMax) {
                btnUseMax.disabled = true;
                btnUseMax.classList.add('opacity-50', 'cursor-not-allowed');
            }
            return;
        }

        const cust = Store.getCustomerByPhone(phone);
        if (cust) {
            const custPoints = cust.points || 0;
            const tier = Store.getCustomerTier(custPoints);
            const nextTotal = Math.max(0, custPoints - this.pointsUsed) + pointsEarned;

            if (elCustStatus) {
                const safePhone = (cust.phone || phone).replace(/'/g, "\\'");
                elCustStatus.innerHTML = `Khách: <a href="javascript:void(0)" onclick="CustomersModule.openCustomerOrdersModal('${safePhone}')" class="text-emerald-700 hover:text-emerald-900 underline font-bold cursor-pointer inline-flex items-center gap-1" title="Bấm để xem toàn bộ hóa đơn khách đã từng mua"><span>${cust.name}</span> <i data-lucide="receipt" class="w-3.5 h-3.5 text-emerald-600"></i></a> <span class="px-1.5 py-0.5 rounded text-[10px] font-bold border ${tier.badge}">${tier.icon} ${tier.name}</span> <button type="button" onclick="CustomersModule.openCustomerOrdersModal('${safePhone}')" class="ml-1 text-[10px] text-emerald-800 bg-emerald-100 hover:bg-emerald-200 px-1.5 py-0.2 rounded font-bold cursor-pointer transition">Xem lịch sử đơn</button>`;
                if (window.lucide) lucide.createIcons();
            }

            if (custPoints > 0) {
                if (elCurrBalance) {
                    elCurrBalance.innerHTML = `Điểm hiện có: <b class="text-amber-800 font-bold">${custPoints} điểm</b> (Sau đơn: <b class="text-emerald-700 font-bold">${nextTotal} điểm</b>)`;
                }
                if (elRateHint) {
                    elRateHint.innerHTML = `Khách có <b class="text-amber-800 font-bold">${custPoints} điểm</b> (Tối đa: <b class="text-emerald-700 font-bold">${AppUtils.formatVND(custPoints * this.POINT_VALUE)}</b>)`;
                }
                if (pointsInput) {
                    pointsInput.disabled = false;
                    pointsInput.classList.remove('bg-slate-100', 'cursor-not-allowed');
                    pointsInput.max = custPoints;
                }
                if (btnUseMax) {
                    btnUseMax.disabled = false;
                    btnUseMax.classList.remove('opacity-50', 'cursor-not-allowed');
                }
            } else {
                if (elCurrBalance) {
                    elCurrBalance.innerHTML = `Điểm hiện có: <b class="text-slate-600">0 điểm</b> (Sau đơn: <b class="text-emerald-700 font-bold">+${pointsEarned} điểm</b>)`;
                }
                if (elRateHint) {
                    elRateHint.innerText = 'Khách có 0 điểm (1 điểm = 1.000đ)';
                }
                if (pointsInput) {
                    pointsInput.disabled = true;
                    pointsInput.classList.add('bg-slate-100', 'cursor-not-allowed');
                    if (this.pointsUsed > 0) {
                        this.pointsUsed = 0;
                        pointsInput.value = 0;
                    }
                }
                if (btnUseMax) {
                    btnUseMax.disabled = true;
                    btnUseMax.classList.add('opacity-50', 'cursor-not-allowed');
                }
            }
        } else {
            if (elCustStatus) {
                const safePhone = phone.replace(/'/g, "\\'");
                elCustStatus.innerHTML = `Khách mới: <b class="font-mono text-slate-800">${phone}</b> <button type="button" onclick="CustomersModule.openCustomerOrdersModal('${safePhone}')" class="ml-1 text-[10px] text-emerald-800 bg-emerald-100 hover:bg-emerald-200 px-1.5 py-0.2 rounded font-bold cursor-pointer transition">Lịch sử đơn</button>`;
            }
            if (elCurrBalance) elCurrBalance.innerHTML = `Tích lũy đơn đầu tiên: <b class="text-emerald-700 font-bold">+${pointsEarned} điểm</b> khi thanh toán`;
            if (elRateHint) elRateHint.innerText = 'Khách mới: 0 điểm (1 điểm = 1.000đ)';
            if (pointsInput) {
                pointsInput.disabled = true;
                pointsInput.classList.add('bg-slate-100', 'cursor-not-allowed');
                if (this.pointsUsed > 0) {
                    this.pointsUsed = 0;
                    pointsInput.value = 0;
                }
            }
            if (btnUseMax) {
                btnUseMax.disabled = true;
                btnUseMax.classList.add('opacity-50', 'cursor-not-allowed');
            }
        }
    },

    handleCustomerPhoneChange(phone) {
        if (!phone) {
            this.updatePointsPreview();
            return;
        }

        const cust = Store.getCustomerByPhone(phone);
        const nameInput = document.getElementById('pos-customer-name');
        if (cust) {
            if (nameInput && (!nameInput.value.trim() || nameInput.value === 'Khách hàng' || nameInput.value === 'Khách vãng lai')) {
                nameInput.value = cust.name;
            }
        }
        this.updatePointsPreview();
    },

    // --- THANH TOÁN & IN HÓA ĐƠN ---
    checkout(shouldPrint = true) {
        if (this.cart.length === 0) {
            alert('Giỏ hàng đang trống! Vui lòng chọn ít nhất một loại thuốc để thanh toán.');
            return;
        }

        const totalAmount = this.calculateTotalAmount();
        const subTotal = this.calculateSubTotal();
        const settings = Store.getSettings();

        // Kiểm tra tiền mặt nếu chọn thanh toán tiền mặt
        if (this.paymentMethod === 'cash') {
            if (this.customerCash > 0 && this.customerCash < totalAmount) {
                if (!confirm(`Tiền khách đưa (${AppUtils.formatVND(this.customerCash)}) ít hơn Tổng tiền (${AppUtils.formatVND(totalAmount)}). Bạn có muốn tiếp tục ghi nhận đơn không?`)) {
                    return;
                }
            } else if (this.customerCash === 0) {
                // Mặc định coi như khách đưa vừa đủ nếu không gõ
                this.customerCash = totalAmount;
            }
        }

        const custName = document.getElementById('pos-customer-name')?.value.trim();
        const custPhone = document.getElementById('pos-customer-phone')?.value.trim();
        const custNote = document.getElementById('pos-customer-note')?.value.trim();

        const changeAmount = this.paymentMethod === 'cash' ? Math.max(0, this.customerCash - totalAmount) : 0;
        const transferCode = this.paymentMethod === 'transfer' ? `MB-TXN-${Math.floor(100000 + Math.random() * 900000)}` : '';

        // Tạo đối tượng đơn hàng
        const newOrder = {
            customerName: custName || 'Khách vãng lai',
            customerPhone: custPhone || '',
            note: custNote || '',
            paymentMethod: this.paymentMethod, // 'cash' hoặc 'transfer'
            items: this.cart.map(i => ({
                medicineId: i.medicineId,
                medicineName: i.medicineName,
                unit: i.unit,
                quantity: i.quantity,
                price: i.price,
                costPrice: i.costPrice || 0,
                usage: i.usage || ''
            })),
            subTotal: subTotal,
            discount: this.discount || 0,
            pointsUsed: this.pointsUsed || 0,
            pointsDiscount: this.calculatePointsDiscount(),
            totalAmount: totalAmount,
            customerCash: this.paymentMethod === 'cash' ? this.customerCash : 0,
            changeAmount: changeAmount,
            transferCode: transferCode,
            pharmacist: (window.AuthModule ? AuthModule.getCurrentUser()?.fullName : null) || settings.pharmacist || 'Dược sĩ bán hàng'
        };

        const savedOrder = Store.addOrder(newOrder);
        AppUtils.playBeepSound('success');

        if (shouldPrint) {
            this.showReceiptPreview(savedOrder);
        } else {
            alert(`Đã lưu thành công đơn hàng: ${savedOrder.id}\nPhương thức: ${this.paymentMethod === 'cash' ? 'TIỀN MẶT' : 'CHUYỂN KHOẢN (VietQR)'}`);
        }

        // Reset lại form bán hàng cho lượt khách kế tiếp
        this.resetAfterCheckout();
    },

    checkoutAndPrint() {
        this.checkout(true);
    },

    resetAfterCheckout() {
        this.cart = [];
        this.discount = 0;
        this.pointsUsed = 0;
        this.customerCash = 0;
        document.getElementById('pos-discount-input').value = 0;
        const ptsInput = document.getElementById('pos-points-used-input');
        if (ptsInput) ptsInput.value = 0;
        const ptsText = document.getElementById('pos-points-discount-text');
        if (ptsText) {
            ptsText.innerText = '-0 đ';
            ptsText.className = 'font-bold text-slate-400';
        }
        document.getElementById('pos-cash-received').value = '';
        document.getElementById('pos-customer-name').value = '';
        document.getElementById('pos-customer-phone').value = '';
        document.getElementById('pos-customer-note').value = '';
        this.renderCart();
        this.updatePointsPreview();
        document.getElementById('pos-search-input')?.focus();
    },

    // --- MẪU IN HÓA ĐƠN NHIỆT K80 (80mm) và K58 (58mm) ---
    showReceiptPreview(order) {
        const modal = document.getElementById('modal-receipt-preview');
        const container = document.getElementById('receipt-print-content');
        if (!modal || !container) return;

        const settings = Store.getSettings();
        const format = settings.printFormat || 'k80'; // 'k80' hoặc 'k58'

        let itemsHtml = '';
        (order.items || []).forEach((item, idx) => {
            const lineTotal = item.quantity * item.price;
            itemsHtml += `
                <div class="border-b border-dashed border-slate-300 py-1.5 text-xs">
                    <div class="font-bold text-slate-800 flex justify-between">
                        <span>${idx + 1}. ${item.medicineName}</span>
                        <span>${AppUtils.formatVND(lineTotal)}</span>
                    </div>
                    <div class="flex justify-between text-slate-500 text-[11px]">
                        <span>${item.quantity} ${item.unit} x ${AppUtils.formatVND(item.price)}</span>
                    </div>
                </div>
            `;
        });

        const isTransfer = order.paymentMethod === 'transfer';
        const paymentLabel = isTransfer ? 'CHUYỂN KHOẢN (VietQR)' : 'TIỀN MẶT';

        container.innerHTML = `
            <div id="receipt-paper" class="receipt-paper ${format === 'k58' ? 'k58-width' : 'k80-width'} bg-white text-slate-900 mx-auto p-4 shadow-lg font-sans">
                <!-- Header Hóa Đơn -->
                <div class="text-center pb-2 border-b-2 border-dashed border-slate-400">
                    <h2 class="text-base font-extrabold uppercase tracking-wide text-slate-900">${settings.pharmacyName}</h2>
                    <p class="text-[11px] font-medium text-slate-600">${settings.gppCert}</p>
                    <p class="text-[11px] text-slate-600">${settings.address}</p>
                    <p class="text-[11px] font-bold text-slate-700">Hotline: ${settings.phone}</p>
                </div>

                <!-- Tiêu đề Hóa Đơn Bán Lẻ -->
                <div class="text-center py-2">
                    <h3 class="text-sm font-extrabold tracking-wider uppercase">HÓA ĐƠN BÁN LẺ THUỐC</h3>
                    <p class="text-[11px] font-mono font-bold text-slate-700">Số HĐ: ${order.id}</p>
                    <p class="text-[10px] text-slate-500">${AppUtils.formatDateTime(order.createdAt)}</p>
                </div>

                <!-- Thông tin khách hàng & Dược sĩ -->
                <div class="text-[11px] space-y-0.5 py-1 border-b border-dashed border-slate-300">
                    <div class="flex justify-between">
                        <span class="text-slate-500">Khách hàng:</span>
                        <span class="font-bold text-slate-800">${order.customerName || 'Khách vãng lai'}</span>
                    </div>
                    ${order.customerPhone ? `
                    <div class="flex justify-between">
                        <span class="text-slate-500">Số ĐT:</span>
                        <span class="font-mono">${order.customerPhone}</span>
                    </div>` : ''}
                    <div class="flex justify-between">
                        <span class="text-slate-500">Dược sĩ:</span>
                        <span>${order.pharmacist || settings.pharmacist}</span>
                    </div>
                </div>

                <!-- Danh sách thuốc -->
                <div class="py-2">
                    <div class="flex justify-between text-[11px] font-bold border-b border-slate-400 pb-1 mb-1">
                        <span>TÊN THUỐC / LIỀU DÙNG</span>
                        <span>THÀNH TIỀN</span>
                    </div>
                    ${itemsHtml}
                </div>

                <!-- Tổng kết tiền -->
                <div class="py-2 border-t-2 border-dashed border-slate-400 space-y-1 text-xs">
                    <div class="flex justify-between">
                        <span>Tiền hàng:</span>
                        <span class="font-medium">${AppUtils.formatVND(order.subTotal)}</span>
                    </div>
                    ${order.discount > 0 ? `
                    <div class="flex justify-between text-rose-600">
                        <span>Chiết khấu/Giảm giá:</span>
                        <span>-${AppUtils.formatVND(order.discount)}</span>
                    </div>` : ''}
                    ${order.pointsUsed > 0 ? `
                    <div class="flex justify-between text-amber-800 font-bold">
                        <span>Dùng điểm (-${order.pointsUsed} điểm):</span>
                        <span>-${AppUtils.formatVND(order.pointsDiscount || order.pointsUsed * 1000)}</span>
                    </div>` : ''}
                    <div class="flex justify-between text-sm font-extrabold pt-1 border-t border-slate-200">
                        <span>TỔNG CỘNG:</span>
                        <span class="text-base font-bold text-slate-900">${AppUtils.formatVND(order.totalAmount)}</span>
                    </div>
                    <div class="flex justify-between text-[11px] pt-1">
                        <span>Hình thức thanh toán:</span>
                        <span class="font-bold ${isTransfer ? 'text-blue-700' : 'text-emerald-700'}">${paymentLabel}</span>
                    </div>
                    ${!isTransfer ? `
                    <div class="flex justify-between text-[11px] text-slate-600">
                        <span>Tiền khách đưa:</span>
                        <span>${AppUtils.formatVND(order.customerCash)}</span>
                    </div>
                    <div class="flex justify-between text-[11px] font-bold text-slate-800">
                        <span>Tiền thừa trả khách:</span>
                        <span>${AppUtils.formatVND(order.changeAmount)}</span>
                    </div>` : `
                    <div class="flex justify-between text-[11px] text-slate-600">
                        <span>Mã giao dịch NH:</span>
                        <span class="font-mono font-bold">${order.transferCode || 'Đã xác nhận'}</span>
                    </div>`}
                </div>

                <!-- Khối Tích Điểm Khách Hàng (100.000đ = +1 điểm | 1 điểm = 1.000đ) -->
                ${order.customerPhone ? `
                <div class="my-2 py-1.5 px-2 bg-slate-50 border border-dashed border-slate-300 rounded text-center text-xs">
                    <div class="font-extrabold uppercase text-slate-800 text-[11px] flex items-center justify-center gap-1">
                        <span>⭐ TÍCH ĐIỂM KHÁCH HÀNG ⭐</span>
                    </div>
                    ${order.pointsUsed > 0 ? `
                    <div class="flex justify-between text-rose-700 text-xs mt-1 font-semibold">
                        <span>Điểm dùng đơn này:</span>
                        <span>-${order.pointsUsed} điểm</span>
                    </div>` : ''}
                    <div class="flex justify-between text-slate-700 text-xs ${order.pointsUsed > 0 ? 'mt-0.5' : 'mt-1'}">
                        <span>Điểm cộng đơn này:</span>
                        <span class="font-bold text-emerald-700">+${order.pointsEarned || 0} điểm</span>
                    </div>
                    <div class="flex justify-between text-slate-700 text-xs mt-0.5 border-t border-slate-200 pt-0.5">
                        <span>Tổng điểm còn lại:</span>
                        <span class="font-bold text-slate-900">${order.customerPointsTotal || 0} điểm</span>
                    </div>
                    <div class="text-[9px] text-slate-500 italic mt-0.5">(Quy tắc: Cứ mỗi 100.000đ = +1 điểm | 1 điểm = 1.000đ)</div>
                </div>` : ''}

                <!-- Lời dặn dò chân trang -->
                <div class="text-center pt-3 border-t border-dashed border-slate-300 text-[10px] text-slate-500 space-y-1">
                    <p class="italic">${settings.receiptNote}</p>
                    <p class="font-bold text-slate-800 text-xs">${settings.receiptThankYou}</p>
                    <p class="font-mono text-[9px] text-slate-400">MedicaPharmacy v1.0 • In lúc: ${AppUtils.formatDateTime(new Date())}</p>
                </div>
            </div>
        `;

        modal.classList.remove('hidden');
    },

    closeReceiptModal() {
        document.getElementById('modal-receipt-preview')?.classList.add('hidden');
    },

    printCurrentReceipt() {
        window.print();
    }
};

window.POSModule = POSModule;

