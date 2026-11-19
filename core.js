/**
 * EMS Office Pro — resilient import and record core.
 * Pure JavaScript module: no browser APIs, network calls, or external dependencies.
 */
export const APP_VERSION = '4.0.0';
export const FIELDS = Object.freeze([
  'date', 'company', 'tracking', 'recipient', 'companyAddress',
  'recipientAddress', 'cost', 'note'
]);
export const LABELS = Object.freeze({
  date: 'วันที่ส่ง', company: 'บริษัท/ลูกค้า', tracking: 'เลข EMS',
  recipient: 'ชื่อผู้รับ', companyAddress: 'ที่อยู่ผู้ส่ง',
  recipientAddress: 'ที่อยู่ผู้รับ', cost: 'ค่าส่ง (บาท)', note: 'หมายเหตุ'
});

const HEADER_MAP = Object.freeze({
  date: [
    'วันที่', 'วันที่ส่ง', 'วันส่ง', 'วันเดือนปี', 'วันเดือนปีที่ส่ง', 'วันที่จัดส่ง',
    'วันที่รับฝาก', 'วันรับฝาก', 'วันเดือนปีส่ง', 'date', 'shipdate', 'shippingdate', 'posteddate'
  ],
  company: [
    'บริษัท', 'ชื่อบริษัท', 'บริษัทผู้ส่ง', 'ชื่อลูกค้า', 'ลูกค้า', 'ชื่อบริษัทลูกค้า',
    'ชื่อบริษัท/ลูกค้า', 'ชื่อบริษัทลูกค้า/ผู้ส่ง', 'ผู้ส่ง', 'ต้นทาง', 'company',
    'companyname', 'customer', 'customername', 'sender', 'merchant', 'client'
  ],
  tracking: [
    'เลขems', 'เลข ems', 'เลขอีเอ็มเอส', 'หมายเลขems', 'เลขพัสดุ', 'เลขแทรค',
    'เลขติดตาม', 'หมายเลขพัสดุ', 'เลขที่พัสดุ', 'เลขที่ems', 'รหัสพัสดุ',
    'tracking', 'trackingnumber', 'trackno', 'ems', 'barcode', 'consignmentno'
  ],
  recipient: [
    'ผู้รับ', 'ชื่อผู้รับ', 'ผู้รับพัสดุ', 'ชื่อผู้รับพัสดุ', 'ปลายทาง',
    'recipient', 'recipientname', 'consignee', 'deliveryname'
  ],
  companyAddress: [
    'ที่อยู่บริษัท', 'ที่อยู่ผู้ส่ง', 'ที่อยู่ต้นทาง', 'ที่อยู่ลูกค้า',
    'companyaddress', 'senderaddress', 'originaddress'
  ],
  recipientAddress: [
    'ที่อยู่ผู้รับ', 'ที่อยู่ปลายทาง', 'ที่อยู่จัดส่ง', 'ที่อยู่ผู้รับพัสดุ',
    'recipientaddress', 'deliveryaddress', 'destinationaddress'
  ],
  cost: [
    'ค่าส่ง', 'ค่าจัดส่ง', 'ราคา', 'ค่าบริการ', 'ค่าขนส่ง', 'จำนวนเงิน',
    'ยอดเงิน', 'ค่าธรรมเนียม', 'cost', 'price', 'shippingcost', 'amount', 'fee', 'charge'
  ],
  note: ['หมายเหตุ', 'รายละเอียด', 'บันทึก', 'note', 'remark', 'description', 'memo']
});

