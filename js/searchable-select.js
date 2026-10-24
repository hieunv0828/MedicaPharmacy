/**
 * MedicaPharmacy - Searchable Select / Combobox Component
 * Biến các dropdown <select> dài thành Combobox tìm kiếm thông minh:
 * - Gõ chữ lọc tức thì (hỗ trợ tiếng Việt không dấu, viết tắt, hoạt chất, SĐT...)
 * - Hiển thị giao diện trực quan (tồn kho, quy cách, SĐT nhà cung cấp...)
 * - Điều hướng bàn phím mượt mà (Mũi tên lên/xuống, Enter để chọn, Escape để đóng)
 * - Tự động đồng bộ 2 chiều hoàn hảo với thẻ <select> gốc
 */

(function() {
    'use strict';

    class ComboboxInstance {
        constructor(select, config = {}) {
            this.select = select;
            this.config = Object.assign({
                placeholder: '-- Tìm kiếm hoặc bấm để chọn --',
                richType: 'default', // 'medicine' | 'supplier' | 'category' | 'default'
                maxItems: 50
            }, config);

            this.isOpen = false;
            this.activeIndex = -1;
            this.items = [];
            this.visibleItems = [];

            this.buildUI();
            this.hookSelectProperty();
            this.bindEvents();
            this.observeSelect();
            this.syncFromSelect();
        }

        buildUI() {
            // Ẩn select gốc (giữ nguyên trong DOM để form & script bên ngoài hoạt động bình thường)
            this.select.classList.add('hidden');
            this.select.style.display = 'none';

            // Tạo wrapper combobox
            this.wrapper = document.createElement('div');
            this.wrapper.className = 'searchable-combobox-wrapper relative w-full text-left font-normal select-none';
            this.wrapper.setAttribute('data-target-select', this.select.id || '');

            // Ô input tìm kiếm + icon
            const inputContainer = document.createElement('div');
            inputContainer.className = 'relative flex items-center w-full';

            this.input = document.createElement('input');
            this.input.type = 'text';
            this.input.className = 'combobox-search-input w-full text-xs px-3 py-2 pr-12 bg-white border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500 font-semibold text-slate-800 placeholder-slate-400 cursor-pointer shadow-sm transition';
            this.input.placeholder = this.config.placeholder;
            this.input.autocomplete = 'off';
            this.input.spellcheck = false;

            // Nút xóa & mũi tên dropdown
            const actionsContainer = document.createElement('div');
            actionsContainer.className = 'absolute right-2 flex items-center gap-1';

            this.clearBtn = document.createElement('button');
            this.clearBtn.type = 'button';
            this.clearBtn.className = 'combobox-clear-btn hidden p-1 text-slate-300 hover:text-slate-600 rounded transition cursor-pointer';
            this.clearBtn.title = 'Xóa lựa chọn';
            this.clearBtn.innerHTML = `
                <svg class="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
                    <line x1="18" y1="6" x2="6" y2="18"></line>
                    <line x1="6" y1="6" x2="18" y2="18"></line>
                </svg>
            `;

            this.toggleBtn = document.createElement('button');
            this.toggleBtn.type = 'button';
            this.toggleBtn.tabIndex = -1;
            this.toggleBtn.className = 'combobox-toggle-btn p-1 text-slate-400 hover:text-slate-700 rounded transition cursor-pointer';
            this.toggleBtn.innerHTML = `
                <svg class="w-4 h-4 transition-transform duration-200" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <path d="m6 9 6 6 6-6"/>
                </svg>
            `;

            actionsContainer.appendChild(this.clearBtn);
            actionsContainer.appendChild(this.toggleBtn);

            inputContainer.appendChild(this.input);
            inputContainer.appendChild(actionsContainer);

            // Menu thả xuống (Dropdown) - đặt min-width lớn để hiển thị trọn vẹn tên thuốc và thông tin tồn kho
            this.dropdown = document.createElement('div');
            const minW = this.config.richType === 'medicine' ? 'min-w-[420px] sm:min-w-[560px]' : (this.config.richType === 'supplier' ? 'min-w-[360px] sm:min-w-[480px]' : 'min-w-full');
            this.dropdown.className = `combobox-dropdown hidden absolute left-0 top-full mt-1 w-full ${minW} max-w-[92vw] bg-white border border-slate-200 rounded-xl shadow-2xl z-[100] max-h-72 overflow-y-auto divide-y divide-slate-100 py-1 animate-fadeIn`;

            this.wrapper.appendChild(inputContainer);
            this.wrapper.appendChild(this.dropdown);

            // Chèn wrapper vào đúng vị trí của select
            this.select.parentNode.insertBefore(this.wrapper, this.select.nextSibling);
        }

        hookSelectProperty() {
            const self = this;
            const originalDescriptor = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value');

            // Bắt sự kiện gán select.value từ JS bên ngoài
            Object.defineProperty(this.select, 'value', {
                set: function(val) {
                    if (originalDescriptor && originalDescriptor.set) {
                        originalDescriptor.set.call(this, val);
                    }
                    self.syncFromSelect();
                },
                get: function() {
                    return originalDescriptor && originalDescriptor.get ? originalDescriptor.get.call(this) : '';
                },
                configurable: true
            });

            // Chuyển hướng select.focus() vào input
            this.select.focus = () => {
                this.input.focus();
            };
        }

        bindEvents() {
            // Khi người dùng bấm vào ô input
            this.input.addEventListener('focus', () => {
                this.input.select();
                this.open();
            });

            this.input.addEventListener('click', () => {
                if (!this.isOpen) {
                    this.open();
                }
            });

            // Khi người dùng gõ tìm kiếm
            this.input.addEventListener('input', (e) => {
                if (!this.isOpen) this.open();
                this.renderList(e.target.value);
            });

            // Phím điều hướng
            this.input.addEventListener('keydown', (e) => {
                if (e.key === 'ArrowDown') {
                    e.preventDefault();
                    if (!this.isOpen) {
                        this.open();
                    } else {
                        this.moveHighlight(1);
                    }
                } else if (e.key === 'ArrowUp') {
                    e.preventDefault();
                    if (this.isOpen) {
                        this.moveHighlight(-1);
                    }
                } else if (e.key === 'Enter') {
                    if (this.isOpen) {
                        e.preventDefault();
                        this.selectHighlighted();
                    }
                } else if (e.key === 'Escape') {
                    this.close();
                } else if (e.key === 'Tab') {
                    this.close();
                }
            });

            // Nút mũi tên mở/đóng
            this.toggleBtn.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();
                if (this.isOpen) {
                    this.close();
                } else {
                    this.input.focus();
                    this.open();
                }
            });

            // Nút xóa lựa chọn
            this.clearBtn.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();
                this.clearSelection();
            });

            // Bấm ra ngoài thì đóng dropdown
            document.addEventListener('click', (e) => {
                if (!this.wrapper.contains(e.target)) {
                    if (this.isOpen) {
                        this.close();
                        // Trả lại text đúng với option đang chọn nếu gõ dở chưa chọn
                        const selected = this.items.find(i => i.value === this.select.value && i.value !== '');
                        this.input.value = selected ? selected.text : '';
                    }
                }
            });
        }

        observeSelect() {
            // Theo dõi khi options trong <select> bị thay đổi qua script
            const observer = new MutationObserver(() => {
                this.syncFromSelect();
            });
            observer.observe(this.select, { childList: true, subtree: true, attributes: true });

            // Lắng nghe sự kiện change
            this.select.addEventListener('change', () => {
                this.syncFromSelect();
            });
        }

        syncFromSelect() {
            this.items = Array.from(this.select.options).map(opt => ({
                value: opt.value,
                text: opt.text ? opt.text.trim() : '',
                selected: opt.selected,
                element: opt
            }));

            const curVal = this.select.value;
            const selected = this.items.find(i => i.value === curVal && i.value !== '');

            if (selected) {
                let displayLabel = selected.text;
                if (this.config.richType === 'medicine' && window.Store && selected.value) {
                    const med = Store.getMedicineById(selected.value);
                    if (med) {
                        displayLabel = `${med.name} (${med.packUnit || 'Hộp'})`;
                    }
                } else if (this.config.richType === 'supplier' && window.Store && selected.value) {
                    const sup = Store.getSuppliers().find(s => s.id === selected.value);
                    if (sup) {
                        displayLabel = sup.name;
                    }
                }
                this.input.value = displayLabel;
                this.input.title = displayLabel;
                this.clearBtn.classList.remove('hidden');
            } else {
                this.input.value = '';
                this.input.title = '';
                this.clearBtn.classList.add('hidden');
            }
        }

        open() {
            this.isOpen = true;
            this.dropdown.classList.remove('hidden');
            const svg = this.toggleBtn.querySelector('svg');
            if (svg) svg.classList.add('rotate-180');

            // Căn lề thông minh tránh tràn mép phải màn hình
            this.dropdown.style.left = '0';
            this.dropdown.style.right = 'auto';
            const rect = this.dropdown.getBoundingClientRect();
            const viewportWidth = window.innerWidth || document.documentElement.clientWidth;
            if (rect.right > viewportWidth - 12) {
                this.dropdown.style.left = 'auto';
                this.dropdown.style.right = '0';
            }

            this.renderList(this.input.value);
        }

        close() {
            this.isOpen = false;
            this.dropdown.classList.add('hidden');
            const svg = this.toggleBtn.querySelector('svg');
            if (svg) svg.classList.remove('rotate-180');
            this.activeIndex = -1;
        }

        renderList(query = '') {
            const qClean = SearchableSelect.removeVietnameseTones(query);
            this.dropdown.innerHTML = '';

            // Lọc danh sách items
            const matched = this.items.filter(item => {
                // Luôn hiển thị nút thêm mới nếu có
                if (item.value === '__custom__') return true;
                // Bỏ qua option rỗng (placeholder)
                if (!item.value) return false;

                if (!qClean) return true;

                const textClean = SearchableSelect.removeVietnameseTones(item.text);
                if (textClean.includes(qClean)) return true;

                // Tìm kiếm mở rộng theo hoạt chất, mã vạch (thuốc)
                if (this.config.richType === 'medicine' && window.Store) {
                    const med = Store.getMedicineById(item.value);
                    if (med) {
                        const extraText = SearchableSelect.removeVietnameseTones(
                            `${med.name} ${med.activeIngredient || ''} ${med.barcode || ''} ${med.id || ''}`
                        );
                        if (extraText.includes(qClean)) return true;
                    }
                }

                // Tìm kiếm mở rộng theo SĐT, địa chỉ (nhà cung cấp)
                if (this.config.richType === 'supplier' && window.Store) {
                    const sup = Store.getSuppliers().find(s => s.id === item.value);
                    if (sup) {
                        const extraText = SearchableSelect.removeVietnameseTones(
                            `${sup.name} ${sup.phone || ''} ${sup.address || ''} ${sup.id || ''}`
                        );
                        if (extraText.includes(qClean)) return true;
                    }
                }

                return false;
            });

            this.visibleItems = matched;
            this.activeIndex = -1;

            if (matched.length === 0) {
                const emptyEl = document.createElement('div');
                emptyEl.className = 'px-3 py-4 text-center text-xs text-slate-400 italic';
                emptyEl.innerText = `Không tìm thấy kết quả phù hợp với "${query}"`;
                this.dropdown.appendChild(emptyEl);
                return;
            }

            // Giới hạn hiển thị nếu quá dài để đảm bảo hiệu năng
            const displayList = matched.slice(0, this.config.maxItems);

            displayList.forEach((item, index) => {
                const itemEl = document.createElement('div');
                itemEl.className = 'combobox-option px-3 py-2 text-xs hover:bg-emerald-50 cursor-pointer transition flex items-center justify-between gap-2';
                itemEl.setAttribute('data-value', item.value);
                itemEl.setAttribute('data-index', index);

                if (item.value === this.select.value) {
                    itemEl.classList.add('bg-emerald-50/80', 'font-bold');
                }

                // Render giao diện phù hợp với loại đối tượng
                if (item.value === '__custom__') {
                    itemEl.className = 'combobox-option px-3 py-2.5 text-xs bg-blue-50/60 hover:bg-blue-100/90 text-blue-700 font-bold cursor-pointer transition flex items-center gap-2 border-t border-blue-100';
                    itemEl.innerHTML = `
                        <svg class="w-4 h-4 text-blue-600 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><circle cx="12" cy="12" r="10"/><path d="M12 8v8M8 12h8"/></svg>
                        <span>${item.text}</span>
                    `;
                } else if (this.config.richType === 'medicine' && window.Store) {
                    const med = Store.getMedicineById(item.value);
                    if (med) {
                        const stockDisplay = (typeof AppUtils !== 'undefined' && AppUtils.formatStockUnitsDisplay) ? AppUtils.formatStockUnitsDisplay(med) : `${med.stockUnits || 0} ${med.baseUnit}`;
                        const isAvailable = (med.stockUnits || 0) > 0;
                        itemEl.className = 'combobox-option px-3.5 py-2.5 text-xs hover:bg-emerald-50/90 cursor-pointer transition border-b border-slate-100 last:border-b-0';
                        const canViewCost = !window.AuthModule || AuthModule.canViewCostPrice();
                        const priceLabel = canViewCost
                            ? `<span>• Giá vốn: <b class="text-emerald-700 font-semibold font-mono">${(typeof AppUtils !== 'undefined') ? AppUtils.formatVND(med.costPrice) : med.costPrice}</b></span>`
                            : `<span>• Giá bán: <b class="text-emerald-700 font-semibold font-mono">${(typeof AppUtils !== 'undefined') ? AppUtils.formatVND(med.priceBox) : med.priceBox}</b></span>`;

                        itemEl.innerHTML = `
                            <div class="flex items-start justify-between gap-3 w-full">
                                <div class="flex-1 min-w-0">
                                    <div class="flex flex-wrap items-center gap-1.5">
                                        <span class="font-bold text-slate-900 text-xs sm:text-sm text-emerald-950">${med.name}</span>
                                        <span class="px-1.5 py-0.5 rounded text-[10px] font-bold bg-slate-100 text-slate-700 border border-slate-200">${med.packUnit || 'Hộp'}</span>
                                    </div>
                                    <div class="text-[11px] text-slate-500 mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5">
                                        ${med.activeIngredient ? `<span>Hoạt chất: <b class="text-slate-700 font-medium">${med.activeIngredient}</b></span>` : ''}
                                        ${priceLabel}
                                    </div>
                                </div>
                                <div class="shrink-0 text-right self-center">
                                    <span class="inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-[11px] font-bold whitespace-nowrap shadow-xs ${isAvailable ? 'bg-emerald-50 text-emerald-800 border border-emerald-300' : 'bg-rose-50 text-rose-700 border border-rose-300'}">
                                        Tồn: ${stockDisplay}
                                    </span>
                                </div>
                            </div>
                        `;
                    } else {
                        itemEl.innerHTML = `<span class="font-bold text-slate-800 text-xs sm:text-sm">${item.text}</span>`;
                    }
                } else if (this.config.richType === 'supplier' && window.Store) {
                    const sup = Store.getSuppliers().find(s => s.id === item.value);
                    if (sup) {
                        itemEl.className = 'combobox-option px-3.5 py-2.5 text-xs hover:bg-emerald-50/90 cursor-pointer transition border-b border-slate-100 last:border-b-0';
                        itemEl.innerHTML = `
                            <div class="flex items-start justify-between gap-3 w-full">
                                <div class="flex-1 min-w-0">
                                    <div class="font-bold text-slate-900 text-xs sm:text-sm">${sup.name}</div>
                                    <div class="text-[11px] text-slate-500 mt-1 flex flex-wrap items-center gap-2">
                                        ${sup.phone ? `<span>📞 <b>${sup.phone}</b></span>` : ''}
                                        ${sup.address ? `<span class="text-slate-400">📍 ${sup.address}</span>` : ''}
                                    </div>
                                </div>
                                <span class="text-[10px] text-slate-400 font-mono font-semibold shrink-0 self-center">${sup.id}</span>
                            </div>
                        `;
                    } else {
                        itemEl.innerHTML = `<span class="font-bold text-slate-800">${item.text}</span>`;
                    }
                } else {
                    itemEl.innerHTML = `
                        <span class="font-semibold text-slate-800">${item.text}</span>
                        ${item.value === this.select.value ? `<svg class="w-4 h-4 text-emerald-600" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"/></svg>` : ''}
                    `;
                }

                itemEl.addEventListener('click', () => {
                    this.selectItem(item);
                });

                this.dropdown.appendChild(itemEl);
            });

            if (matched.length > this.config.maxItems) {
                const moreEl = document.createElement('div');
                moreEl.className = 'px-3 py-1.5 text-center text-[10px] text-slate-400 bg-slate-50';
                moreEl.innerText = `Còn ${matched.length - this.config.maxItems} kết quả khác. Hãy gõ thêm từ khóa để tìm chính xác hơn.`;
                this.dropdown.appendChild(moreEl);
            }
        }

        moveHighlight(direction) {
            const options = this.dropdown.querySelectorAll('.combobox-option');
            if (options.length === 0) return;

            if (this.activeIndex >= 0 && this.activeIndex < options.length) {
                options[this.activeIndex].classList.remove('bg-emerald-100', 'font-bold');
            }

            this.activeIndex += direction;
            if (this.activeIndex < 0) this.activeIndex = options.length - 1;
            if (this.activeIndex >= options.length) this.activeIndex = 0;

            const activeEl = options[this.activeIndex];
            if (activeEl) {
                activeEl.classList.add('bg-emerald-100', 'font-bold');
                activeEl.scrollIntoView({ block: 'nearest' });
            }
        }

        selectHighlighted() {
            const options = this.dropdown.querySelectorAll('.combobox-option');
            let targetEl = null;
            if (this.activeIndex >= 0 && this.activeIndex < options.length) {
                targetEl = options[this.activeIndex];
            } else if (options.length > 0) {
                targetEl = options[0];
            }

            if (targetEl) {
                const val = targetEl.getAttribute('data-value');
                const item = this.items.find(i => i.value === val);
                if (item) this.selectItem(item);
            }
        }

        selectItem(item) {
            this.select.value = item.value;
            let displayLabel = item.text;
            if (this.config.richType === 'medicine' && window.Store && item.value) {
                const med = Store.getMedicineById(item.value);
                if (med) {
                    displayLabel = `${med.name} (${med.packUnit || 'Hộp'})`;
                }
            } else if (this.config.richType === 'supplier' && window.Store && item.value) {
                const sup = Store.getSuppliers().find(s => s.id === item.value);
                if (sup) {
                    displayLabel = sup.name;
                }
            }
            this.input.value = item.value ? displayLabel : '';
            this.input.title = this.input.value;
            this.close();

            // Kích hoạt sự kiện change native trên select gốc
            this.select.dispatchEvent(new Event('change', { bubbles: true }));

            if (item.value) {
                this.clearBtn.classList.remove('hidden');
            } else {
                this.clearBtn.classList.add('hidden');
            }
        }

        clearSelection() {
            this.select.value = '';
            this.input.value = '';
            this.clearBtn.classList.add('hidden');
            this.select.dispatchEvent(new Event('change', { bubbles: true }));
            this.input.focus();
            this.open();
        }

        refresh() {
            this.syncFromSelect();
            if (this.isOpen) {
                this.renderList(this.input.value);
            }
        }
    }

    // Đối tượng quản lý toàn cục
    window.SearchableSelect = {
        instances: new Map(),

        removeVietnameseTones(str) {
            if (!str) return '';
            str = String(str).toLowerCase().trim();
            str = str.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
            str = str.replace(/[đĐ]/g, 'd');
            return str;
        },

        init(selectId, options = {}) {
            const select = typeof selectId === 'string' ? document.getElementById(selectId) : selectId;
            if (!select) return null;

            if (this.instances.has(select)) {
                const inst = this.instances.get(select);
                inst.refresh();
                return inst;
            }

            const inst = new ComboboxInstance(select, options);
            this.instances.set(select, inst);
            return inst;
        },

        refresh(selectId) {
            const select = typeof selectId === 'string' ? document.getElementById(selectId) : selectId;
            if (!select) return;
            const inst = this.instances.get(select);
            if (inst) {
                inst.refresh();
            } else {
                this.init(select);
            }
        },

        refreshAll() {
            this.instances.forEach(inst => inst.refresh());
        },

        closeAll() {
            this.instances.forEach(inst => inst.close());
        }
    };

})();
