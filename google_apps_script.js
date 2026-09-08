/**
 * =========================================================================================
 * GOOGLE APPS SCRIPT: HỆ THỐNG QUẢN TRỊ CHI PHÍ HÀNH CHÍNH - THACO AUTO
 * File Google Sheet: Quan_Ly_Chi_Phi
 * (ID: 1UwV3TbvAfeLZslEazzcFWi5cXsJo98AQmxX5dXH1Pqo)
 * 
 * Các Sheet quản lý:
 * 1. DM_CPHC : Cấu hình danh mục phí, mã B7, mã B10, Nhóm phí, Trọng yếu (⭐)
 * 2. DM_QTPN : Danh mục ánh xạ Quản trị ↔ Pháp nhân (TT, Mã QT, Tên QT, Mã PN, Tên PN)
 * 3. CP_AUTO : Toàn bộ dữ liệu chi phí hành chính THACO AUTO (C1101 - VPĐH)
 * 4. CP_PP   : Dữ liệu chi phí hành chính Phân Phối THACO AUTO
 * 5. CP_CTTT : Dữ liệu chi phí hành chính các Công ty Tỉnh Thành / Chi nhánh
 * =========================================================================================
 * 
 * HƯỚNG DẪN TRIỂN KHAI / CẬP NHẬT (MẤT 1 PHÚT):
 * 1. Mở file Google Sheet Quan_Ly_Chi_Phi trên trình duyệt:
 *    https://docs.google.com/spreadsheets/d/1UwV3TbvAfeLZslEazzcFWi5cXsJo98AQmxX5dXH1Pqo/edit
 * 2. Vào menu "Tiện ích mở rộng" (Extensions) > chọn "Apps Script".
 * 3. Dán toàn bộ mã nguồn này đè vào file Code.gs và bấm Ctrl + S (Lưu).
 * 4. Bấm "Triển khai" (Deploy) > "Quản lý bản triển khai" (Manage deployments) hoặc "Triển khai mới" (New deployment).
 * 5. Chọn loại "Ứng dụng web" (Web app):
 *    - Thực thi dưới dạng (Execute as): "Tôi" (Me)
 *    - Ai có quyền truy cập (Who has access): "Bất kỳ ai" (Anyone)
 * 6. Bấm "Triển khai" (Deploy) > Sao chép "URL ứng dụng web" dán vào Web App.
 * =========================================================================================
 */

var SHEET_DM_CPHC = 'DM_CPHC';
var SHEET_DM_QTPN = 'DM_QTPN';
var COST_SHEETS = ['CP_AUTO', 'CP_PP', 'CP_CTTT', 'CP_VPDH', 'CP_NHAMAY', 'CP_CTTT_MB', 'CP_CTTT_MN'];

var COST_COLUMNS = [
  'STT',
  'Mã ĐVCS',
  'Tên Pháp Nhân / Đơn Vị',
  'Mã B7',
  'Tên Khoản Mục (B7)',
  'Nhóm Chi Phí',
  'Mã B10',
  'Trọng Yếu (⭐)',
  'Mã Bộ Phận',
  'Tên Bộ Phận',
  'Khối Phòng Ban',
  'Năm',
  'Kỳ Thực Hiện',
  'T01', 'T02', 'T03', 'T04', 'T05', 'T06',
  'T07', 'T08', 'T09', 'T10', 'T11', 'T12',
  'Tổng Cộng'
];

/**
 * Tạo menu THACO AUTO trong Google Sheet
 */