const clean = (value) => String(value ?? '').replace(/\u00a0/g, ' ').replace(/[\r\n\t]+/g, ' ').trim();
const compact = (value) => clean(value).toLocaleLowerCase('th').normalize('NFKC')
  .replace(/[\s_\-./\\()[\]{}（）:：;,'"`~!@#$%^&*+=<>?|]/g, '');

export function normalizeHeader(value) { return compact(value); }

export function fieldForHeader(header) {
  const normalized = normalizeHeader(header);
  if (!normalized) return null;
  for (const [field, aliases] of Object.entries(HEADER_MAP)) {
    if (aliases.some((alias) => normalizeHeader(alias) === normalized)) return field;
  }
  // Conservative partial matching for real-world decorated headers, e.g. "เลข EMS (Barcode)".
  const partials = [
    ['tracking', /(?:เลขems|เลขอีเอ็มเอส|หมายเลขems|trackingnumber|tracking|barcode)/i],
    ['date', /(?:วันเดือนปี|วันที่ส่ง|วันที่จัดส่ง|shipdate)/i],
    ['company', /(?:ชื่อบริษัท|ชื่อลูกค้า|บริษัทผู้ส่ง|companyname|customername)/i],
    ['recipient', /(?:ชื่อผู้รับ|recipientname|consignee)/i],
    ['cost', /(?:ค่าส่ง|ค่าจัดส่ง|ค่าขนส่ง|shippingcost)/i]
  ];
  return partials.find(([, pattern]) => pattern.test(normalized))?.[0] ?? null;
}

export function normalizeTracking(value) {
  return clean(value).toUpperCase().replace(/[‐‑‒–—−]/g, '-').replace(/[^A-Z0-9]/g, '');
}

export function findTrackings(value) {
  const text = clean(value).toUpperCase().replace(/[‐‑‒–—−]/g, '-');
  const patterns = [
    /\b[A-Z]{2}[\s-]*(?:\d[\s-]*){6,13}(?:[A-Z]{2}(?![\s-]*\d))?\b/g,
    /\b\d{10,15}\b/g
  ];
  const found = [];
  for (const pattern of patterns) {
    for (const match of text.matchAll(pattern)) {
      const normalized = normalizeTracking(match[0]);
      if (normalized.length >= 8 && !found.includes(normalized)) found.push(normalized);
    }
  }
  return found;
}

export function trackingWarnings(value) {
  const normalized = normalizeTracking(value);
  if (!normalized) return [];
  const digits = (normalized.match(/\d/g) ?? []).length;
  const warnings = [];
  // EMS-style international identifiers commonly contain two prefix letters and nine digits.
  // Do not reject atypical values: preserve the original value and ask for human review.
  if (!/^[A-Z]{2}\d{9}[A-Z]{0,2}$/.test(normalized)) {
    warnings.push(`รูปแบบเลขติดตามไม่ตรงรูปแบบที่ระบบคาดหมาย (${digits} หลักตัวเลข) — เก็บข้อมูลไว้ โปรดตรวจสอบ`);
  }
  return warnings;
}

export function parseDate(value) {
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value.toISOString().slice(0, 10);
  if (typeof value === 'number' && Number.isFinite(value)) {
    // Excel's 1900 date system; ignore implausible serial numbers.
    if (value >= 20000 && value <= 90000) {
      const date = new Date(Date.UTC(1899, 11, 30) + Math.round(value) * 86400000);
      if (!Number.isNaN(date.getTime())) return date.toISOString().slice(0, 10);
    }
    return '';
  }
  const text = clean(value);
  if (!text) return '';
  const iso = text.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})$/);
  if (iso) {
    let year = Number(iso[1]);
    if (year > 2400) year -= 543;
    return validDate(year, Number(iso[2]), Number(iso[3]));
  }
  const thai = text.match(/^(\d{1,2})[\s./-](\d{1,2})[\s./-](\d{2,4})$/);
  if (thai) {
    let year = Number(thai[3]);
    if (year < 100) year += year >= 50 ? 2500 : 2000;
    if (year > 2400) year -= 543;
    return validDate(year, Number(thai[2]), Number(thai[1]));
  }
  const parsed = Date.parse(text);
  return Number.isNaN(parsed) ? '' : new Date(parsed).toISOString().slice(0, 10);
}

function validDate(year, month, day) {
  const date = new Date(Date.UTC(year, month - 1, day));
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) return '';
  return date.toISOString().slice(0, 10);
}

