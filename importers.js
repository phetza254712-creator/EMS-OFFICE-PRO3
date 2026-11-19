import * as XLSX from 'xlsx';
import mammoth from 'mammoth/mammoth.browser';
import { getDocument, GlobalWorkerOptions } from 'pdfjs-dist';
import pdfWorkerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import { parseMatrix, parseText } from './core.js';

GlobalWorkerOptions.workerSrc = pdfWorkerUrl;

const IMAGE_EXTENSIONS = new Set(['png', 'jpg', 'jpeg', 'webp', 'bmp', 'tif', 'tiff']);
const extOf = (name = '') => name.split('.').pop()?.toLowerCase() || '';

function parseSpreadsheet(buffer, fileName) {
  const workbook = XLSX.read(buffer, { type: 'array', cellDates: true, raw: true, dense: false });
  const output = { rows: [], unclassified: [], sheets: [], errors: [] };
  for (const sheetName of workbook.SheetNames) {
    const sheet = workbook.Sheets[sheetName];
    const matrix = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '', raw: true, blankrows: false });
    if (!matrix.length) continue;
    const parsed = parseMatrix(matrix, { source: 'spreadsheet', sourceFile: fileName, sourceLocation: sheetName });
    output.rows.push(...parsed.rows);
    output.unclassified.push(...parsed.unclassified);
    output.sheets.push({ name: sheetName, rows: parsed.totalNonEmptyRows, classified: parsed.rows.length, headerRow: parsed.headerRow });
  }
  return output;
}

function linesFromPdfItems(items) {
  const grouped = new Map();
  for (const item of items) {
    const value = String(item.str || '').trim();
    if (!value) continue;
    const y = Math.round(item.transform?.[5] ?? 0);
    if (!grouped.has(y)) grouped.set(y, []);
    grouped.get(y).push({ x: item.transform?.[4] ?? 0, value });
  }
  return [...grouped.entries()].sort((a, b) => b[0] - a[0])
    .map(([, pieces]) => pieces.sort((a, b) => a.x - b.x).map((piece) => piece.value).join(' '));
}

async function parsePdf(buffer, fileName) {
  const pdf = await getDocument({ data: new Uint8Array(buffer), useSystemFonts: true }).promise;
  const pages = [];
  for (let pageNo = 1; pageNo <= pdf.numPages; pageNo += 1) {
    const page = await pdf.getPage(pageNo);
    const content = await page.getTextContent();
    pages.push({ pageNo, page, lines: linesFromPdfItems(content.items) });
  }
  const scanned = pages.filter((page) => page.lines.join(' ').trim().length < 15);
  let ocrText = '';
  if (scanned.length) {
    const { createWorker } = await import('tesseract.js');
    const worker = await createWorker('tha+eng');
    try {
      for (const item of scanned) {
        const viewport = item.page.getViewport({ scale: 1.65 });
        const canvas = document.createElement('canvas');
        const context = canvas.getContext('2d', { willReadFrequently: true });
        canvas.width = Math.ceil(viewport.width);
        canvas.height = Math.ceil(viewport.height);
        await item.page.render({ canvasContext: context, viewport }).promise;
        const recognized = await worker.recognize(canvas);
        ocrText += `\nหน้า ${item.pageNo}\n${recognized.data.text || ''}`;
        canvas.width = 0;
        canvas.height = 0;
      }
    } finally {
      await worker.terminate();
    }
  }
  const text = pages.map((page) => `หน้า ${page.pageNo}\n${page.lines.join('\n')}`).join('\n\n') + ocrText;
  const records = parseText(text, { source: scanned.length ? 'pdf+ocr' : 'pdf', sourceFile: fileName });
  return {
    rows: records, unclassified: [],
    sheets: pages.map((page) => ({ name: `หน้า ${page.pageNo}`, rows: page.lines.length, classified: 0 })),
    errors: [], ocrPages: scanned.map((page) => page.pageNo)
  };
}