function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu('🚗 THACO AUTO')
    .addItem('🔄 Kiểm tra cấu trúc DM_CPHC', 'checkDmStructure')
    .addItem('✨ Chuẩn hóa định dạng DM_CPHC', 'formatDmSheet')
    .addSeparator()
    .addItem('🔄 Kiểm tra cấu trúc DM_QTPN', 'checkDmQtpnStructure')
    .addItem('✨ Chuẩn hóa định dạng DM_QTPN', 'formatDmQtpnSheet')
    .addSeparator()
    .addItem('📊 Khởi tạo cấu trúc các Sheet Chi phí (CP_AUTO, CP_PP, CP_CTTT)', 'initCostSheets')
    .addItem('✨ Chuẩn hóa định dạng các Sheet Chi phí', 'formatAllCostSheets')
    .addToUi();
}

/**
 * =========================================================================================
 * API GET: Đọc dữ liệu từ Google Sheet về Web App
 * Hỗ trợ các chế độ:
 * 1. Mặc định hoặc ?action=get_all : Đọc TOÀN BỘ (DM_CPHC, DM_QTPN và CP_AUTO, CP_PP, CP_CTTT)
 * 2. ?action=get_dm               : Chỉ đọc danh mục DM_CPHC
 * 3. ?action=get_qtpn             : Chỉ đọc danh mục DM_QTPN
 * 4. ?action=get_cphc_data&sheet=CP_AUTO : Chỉ đọc dữ liệu của 1 sheet chi phí cụ thể
 * =========================================================================================
 */
function doGet(e) {
  try {
    var params = e ? e.parameter || {} : {};
    var action = params.action || 'get_all';
    var sheetName = params.sheet || '';

    // Trường hợp 1: Đọc riêng 1 sheet chi phí
    if (action === 'get_cphc_data' && sheetName) {
      return handleGetCostData(sheetName);
    }

    // Trường hợp 2: Đọc riêng Danh mục DM_CPHC
    if (action === 'get_dm') {
      return handleGetDmCphc();
    }

    // Trường hợp 3: Đọc riêng Danh mục DM_QTPN
    if (action === 'get_qtpn') {
      return handleGetDmQtpn();
    }

    // Trường hợp 4: Mặc định (action === 'get_all' hoặc không truyền tham số):
    return handleGetAllData();

  } catch (err) {
    return jsonResponse({
      status: 'error',
      message: 'Lỗi doGet: ' + err.toString()
    });
  }
}

/**
 * =========================================================================================
 * API POST: Nhận dữ liệu từ Web App ghi vào Google Sheet
 * Hỗ trợ các chế độ:
 * 1. Ghi chi phí đã làm sạch: payload.action === 'save_cphc_data'
 * 2. Ghi danh mục Quản trị ↔ Pháp nhân: payload.action === 'save_qtpn' hoặc payload.qtpnMappings
 * 3. Ghi danh mục DM_CPHC: payload.action === 'save_dm' hoặc payload.categories
 * =========================================================================================
 */
function doPost(e) {
  try {
    var raw = e.postData && e.postData.contents ? e.postData.contents : '';
    if (!raw) {
      return jsonResponse({ status: 'error', message: 'Dữ liệu POST rỗng.' });
    }

    var payload = JSON.parse(raw);

    // Trường hợp 1: Ghi dữ liệu chi phí đã làm sạch từ Bravo (CP_AUTO / CP_PP / CP_CTTT)
    if (payload.action === 'save_cphc_data') {
      return handleSaveCostData(payload);
    }

    // Trường hợp 2: Ghi danh mục Quản trị ↔ Pháp nhân DM_QTPN
    if (payload.action === 'save_qtpn' || payload.qtpnMappings) {
      return handleSaveDmQtpn(payload);
    }

    // Trường hợp 3: Ghi danh mục DM_CPHC
    return handleSaveDmCphc(payload);

  } catch (err) {
    return jsonResponse({
      status: 'error',
      message: 'Lỗi doPost: ' + err.toString()
    });
  }
}

/**
 * =========================================================================================
 * XỬ LÝ LẤY TOÀN BỘ DỮ LIỆU (GET_ALL)
 * =========================================================================================
 */