function isDateLike(value) { return Boolean(parseDate(value)); }
function isTrackingLike(value) { return findTrackings(value).length > 0; }
function isNumericLike(value) {
  const text = clean(value).replace(/[฿,\s]/g, '');
  return text !== '' && /^-?\d+(?:\.\d{1,2})?$/.test(text);
}
function isAddressLike(value) {
  const text = clean(value);
  return text.length >= 12 && /(\b\d{1,4}\b|ถนน|ซอย|ตำบล|อำเภอ|จังหวัด|แขวง|เขต|หมู่|ต\.|อ\.|จ\.|road|street|district|province)/i.test(text);
}
function isCompanyLike(value) {
  return /(บริษัท|จำกัด|มหาชน|หจก\.?|ห้างหุ้นส่วน|co\.?\s*ltd|company|limited|logistic|logistics|express|trading)/i.test(clean(value));
}
function rowText(row) { return row.map(clean).filter(Boolean).join(' | '); }

function inferColumnFields(matrix, headerRow) {
  const width = Math.max(0, ...matrix.slice(headerRow + 1, headerRow + 31).map((row) => row?.length ?? 0));
  const samples = Array.from({ length: width }, (_, col) => matrix.slice(headerRow + 1, headerRow + 31)
    .map((row) => row?.[col]).filter((v) => clean(v) !== ''));
  const scores = samples.map((values) => {
    const count = Math.max(values.length, 1);
    const ratio = (fn) => values.filter(fn).length / count;
    return {
      date: ratio(isDateLike), tracking: ratio(isTrackingLike), cost: ratio(isNumericLike),
      address: ratio(isAddressLike), company: ratio(isCompanyLike),
      text: ratio((v) => /[A-Za-zก-๙]/.test(clean(v)) && !isTrackingLike(v) && !isDateLike(v) && !isAddressLike(v))
    };
  });
  const assigned = new Map();
  const used = new Set();
  const assignBest = (field, scoreFn, threshold) => {
    let winner = -1; let best = threshold;
    scores.forEach((score, col) => {
      if (used.has(col)) return;
      const candidate = scoreFn(score);
      if (candidate > best) { best = candidate; winner = col; }
    });
    if (winner >= 0) { assigned.set(winner, field); used.add(winner); }
  };
  assignBest('tracking', (s) => s.tracking, 0.25);
  assignBest('date', (s) => s.date, 0.35);
  assignBest('cost', (s) => s.cost, 0.75);
  assignBest('companyAddress', (s) => s.address, 0.45);
  assignBest('company', (s) => Math.max(s.company, s.text * 0.72), 0.48);
  // Remaining text-like columns are useful candidates for recipient or free-form notes.
  assignBest('recipient', (s) => s.text, 0.65);
  return assigned;
}

function findHeader(matrix) {
  let best = { index: -1, score: 0, map: new Map(), generic: false };
  let genericCandidate = null;
  for (let index = 0; index < Math.min(matrix.length, 60); index += 1) {
    const row = matrix[index] ?? [];
    const map = new Map();
    row.forEach((value, col) => {
      const field = fieldForHeader(value);
      if (field && ![...map.values()].includes(field)) map.set(col, field);
    });
    const score = map.size;
    // Prefer an actual header row with multiple known labels; ties retain the earlier row.
    if (score > best.score) best = { index, score, map, generic: false };
    if (!genericCandidate && looksLikeGenericHeader(row)) genericCandidate = { index, map };
  }
  if (best.score >= 2) return best;
  if (genericCandidate) {
    const row = matrix[genericCandidate.index] ?? [];
    const map = new Map();
    row.forEach((value, col) => {
      const field = fieldForHeader(value);
      if (field && ![...map.values()].includes(field)) map.set(col, field);
    });
    return { index: genericCandidate.index, score: map.size, map, generic: true };
  }
  return best;
}

function looksLikeGenericHeader(row) {
  const cells = (row || []).map(clean).filter(Boolean);
  if (cells.length < 2) return false;
  const headerWord = /(?:รหัส|ข้อมูล|ชื่อ|วัน|วันที่|เลข|บริษัท|ลูกค้า|ผู้ส่ง|ผู้รับ|ที่อยู่|จำนวน|ยอด|ค่าส่ง|หมายเหตุ|address|tracking|track|date|company|customer|sender|recipient|amount|price|name|id)/i;
  const labelLike = cells.filter((value) => value.length <= 32 && !/\d{3,}/.test(value) && headerWord.test(value)).length;
  return labelLike >= 2 && labelLike / cells.length >= 0.5;
}

