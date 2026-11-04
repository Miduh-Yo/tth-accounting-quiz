import test from 'node:test';
import assert from 'node:assert/strict';
import { gradeQuestion, summarize } from '../src/grading.js';

const opts = [{ id: 'a', isCorrect: true }, { id: 'b', isCorrect: false }, { id: 'c', isCorrect: true }];

test('nhiều đáp án: phải chọn đủ và không thừa', () => {
  assert.equal(gradeQuestion(opts, ['a', 'c']).isCorrect, true);
  assert.equal(gradeQuestion(opts, ['c', 'a']).isCorrect, true);
  assert.equal(gradeQuestion(opts, ['a']).isCorrect, false);
  assert.equal(gradeQuestion(opts, ['a', 'b', 'c']).isCorrect, false);
});
test('bỏ trùng, bỏ id lạ, không trả lời = sai', () => {
  assert.deepEqual(gradeQuestion(opts, ['a', 'a', 'c', 'zzz']).picked, ['a', 'c']);
  assert.equal(gradeQuestion(opts, undefined).isCorrect, false);
  assert.equal(gradeQuestion(opts, []).isCorrect, false);
});
test('tính phần trăm và đạt/chưa đạt', () => {
  assert.deepEqual(summarize(7, 10, 70), { percent: 70, passed: true });
  assert.deepEqual(summarize(2, 3, 70), { percent: 67, passed: false });
  assert.deepEqual(summarize(0, 0, 70), { percent: 0, passed: false });
});
