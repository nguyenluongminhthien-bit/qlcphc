/**
 * =========================================================================================
 * TOOLTIP ENGINE: HỆ THỐNG HIỂN THỊ TOOLTIP CHÊNH LỆCH & % TĂNG GIẢM CHI PHÍ
 * THACO AUTO - Quản trị Chi phí Hành chính
 * File: tooltip.js
 * 
 * Tính năng chính:
 * 1. Tự động sinh DOM Tooltip container, hoàn toàn không làm nặng index.html.
 * 2. Lắng nghe hover (Event Delegation) trên bảng báo cáo chi phí.
 * 3. Tự động đọc dữ liệu năm so sánh hiện hành (Năm 2025, Năm 2024, hoặc Cả hai năm).
 * 4. Tính toán chênh lệch (Diff) và % tăng giảm, kèm icon trực quan (🔺 Tăng, 🔻 Giảm, ➖ Không đổi).
 * 5. Căn chỉnh vị trí thông minh, chống tràn viền màn hình (Screen edge collision detection).
 * =========================================================================================
 */

(function () {
    'use strict';

    let tooltipEl = null;

    function formatNumber(num) {
        if (num === null || num === undefined || isNaN(num)) return '0';
        const rounded = Math.round(Number(num) * 10) / 10;
        const parts = rounded.toFixed(1).split('.');
        parts[0] = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, ',');
        return parts[1] === '0' ? parts[0] : parts.join('.');
    }

    function initTooltipDOM() {
        if (tooltipEl) return;
        tooltipEl = document.createElement('div');
        tooltipEl.id = 'cost-cell-tooltip';
        tooltipEl.className = 'fixed hidden pointer-events-none z-[99999] bg-slate-900/95 text-slate-100 p-3 rounded-xl shadow-2xl border border-slate-700/80 backdrop-blur-md text-xs transition-opacity duration-100 w-80 max-w-sm font-sans select-none';
        tooltipEl.style.willChange = 'transform, top, left';
        document.body.appendChild(tooltipEl);
    }

    function getCompareConfig() {
        if (window.appState && window.appState.compareConfig) {
            return window.appState.compareConfig;
        }
        if (window.THACO_APP && window.THACO_APP.state && window.THACO_APP.state.compareConfig) {
            return window.THACO_APP.state.compareConfig;
        }
        return { mode: '2025', show: true };
    }

    function buildComparisonSnippet(targetYear, valCurrent, valPast, periodLabel, isCompareCol = false) {
        if (valPast === null || valPast === undefined || isNaN(valPast)) {
            return `
                <div class="mt-2 pt-2 border-t border-slate-700/70">
                    <div class="flex items-center justify-between text-[10px] text-slate-400 font-bold uppercase tracking-wider mb-1.5">
                        <span>${isCompareCol ? 'Đối soát với Cả năm 2026' : `So với ${periodLabel} ${targetYear}`}:</span>
                        <span class="text-slate-500 italic text-[10px]">Chưa có dữ liệu</span>
                    </div>
                    <div class="p-2 rounded-lg bg-slate-800/60 border border-slate-700/60 text-slate-400 flex items-center justify-between">
                        <span class="font-medium text-[11px] flex items-center gap-1.5">
                            <span>ℹ️</span>
                            <span>Chưa có dữ liệu so sánh</span>
                        </span>
                        <span class="text-[10px] text-slate-500 italic">Năm ${targetYear}</span>
                    </div>
                </div>
            `;
        }

        // Tiêu đề dòng đối chiếu
        const compareHeaderHtml = isCompareCol ? `
            <div class="flex items-center justify-between text-[10px] text-slate-400 font-bold uppercase tracking-wider mb-1.5">
                <span>Dự kiến Cả năm 2026:</span>
                <span class="font-mono text-cyan-300 font-bold text-xs">${formatNumber(valCurrent)} Tr.đ</span>
            </div>
        ` : `
            <div class="flex items-center justify-between text-[10px] text-slate-400 font-bold uppercase tracking-wider mb-1.5">
                <span>So với ${periodLabel} ${targetYear}:</span>
                <span class="font-mono text-slate-200 font-semibold text-xs">${formatNumber(valPast)} Tr.đ</span>
            </div>
        `;

        // Trường hợp 1: Cả 2 kỳ đều bằng 0
        if (valCurrent === 0 && valPast === 0) {
            return `
                <div class="mt-2 pt-2 border-t border-slate-700/70">
                    ${compareHeaderHtml}
                    <div class="p-2 rounded-lg bg-slate-800/70 border border-slate-700/70 text-slate-300 flex items-center justify-between shadow-sm">
                        <span class="font-medium text-[11px] flex items-center gap-1.5 text-slate-300">
                            <span class="text-sm leading-none">➖</span>
                            <span>Không phát sinh chi phí</span>
                        </span>
                        <span class="italic text-[10px] text-slate-400 font-mono">0 Tr.đ</span>
                    </div>
                </div>
            `;
        }

        // Trường hợp 2: Kỳ trước bằng 0, kỳ này có phát sinh (Mới phát sinh -> TĂNG)
        if (valPast === 0 && valCurrent > 0) {
            return `
                <div class="mt-2 pt-2 border-t border-slate-700/70">
                    ${compareHeaderHtml}
                    <div class="p-2 rounded-lg bg-rose-950/70 border border-rose-800/80 text-rose-200 shadow-sm">
                        <div class="flex items-center justify-between font-bold text-[11px] mb-1">
                            <span class="flex items-center gap-1.5 text-rose-300">
                                <span class="text-sm leading-none">🔺</span>
                                <span>Tăng:</span>
                            </span>
                            <span class="font-mono text-xs font-black text-rose-200">+${formatNumber(valCurrent)} Tr.đ</span>
                        </div>
                        <div class="flex items-center justify-between text-[10px] text-rose-300/90 pt-1 border-t border-rose-900/50">
                            <span>Tỉ lệ Tăng:</span>
                            <span class="font-mono font-bold text-rose-200">+100.0% <span class="text-[9px] font-normal italic opacity-80">(Mới phát sinh)</span></span>
                        </div>
                    </div>
                </div>
            `;
        }

        // Trường hợp 3: Kỳ trước có phát sinh, kỳ này bằng 0 (Tiết giảm hoàn toàn 100% -> GIẢM)
        if (valPast > 0 && valCurrent === 0) {
            return `
                <div class="mt-2 pt-2 border-t border-slate-700/70">
                    ${compareHeaderHtml}
                    <div class="p-2 rounded-lg bg-emerald-950/70 border border-emerald-800/80 text-emerald-200 shadow-sm">
                        <div class="flex items-center justify-between font-bold text-[11px] mb-1">
                            <span class="flex items-center gap-1.5 text-emerald-300">
                                <span class="text-sm leading-none">🔻</span>
                                <span>Giảm:</span>
                            </span>
                            <span class="font-mono text-xs font-black text-emerald-200">-${formatNumber(valPast)} Tr.đ</span>
                        </div>
                        <div class="flex items-center justify-between text-[10px] text-emerald-300/90 pt-1 border-t border-emerald-900/50">
                            <span>Tỉ lệ Giảm:</span>
                            <span class="font-mono font-bold text-emerald-200">-100.0%</span>
                        </div>
                    </div>
                </div>
            `;
        }

        // Trường hợp 4: Cả 2 kỳ đều có số liệu thực tế > 0
        const diff = valCurrent - valPast;
        const pct = (diff / valPast) * 100;

        if (diff >= 0.05) {
            // TĂNG
            return `
                <div class="mt-2 pt-2 border-t border-slate-700/70">
                    ${compareHeaderHtml}
                    <div class="p-2 rounded-lg bg-rose-950/70 border border-rose-800/80 text-rose-200 shadow-sm">
                        <div class="flex items-center justify-between font-bold text-[11px] mb-1">
                            <span class="flex items-center gap-1.5 text-rose-300">
                                <span class="text-sm leading-none">🔺</span>
                                <span>Tăng:</span>
                            </span>
                            <span class="font-mono text-xs font-black text-rose-200">+${formatNumber(diff)} Tr.đ</span>
                        </div>
                        <div class="flex items-center justify-between text-[10px] text-rose-300/90 pt-1 border-t border-rose-900/50">
                            <span>Tỉ lệ Tăng:</span>
                            <span class="font-mono font-bold text-rose-200">+${pct.toFixed(1)}%</span>
                        </div>
                    </div>
                </div>
            `;
        } else if (diff <= -0.05) {
            // GIẢM
            return `
                <div class="mt-2 pt-2 border-t border-slate-700/70">
                    ${compareHeaderHtml}
                    <div class="p-2 rounded-lg bg-emerald-950/70 border border-emerald-800/80 text-emerald-200 shadow-sm">
                        <div class="flex items-center justify-between font-bold text-[11px] mb-1">
                            <span class="flex items-center gap-1.5 text-emerald-300">
                                <span class="text-sm leading-none">🔻</span>
                                <span>Giảm:</span>
                            </span>
                            <span class="font-mono text-xs font-black text-emerald-200">-${formatNumber(Math.abs(diff))} Tr.đ</span>
                        </div>
                        <div class="flex items-center justify-between text-[10px] text-emerald-300/90 pt-1 border-t border-emerald-900/50">
                            <span>Tỉ lệ Giảm:</span>
                            <span class="font-mono font-bold text-emerald-200">-${Math.abs(pct).toFixed(1)}%</span>
                        </div>
                    </div>
                </div>
            `;
        } else {
            // TƯƠNG ĐƯƠNG (|diff| < 0.05)
            return `
                <div class="mt-2 pt-2 border-t border-slate-700/70">
                    ${compareHeaderHtml}
                    <div class="p-2 rounded-lg bg-slate-800/80 border border-slate-700/80 text-slate-300 shadow-sm">
                        <div class="flex items-center justify-between font-bold text-[11px] mb-1">
                            <span class="flex items-center gap-1.5 text-slate-300">
                                <span class="text-sm leading-none">➖</span>
                                <span>Biến động:</span>
                            </span>
                            <span class="font-mono text-xs font-semibold text-slate-300">0.0 Tr.đ</span>
                        </div>
                        <div class="flex items-center justify-between text-[10px] text-slate-400 pt-1 border-t border-slate-700/50">
                            <span>Tỉ lệ:</span>
                            <span class="font-mono font-semibold text-slate-300">0.0%</span>
                        </div>
                    </div>
                </div>
            `;
        }
    }

    function showTooltip(e, targetCell) {
        if (!tooltipEl) initTooltipDOM();

        const type = targetCell.dataset.tooltipType; // 'month' | 'luyke' | 'fullyear' | 'compare'
        const title = targetCell.dataset.tooltipTitle || 'Khoản mục chi phí';
        const subtitle = targetCell.dataset.tooltipSubtitle || '';
        const period = targetCell.dataset.tooltipPeriod || '';

        // Đọc an toàn tuyệt đối từ DOM attributes (khắc phục lỗi HTML5 dataset với chữ số sau gạch nối)
        const val2026 = parseFloat(targetCell.getAttribute('data-val-2026') || targetCell.dataset['val-2026'] || targetCell.dataset.valCur || targetCell.dataset.val2026) || 0;
        const val2025 = parseFloat(targetCell.getAttribute('data-val-2025') || targetCell.dataset['val-2025'] || targetCell.dataset.valPrev25 || targetCell.dataset.val2025) || 0;
        const val2024 = parseFloat(targetCell.getAttribute('data-val-2024') || targetCell.dataset['val-2024'] || targetCell.dataset.valPrev24 || targetCell.dataset.val2024) || 0;

        const config = getCompareConfig();
        const mode = config.mode || '2025';

        let comparisonsHTML = '';
        let headerPeriodVal = val2026;
        let typeBadge = '';

        if (type === 'compare') {
            const compareYear = targetCell.dataset.targetYear || (targetCell.getAttribute('data-target-year') || '2025');
            const pastVal = compareYear === '2024' ? val2024 : val2025;
            headerPeriodVal = pastVal;
            typeBadge = `<span class="px-2 py-0.5 rounded text-[9px] font-black bg-blue-950 text-blue-300 border border-blue-700/60 shadow-xs">Cả năm ${compareYear}</span>`;

            // So sánh với 2026
            comparisonsHTML = buildComparisonSnippet(
                compareYear,
                val2026,
                pastVal,
                `Cả năm ${compareYear}`,
                true
            );
        } else {
            if (mode === '2025' || mode === 'BOTH') {
                comparisonsHTML += buildComparisonSnippet(
                    '2025',
                    val2026,
                    val2025,
                    type === 'month' ? `cùng kỳ ${period}` : (type === 'luyke' ? `${period} cùng kỳ` : 'Cả năm'),
                    false
                );
            }

            if (mode === '2024' || mode === 'BOTH') {
                comparisonsHTML += buildComparisonSnippet(
                    '2024',
                    val2026,
                    val2024,
                    type === 'month' ? `cùng kỳ ${period}` : (type === 'luyke' ? `${period} cùng kỳ` : 'Cả năm'),
                    false
                );
            }

            if (type === 'month') {
                const isActual = parseInt(targetCell.getAttribute('data-month-num') || targetCell.dataset.monthNum || '0', 10) <= 7;
                typeBadge = isActual
                    ? '<span class="px-2 py-0.5 rounded text-[9px] font-black bg-emerald-950 text-emerald-300 border border-emerald-700/60 shadow-xs">Thực tế 2026</span>'
                    : `<span class="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[9px] font-bold bg-purple-950/90 text-purple-300 border border-purple-700/60 shadow-xs" title="Mô hình AI Gemini dự báo">
                        <svg class="w-3 h-3 text-purple-400 shrink-0" viewBox="0 0 24 24" fill="currentColor">
                            <path d="M19 9l1.25-2.75L23 5l-2.75-1.25L19 1l-1.25 2.75L15 5l2.75 1.25L19 9zm-7.5.5L9 4 6.5 9.5 1 12l5.5 2.5L9 20l2.5-5.5L17 12l-5.5-2.5zM19 15l-1.25 2.75L15 19l2.75 1.25L19 23l1.25-2.75L23 19l-2.75-1.25L19 15z"/>
                        </svg>
                        <span>AI Gemini Dự báo</span>
                       </span>`;
            } else if (type === 'luyke') {
                typeBadge = `<span class="px-2 py-0.5 rounded text-[9px] font-black bg-amber-950 text-amber-300 border border-amber-700/60 shadow-xs">${period || 'Luỹ kế'}</span>`;
            } else if (type === 'fullyear') {
                typeBadge = '<span class="px-2 py-0.5 rounded text-[9px] font-black bg-emerald-950 text-emerald-300 border border-emerald-700/60 shadow-xs">Dự kiến Cả năm</span>';
            }
        }

        tooltipEl.innerHTML = `
            <div class="flex items-start justify-between gap-2 pb-1.5 border-b border-slate-700/60">
                <div>
                    <div class="font-black text-cyan-300 text-xs leading-snug line-clamp-2">${title}</div>
                    ${subtitle ? `<div class="text-[10px] text-slate-400 font-mono mt-0.5">${subtitle}</div>` : ''}
                </div>
                <div class="shrink-0">${typeBadge}</div>
            </div>

            <div class="mt-2 flex items-center justify-between">
                <span class="text-slate-300 text-xs">Chi phí <strong>${period}</strong>:</span>
                <span class="font-mono text-sm font-black text-white">${formatNumber(headerPeriodVal)} <span class="text-[10px] font-normal text-slate-400">Tr.đ</span></span>
            </div>

            ${comparisonsHTML}

            <div class="mt-2 pt-1.5 text-[9px] text-slate-500 text-center italic border-t border-slate-800">
                (💡 Rê chuột qua các ô khác để so sánh nhanh số liệu)
            </div>
        `;

        tooltipEl.classList.remove('hidden');
        positionTooltip(e);
    }

    function positionTooltip(e) {
        if (!tooltipEl || tooltipEl.classList.contains('hidden')) return;

        const pad = 14;
        const tipWidth = tooltipEl.offsetWidth || 280;
        const tipHeight = tooltipEl.offsetHeight || 160;

        let left = e.clientX + pad;
        let top = e.clientY + pad;

        // Chống tràn mép phải
        if (left + tipWidth > window.innerWidth - 10) {
            left = e.clientX - tipWidth - pad;
        }
        if (left < 10) left = 10;

        // Chống tràn mép dưới
        if (top + tipHeight > window.innerHeight - 10) {
            top = e.clientY - tipHeight - pad;
        }
        if (top < 10) top = 10;

        tooltipEl.style.left = `${left}px`;
        tooltipEl.style.top = `${top}px`;
    }

    function hideTooltip() {
        if (tooltipEl) {
            tooltipEl.classList.add('hidden');
        }
    }

    function attachEventListeners() {
        initTooltipDOM();

        // Sử dụng Event Delegation trên toàn bộ document
        document.addEventListener('mouseover', (e) => {
            const targetCell = e.target.closest('[data-tooltip-cell="true"]');
            if (targetCell) {
                showTooltip(e, targetCell);
            }
        });

        document.addEventListener('mousemove', (e) => {
            const targetCell = e.target.closest('[data-tooltip-cell="true"]');
            if (targetCell) {
                positionTooltip(e);
            } else if (tooltipEl && !tooltipEl.classList.contains('hidden')) {
                hideTooltip();
            }
        });

        document.addEventListener('mouseout', (e) => {
            const targetCell = e.target.closest('[data-tooltip-cell="true"]');
            if (targetCell) {
                const relTarget = e.relatedTarget;
                if (!relTarget || !targetCell.contains(relTarget)) {
                    hideTooltip();
                }
            }
        });

        window.addEventListener('scroll', hideTooltip, true);
    }

    // Tự động khởi chạy khi trang đã sẵn sàng
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', attachEventListeners);
    } else {
        attachEventListeners();
    }

    // Expose API cho app.js khi cần tương tác trực tiếp
    window.CostTooltipEngine = {
        formatNumber: formatNumber,
        hide: hideTooltip,
        refresh: () => {
            if (tooltipEl) hideTooltip();
        }
    };
})();