function makeDraft(row, meta, fieldsByColumn, companyContext) {
  const record = {
    date: '', company: '', tracking: '', recipient: '', companyAddress: '',
    recipientAddress: '', cost: '', note: '', rawText: rowText(row),
    source: meta.source ?? 'import', sourceFile: meta.sourceFile ?? '',
    sourceLocation: meta.sourceLocation ?? '', warnings: [], confidence: 'low'
  };
  for (const [column, field] of fieldsByColumn.entries()) {
    const value = row[column];
    if (value === undefined || clean(value) === '') continue;
    if (field === 'date') record.date = parseDate(value) || clean(value);
    else if (field === 'cost') record.cost = clean(value).replace(/[฿,\s]/g, '');
    else if (field === 'tracking') record.tracking = clean(value);
    else record[field] = clean(value);
  }
  if (!record.company && companyContext) record.company = companyContext;
  if (record.tracking) record.warnings.push(...trackingWarnings(record.tracking));
  const filled = FIELDS.filter((field) => clean(record[field])).length;
  record.confidence = filled >= 3 ? 'high' : filled >= 2 ? 'medium' : 'low';
  return record;
}

/**
 * Parse a worksheet matrix while preserving every non-empty row.
 * Unknown columns remain visible in rawText and are surfaced in unclassified.
 */
export function parseMatrix(matrix, options = {}) {
  const rowsInput = Array.isArray(matrix) ? matrix : [];
  const meta = typeof options === 'string' ? { source: `import:${options}`, sourceFile: options } : options;
  const header = findHeader(rowsInput);
  const hasHeader = header.score >= 2 || header.generic === true;
  const dataStart = hasHeader ? header.index + 1 : 0;
  const inferred = inferColumnFields(rowsInput, hasHeader ? header.index : -1);
  const fieldsByColumn = new Map(inferred);
  if (hasHeader) {
    for (const [column, field] of header.map.entries()) fieldsByColumn.set(column, field);
  }

  // Reassign inferred duplicates by keeping explicit header assignments authoritative.
  const seenFields = new Set();
  for (const [column, field] of [...fieldsByColumn.entries()]) {
    if (header.map.has(column)) continue;
    if (seenFields.has(field) || [...header.map.values()].includes(field)) fieldsByColumn.delete(column);
    else seenFields.add(field);
  }

  const parsedRows = [];
  const unclassified = [];
  if (hasHeader && header.generic) {
    const headerText = rowText(rowsInput[header.index] || []);
    if (headerText) unclassified.push({ sourceLocation: `row ${header.index + 1}`, rawText: headerText, reason: 'หัวตารางมีชื่อบางช่องที่ระบบยังไม่รู้จัก' });
  }
  let companyContext = '';
  let nonEmptyRows = 0;
  for (let index = dataStart; index < rowsInput.length; index += 1) {
    const row = Array.isArray(rowsInput[index]) ? rowsInput[index] : [rowsInput[index]];
    const rawText = rowText(row);
    if (!rawText) continue;
    nonEmptyRows += 1;
    const draft = makeDraft(row, {
      ...meta,
      sourceLocation: meta.sourceLocation ? `${meta.sourceLocation}:${index + 1}` : `row ${index + 1}`
    }, fieldsByColumn, companyContext);
    if (draft.company) companyContext = draft.company;

    // For spreadsheets without a recognizable header, discover EMS values even if column inference missed it.
    const trackingMatches = findTrackings(rawText);
    if (!draft.tracking && trackingMatches.length === 1) draft.tracking = trackingMatches[0];
    if (trackingMatches.length > 1) draft.warnings.push('พบเลขติดตามหลายเลขในแถวเดียว ระบบเก็บแถวต้นฉบับไว้ แต่โปรดตรวจสอบการจับคู่ด้วยตนเอง');
    if (draft.tracking) draft.warnings.push(...trackingWarnings(draft.tracking));
    draft.warnings = [...new Set(draft.warnings)];
    const hasUsefulField = FIELDS.some((field) => clean(draft[field]));
    if (hasUsefulField) {
      parsedRows.push(draft);
    } else {
      unclassified.push({ sourceLocation: draft.sourceLocation, rawText, reason: 'ยังจำแนกช่องข้อมูลไม่ได้' });
    }
  }
  return {
    rows: parsedRows, unclassified, headerRow: hasHeader ? header.index : -1,
    headers: hasHeader ? [...header.map.entries()].map(([index, field]) => ({ index, field })) : [],
    inferredColumns: [...fieldsByColumn.entries()].map(([index, field]) => ({ index, field })),
    headerless: !hasHeader, totalNonEmptyRows: nonEmptyRows
  };
}