function handleGetAllData() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();

  // 1. Đọc Danh mục DM_CPHC
  var categories = readDmCategories(ss);

  // 2. Đọc Danh mục DM_QTPN
  var qtpnMappings = readDmQtpn(ss);

  // 3. Đọc các sheet chi phí
  var costSheets = {};
  var allCostRows = [];

  COST_SHEETS.forEach(function(sName) {
    var sRows = readSheetCostRows(ss, sName);
    costSheets[sName] = sRows;
    allCostRows = allCostRows.concat(sRows);
  });

  return jsonResponse({
    status: 'success',
    updatedAt: new Date().toISOString(),
    categories: categories,
    qtpnMappings: qtpnMappings,
    costSheets: costSheets,
    allCostRows: allCostRows,
    totalCostRows: allCostRows.length
  });
}

/**
 * Đọc toàn bộ danh mục từ sheet DM_CPHC
 */
function readDmCategories(ss) {
  var sheet = ss.getSheetByName(SHEET_DM_CPHC);
  if (!sheet || sheet.getLastRow() <= 1) return [];

  var data = sheet.getDataRange().getValues();
  if (data.length <= 1) return [];

  var headers = data[0];
  var colMap = { tt: -1, group: -1, b7: -1, b10: -1, name: -1, isMaterial: -1 };

  for (var c = 0; c < headers.length; c++) {
    var h = String(headers[c] || '').toLowerCase().trim();
    if (h.indexOf('tt') !== -1 || h.indexOf('stt') !== -1) colMap.tt = c;
    else if (h.indexOf('nhóm') !== -1 || h.indexOf('group') !== -1) colMap.group = c;
    else if (h.indexOf('b7') !== -1) colMap.b7 = c;
    else if (h.indexOf('b10') !== -1) colMap.b10 = c;
    else if (h.indexOf('tên') !== -1 || h.indexOf('khoản mục') !== -1 || h.indexOf('diễn giải') !== -1) colMap.name = c;
    else if (h.indexOf('trọng yếu') !== -1 || h.indexOf('material') !== -1 || h.indexOf('⭐') !== -1) colMap.isMaterial = c;
  }

  if (colMap.tt === -1) colMap.tt = 0;
  if (colMap.group === -1) colMap.group = 1;
  if (colMap.b7 === -1) colMap.b7 = 2;
  if (colMap.b10 === -1) colMap.b10 = 3;
  if (colMap.name === -1) colMap.name = 4;
  if (colMap.isMaterial === -1) colMap.isMaterial = 5;

  var categories = [];
  var currentGroup = 'Chi phí hoạt động chung';

  for (var r = 1; r < data.length; r++) {
    var row = data[r];
    if (!row || row.every(function(cell) { return cell === '' || cell === null; })) continue;

    var nameVal = String(row[colMap.name] || '').trim();
    var b7Val = String(row[colMap.b7] || '').trim();
    var b10Val = String(row[colMap.b10] || '').trim();
    var grpVal = String(row[colMap.group] || '').trim();
    var ttVal = parseInt(row[colMap.tt], 10) || (categories.length + 1);

    var isMat = false;
    if (colMap.isMaterial !== -1 && row[colMap.isMaterial]) {
      var mStr = String(row[colMap.isMaterial]).toLowerCase().trim();
      isMat = (mStr === 'true' || mStr === '1' || mStr === 'x' || mStr === '⭐' || mStr === 'có');
    }

    if (grpVal) currentGroup = grpVal;
    if (!b7Val && !b10Val && !nameVal) continue;

    var b7Codes = b7Val ? b7Val.split(/[,;\s]+/).map(function(s){ return s.trim(); }).filter(Boolean) : [];
    var b10Codes = b10Val ? b10Val.split(/[,;\s]+/).map(function(s){ return s.trim(); }).filter(Boolean) : [];

    categories.push({
      id: r,
      tt: ttVal,
      group: currentGroup,
      b7_display: b7Val,
      b10_display: b10Val,
      b7_codes: b7Codes,
      b10_codes: b10Codes,
      name: nameVal || b7Val || ('Khoản mục ' + r),
      is_material: isMat
    });
  }

  return categories;
}

