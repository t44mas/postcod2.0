import test from 'node:test';
import assert from 'node:assert/strict';
import { tariffs, estimateSavings } from '../src/features/business/tariffs.mjs';

test('Контрольный пример архитектуры: Plus, 40 отправлений и 10 упаковок', () => {
  assert.deepEqual(estimateSavings(tariffs[1], 40, 10), { gross: 3200, applied: 3200, net: 710, capped: false });
});
test('Отрицательная выгода не скрывается', () => {
  assert.equal(estimateSavings(tariffs[1], 10, 0).net, -1790);
});
test('Общий лимит ограничивает выгоду обоих тарифов', () => {
  for (const tariff of tariffs) {
    const result = estimateSavings(tariff, 1000, 1000);
    assert.equal(result.applied, tariff.cap);
    assert.equal(result.capped, true);
  }
});
test('Start не начисляет скидку на упаковку; некорректное количество не создаёт выгоду', () => {
  assert.equal(estimateSavings(tariffs[0], 0, 20).applied, 0);
  assert.equal(estimateSavings(tariffs[1], -2, NaN).applied, 0);
});