async function parseImage(file) {
  const { createWorker } = await import('tesseract.js');
  const worker = await createWorker('tha+eng');
  try {
    const result = await worker.recognize(file);
    const text = result.data.text || '';
    return { rows: parseText(text, { source: 'ocr', sourceFile: file.name }), unclassified: [], sheets: [{ name: 'OCR', rows: text.split(/\r?\n/).filter(Boolean).length, classified: 0 }], errors: [], ocrConfidence: result.data.confidence, extractedText: text };
  } finally {
    await worker.terminate();
  }
}

export async function importFile(file) {
  if (!file) throw new Error('ไม่พบไฟล์ที่เลือก');
  const extension = extOf(file.name);
  const buffer = await file.arrayBuffer();
  if (['xlsx', 'xls', 'xlsm', 'ods', 'csv'].includes(extension)) return parseSpreadsheet(buffer, file.name);
  if (extension === 'docx') {
    const [raw, html] = await Promise.all([
      mammoth.extractRawText({ arrayBuffer: buffer }),
      mammoth.convertToHtml({ arrayBuffer: buffer })
    ]);
    const document = new DOMParser().parseFromString(html.value, 'text/html');
    const tableRows = [...document.querySelectorAll('table')].flatMap((table) =>
      [...table.querySelectorAll('tr')].map((tr) => [...tr.querySelectorAll('th,td')].map((cell) => cell.textContent.trim()))
    );
    const parsedTable = tableRows.length ? parseMatrix(tableRows, { source: 'docx-table', sourceFile: file.name }) : null;
    const parsedText = parseText(raw.value, { source: 'docx', sourceFile: file.name });
    const useTable = parsedTable && (parsedTable.rows.length || parsedTable.unclassified.length);
    return {
      rows: useTable ? parsedTable.rows : parsedText,
      unclassified: useTable ? parsedTable.unclassified : [], sheets: [],
      errors: [...raw.messages, ...html.messages].map((message) => message.message)
    };
  }
  if (extension === 'pdf') return parsePdf(buffer, file.name);
  if (IMAGE_EXTENSIONS.has(extension)) return parseImage(file);
  if (['txt', 'tsv'].includes(extension)) {
    const text = new TextDecoder('utf-8').decode(buffer);
    if (text.includes('\t')) {
      const workbook = XLSX.read(text, { type: 'string', FS: '\t' });
      const sheet = workbook.Sheets[workbook.SheetNames[0]];
      const matrix = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '', raw: true });
      return { ...parseMatrix(matrix, { source: 'text-table', sourceFile: file.name }), sheets: [{ name: 'ข้อความ', rows: matrix.length }] };
    }
    return { rows: parseText(text, { source: 'text', sourceFile: file.name }), unclassified: [], sheets: [], errors: [] };
  }
  throw new Error(`ไม่รองรับไฟล์ .${extension || '?'} — รองรับ Excel, CSV, Word, PDF, TXT และรูปภาพ`);
}

export function exportWorkbook(records, fileName = 'EMS-Records.xlsx') {
  const rows = (records.length ? records : [{}]).map((record) => ({
    'วันที่ส่ง': record.date || '', 'บริษัท/ลูกค้า': record.company || '', 'เลข EMS': record.tracking || '',
    'ชื่อผู้รับ': record.recipient || '', 'ที่อยู่ผู้ส่ง': record.companyAddress || '',
    'ที่อยู่ผู้รับ': record.recipientAddress || '', 'ค่าส่ง (บาท)': record.cost ?? '',
    'หมายเหตุ': record.note || '', 'แหล่งที่มา': record.sourceFile || record.source || '',
    'ตำแหน่งต้นฉบับ': record.sourceLocation || '', 'ข้อความต้นฉบับ': record.rawText || '',
    'คำเตือน': (record.warnings || []).join(' | ')
  }));
  const worksheet = XLSX.utils.json_to_sheet(rows);
  worksheet['!cols'] = [{ wch: 14 }, { wch: 24 }, { wch: 22 }, { wch: 22 }, { wch: 32 }, { wch: 32 }, { wch: 14 }, { wch: 32 }, { wch: 24 }, { wch: 20 }, { wch: 55 }, { wch: 48 }];
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, 'ประวัติ EMS');
  return XLSX.write(workbook, { bookType: 'xlsx', type: 'array' });
}