/**
 * Đọc toàn bộ dòng chi phí từ một sheet chi phí cụ thể
 */
function readSheetCostRows(ss, sheetName) {
  var sheet = ss.getSheetByName(sheetName);
  if (!sheet || sheet.getLastRow() <= 1) return [];

  var data = sheet.getDataRange().getValues();
  if (data.length <= 1) return [];

  var headers = data[0];
  var rows = [];

  for (var r = 1; r < data.length; r++) {
    var raw = data[r];
    if (!raw || raw.every(function(c) { return c === '' || c === null; })) continue;

    var item = {};
    for (var c = 0; c < headers.length; c++) {
      item[headers[c]] = raw[c];
    }
    rows.push(item);
  }

  return rows;
}

/**
 * =========================================================================================
 * XỬ LÝ DANH MỤC PHÍ (DM_CPHC)
 * =========================================================================================
 */
function handleGetDmCphc() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var categories = readDmCategories(ss);

  return jsonResponse({
    status: 'success',
    sheet: SHEET_DM_CPHC,
    count: categories.length,
    updatedAt: new Date().toISOString(),
    categories: categories
  });
}

function handleSaveDmCphc(payload) {
  var categories = payload.categories;
  if (!categories || !Array.isArray(categories)) {
    return jsonResponse({ status: 'error', message: 'Mảng categories không đúng định dạng.' });
  }

  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(SHEET_DM_CPHC);
  if (!sheet) {
    sheet = ss.insertSheet(SHEET_DM_CPHC);
  }

  sheet.clear();

  var headerRow = [
    'TT',
    'Nhóm Chi Phí',
    'Mã Bravo 7',
    'Mã Bravo 10',
    'Tên Khoản Mục / Diễn Giải',
    'Trọng yếu (⭐)'
  ];

  var rows = [headerRow];
  categories.forEach(function(cat, index) {
    var b7Text = cat.b7_display || (cat.b7_codes ? cat.b7_codes.join(', ') : '');
    var b10Text = cat.b10_display || (cat.b10_codes ? cat.b10_codes.join(', ') : '');
    var tt = cat.tt || (index + 1);
    var grp = cat.group || 'Chi phí hoạt động chung';
    var name = cat.name || '';
    var mat = cat.is_material ? '⭐' : '';
    rows.push([tt, grp, b7Text, b10Text, name, mat]);
  });

  sheet.getRange(1, 1, rows.length, 6).setValues(rows);

  var headerRange = sheet.getRange(1, 1, 1, 6);
  headerRange.setBackground('#00529C')
             .setFontColor('#FFFFFF')
             .setFontWeight('bold')
             .setHorizontalAlignment('center')
             .setVerticalAlignment('middle');
  sheet.setRowHeight(1, 35);

  if (rows.length > 1) {
    sheet.getRange(2, 1, rows.length - 1, 1).setHorizontalAlignment('center');
    sheet.getRange(2, 3, rows.length - 1, 2).setHorizontalAlignment('center');
    sheet.getRange(2, 6, rows.length - 1, 1).setHorizontalAlignment('center');
  }

  sheet.setFrozenRows(1);
  sheet.autoResizeColumns(1, 6);

  return jsonResponse({
    status: 'success',
    message: 'Đã đồng bộ thành công ' + categories.length + ' khoản mục lên Google Sheet DM_CPHC!',
    count: categories.length,
    updatedAt: new Date().toISOString()
  });
}

/**
 * =========================================================================================
 * XỬ LÝ QUẢN TRỊ ↔ PHÁP NHÂN (DM_QTPN)
 * =========================================================================================
 */
