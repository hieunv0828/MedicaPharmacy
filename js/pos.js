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
    customerSearchHighlightedIndex: -1,
    customerSearchResultsList: [],
    selectedCustomerId: '',
    medicineSearchResultsList: [],
    medicineSearchHighlightedIndex: -1,

    init() {
        this.bindEvents();
        this.renderCart();
        this.setupKeyboardShortcuts();
        this.selectPaymentMethod('cash');
    },

    bindEvents() {
        // Tìm kiếm thuốc & máy quét mã vạch
        const searchInput = document.getElementById('pos-search-input');
        const searchResults = document.getElementById('pos-search-results');

        if (searchInput) {
            searchInput.addEventListener('input', (e) => {
                this.handleSearch(e.target.value.trim());
            });

            // Bắt phím Enter từ máy quét mã vạch hoặc bàn phím mũi tên lên/xuống
            searchInput.addEventListener('keydown', (e) => {
                this.handleMedicineSearchKeydown(e);
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

        // Ô nhập SĐT & Tên khách hàng (tra cứu gợi ý & tích điểm)
        const phoneInput = document.getElementById('pos-customer-phone');
        const nameInput = document.getElementById('pos-customer-name');
        const custResults = document.getElementById('pos-customer-search-results');
        const clearCustBtn = document.getElementById('pos-clear-customer-btn');

        const triggerCustomerSearch = (val, searchType) => {
            const query = (val || '').trim();
            if (query.length > 0) {
                if (clearCustBtn) clearCustBtn.classList.remove('hidden');
                this.handleCustomerSearch(query, searchType);
            } else {
                if (!phoneInput?.value.trim() && !nameInput?.value.trim()) {
                    if (clearCustBtn) clearCustBtn.classList.add('hidden');
                }
                if (custResults) custResults.classList.add('hidden');
                this.updatePointsPreview();
            }
        };

        if (phoneInput) {
            phoneInput.addEventListener('input', (e) => {
                triggerCustomerSearch(e.target.value, 'phone');
            });
            phoneInput.addEventListener('focus', () => {
                if (phoneInput.value.trim().length > 0) {
                    triggerCustomerSearch(phoneInput.value, 'phone');
                }
            });
            phoneInput.addEventListener('keydown', (e) => this.handleCustomerKeydown(e));
        }

        if (nameInput) {
            nameInput.addEventListener('input', (e) => {
                triggerCustomerSearch(e.target.value, 'name');
            });
            nameInput.addEventListener('focus', () => {
                if (nameInput.value.trim().length > 0) {
                    triggerCustomerSearch(nameInput.value, 'name');
                }
            });
            nameInput.addEventListener('keydown', (e) => this.handleCustomerKeydown(e));
        }

        // Đóng gợi ý khách hàng khi click ra ngoài
        document.addEventListener('click', (e) => {
            if (custResults && !custResults.classList.contains('hidden')) {
                if (!custResults.contains(e.target) && 
                    !phoneInput?.contains(e.target) && 
                    !nameInput?.contains(e.target) &&
                    !clearCustBtn?.contains(e.target)) {
                    custResults.classList.add('hidden');
                }
            }
        });
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
                    document.getElementById('pos-customer-search-results')?.classList.add('hidden');
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
            this.medicineSearchResultsList = [];
            this.medicineSearchHighlightedIndex = -1;
            return;
        }

        const q = query.toLowerCase();
        const medicines = Store.getMedicines().filter(m => 
            (m.name && m.name.toLowerCase().includes(q)) ||
            (m.activeIngredient && m.activeIngredient.toLowerCase().includes(q)) ||
            (m.barcode && m.barcode.includes(q)) ||
            (m.id && m.id.toLowerCase().includes(q))
        );

        this.medicineSearchResultsList = medicines.slice(0, 10);
        this.medicineSearchHighlightedIndex = -1;

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
        this.medicineSearchResultsList.forEach((m, idx) => {
            const stockStatus = AppUtils.checkStockStatus(m);
            const isOutOfStock = stockStatus.status === 'out_of_stock';
            const priceBox = AppUtils.formatVND(m.priceBox);
            const priceBase = AppUtils.formatVND(m.priceBase);

            html += `
                <div onclick="POSModule.addToCart('${m.id}')" 
                     data-med-index="${idx}"
                     class="pos-med-search-item p-2.5 hover:bg-emerald-50 transition border-b border-slate-100 cursor-pointer flex items-center justify-between group ${isOutOfStock ? 'opacity-60 bg-slate-50' : ''}">
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

    // Bắt phím cho ô tìm kiếm thuốc: hỗ trợ Enter của máy quét mã vạch và phím mũi tên
    handleMedicineSearchKeydown(e) {
        const resultsEl = document.getElementById('pos-search-results');
        const searchInput = document.getElementById('pos-search-input');
        if (!searchInput) return;

        const val = searchInput.value.trim();

        if (e.key === 'ArrowDown') {
            if (!this.medicineSearchResultsList || this.medicineSearchResultsList.length === 0) return;
            e.preventDefault();
            this.medicineSearchHighlightedIndex++;
            if (this.medicineSearchHighlightedIndex >= this.medicineSearchResultsList.length) {
                this.medicineSearchHighlightedIndex = 0;
            }
            this.updateMedicineHighlight();
            return;
        }

        if (e.key === 'ArrowUp') {
            if (!this.medicineSearchResultsList || this.medicineSearchResultsList.length === 0) return;
            e.preventDefault();
            this.medicineSearchHighlightedIndex--;
            if (this.medicineSearchHighlightedIndex < 0) {
                this.medicineSearchHighlightedIndex = this.medicineSearchResultsList.length - 1;
            }
            this.updateMedicineHighlight();
            return;
        }

        if (e.key === 'Enter') {
            e.preventDefault();
            if (!val) return;

            // 1. Kiểm tra khớp chính xác mã thuốc hoặc mã vạch (Hỗ trợ máy quét Barcode Scanner)
            const exactMed = Store.getMedicineById(val);
            if (exactMed) {
                this.addToCart(exactMed.id);
                if (window.AppUtils && AppUtils.playBeepSound) AppUtils.playBeepSound('success');
                return;
            }

            // 2. Nếu đang dùng mũi tên di chuyển chọn 1 mục trong danh sách
            if (this.medicineSearchHighlightedIndex >= 0 && this.medicineSearchResultsList[this.medicineSearchHighlightedIndex]) {
                const selected = this.medicineSearchResultsList[this.medicineSearchHighlightedIndex];
                this.addToCart(selected.id);
                if (window.AppUtils && AppUtils.playBeepSound) AppUtils.playBeepSound('success');
                return;
            }

            // 3. Nếu danh sách tìm kiếm có kết quả, chọn ngay kết quả đầu tiên
            if (this.medicineSearchResultsList && this.medicineSearchResultsList.length > 0) {
                const first = this.medicineSearchResultsList[0];
                this.addToCart(first.id);
                if (window.AppUtils && AppUtils.playBeepSound) AppUtils.playBeepSound('success');
                return;
            }
        }

        if (e.key === 'Escape') {
            if (resultsEl) resultsEl.classList.add('hidden');
        }
    },

    updateMedicineHighlight() {
        const items = document.querySelectorAll('.pos-med-search-item');
        items.forEach((item, idx) => {
            if (idx === this.medicineSearchHighlightedIndex) {
                item.classList.add('bg-emerald-100/90', 'border-l-4', 'border-emerald-600');
                item.classList.remove('hover:bg-emerald-50');
                try { item.scrollIntoView({ block: 'nearest' }); } catch(err){}
            } else {
                item.classList.remove('bg-emerald-100/90', 'border-l-4', 'border-emerald-600');
                item.classList.add('hover:bg-emerald-50');
            }
        });
    },

    // Tính số lượng tồn kho khả dụng tối đa theo đơn vị đang chọn (đã trừ đi các dòng khác của cùng thuốc này trong giỏ)
    getMaxAvailableQuantity(medicineId, unit, excludeCartIndex = -1) {
        const med = Store.getMedicineById(medicineId);
        if (!med) return 0;

        const totalStockUnits = parseFloat(med.stockUnits) || 0;
        if (totalStockUnits <= 0) return 0;

        // Tính tổng số đơn vị cơ bản (baseUnit) đã được sử dụng ở các dòng khác trong giỏ hàng
        let usedBaseUnitsInCart = 0;
        (this.cart || []).forEach((item, idx) => {
            if (item.medicineId === medicineId && idx !== excludeCartIndex) {
                let ratio = 1;
                if (item.unit === med.packUnit && (med.packRatio || 1) > 1) {
                    ratio = med.packRatio;
                } else if (item.unit === med.subUnit && (med.subRatio || 1) > 1) {
                    ratio = med.subRatio;
                }
                usedBaseUnitsInCart += (parseFloat(item.quantity) || 0) * ratio;
            }
        });

        const remainingBaseUnits = Math.max(0, Math.round((totalStockUnits - usedBaseUnitsInCart) * 1000) / 1000);
        if (remainingBaseUnits <= 0) return 0;

        // Quy đổi ra đơn vị mục tiêu (unit)
        let targetRatio = 1;
        if (unit === med.packUnit && (med.packRatio || 1) > 1) {
            targetRatio = med.packRatio;
        } else if (unit === med.subUnit && (med.subRatio || 1) > 1) {
            targetRatio = med.subRatio;
        }

        const maxInUnit = remainingBaseUnits / targetRatio;
        return Math.round(maxInUnit * 1000) / 1000;
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
        const maxQty = this.getMaxAvailableQuantity(medicineId, selectedUnit, existingIndex >= 0 ? existingIndex : -1);

        if (maxQty <= 0) {
            alert(`Thuốc [${med.name}] hiện đã hết hàng trong kho (Tồn: 0 ${selectedUnit})! Không thể thêm vào đơn bán.`);
            if (window.App && App.showToast) App.showToast(`Thuốc [${med.name}] đã hết hàng!`, 'error');
            if (window.AppUtils && AppUtils.playBeepSound) AppUtils.playBeepSound('error');
            return;
        }

        if (existingIndex >= 0) {
            const currentQty = this.cart[existingIndex].quantity;
            if (currentQty + 1 > maxQty) {
                if (currentQty >= maxQty) {
                    alert(`Thuốc [${med.name}] hiện chỉ còn tồn tối đa ${maxQty} ${selectedUnit} trong kho! Không thể thêm tiếp.`);
                    if (window.App && App.showToast) App.showToast(`Đã đạt giới hạn tồn kho tối đa: ${maxQty} ${selectedUnit}`, 'warning');
                    if (window.AppUtils && AppUtils.playBeepSound) AppUtils.playBeepSound('error');
                    return;
                }
                this.cart[existingIndex].quantity = maxQty;
                if (window.App && App.showToast) App.showToast(`Đã điều chỉnh thuốc [${med.name}] lên tối đa ${maxQty} ${selectedUnit}.`, 'info');
            } else {
                this.cart[existingIndex].quantity = Math.round((currentQty + 1) * 1000) / 1000;
            }
        } else {
            const addQty = Math.min(1, maxQty);
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
                quantity: addQty,
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

        // Kiểm tra lại tồn kho tối đa sau khi đổi đơn vị
        const maxQty = this.getMaxAvailableQuantity(item.medicineId, newUnit, index);
        if (item.quantity > maxQty) {
            item.quantity = Math.max(0.001, maxQty);
            alert(`Thuốc [${med.name}] khi đổi sang ${newUnit} chỉ còn tồn tối đa ${maxQty} ${newUnit}. Số lượng đã được điều chỉnh về ${maxQty} ${newUnit}.`);
            if (window.App && App.showToast) App.showToast(`Thuốc [${med.name}] điều chỉnh về tối đa ${maxQty} ${newUnit}.`, 'warning');
        }

        this.renderCart();
    },

    // Tăng giảm số lượng
    changeItemQty(index, delta) {
        const item = this.cart[index];
        if (!item) return;

        const maxQty = this.getMaxAvailableQuantity(item.medicineId, item.unit, index);

        if (delta > 0) {
            const nextQty = Math.round((item.quantity + delta) * 1000) / 1000;
            if (nextQty > maxQty) {
                item.quantity = maxQty;
                alert(`Thuốc [${item.medicineName}] hiện chỉ còn tồn tối đa ${maxQty} ${item.unit} trong kho! Không thể tăng thêm.`);
                if (window.App && App.showToast) App.showToast(`Đã đạt giới hạn tồn kho: ${maxQty} ${item.unit}`, 'warning');
                if (window.AppUtils && AppUtils.playBeepSound) AppUtils.playBeepSound('error');
                this.renderCart();
                return;
            }
            item.quantity = nextQty;
        } else {
            const nextQty = Math.round((item.quantity + delta) * 1000) / 1000;
            if (nextQty <= 0) {
                this.removeItem(index);
                return;
            }
            item.quantity = nextQty;
        }

        this.renderCart();
    },

    // Nhập trực tiếp số lượng (hỗ trợ cả số lẻ như 0.5 vỉ, 0.4 hộp...)
    setItemQty(index, val) {
        const item = this.cart[index];
        if (!item) return;

        let qty = parseFloat(val);
        if (isNaN(qty) || qty <= 0) {
            qty = 1;
        }

        const maxQty = this.getMaxAvailableQuantity(item.medicineId, item.unit, index);
        if (maxQty <= 0) {
            alert(`Thuốc [${item.medicineName}] đã hết hàng trong kho!`);
            this.removeItem(index);
            return;
        }

        if (qty > maxQty) {
            alert(`Tồn kho không đủ!\n\nThuốc [${item.medicineName}] hiện chỉ còn tồn ${maxQty} ${item.unit} trong kho.\n\nSố lượng bán đã được tự động giới hạn về tối đa ${maxQty} ${item.unit}.`);
            qty = maxQty;
        }

        item.quantity = Math.round(qty * 1000) / 1000;
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
            const med = Store.getMedicineById(item.medicineId);
            const maxQty = this.getMaxAvailableQuantity(item.medicineId, item.unit, idx);
            if (item.quantity > maxQty) {
                item.quantity = maxQty > 0 ? maxQty : 0.001;
            }
            const lineTotal = item.quantity * item.price;

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
                        <div class="text-[10px] text-slate-400 mt-0.5">Tồn: <span class="font-bold text-slate-600">${maxQty}</span> ${item.unit}</div>
                    </td>
                    <td class="py-2.5 px-2">
                        <div class="flex items-center justify-center border border-slate-200 rounded-lg overflow-hidden w-24 bg-white">
                            <button onclick="POSModule.changeItemQty(${idx}, -1)" class="px-2 py-1 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold cursor-pointer">-</button>
                            <input type="number" min="0.001" max="${maxQty}" step="any" value="${item.quantity}" 
                                   onchange="POSModule.setItemQty(${idx}, this.value)" 
                                   class="w-12 text-center font-bold text-slate-800 text-sm focus:outline-none py-1" />
                            <button onclick="POSModule.changeItemQty(${idx}, 1)" 
                                    ${item.quantity >= maxQty ? 'disabled title="Đã đạt giới hạn tồn kho tối đa" class="px-2 py-1 bg-slate-100 text-slate-300 font-bold cursor-not-allowed"' : 'class="px-2 py-1 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold cursor-pointer"'} 
                                    >+</button>
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

    removeAccents(str) {
        if (!str) return '';
        return str
            .normalize('NFD')
            .replace(/[\u0300-\u036f]/g, '')
            .replace(/[đĐ]/g, (m) => (m === 'đ' ? 'd' : 'D'))
            .toLowerCase();
    },

    escapeHtml(str) {
        if (!str) return '';
        return String(str)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#039;');
    },

    updatePointsPreview() {
        const totalAmount = this.calculateTotalAmount();
        const pointsEarned = Store.calculatePoints(totalAmount);
        const phoneInput = document.getElementById('pos-customer-phone');
        const nameInput = document.getElementById('pos-customer-name');
        const phone = phoneInput?.value.trim() || '';
        const name = nameInput?.value.trim() || '';

        const elPointsThisOrder = document.getElementById('pos-points-this-order');
        const elCustStatus = document.getElementById('pos-points-cust-status');
        const elCurrBalance = document.getElementById('pos-points-curr-balance');
        const elRateHint = document.getElementById('pos-points-rate-hint');
        const pointsInput = document.getElementById('pos-points-used-input');
        const btnUseMax = document.getElementById('pos-btn-use-all-points');
        const clearBtn = document.getElementById('pos-clear-customer-btn');

        if (clearBtn) {
            if (phone || name) {
                clearBtn.classList.remove('hidden');
            } else {
                clearBtn.classList.add('hidden');
            }
        }

        if (elPointsThisOrder) {
            elPointsThisOrder.innerText = `+${pointsEarned} điểm`;
        }

        // Tìm thông tin khách hàng:
        // 1. Theo ID đã chọn (nếu có)
        // 2. Theo SĐT
        // 3. Theo Tên (nếu không có SĐT)
        let cust = null;
        if (this.selectedCustomerId) {
            cust = Store.getCustomerById(this.selectedCustomerId);
        }
        if (!cust && phone) {
            cust = Store.getCustomerByPhone(phone);
        }
        if (!cust && name) {
            const normName = this.removeAccents(name);
            const customers = Store.getCustomers();
            cust = customers.find(c => c.name && this.removeAccents(c.name) === normName);
        }

        if (!phone && !name && !cust) {
            if (elCustStatus) elCustStatus.innerHTML = 'Tích điểm: <b>100.000đ = +1 điểm</b>';
            if (elCurrBalance) elCurrBalance.innerText = 'Nhập SĐT hoặc Tên để dùng điểm & cộng dồn cho khách';
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

        if (cust) {
            const custPoints = cust.points || 0;
            const tier = Store.getCustomerTier(custPoints);
            const nextTotal = Math.max(0, custPoints - this.pointsUsed) + pointsEarned;
            const targetPhoneOrId = cust.phone || cust.id || phone;

            if (elCustStatus) {
                const safeTarget = targetPhoneOrId.replace(/'/g, "\\'");
                elCustStatus.innerHTML = `Khách: <a href="javascript:void(0)" onclick="CustomersModule.openCustomerOrdersModal('${safeTarget}')" class="text-emerald-700 hover:text-emerald-900 underline font-bold cursor-pointer inline-flex items-center gap-1" title="Bấm để xem toàn bộ hóa đơn khách đã từng mua"><span>${this.escapeHtml(cust.name)}</span> <i data-lucide="receipt" class="w-3.5 h-3.5 text-emerald-600"></i></a> <span class="px-1.5 py-0.5 rounded text-[10px] font-bold border ${tier.badge}">${tier.icon} ${tier.name}</span> <button type="button" onclick="CustomersModule.openCustomerOrdersModal('${safeTarget}')" class="ml-1 text-[10px] text-emerald-800 bg-emerald-100 hover:bg-emerald-200 px-1.5 py-0.2 rounded font-bold cursor-pointer transition">Xem lịch sử đơn</button>`;
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
            // Khách mới chưa có trong danh bạ
            const displayName = phone || name || 'Khách mới';
            const safeTarget = (phone || name).replace(/'/g, "\\'");
            if (elCustStatus) {
                elCustStatus.innerHTML = `Khách mới: <b class="font-mono text-slate-800">${this.escapeHtml(displayName)}</b> <button type="button" onclick="CustomersModule.openCustomerOrdersModal('${safeTarget}')" class="ml-1 text-[10px] text-emerald-800 bg-emerald-100 hover:bg-emerald-200 px-1.5 py-0.2 rounded font-bold cursor-pointer transition">Lịch sử đơn</button>`;
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

    handleCustomerSearch(query, searchType = 'phone') {
        const resultsEl = document.getElementById('pos-customer-search-results');
        if (!resultsEl) return;

        const rawQuery = (query || '').trim();
        if (!rawQuery) {
            resultsEl.classList.add('hidden');
            resultsEl.innerHTML = '';
            this.customerSearchResultsList = [];
            this.customerSearchHighlightedIndex = -1;
            return;
        }

        const normQuery = this.removeAccents(rawQuery);
        const digitsQuery = rawQuery.replace(/\D/g, '');
        const customers = Store.getCustomers() || [];

        // Tìm kiếm khách hàng theo: SĐT, Tên, Mã khách hàng (KH...), Địa chỉ
        const matches = customers.filter(c => {
            const cPhone = c.phone || '';
            const cName = c.name || '';
            const cId = c.id || '';
            const cAddr = c.address || '';

            // Khớp SĐT
            if (digitsQuery && cPhone.replace(/\D/g, '').includes(digitsQuery)) return true;
            if (cPhone.toLowerCase().includes(normQuery)) return true;

            // Khớp Mã KH
            if (cId.toLowerCase().includes(normQuery)) return true;

            // Khớp Tên (không dấu)
            const normName = this.removeAccents(cName);
            if (normName.includes(normQuery)) return true;

            // Khớp Địa chỉ (không dấu)
            if (cAddr && this.removeAccents(cAddr).includes(normQuery)) return true;

            return false;
        });

        // Điểm ưu tiên sắp xếp kết quả:
        // 1. Trùng khớp chính xác SĐT hoặc Tên
        // 2. Bắt đầu bằng query
        // 3. Ưu tiên số lượt mua / điểm / chi tiêu
        matches.sort((a, b) => {
            const aNormPhone = (a.phone || '').replace(/\D/g, '');
            const bNormPhone = (b.phone || '').replace(/\D/g, '');
            const aNormName = this.removeAccents(a.name || '');
            const bNormName = this.removeAccents(b.name || '');

            if (digitsQuery) {
                const aExact = aNormPhone === digitsQuery;
                const bExact = bNormPhone === digitsQuery;
                if (aExact && !bExact) return -1;
                if (!aExact && bExact) return 1;

                const aStarts = aNormPhone.startsWith(digitsQuery);
                const bStarts = bNormPhone.startsWith(digitsQuery);
                if (aStarts && !bStarts) return -1;
                if (!aStarts && bStarts) return 1;
            }

            const aNameStarts = aNormName.startsWith(normQuery);
            const bNameStarts = bNormName.startsWith(normQuery);
            if (aNameStarts && !bNameStarts) return -1;
            if (!aNameStarts && bNameStarts) return 1;

            const aScore = (a.ordersCount || 0) * 10 + (a.points || 0);
            const bScore = (b.ordersCount || 0) * 10 + (b.points || 0);
            return bScore - aScore;
        });

        const topMatches = matches.slice(0, 10);
        this.customerSearchResultsList = topMatches;
        this.customerSearchHighlightedIndex = topMatches.length > 0 ? 0 : -1;

        if (topMatches.length === 0) {
            resultsEl.innerHTML = `
                <div class="p-3 text-center text-xs text-slate-500">
                    <p class="font-medium text-slate-700">Không tìm thấy khách hàng nào khớp với "<b>${this.escapeHtml(rawQuery)}</b>"</p>
                    <p class="text-[11px] text-slate-400 mt-0.5">Tiếp tục nhập để bán và hệ thống sẽ tự động lưu khách mới khi thanh toán</p>
                </div>
            `;
            resultsEl.classList.remove('hidden');
            return;
        }

        let html = `
            <div class="px-2.5 py-1.5 bg-slate-50 text-[10px] font-bold text-slate-500 uppercase tracking-wider flex justify-between items-center border-b border-slate-100">
                <span>Tìm thấy ${matches.length} khách hàng (Dùng ↑↓ để chọn, Enter để điền)</span>
                <span class="text-[9px] text-slate-400 font-normal">Esc để đóng</span>
            </div>
            <div class="py-1">
        `;

        topMatches.forEach((cust, idx) => {
            const isHighlighted = idx === this.customerSearchHighlightedIndex;
            const pts = cust.points || 0;
            const tier = Store.getCustomerTier(pts);
            const phoneDisplay = cust.phone ? cust.phone : 'Chưa có SĐT';
            const orders = cust.ordersCount || 0;

            html += `
                <div class="customer-search-item px-3 py-2 cursor-pointer transition flex items-center justify-between text-xs ${isHighlighted ? 'bg-emerald-50 text-emerald-950 font-medium' : 'hover:bg-slate-50 text-slate-800'}"
                     data-index="${idx}"
                     onclick="POSModule.selectCustomerByIndex(${idx})">
                    <div class="flex-1 min-w-0 mr-2">
                        <div class="flex items-center gap-1.5 flex-wrap">
                            <span class="font-bold text-slate-900">${this.escapeHtml(cust.name || 'Khách chưa đặt tên')}</span>
                            <span class="font-mono text-[11px] px-1.5 py-0.2 rounded bg-slate-100 text-slate-700 border border-slate-200">${phoneDisplay}</span>
                            <span class="px-1.5 py-0.2 rounded text-[10px] font-bold border ${tier.badge}">${tier.icon} ${tier.name}</span>
                        </div>
                        <div class="text-[11px] text-slate-500 flex items-center gap-2 mt-0.5">
                            <span class="text-amber-800 font-semibold"><i data-lucide="star" class="w-3 h-3 inline"></i> ${pts} điểm</span>
                            ${orders > 0 ? `<span>• ${orders} lượt mua</span>` : ''}
                            ${cust.address ? `<span class="truncate max-w-[200px]" title="${this.escapeHtml(cust.address)}">• ${this.escapeHtml(cust.address)}</span>` : ''}
                        </div>
                    </div>
                    <div class="text-right shrink-0">
                        <span class="text-[10px] text-emerald-700 font-bold bg-emerald-50 px-2 py-1 rounded border border-emerald-200 hover:bg-emerald-100">Chọn</span>
                    </div>
                </div>
            `;
        });

        html += `</div>`;
        resultsEl.innerHTML = html;
        resultsEl.classList.remove('hidden');
        if (window.lucide) lucide.createIcons();
    },

    selectCustomerByIndex(idx) {
        if (!this.customerSearchResultsList || !this.customerSearchResultsList[idx]) return;
        const cust = this.customerSearchResultsList[idx];
        this.applySelectedCustomer(cust);
    },

    applySelectedCustomer(cust) {
        if (!cust) return;
        const phoneInput = document.getElementById('pos-customer-phone');
        const nameInput = document.getElementById('pos-customer-name');
        const clearBtn = document.getElementById('pos-clear-customer-btn');
        const resultsEl = document.getElementById('pos-customer-search-results');

        this.selectedCustomerId = cust.id || '';
        if (phoneInput) phoneInput.value = cust.phone || '';
        if (nameInput) nameInput.value = cust.name || '';
        if (clearBtn) clearBtn.classList.remove('hidden');
        if (resultsEl) resultsEl.classList.add('hidden');

        this.customerSearchResultsList = [];
        this.customerSearchHighlightedIndex = -1;

        this.updatePointsPreview();

        // Focus sang ô ghi chú dặn dò bệnh nhân
        document.getElementById('pos-customer-note')?.focus();
    },

    clearCustomer() {
        const phoneInput = document.getElementById('pos-customer-phone');
        const nameInput = document.getElementById('pos-customer-name');
        const noteInput = document.getElementById('pos-customer-note');
        const clearBtn = document.getElementById('pos-clear-customer-btn');
        const resultsEl = document.getElementById('pos-customer-search-results');

        this.selectedCustomerId = '';
        if (phoneInput) phoneInput.value = '';
        if (nameInput) nameInput.value = '';
        if (noteInput) noteInput.value = '';
        if (clearBtn) clearBtn.classList.add('hidden');
        if (resultsEl) resultsEl.classList.add('hidden');

        this.customerSearchResultsList = [];
        this.customerSearchHighlightedIndex = -1;

        this.updatePointsPreview();
        phoneInput?.focus();
    },

    handleCustomerKeydown(e) {
        const resultsEl = document.getElementById('pos-customer-search-results');
        if (!resultsEl || resultsEl.classList.contains('hidden') || this.customerSearchResultsList.length === 0) {
            return;
        }

        if (e.key === 'ArrowDown') {
            e.preventDefault();
            this.customerSearchHighlightedIndex = (this.customerSearchHighlightedIndex + 1) % this.customerSearchResultsList.length;
            this.updateCustomerHighlight();
        } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            this.customerSearchHighlightedIndex = (this.customerSearchHighlightedIndex - 1 + this.customerSearchResultsList.length) % this.customerSearchResultsList.length;
            this.updateCustomerHighlight();
        } else if (e.key === 'Enter') {
            e.preventDefault();
            if (this.customerSearchHighlightedIndex >= 0 && this.customerSearchHighlightedIndex < this.customerSearchResultsList.length) {
                this.selectCustomerByIndex(this.customerSearchHighlightedIndex);
            }
        } else if (e.key === 'Escape') {
            e.preventDefault();
            resultsEl.classList.add('hidden');
        }
    },

    updateCustomerHighlight() {
        const items = document.querySelectorAll('#pos-customer-search-results .customer-search-item');
        items.forEach((item, idx) => {
            if (idx === this.customerSearchHighlightedIndex) {
                item.classList.add('bg-emerald-50', 'text-emerald-950', 'font-medium');
                item.classList.remove('hover:bg-slate-50', 'text-slate-800');
                item.scrollIntoView({ block: 'nearest' });
            } else {
                item.classList.remove('bg-emerald-50', 'text-emerald-950', 'font-medium');
                item.classList.add('hover:bg-slate-50', 'text-slate-800');
            }
        });
    },

    handleCustomerPhoneChange(phone) {
        if (!phone) {
            this.updatePointsPreview();
            return;
        }

        const cust = Store.getCustomerByPhone(phone);
        const nameInput = document.getElementById('pos-customer-name');
        if (cust) {
            this.selectedCustomerId = cust.id || '';
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

        // Kiểm tra tồn kho thực tế của toàn bộ giỏ hàng - KHÔNG CHO PHÉP BÁN ÂM TỒN KHO
        for (let i = 0; i < this.cart.length; i++) {
            const item = this.cart[i];
            const maxQty = this.getMaxAvailableQuantity(item.medicineId, item.unit, i);
            if (item.quantity > maxQty) {
                alert(`KHÔNG THỂ THANH TOÁN!\n\nThuốc [${item.medicineName}] hiện chỉ còn tồn ${maxQty} ${item.unit} trong kho, nhưng giỏ hàng đang chọn ${item.quantity} ${item.unit}.\n\nSố lượng bán đã được tự động điều chỉnh về ${maxQty} ${item.unit}. Vui lòng kiểm tra lại trước khi thanh toán.`);
                item.quantity = maxQty > 0 ? maxQty : 0.001;
                this.renderCart();
                return;
            }
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
            customerId: this.selectedCustomerId || '',
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

        // Lưu tức thì lên máy chủ, không chờ debounce
        if (window.Store && typeof Store.persistImmediately === 'function') {
            Store.persistImmediately();
        }

        // Ghi nhận vào Lịch Sử Thao Tác (Audit Log)
        Store.logAction('Hóa đơn', `Tạo hóa đơn: ${savedOrder.id}, bảng giá: Bảng giá chung, Thuế: Tắt thuế, giá trị: ${AppUtils.formatVND(savedOrder.totalAmount)}, khách hàng: ${savedOrder.customerName || 'Khách vãng lai'}`, savedOrder.pharmacist || 'ADMIN', 'create');
        Store.logAction('Phiếu thu', `Tạo phiếu thu: TTHD${savedOrder.id.replace('HD','')}, cho hóa đơn: ${savedOrder.id}, với giá trị: ${AppUtils.formatVND(savedOrder.totalAmount)}`, savedOrder.pharmacist || 'ADMIN', 'create');

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
        this.selectedCustomerId = '';
        this.customerSearchResultsList = [];
        this.customerSearchHighlightedIndex = -1;
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
        document.getElementById('pos-clear-customer-btn')?.classList.add('hidden');
        document.getElementById('pos-customer-search-results')?.classList.add('hidden');
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