/** Parse free text/OCR text and retain a draft for every line containing meaningful data. */
export function parseText(text, options = {}) {
  const lines = String(text ?? '').split(/\r?\n/).map(clean).filter(Boolean);
  const allText = lines.join('\n');
  const trackingMatches = findTrackings(allText);
  const companyMatch = lines.find((line) => isCompanyLike(line) && !isTrackingLike(line)) ?? '';
  const dateMatch = lines.map((line) => parseDate(line)).find(Boolean) ?? '';
  const records = [];
  for (let index = 0; index < trackingMatches.length; index += 1) {
    const tracking = trackingMatches[index];
    const contextLine = lines.find((line) => normalizeTracking(line) === tracking) ?? tracking;
    const company = companyMatch || '';
    const record = {
      date: dateMatch, company, tracking, recipient: '', companyAddress: '',
      recipientAddress: '', cost: '', note: '', rawText: allText,
      source: options.source ?? 'text-import', sourceFile: options.sourceFile ?? '',
      sourceLocation: options.sourceLocation ?? `line ${index + 1}`,
      warnings: trackingWarnings(tracking), confidence: company || dateMatch ? 'medium' : 'low'
    };
    if (!contextLine) record.warnings.push('ตรวจจับเลขติดตามจากข้อความรวม โปรดตรวจสอบตำแหน่งต้นฉบับ');
    records.push(record);
  }
  if (!records.length && allText) records.push({
    date: '', company: companyMatch, tracking: '', recipient: '', companyAddress: '',
    recipientAddress: '', cost: '', note: allText.slice(0, 1000), rawText: allText,
    source: options.source ?? 'text-import', sourceFile: options.sourceFile ?? '',
    sourceLocation: options.sourceLocation ?? 'text',
    warnings: ['ยังตรวจจับเลข EMS ไม่พบ — เก็บข้อความต้นฉบับไว้ให้ตรวจสอบ'], confidence: 'low'
  });
  return records;
}

export function makeRecord(input = {}, now = new Date(), options = {}) {
  const record = {};
  for (const field of FIELDS) record[field] = clean(input[field]);
  record.date = parseDate(record.date) || record.date;
  record.tracking = clean(record.tracking);
  const warnings = [...(input.warnings || [])];
  if (record.cost !== '') {
    const rawCost = String(record.cost);
    const parsedCost = Number(rawCost.replace(/[฿,\s]/g, ''));
    if (Number.isFinite(parsedCost) && parsedCost >= 0) record.cost = parsedCost;
    else {
      if (options.strictCost) throw new Error('ค่าส่งต้องเป็นตัวเลขตั้งแต่ 0 ขึ้นไป');
      record.cost = rawCost;
      warnings.push('ค่าส่งไม่ใช่ตัวเลขตั้งแต่ 0 ขึ้นไป — เก็บค่าต้นฉบับไว้ โปรดตรวจสอบ');
    }
  }
  if (!FIELDS.some((field) => clean(record[field])) && !clean(input.rawText)) {
    throw new Error('กรุณากรอกข้อมูลอย่างน้อยหนึ่งช่อง');
  }
  const createdAt = input.createdAt || now.toISOString();
  return {
    ...record,
    id: input.id || createId(),
    rawText: clean(input.rawText), source: clean(input.source || 'manual'),
    sourceFile: clean(input.sourceFile), sourceLocation: clean(input.sourceLocation),
    warnings: [...new Set([...warnings, ...trackingWarnings(record.tracking)])],
    confidence: input.confidence || 'high', createdAt, updatedAt: now.toISOString()
  };
}