function handleGetDmQtpn() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var mappings = readDmQtpn(ss);

  return jsonResponse({
    status: 'success',
    sheet: SHEET_DM_QTPN,
    count: mappings.length,
    updatedAt: new Date().toISOString(),
    qtpnMappings: mappings
  });
}

function readDmQtpn(ss) {
  var sheet = ss.getSheetByName(SHEET_DM_QTPN);
  if (!sheet || sheet.getLastRow() <= 1) return [];

  var data = sheet.getDataRange().getValues();
  if (data.length <= 1) return [];

  var headers = data[0].map(function(h) { return String(h || '').trim().toLowerCase(); });
  var colMap = { tt: 0, khoi: -1, maQt: -1, tenQt: -1, maPn: -1, tenPn: -1 };

  for (var c = 0; c < headers.length; c++) {
    var h = headers[c];
    if (h.indexOf('khối') !== -1 || h.indexOf('khoi') !== -1 || h.indexOf('đơn vị') !== -1 && h.indexOf('quản trị') === -1) colMap.khoi = c;
    else if (h.indexOf('mã quản trị') !== -1 || h.indexOf('ma quan tri') !== -1 || h.indexOf('mã qt') !== -1) colMap.maQt = c;
    else if (h.indexOf('tên quản trị') !== -1 || h.indexOf('ten quan tri') !== -1 || h.indexOf('đơn vị quản trị') !== -1 || h.indexOf('tên qt') !== -1) colMap.tenQt = c;
    else if (h.indexOf('mã pháp nhân') !== -1 || h.indexOf('ma phap nhan') !== -1 || h.indexOf('mã đvcs') !== -1 || h.indexOf('mã pn') !== -1) colMap.maPn = c;
    else if (h.indexOf('tên pháp nhân') !== -1 || h.indexOf('ten phap nhan') !== -1 || h.indexOf('tên đvcs') !== -1 || h.indexOf('tên pn') !== -1 || h.indexOf('showroom') !== -1) colMap.tenPn = c;
  }

  // Fallback nếu không khớp từ khóa
  var is6Cols = data[0].length >= 6;
  if (colMap.khoi === -1) colMap.khoi = is6Cols ? 1 : -1;
  if (colMap.maQt === -1) colMap.maQt = is6Cols ? 2 : 1;
  if (colMap.tenQt === -1) colMap.tenQt = is6Cols ? 3 : 2;
  if (colMap.maPn === -1) colMap.maPn = is6Cols ? 4 : 3;
  if (colMap.tenPn === -1) colMap.tenPn = is6Cols ? 5 : 4;

  var mappings = [];
  for (var r = 1; r < data.length; r++) {
    var row = data[r];
    if (!row || row.every(function(cell) { return cell === '' || cell === null; })) continue;

    var khoi = colMap.khoi !== -1 ? String(row[colMap.khoi] || '').trim() : 'VPĐH';
    var maQt = String(row[colMap.maQt] || '').trim();
    var tenQt = String(row[colMap.tenQt] || '').trim();
    var maPn = String(row[colMap.maPn] || '').trim();
    var tenPn = String(row[colMap.tenPn] || '').trim();

    if (!maQt && !tenQt && !maPn && !tenPn) continue;

    mappings.push({
      stt: parseInt(row[colMap.tt], 10) || (mappings.length + 1),
      khoi: khoi || 'VPĐH',
      maQt: maQt,
      tenQt: tenQt,
      maPn: maPn,
      tenPn: tenPn
    });
  }

  return mappings;
}

