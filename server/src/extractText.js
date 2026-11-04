import mammoth from 'mammoth';

export const MAX_FILE_BYTES = 4 * 1024 * 1024;

// Trích văn bản từ file tải lên: .txt/.md gửi dạng text, .docx gửi base64. Trả về chuỗi đã chuẩn hoá.
export async function extractText({ filename, text, base64 }) {
  const ext = String(filename ?? '').toLowerCase().split('.').pop();
  let out;
  if (base64 != null) {
    if (ext !== 'docx') throw Object.assign(new Error('Chỉ hỗ trợ .docx cho file nhị phân'), { status: 400 });
    const buf = Buffer.from(base64, 'base64');
    if (buf.length > MAX_FILE_BYTES) throw Object.assign(new Error('File quá lớn (tối đa 4MB)'), { status: 400 });
    // .docx là file zip bắt đầu bằng "PK"; từ chối nếu không đúng định dạng.
    if (buf.length < 4 || buf[0] !== 0x50 || buf[1] !== 0x4b) throw Object.assign(new Error('File .docx không hợp lệ'), { status: 400 });
    try { out = (await mammoth.extractRawText({ buffer: buf })).value; }
    catch { throw Object.assign(new Error('Không đọc được file .docx'), { status: 400 }); }
  } else {
    out = String(text ?? '');
  }
  return out.replace(/\r\n?/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
}