export function createId() {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
  return `ems-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

export function normalizeQuery(value) { return clean(value).toLocaleLowerCase('th'); }

export function analyzeQuestion(question, records = []) {
  const q = normalizeQuery(question);
  const trackingQuery = findTrackings(question);
  if (trackingQuery.length) {
    const matches = records.filter((r) => trackingQuery.some((t) => normalizeTracking(r.tracking) === t));
    if (!matches.length) return { type: 'lookup', answer: `ไม่พบเลข EMS ${trackingQuery.join(', ')} ในฐานข้อมูล`, records: [] };
    return { type: 'lookup', answer: `พบข้อมูล ${matches.length} รายการ`, records: matches };
  }
  if (/(มากที่สุด|สูงสุด|อันดับ|top|most)/i.test(q) && /(บริษัท|ลูกค้า|ผู้ส่ง|company)/i.test(q)) {
    const counts = new Map();
    records.forEach((r) => { if (r.company) counts.set(r.company, (counts.get(r.company) || 0) + 1); });
    const ranking = [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10);
    return { type: 'ranking', answer: ranking.length ? 'บริษัทที่มีรายการส่งมากที่สุดเรียงตามจำนวน' : 'ยังไม่มีข้อมูลบริษัทเพียงพอ', ranking };
  }
  if (/(จำนวน|ทั้งหมด|กี่รายการ|กี่ชิ้น|สรุป)/i.test(q) && /(วันนี้|เดือนนี้|ปีนี้)/i.test(q)) {
    const now = new Date();
    const filtered = records.filter((record) => {
      const date = record.date;
      if (!date) return false;
      if (q.includes('วันนี้')) return date === now.toISOString().slice(0, 10);
      if (q.includes('เดือนนี้')) return date.slice(0, 7) === now.toISOString().slice(0, 7);
      return date.slice(0, 4) === String(now.getFullYear());
    });
    return { type: 'count', answer: `พบ ${filtered.length.toLocaleString('th-TH')} รายการตามช่วงเวลาที่ระบุ`, count: filtered.length, records: filtered };
  }
  if (/(จำนวน|ทั้งหมด|กี่รายการ|กี่ชิ้น|สรุป|กี่ครั้ง)/i.test(q)) {
    return { type: 'count', answer: `มีประวัติทั้งหมด ${records.length.toLocaleString('th-TH')} รายการ`, count: records.length };
  }
  if (/(ค้นหา|หา|รายการของ|บริษัท|ลูกค้า)/i.test(q)) {
    const terms = q.split(/\s+/).filter((x) => x.length >= 3 && !/^(ค้นหา|บริษัท|ลูกค้า|รายการของ|ชื่อ)$/i.test(x));
    const matches = records.filter((r) => terms.some((term) => [r.company, r.recipient, r.tracking, r.note].some((value) => normalizeQuery(value).includes(term))));
    return { type: 'search', answer: matches.length ? `พบ ${matches.length} รายการที่เกี่ยวข้อง` : 'ยังไม่พบรายการที่ตรงกับคำค้น', records: matches.slice(0, 100) };
  }
  return {
    type: 'help',
    answer: 'ผมช่วยค้นเลข EMS, ค้นหาบริษัท/ผู้รับ, นับจำนวนรายการ, จัดอันดับบริษัท และสรุปข้อมูลจากฐานข้อมูล EMS ได้ ลองถาม เช่น “เลข EE5555555 อยู่ในชื่อใคร”, “บริษัทไหนส่งมากที่สุด”, “เดือนนี้ส่งกี่รายการ”'
  };
}

export function summarizeRecords(records = []) {
  const companies = new Map();
  let withTracking = 0; let withWarning = 0; let totalCost = 0;
  for (const record of records) {
    if (record.tracking) withTracking += 1;
    if (record.warnings?.length) withWarning += 1;
    if (record.company) companies.set(record.company, (companies.get(record.company) || 0) + 1);
    if (Number.isFinite(Number(record.cost))) totalCost += Number(record.cost);
  }
  return {
    total: records.length, withTracking, withWarning, totalCost,
    companies: [...companies.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5)
  };
}