function handleSaveDmQtpn(payload) {
  var mappings = payload.qtpnMappings || payload.mappings;
  if (!mappings || !Array.isArray(mappings)) {
    return jsonResponse({ status: 'error', message: 'Mảng qtpnMappings không đúng định dạng.' });
  }

  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(SHEET_DM_QTPN);
  if (!sheet) {
    sheet = ss.insertSheet(SHEET_DM_QTPN);
  }

  sheet.clear();

  var headerRow = [
    'TT',
    'Khối Đơn Vị',
    'Mã Quản trị',
    'Tên Quản trị',
    'Mã pháp nhân',
    'Tên pháp nhân'
  ];

  var rows = [headerRow];
  mappings.forEach(function(item, index) {
    var tt = item.stt || (index + 1);
    var khoi = item.khoi || 'VPĐH';
    var maQt = item.maQt || item.maQuanti || '';
    var tenQt = item.tenQt || item.tenQuanti || '';
    var maPn = item.maPn || item.maPhapNhan || '';
    var tenPn = item.tenPn || item.tenPhapNhan || '';
    rows.push([tt, khoi, maQt, tenQt, maPn, tenPn]);
  });

  sheet.getRange(1, 1, rows.length, 6).setValues(rows);

  var headerRange = sheet.getRange(1, 1, 1, 6);
  headerRange.setBackground('#00529C')
             .setFontColor('#FFFFFF')
             .setFontWeight('bold')
             .setHorizontalAlignment('center')
             .setVerticalAlignment('middle');
  sheet.setRowHeight(1, 35);

  if (rows.length > 1) {
    sheet.getRange(2, 1, rows.length - 1, 1).setHorizontalAlignment('center');
    sheet.getRange(2, 2, rows.length - 1, 1).setHorizontalAlignment('center');
    sheet.getRange(2, 3, rows.length - 1, 1).setHorizontalAlignment('center');
    sheet.getRange(2, 5, rows.length - 1, 1).setHorizontalAlignment('center');
  }

  sheet.setFrozenRows(1);
  sheet.autoResizeColumns(1, 6);

  return jsonResponse({
    status: 'success',
    message: 'Đã đồng bộ thành công ' + mappings.length + ' dòng ánh xạ lên Google Sheet DM_QTPN!',
    count: mappings.length,
    updatedAt: new Date().toISOString()
  });
}

/**
 * =========================================================================================
 * XỬ LÝ CHI PHÍ ĐÃ LÀM SẠCH (CP_AUTO / CP_PP / CP_CTTT)
 * =========================================================================================
 */
function handleGetCostData(sheetName) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(sheetName);
  if (!sheet) {
    return jsonResponse({
      status: 'error',
      message: 'Sheet "' + sheetName + '" chưa tồn tại trên file này.'
    });
  }

  var rows = readSheetCostRows(ss, sheetName);

  return jsonResponse({
    status: 'success',
    sheet: sheetName,
    count: rows.length,
    rows: rows
  });
}

