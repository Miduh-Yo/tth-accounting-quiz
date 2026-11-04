import test from 'node:test';
import assert from 'node:assert/strict';
import { csvCell, toCsv } from '../src/csv.js';

test('thoát dấu phẩy, ngoặc kép, xuống dòng', () => {
  assert.equal(csvCell('a,b'), '"a,b"');
  assert.equal(csvCell('say "hi"'), '"say ""hi"""');
  assert.equal(csvCell(null), '');
  assert.equal(csvCell(5), '5');
});
test('chặn CSV injection', () => {
  assert.equal(csvCell('=SUM(A1)'), "'=SUM(A1)");
  assert.equal(csvCell('@cmd'), "'@cmd");
});
test('toCsv có BOM và CRLF', () => {
  assert.equal(toCsv([['a', 'b'], [1, 2]]), '\uFEFFa,b\r\n1,2\r\n');
});
