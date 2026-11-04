import ExcelJS from 'exceljs';
import { IMPORT_HEADER } from './importQuestions.js';

export const MAX_XLSX_BYTES = 3 * 1024 * 1024;
const COLS = IMPORT_HEADER.length;

function cellText(v) {
  if (v == null) return '';
  if (typeof v === 'object') {
    if (v instanceof Date) return v.toISOString().slice(0, 10);
    if (Array.isArray(v.richText)) return v.richText.map(r => r.text).join('');
    if ('result' in v) return cellText(v.result);
    if ('text' in v) return cellText(v.text);
    return '';
  }
  return String(v);
}

// Đọc sheet đầu tiên; dòng 1 là tiêu đề. `line` là số dòng thật trong Excel để báo lỗi chính xác.
export async function parseXlsx(buffer) {
  if (buffer.length > MAX_XLSX_BYTES) throw Object.assign(new Error('File Excel quá lớn (tối đa 3MB)'), { status: 400 });
  if (buffer.length < 4 || buffer[0] !== 0x50 || buffer[1] !== 0x4b) throw Object.assign(new Error('File không phải .xlsx hợp lệ'), { status: 400 });
  const wb = new ExcelJS.Workbook();
  try { await wb.xlsx.load(buffer); } catch { throw Object.assign(new Error('Không đọc được file .xlsx'), { status: 400 }); }
  const ws = wb.worksheets[0];
  if (!ws) throw Object.assign(new Error('File Excel không có sheet nào'), { status: 400 });
  const out = [];
  ws.eachRow({ includeEmpty: false }, (row, n) => {
    if (n === 1) return;
    const cells = Array.from({ length: COLS }, (_, i) => cellText(row.getCell(i + 1).value));
    if (cells.some(c => c.trim() !== '')) out.push({ line: n, row: cells });
  });
  return out;
}

// File mẫu có sẵn danh sách chọn cho cột Loại/Độ khó và vài dòng ví dụ.
export async function buildTemplate() {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('Câu hỏi');
  ws.addRow(IMPORT_HEADER).font = { bold: true };
  ws.addRow(['Thuế GTGT', 'Một đáp án', 'Dễ', 'Thuế suất GTGT phổ thông là bao nhiêu?', '5%', '8%', '10%', '15%', '', '', 'C', 'Mức phổ thông 10%', 'Điều 8', '']);
  ws.addRow(['Thuế GTGT', 'Nhiều đáp án', 'Trung bình', 'Chọn các khoản được khấu trừ', 'Khoản 1', 'Khoản 2', 'Khoản 3', '', '', '', 'A;C', '', '', '']);
  ws.addRow(['Kế toán chung', 'Đúng/Sai', 'Khó', 'Tài sản = Nợ phải trả + Vốn chủ sở hữu', '', '', '', '', '', '', 'Đúng', '', '', '']);
  const widths = [16, 14, 12, 50, 18, 18, 18, 18, 18, 18, 14, 30, 20, 24];
  widths.forEach((w, i) => { ws.getColumn(i + 1).width = w; });
  ws.views = [{ state: 'frozen', ySplit: 1 }];
  for (let r = 2; r <= 501; r++) {
    ws.getCell(`B${r}`).dataValidation = { type: 'list', allowBlank: true, formulae: ['"Một đáp án,Nhiều đáp án,Đúng/Sai"'] };
    ws.getCell(`C${r}`).dataValidation = { type: 'list', allowBlank: true, formulae: ['"Dễ,Trung bình,Khó"'] };
  }
  return Buffer.from(await wb.xlsx.writeBuffer());
}