function handleSaveCostData(payload) {
  var targetSheet = payload.targetSheet || 'CP_AUTO';
  if (COST_SHEETS.indexOf(targetSheet) === -1) {
    targetSheet = 'CP_AUTO';
  }

  var newRows = payload.rows;
  if (!newRows || !Array.isArray(newRows)) {
    return jsonResponse({ status: 'error', message: 'Mảng rows không đúng định dạng.' });
  }

  var entityCode = payload.entityCode ? String(payload.entityCode).trim() : '';
  var year = payload.year ? parseInt(payload.year, 10) : null;
  var mode = payload.mode || 'replace_year_entity'; // 'replace_year_entity' | 'overwrite' | 'append'

  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(targetSheet);
  if (!sheet) {
    sheet = ss.insertSheet(targetSheet);
  }

  var existingValues = [];
  if (sheet.getLastRow() > 1 && mode === 'replace_year_entity') {
    existingValues = sheet.getRange(2, 1, sheet.getLastRow() - 1, COST_COLUMNS.length).getValues();
  }

  var preservedRows = [];
  if (mode === 'replace_year_entity' && existingValues.length > 0) {
    preservedRows = existingValues.filter(function(row) {
      var rowEntity = String(row[1] || '').trim(); // Cột 2: Mã ĐVCS
      var rowYear = parseInt(row[11], 10);        // Cột 12: Năm
      if (entityCode && year) {
        return !(rowEntity === entityCode && rowYear === year);
      } else if (year) {
        return rowYear !== year;
      } else if (entityCode) {
        return rowEntity !== entityCode;
      }
      return false;
    });
  }

  // Chuẩn hóa dữ liệu mới thành mảng 2 chiều theo đúng 26 cột COST_COLUMNS
  var formattedNewRows = newRows.map(function(item) {
    if (Array.isArray(item)) return item;

    var months = item.months || [0,0,0,0,0,0,0,0,0,0,0,0];
    var totalVal = typeof item.total === 'number' ? item.total : months.reduce(function(a,b){ return a + (b||0); }, 0);

    return [
      item.stt || '',
      item.entityCode || entityCode || 'C1101',
      item.entityName || 'THACO AUTO',
      item.km || item.b7 || '',
      item.tenKm || item.name || '',
      item.nhom || 'Chi phí hoạt động chung',
      item.b10 || '',
      item.isMaterial ? '⭐' : '',
      item.bp || '',
      item.tenBp || '',
      item.khoiPb || '',
      item.year || year || 2026,
      item.ky || (item.year === 2025 ? 'Cả năm' : 'T1 - T7'),
      months[0] || 0,
      months[1] || 0,
      months[2] || 0,
      months[3] || 0,
      months[4] || 0,
      months[5] || 0,
      months[6] || 0,
      months[7] || 0,
      months[8] || 0,
      months[9] || 0,
      months[10] || 0,
      months[11] || 0,
      totalVal
    ];
  });

  var finalDataRows = preservedRows.concat(formattedNewRows);

  // Đánh lại số thứ tự STT
  finalDataRows.forEach(function(r, idx) {
    r[0] = idx + 1;
  });

  // Ghi toàn bộ dữ liệu (Header + Rows)
  sheet.clear();
  var writeArray = [COST_COLUMNS].concat(finalDataRows);

  var numRows = writeArray.length;
  var numCols = COST_COLUMNS.length;

  sheet.getRange(1, 1, numRows, numCols).setValues(writeArray);

  // Định dạng tiêu đề THACO Royal Blue #00529C
  var headerRange = sheet.getRange(1, 1, 1, numCols);
  headerRange.setBackground('#00529C')
             .setFontColor('#FFFFFF')
             .setFontWeight('bold')
             .setHorizontalAlignment('center')
             .setVerticalAlignment('middle');
  sheet.setRowHeight(1, 35);

  if (numRows > 1) {
    // Căn giữa các cột mã số, năm, kỳ
    sheet.getRange(2, 1, numRows - 1, 1).setHorizontalAlignment('center'); // STT
    sheet.getRange(2, 2, numRows - 1, 1).setHorizontalAlignment('center'); // Mã ĐVCS
    sheet.getRange(2, 4, numRows - 1, 1).setHorizontalAlignment('center'); // Mã B7
    sheet.getRange(2, 7, numRows - 1, 2).setHorizontalAlignment('center'); // Mã B10, Trọng yếu
    sheet.getRange(2, 9, numRows - 1, 1).setHorizontalAlignment('center'); // Mã BP
    sheet.getRange(2, 11, numRows - 1, 3).setHorizontalAlignment('center'); // Khối PB, Năm, Kỳ

    // Định dạng số tiền (cột T01 đến Tổng Cộng) dạng phân cách hàng ngàn #,##0
    var moneyRange = sheet.getRange(2, 14, numRows - 1, 13);
    moneyRange.setNumberFormat('#,##0').setHorizontalAlignment('right');
  }

  sheet.setFrozenRows(1);
  sheet.setFrozenColumns(5); // Cố định 5 cột đầu (STT, Mã ĐVCS, Đơn vị, Mã B7, Tên Khoản Mục)
  sheet.autoResizeColumns(1, numCols);

  var totalMoney = formattedNewRows.reduce(function(acc, r) { return acc + (Number(r[25]) || 0); }, 0);

  return jsonResponse({
    status: 'success',
    sheet: targetSheet,
    mode: mode,
    newRowsCount: formattedNewRows.length,
    totalRowsInSheet: finalDataRows.length,
    totalMoneyVND: totalMoney,
    message: 'Đã lưu thành công ' + formattedNewRows.length + ' dòng dữ liệu vào sheet ' + targetSheet + ' (Tổng tiền: ' + totalMoney.toLocaleString('vi-VN') + ' đ)!'
  });
}

