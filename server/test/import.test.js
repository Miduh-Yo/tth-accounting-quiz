import test from 'node:test';
import assert from 'node:assert/strict';
import { parseCsv } from '../src/csvParse.js';
import { rowToQuestion, parseImport, findDocument } from '../src/importQuestions.js';
import { toCsv } from '../src/csv.js';

test('parseCsv: ngoặc kép, xuống dòng trong ô, BOM, CRLF', () => {
  const t = '\uFEFFa,"b,1","c ""q"""\r\n"x\ny",2,3\r\n';
  assert.deepEqual(parseCsv(t), [['a', 'b,1', 'c "q"'], ['x\ny', '2', '3']]);
});
test('parseCsv: tự nhận dấu chấm phẩy, bỏ dòng trống', () => {
  assert.deepEqual(parseCsv('a;b\n\n1;2\n'), [['a', 'b'], ['1', '2']]);
});
test('toCsv rồi parseCsv khứ hồi', () => {
  const rows = [['Chủ đề', 'a,b'], ['x"y', 'dòng1\ndòng2']];
  assert.deepEqual(parseCsv(toCsv(rows)), rows);
});
test('rowToQuestion: một đáp án', () => {
  const { data } = rowToQuestion(['Thuế', 'Một đáp án', 'Dễ', 'Q?', 'a', 'b', 'c', '', '', '', 'B', 'gt', 'ref']);
  assert.equal(data.type, 'SINGLE'); assert.equal(data.difficulty, 'EASY');
  assert.deepEqual(data.options.map(o => o.isCorrect), [false, true, false]);
});
test('rowToQuestion: nhiều đáp án, đúng/sai, lỗi', () => {
  assert.deepEqual(rowToQuestion(['T', 'Nhiều đáp án', '', 'Q', '1', '2', '3', '', '', '', 'A;C', '', '']).data.options.map(o => o.isCorrect), [true, false, true]);
  const tf = rowToQuestion(['T', 'Đúng/Sai', 'Khó', 'Q', '', '', '', '', '', '', 'Sai', '', '']).data;
  assert.deepEqual(tf.options, [{ text: 'Đúng', isCorrect: false }, { text: 'Sai', isCorrect: true }]);
  assert.match(rowToQuestion(['T', 'abc', '', 'Q', '1', '2', '', '', '', '', 'A', '', '']).error, /Loại/);
  assert.match(rowToQuestion(['T', 'Một đáp án', '', 'Q', '1', '2', '', '', '', '', 'D', '', '']).error, /không tồn tại/);
  assert.match(rowToQuestion(['T', 'Một đáp án', '', 'Q', '1', '', '3', '', '', '', 'A', '', '']).error, /liên tiếp/);
  assert.match(rowToQuestion(['T', 'Một đáp án', '', 'Q', '1', '2', '', '', '', '', '', '', '']).error, /Thiếu/);
});
test('parseImport bỏ dòng tiêu đề, đánh số dòng', () => {
  assert.deepEqual(parseImport('h1,h2\nx,y\n').map(r => r.line), [2]);
});

test('findDocument: khớp số hiệu hoặc tên, không phân biệt hoa thường', () => {
  const docs = [{ id: '1', code: '78/2014/TT-BTC', title: 'Thông tư 78' }, { id: '2', code: null, title: 'Quy chế nội bộ' }];
  assert.equal(findDocument(docs, ' 78/2014/tt-btc ').id, '1');
  assert.equal(findDocument(docs, 'quy chế NỘI BỘ').id, '2');
  assert.equal(findDocument(docs, 'không có'), null);
  assert.equal(findDocument(docs, ''), null);
});
test('rowToQuestion trả về documentRef từ cột 14', () => {
  const r = rowToQuestion(['T', 'Một đáp án', '', 'Q', 'a', 'b', '', '', '', '', 'A', '', '', 'Thông tư 78']);
  assert.equal(r.documentRef, 'Thông tư 78');
});
