
import test from 'node:test';
import assert from 'node:assert/strict';

import {
  fieldForHeader,
  parseDate,
  parseMatrix,
  findTrackings,
  normalizeTracking,
  makeRecord,
  trackingWarnings,
  analyzeQuestion
} from './core.js';

const sample = [
  ['วัน เดือน ปี', 'ชื่อบริษัท/ลูกค้า', 'เลขEMS'],
  ['1/2/2569', 'logisticdigital', 'EE 555 555 5'],
  ['2/2/2569', 'oilion', 'EE 666 666 6']
];

test('recognizes the actual Thai column labels supplied by the user', () => {
  assert.equal(fieldForHeader('วัน เดือน ปี'), 'date');
  assert.equal(fieldForHeader('ชื่อบริษัท/ลูกค้า'), 'company');
  assert.equal(fieldForHeader('เลขEMS'), 'tracking');
});

test('imports every example row and converts Buddhist Era dates', () => {
  const result = parseMatrix(sample, {
    sourceFile: 'sample.xlsx',
    sourceLocation: 'Sheet1'
  });

  assert.equal(result.rows.length, 2);
  assert.equal(result.unclassified.length, 0);

  assert.equal(result.rows[0].date, '2026-02-01');
  assert.equal(result.rows[0].company, 'logisticdigital');
  assert.equal(normalizeTracking(result.rows[0].tracking), 'EE5555555');

  assert.equal(result.rows[1].date, '2026-02-02');
  assert.equal(result.rows[1].company, 'oilion');
  assert.equal(normalizeTracking(result.rows[1].tracking), 'EE6666666');
});

test('preserves atypical tracking values and adds a warning instead of dropping them', () => {
  const result = parseMatrix(sample);

  assert.equal(result.rows[0].tracking, 'EE 555 555 5');

  assert.ok(
    result.rows[0].warnings.some((warning) =>
      warning.includes('ไม่ตรงรูปแบบ')
    )
  );
});

test('finds EMS-like tracking numbers even when column headers are absent', () => {
  const result = parseMatrix([
    ['1/2/2569', 'logisticdigital', 'EE 555 555 5'],
    ['2/2/2569', 'oilion', 'EE 666 666 6']
  ]);

  assert.equal(result.rows.length, 2);
  assert.ok(result.rows.every((row) => row.tracking));
  assert.ok(result.rows.every((row) => row.date));
});

test('preserves original row text even when column meanings are inferred', () => {
  const result = parseMatrix([
    ['รหัสภายใน', 'ข้อมูลอื่น'],
    ['A-001', 'รายการที่ต้องเก็บไว้'],
    ['', '']
  ]);

  const preserved = [
    ...result.rows.map((row) => row.rawText),
    ...result.unclassified.map((row) => row.rawText)
  ].join('\n');

  assert.ok(preserved.includes('รหัสภายใน'));
  assert.ok(preserved.includes('A-001'));
  assert.ok(preserved.includes('รายการที่ต้องเก็บไว้'));

  assert.equal(result.totalNonEmptyRows, 1);
});

test('normalizes Thai Buddhist Era, ISO and Excel serial dates', () => {
  assert.equal(parseDate('1/2/2569'), '2026-02-01');
  assert.equal(parseDate('2026-02-01'), '2026-02-01');
  assert.equal(parseDate(46054), '2026-02-01');
  assert.equal(parseDate('31/02/2569'), '');
});

test('tracking extraction supports the sample number while preserving normalized lookup', () => {
  assert.deepEqual(
    findTrackings('พัสดุ EE 555 555 5 ถึงผู้รับ'),
    ['EE5555555']
  );

  assert.equal(
    normalizeTracking('ee-555 555-5'),
    'EE5555555'
  );
});

test('invalid imported costs are preserved with warnings while manual validation can be strict', () => {
  const imported = makeRecord({
    company: 'test',
    cost: '-5'
  });

  assert.equal(imported.cost, '-5');

  assert.ok(
    imported.warnings.some((warning) =>
      warning.includes('ค่าส่งไม่ใช่ตัวเลข')
    )
  );

  assert.throws(
    () => makeRecord(
      { company: 'test', cost: '-5' },
      new Date(),
      { strictCost: true }
    ),
    /ตั้งแต่ 0/
  );

  assert.equal(
    makeRecord({ company: 'test', cost: '12.50' }).cost,
    12.5
  );
});

test('assistant can look up a tracking identifier in local records', () => {
  const records = [{
    tracking: 'EE 555 555 5',
    company: 'logisticdigital',
    date: '2026-02-01'
  }];

  const result = analyzeQuestion(
    'ค้นหาเลข EMS EE 555 555 5',
    records
  );

  assert.equal(result.records.length, 1);
  assert.equal(result.type, 'lookup');
});

test('flags rows that contain more than one tracking candidate for manual review', () => {
  const result = parseMatrix([
    ['บริษัท', 'เลข EMS'],
    ['logisticdigital', 'EE 111 111 111 EE 222 222 222']
  ]);

  assert.equal(result.rows.length, 1);

  assert.ok(
    result.rows[0].warnings.some((warning) =>
      warning.includes('หลายเลข')
    )
  );

  assert.ok(
    result.rows[0].rawText.includes('EE 222 222 222')
  );
});

test('ranks companies using stored shipment history', () => {
  const result = analyzeQuestion('บริษัทไหนส่งมากที่สุด', [
    { company: 'logisticdigital' },
    { company: 'logisticdigital' },
    { company: 'oilion' }
  ]);

  assert.equal(result.type, 'ranking');

  assert.deepEqual(
    result.ranking[0],
    ['logisticdigital', 2]
  );
});