/**
 * =========================================================================================
 * CÁC HÀM TIỆN ÍCH MENU CHO NGƯỜI DÙNG TRÊN GOOGLE SHEET
 * =========================================================================================
 */
function checkDmStructure() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(SHEET_DM_CPHC);
  if (!sheet) {
    SpreadsheetApp.getUi().alert('Chưa có sheet "' + SHEET_DM_CPHC + '". Hãy bấm đồng bộ từ Web App để tự động tạo.');
    return;
  }
  var count = Math.max(0, sheet.getLastRow() - 1);
  SpreadsheetApp.getUi().alert('Sheet DM_CPHC đang có ' + count + ' khoản mục chi phí.');
}

function formatDmSheet() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(SHEET_DM_CPHC);
  if (!sheet || sheet.getLastRow() < 1) return;
  sheet.autoResizeColumns(1, 6);
  SpreadsheetApp.getActiveSpreadsheet().toast('Đã định dạng lại sheet DM_CPHC!', 'THACO AUTO', 3);
}

function checkDmQtpnStructure() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(SHEET_DM_QTPN);
  if (!sheet) {
    SpreadsheetApp.getUi().alert('Chưa có sheet "' + SHEET_DM_QTPN + '". Hãy bấm đồng bộ từ Web App để tự động tạo.');
    return;
  }
  var count = Math.max(0, sheet.getLastRow() - 1);
  SpreadsheetApp.getUi().alert('Sheet DM_QTPN đang có ' + count + ' dòng ánh xạ.');
}

function formatDmQtpnSheet() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(SHEET_DM_QTPN);
  if (!sheet || sheet.getLastRow() < 1) return;
  sheet.autoResizeColumns(1, 5);
  SpreadsheetApp.getActiveSpreadsheet().toast('Đã định dạng lại sheet DM_QTPN!', 'THACO AUTO', 3);
}

function initCostSheets() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  COST_SHEETS.forEach(function(sName) {
    var sh = ss.getSheetByName(sName);
    if (!sh) {
      sh = ss.insertSheet(sName);
      sh.getRange(1, 1, 1, COST_COLUMNS.length).setValues([COST_COLUMNS]);
      sh.getRange(1, 1, 1, COST_COLUMNS.length)
        .setBackground('#00529C')
        .setFontColor('#FFFFFF')
        .setFontWeight('bold')
        .setHorizontalAlignment('center');
      sh.setRowHeight(1, 35);
      sh.setFrozenRows(1);
      sh.setFrozenColumns(5);
      sh.autoResizeColumns(1, COST_COLUMNS.length);
    }
  });
  SpreadsheetApp.getUi().alert('Đã khởi tạo xong các sheet: ' + COST_SHEETS.join(', '));
}

function formatAllCostSheets() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  COST_SHEETS.forEach(function(sName) {
    var sh = ss.getSheetByName(sName);
    if (sh && sh.getLastRow() > 0) {
      sh.autoResizeColumns(1, COST_COLUMNS.length);
      sh.setFrozenRows(1);
      sh.setFrozenColumns(5);
    }
  });
  SpreadsheetApp.getActiveSpreadsheet().toast('Đã chuẩn hóa định dạng các sheet chi phí!', 'THACO AUTO', 3);
}

function jsonResponse(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}
