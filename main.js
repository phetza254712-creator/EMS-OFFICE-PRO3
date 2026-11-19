import './styles.css';
import { APP_VERSION, FIELDS, LABELS, makeRecord, parseDate, normalizeTracking, trackingWarnings, summarizeRecords, createId } from './core.js';
import {
  openDatabase, getAllRecords, saveRecord, saveRecords, deleteRecord,
  getChats, saveChat, exportBackup, restoreBackup, getAudit,
  getSetting, setSetting, getStorageEstimate
} from './database.js';
import { importFile, exportWorkbook } from './importers.js';
import { askAssistant } from './assistant.js';

const root = document.getElementById('app');
const state = {
  tab: 'dashboard', records: [], chats: [], staged: null, query: '',
  modal: null, assistantMode: 'local', assistantEndpoint: 'http://127.0.0.1:11434',
  assistantModel: 'qwen2.5:7b', apiKey: '', notice: '', noticeType: 'success', busy: false,
  audit: [], storage: null
};

const esc = (value) => String(value ?? '').replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
const fmt = (value) => Number.isFinite(Number(value)) ? Number(value || 0).toLocaleString('th-TH') : esc(value);
const dateLabel = (value) => {
  if (!value) return '—';
  const date = new Date(`${value}T00:00:00`);
  return Number.isNaN(date.getTime()) ? esc(value) : new Intl.DateTimeFormat('th-TH', { dateStyle: 'medium' }).format(date);
};
const note = (message, type = 'success') => { state.notice = message; state.noticeType = type; };
const sourceLabel = (record) => record.sourceFile || record.source || 'บันทึกเอง';

function statsMarkup(summary) {
  return `<div class="grid stats">
    <div class="stat"><div class="label">ประวัติทั้งหมด</div><strong>${fmt(summary.total)}</strong><small>รายการในเครื่องนี้</small></div>
    <div class="stat"><div class="label">มีเลขติดตาม</div><strong>${fmt(summary.withTracking)}</strong><small>รายการที่ตรวจพบเลข EMS</small></div>
    <div class="stat"><div class="label">บริษัท/ลูกค้า</div><strong>${fmt(summary.companies.length ? new Set(state.records.map(r => r.company).filter(Boolean)).size : 0)}</strong><small>ชื่อที่ไม่ซ้ำกัน</small></div>
    <div class="stat"><div class="label">รอตรวจสอบ</div><strong>${fmt(summary.withWarning)}</strong><small>ข้อมูลมีคำเตือน ไม่ได้ถูกลบทิ้ง</small></div>
  </div>`;
}

function navMarkup() {
  const tabs = [
    ['dashboard', 'ภาพรวม'], ['records', 'ประวัติ EMS'], ['import', 'นำเข้าข้อมูล'],
    ['assistant', 'AI ผู้ช่วย'], ['backup', 'สำรองข้อมูล'], ['settings', 'ตั้งค่า']
  ];
  return `<nav class="nav" aria-label="เมนูหลัก">${tabs.map(([id, label]) => `<button data-tab="${id}" class="${state.tab === id ? 'active' : ''}">${label}</button>`).join('')}</nav>`;
}

function noticeMarkup() {
  return state.notice ? `<div class="notice ${state.noticeType === 'error' ? 'error-notice' : state.noticeType === 'success' ? 'success-notice' : ''}" role="status">${esc(state.notice)}</div>` : '';
}

function dashboardMarkup() {
  const summary = summarizeRecords(state.records);
  const recent = state.records.slice(0, 8);
  const max = summary.companies[0]?.[1] || 1;
  return `<div class="page-head"><div><h2>ภาพรวมระบบ</h2><p>ติดตามประวัติการส่ง ตรวจสอบข้อมูล และดูภาพรวมการทำงาน</p></div><div class="actions"><button class="btn primary" data-action="add-record">＋ เพิ่มรายการ</button><button class="btn" data-tab="import">นำเข้าไฟล์</button></div></div>
    ${statsMarkup(summary)}
    <div class="grid dashboard-grid">
      <section class="panel"><h3>รายการล่าสุด</h3><p class="panel-sub">ข้อมูลล่าสุดที่บันทึกอยู่ในอุปกรณ์นี้</p>
        ${recent.length ? `<div class="table-wrap"><table><thead><tr><th>วันที่</th><th>บริษัท/ลูกค้า</th><th>เลข EMS</th><th>ผู้รับ</th><th>สถานะ</th></tr></thead><tbody>${recent.map(r => `<tr><td>${dateLabel(r.date)}</td><td>${esc(r.company || '—')}</td><td><strong>${esc(r.tracking || '—')}</strong></td><td>${esc(r.recipient || '—')}</td><td>${r.warnings?.length ? '<span class="pill warn">ตรวจสอบ</span>' : '<span class="pill good">ปกติ</span>'}</td></tr>`).join('')}</tbody></table></div>` : `<div class="empty">ยังไม่มีประวัติพัสดุ เริ่มต้นด้วยการเพิ่มรายการหรือนำเข้า Excel</div>`}
        <div class="actions" style="margin-top:13px"><button class="btn small" data-tab="records">เปิดประวัติทั้งหมด</button></div>
      </section>
      <section class="panel"><h3>บริษัทที่ส่งมากที่สุด</h3><p class="panel-sub">จัดอันดับจากข้อมูลที่มีอยู่ในฐานข้อมูล</p>
        ${summary.companies.length ? summary.companies.map(([company, count]) => `<div class="bar-row"><div title="${esc(company)}">${esc(company.length > 17 ? company.slice(0, 17) + '…' : company)}</div><div class="bar-track"><span style="width:${Math.max(5, count / max * 100)}%"></span></div><strong>${fmt(count)}</strong></div>`).join('') : '<div class="empty">ยังไม่มีข้อมูลบริษัท</div>'}
        <div class="notice" style="margin-top:18px">ข้อมูลถูกจัดเก็บไว้ภายในอุปกรณ์นี้โดยไม่ส่งขึ้นเซิร์ฟเวอร์อัตโนมัติ ควรส่งออกไฟล์สำรองเป็นประจำ</div>
      </section>
    </div>`;
}

function filteredRecords() {
  const query = state.query.trim().toLocaleLowerCase('th');
  if (!query) return state.records;
  return state.records.filter((record) => [record.date, record.company, record.tracking, record.recipient, record.companyAddress, record.recipientAddress, record.note, record.rawText]
    .some((value) => String(value || '').toLocaleLowerCase('th').includes(query)));
}

function recordsMarkup() {
  const records = filteredRecords();
  return `<div class="page-head"><div><h2>ประวัติ EMS</h2><p>ค้นหา แก้ไข ตรวจสอบรายการ และดูข้อมูลต้นฉบับได้</p></div><button class="btn primary" data-action="add-record">＋ เพิ่มรายการ</button></div>
    <section class="panel">
      <div class="toolbar"><input class="input" id="record-search" placeholder="ค้นหาบริษัท เลข EMS ชื่อผู้รับ…" value="${esc(state.query)}" /><span class="pill">${fmt(records.length)} / ${fmt(state.records.length)} รายการ</span><button class="btn small" data-action="export-xlsx">ส่งออก Excel</button></div>
      ${records.length ? `<div class="table-wrap"><table><thead><tr><th>วันที่ส่ง</th><th>บริษัท/ลูกค้า</th><th>เลข EMS</th><th>ชื่อผู้รับ</th><th>ค่าส่ง</th><th>สถานะ</th><th>ดำเนินการ</th></tr></thead><tbody>${records.slice(0, 1000).map((r) => `<tr>
        <td>${dateLabel(r.date)}</td><td>${esc(r.company || '—')}</td><td><strong>${esc(r.tracking || '—')}</strong></td><td>${esc(r.recipient || '—')}</td><td>${r.cost === '' || r.cost == null ? '—' : fmt(r.cost)}</td>
        <td>${r.warnings?.length ? `<span class="pill warn" title="${esc(r.warnings.join('\n'))}">ต้องตรวจสอบ (${r.warnings.length})</span>` : '<span class="pill good">ปกติ</span>'}</td>
        <td><div class="actions"><button class="btn small" data-action="edit-record" data-id="${esc(r.id)}">แก้ไข</button><button class="btn small ghost" data-action="view-record" data-id="${esc(r.id)}">ดูต้นฉบับ</button><button class="btn small danger" data-action="delete-record" data-id="${esc(r.id)}">ลบ</button></div></td>
      </tr>`).join('')}</tbody></table></div>${records.length > 1000 ? `<p class="small-text muted">แสดง 1,000 รายการแรกจากผลค้นหา กรุณาใช้ตัวกรองเพื่อค้นหารายการอื่น</p>` : ''}` : '<div class="empty">ไม่พบข้อมูลที่ค้นหา หรือยังไม่มีประวัติ EMS</div>'}
    </section>`;
}

function importMarkup() {
  const staged = state.staged;
  return `<div class="page-head"><div><h2>นำเข้าข้อมูล</h2><p>รองรับ Excel, CSV, Word, PDF, TXT และภาพถ่ายเอกสาร</p></div></div>
    <section class="panel">
      <div class="import-drop"><strong>เลือกไฟล์ข้อมูลที่จะนำเข้า</strong><p>ระบบจะอ่านทุกชีต ทุกแถว และเก็บแถวที่ยังจำแนกไม่ได้ไว้ให้ตรวจสอบ</p>
        <label class="btn primary" for="import-file">เลือกไฟล์จากอุปกรณ์</label><input id="import-file" class="file-input" type="file" accept=".xlsx,.xls,.xlsm,.ods,.csv,.docx,.pdf,.txt,.tsv,.png,.jpg,.jpeg,.webp,.bmp,.tif,.tiff" />
      </div>
      ${staged ? `<div style="margin-top:18px"><div class="page-head"><div><h3 style="margin:0">ตัวอย่างก่อนบันทึก</h3><p>ไฟล์: ${esc(staged.fileName)} • ระบบไม่บันทึกจนกว่าจะกดยืนยัน</p></div><button class="btn ghost small" data-action="clear-import">ยกเลิกชุดนี้</button></div>
        <div class="grid stats" style="grid-template-columns:repeat(3,minmax(0,1fr))"><div class="stat"><div class="label">แถวที่ตรวจพบ</div><strong>${fmt(staged.rows.length + staged.unclassified.length)}</strong></div><div class="stat"><div class="label">จำแนกข้อมูลได้</div><strong>${fmt(staged.rows.length)}</strong></div><div class="stat"><div class="label">ยังจำแนกไม่ได้</div><strong>${fmt(staged.unclassified.length)}</strong></div></div>
        ${staged.sheets?.length ? `<p class="small-text muted">${staged.sheets.map(s => `${esc(s.name)} (${fmt(s.rows)} แถว)`).join(' • ')}</p>` : ''}
        ${staged.ocrPages?.length ? `<div class="notice">ใช้ OCR อ่าน PDF หน้าที่เป็นภาพสแกนแล้ว: หน้า ${staged.ocrPages.join(', ')}</div>` : ''}
        ${staged.errors?.length ? `<div class="notice">${esc(staged.errors.join(' • '))}</div>` : ''}
        <div class="table-wrap" style="margin-top:12px"><table><thead><tr><th>#</th><th>วันที่</th><th>บริษัท/ลูกค้า</th><th>เลข EMS</th><th>ชื่อผู้รับ</th><th>สถานะ/คำเตือน</th></tr></thead><tbody>${staged.rows.slice(0, 80).map((r, i) => `<tr><td>${i + 1}</td><td>${esc(r.date || '—')}</td><td>${esc(r.company || '—')}</td><td>${esc(r.tracking || '—')}</td><td>${esc(r.recipient || '—')}</td><td>${r.warnings?.length ? `<span class="pill warn" title="${esc(r.warnings.join('\n'))}">ตรวจสอบ</span>` : '<span class="pill good">อ่านได้</span>'}</td></tr>`).join('') || '<tr><td colspan="6">ไม่พบแถวที่จำแนกเป็นรายการได้</td></tr>'}</tbody></table></div>
        ${staged.unclassified.length ? `<div class="notice" style="margin-top:12px">มี ${fmt(staged.unclassified.length)} แถวที่ระบบจำแนกไม่ได้ ข้อความต้นฉบับจะถูกเก็บเป็นหมายเหตุ เพื่อไม่ให้ข้อมูลสูญหาย เช่น: ${esc(staged.unclassified.slice(0, 3).map(x => x.rawText).join(' / ').slice(0, 320))}</div>` : ''}
        <div class="actions" style="margin-top:15px"><button class="btn primary" data-action="save-import" ${!staged.rows.length && !staged.unclassified.length ? 'disabled' : ''}>ยืนยันและบันทึก ${fmt(staged.rows.length + staged.unclassified.length)} แถว</button></div>
      </div>` : ''}
    </section>
    <section class="panel" style="margin-top:14px"><h3>แนวทางการอ่านข้อมูล</h3><p class="small-text muted">ตรวจจากชื่อหัวตารางและรูปแบบค่าจริงในแต่ละคอลัมน์ หากไม่รู้จักหัวตารางจะพยายามอนุมานจากวัน/เลขติดตาม/ตัวเลข/ข้อความ และเก็บข้อความต้นฉบับพร้อมตำแหน่งแถวไว้เสมอ เลขติดตามที่รูปแบบแปลกจะไม่ถูกทิ้ง แต่จะติดคำเตือนเพื่อให้คนตรวจสอบ</p></section>`;
}

function assistantMarkup() {
  const messages = state.chats;
  return `<div class="page-head"><div><h2>AI ผู้ช่วย</h2><p>ถามได้ทั้งงาน EMS และเรื่องทั่วไป โหมดภายในใช้วิเคราะห์ฐานข้อมูลโดยไม่ส่งข้อมูลออกไป</p></div><span class="pill ${state.assistantMode === 'local' ? 'good' : ''}">${state.assistantMode === 'local' ? 'ภายในเครื่อง' : state.assistantMode === 'ollama' ? 'Ollama Local' : 'AI ออนไลน์'}</span></div>
    <div class="chat-layout"><section class="panel chat-panel"><div class="chat-messages" id="chat-messages">${messages.length ? messages.map(m => `<div class="message ${m.role === 'user' ? 'user' : 'assistant'}">${esc(m.content)}</div>`).join('') : '<div class="empty">สวัสดีครับ ผมช่วยค้นเลข EMS สรุปจำนวนพัสดุ จัดอันดับบริษัท และตอบคำถามทั่วไปเมื่อเชื่อมต่อโมเดล AI ได้</div>'}</div>
      <form class="chat-compose" id="chat-form"><input id="chat-input" class="input" placeholder="พิมพ์คำถาม เช่น บริษัทไหนส่งมากที่สุด…" autocomplete="off" required /><button class="btn primary" type="submit" ${state.busy ? 'disabled' : ''}>${state.busy ? 'กำลังคิด…' : 'ส่ง'}</button></form>
      ${state.notice ? noticeMarkup() : ''}
    </section><aside class="panel"><h3>คำถามตัวอย่าง</h3><div class="actions" style="display:grid"><button class="btn ghost" data-prompt="ค้นหาเลข EMS EE 555 555 5">ค้นหาเลข EMS</button><button class="btn ghost" data-prompt="บริษัทไหนส่งมากที่สุด">บริษัทที่ส่งมากที่สุด</button><button class="btn ghost" data-prompt="มีประวัติทั้งหมดกี่รายการ">จำนวนประวัติทั้งหมด</button><button class="btn ghost" data-prompt="สรุปข้อมูลการส่งในฐานข้อมูล">สรุปข้อมูล</button></div><div class="notice" style="margin-top:16px">ผู้ช่วยข้อมูลภายในเป็นการวิเคราะห์ตามกฎ ไม่ใช่โมเดลภาษาขนาดใหญ่ หากต้องการสนทนาอิสระให้ตั้งค่า Ollama หรือ AI ออนไลน์ในหน้าตั้งค่า</div><button class="btn small ghost" style="margin-top:12px" data-action="clear-chat">ล้างประวัติสนทนา</button></aside></div>`;
}

function backupMarkup() {
  const estimate = state.storage;
  const used = estimate?.usage ? `${(estimate.usage / 1024 / 1024).toFixed(1)} MB` : 'ไม่ทราบ';
  return `<div class="page-head"><div><h2>สำรองและกู้คืนข้อมูล</h2><p>จัดเก็บข้อมูลภายในอุปกรณ์ และสำรองไปยังไฟล์ที่ควบคุมเอง</p></div></div>
    <div class="grid dashboard-grid"><section class="panel"><h3>สำรองข้อมูล</h3><p class="small-text muted">สร้างไฟล์ JSON ซึ่งประกอบด้วยประวัติพัสดุและบทสนทนา เก็บไว้ในคอมพิวเตอร์หรือพื้นที่สำรองที่องค์กรควบคุม</p><div class="actions"><button class="btn primary" data-action="backup-json">ดาวน์โหลดไฟล์สำรอง JSON</button><button class="btn" data-action="export-xlsx">ส่งออก Excel</button></div><div class="notice" style="margin-top:16px">แนะนำให้สำรองข้อมูลทุกวันหรือทุกครั้งก่อนอัปเดตแอป และเก็บอย่างน้อย 2 ชุดในสถานที่ต่างกัน</div></section>
      <section class="panel"><h3>กู้คืนข้อมูล</h3><p class="small-text muted">เลือกไฟล์ JSON ที่สร้างจาก EMS Office Pro สามารถรวมข้อมูลเข้ากับฐานข้อมูล หรือแทนที่ข้อมูลเดิมได้</p><label class="btn" for="backup-file">เลือกไฟล์สำรอง</label><input type="file" id="backup-file" class="file-input" accept="application/json,.json" /><p class="small-text muted" id="backup-result"></p></section></div>
    <section class="panel" style="margin-top:14px"><h3>สถานะการจัดเก็บ</h3><ul class="list-plain"><li><span>จำนวนประวัติ</span><strong>${fmt(state.records.length)} รายการ</strong></li><li><span>พื้นที่จัดเก็บโดยประมาณที่ Browser แจ้ง</span><strong>${used}</strong></li><li><span>ฐานข้อมูล</span><strong>IndexedDB ในอุปกรณ์</strong></li><li><span>การส่งข้อมูลขึ้นคลาวด์</span><strong>ไม่มีการส่งอัตโนมัติ</strong></li></ul></section>
    <section class="panel danger-zone" style="margin-top:14px"><h3>พื้นที่ควบคุมความเสี่ยง</h3><p class="small-text muted">การลบข้อมูลจะไม่สามารถย้อนกลับได้ ควรดาวน์โหลดไฟล์สำรองก่อนเสมอ</p><button class="btn danger" data-action="clear-records">ลบประวัติทั้งหมดในอุปกรณ์นี้</button></section>`;
}

function settingsMarkup() {
  return `<div class="page-head"><div><h2>ตั้งค่าระบบ</h2><p>กำหนดผู้ช่วย AI และตรวจสอบข้อจำกัดการทำงานบนอุปกรณ์</p></div></div>
    <section class="panel"><h3>การเชื่อมต่อ AI</h3><div class="field" style="max-width:420px"><label for="assistant-mode">รูปแบบผู้ช่วย</label><select id="assistant-mode"><option value="local" ${state.assistantMode === 'local' ? 'selected' : ''}>ผู้ช่วยวิเคราะห์ภายในเครื่อง (ไม่ต้องใช้อินเทอร์เน็ต)</option><option value="ollama" ${state.assistantMode === 'ollama' ? 'selected' : ''}>Ollama ในเครื่อง (ต้องติดตั้ง Ollama เพิ่ม)</option><option value="openai" ${state.assistantMode === 'openai' ? 'selected' : ''}>AI ออนไลน์แบบ OpenAI-compatible (ต้องมี API key)</option></select></div>
      <div class="form-grid" style="margin-top:14px"><div class="field span-2"><label for="ai-endpoint">Endpoint / URL</label><input class="input" id="ai-endpoint" value="${esc(state.assistantEndpoint)}" placeholder="http://127.0.0.1:11434" /></div><div class="field span-2"><label for="ai-model">ชื่อโมเดล</label><input class="input" id="ai-model" value="${esc(state.assistantModel)}" placeholder="qwen2.5:7b" /></div><div class="field span-2"><label for="ai-key">API key (ใช้เฉพาะครั้งนี้ ไม่บันทึกลงฐานข้อมูล)</label><input class="input" id="ai-key" type="password" value="" autocomplete="new-password" placeholder="ใส่เมื่อใช้ AI ออนไลน์" /></div></div>
      <div class="actions" style="margin-top:14px"><button class="btn primary" data-action="save-settings">บันทึกการตั้งค่า</button><button class="btn" data-action="test-ai">ทดสอบการเชื่อมต่อ</button></div><p class="small-text muted" style="margin-top:12px">ข้อจำกัด: การเชื่อมต่อ AI ออนไลน์ขึ้นกับผู้ให้บริการ การตั้งค่า CORS และเครือข่ายขององค์กร แอปไม่ฝัง API key ไว้ในโปรแกรม ทุกครั้งก่อนส่งจะขออนุญาต และคำถามเกี่ยวกับ EMS อาจส่งบริบทประวัติสูงสุด 500 รายการล่าสุดไปยัง endpoint ส่วน Ollama ต้องเปิดให้แอปเข้าถึง endpoint ได้</p>
    </section>
    <section class="panel" style="margin-top:14px"><h3>ข้อมูลรุ่นโปรแกรม</h3><ul class="list-plain"><li><span>เวอร์ชัน</span><strong>${APP_VERSION}</strong></li><li><span>ระบบฐานข้อมูล</span><strong>IndexedDB • schema 1</strong></li><li><span>แพลตฟอร์ม</span><strong>Web / Android / Windows</strong></li><li><span>การจัดเก็บ</span><strong>Local-first</strong></li></ul></section>
    <section class="panel" style="margin-top:14px"><h3>แนวปฏิบัติสำหรับองค์กร</h3><p class="small-text muted">เวอร์ชันนี้เป็นแอปฐานข้อมูลภายในเครื่องหนึ่งชุด ไม่ใช่ระบบหลายสาขาที่ซิงก์ข้อมูลพร้อมกันบนเซิร์ฟเวอร์กลาง ก่อนใช้ระดับองค์กรหรือระดับประเทศ ต้องเพิ่มระบบเซิร์ฟเวอร์กลาง การกำหนดสิทธิ์ผู้ใช้ การเข้ารหัสขณะจัดเก็บ/ส่งผ่าน การสำรองนอกสถานที่ การบันทึกเหตุการณ์ส่วนกลาง การทดสอบโหลด และการตรวจประเมินความปลอดภัย</p></section>`;
}

function modalMarkup() {
  if (!state.modal) return '';
  const record = state.modal.record || {};
  const mode = state.modal.mode;
  if (mode === 'view') return `<div class="modal-backdrop" data-action="close-modal"><section class="modal" role="dialog" aria-modal="true"><h3>รายละเอียดและต้นฉบับ</h3><div class="form-grid">${FIELDS.map(field => `<div class="field"><label>${LABELS[field]}</label><div>${esc(record[field] || '—')}</div></div>`).join('')}</div><div class="field" style="margin-top:15px"><label>ข้อความต้นฉบับจากไฟล์</label><textarea rows="5" readonly>${esc(record.rawText || '')}</textarea></div><div class="field" style="margin-top:12px"><label>แหล่งที่มา</label><div>${esc(sourceLabel(record))} ${esc(record.sourceLocation || '')}</div></div>${record.warnings?.length ? `<div class="notice" style="margin-top:12px">${esc(record.warnings.join('\n'))}</div>` : ''}<div class="modal-footer"><button class="btn" data-action="close-modal">ปิด</button></div></section></div>`;
  return `<div class="modal-backdrop" data-action="close-modal"><section class="modal" role="dialog" aria-modal="true" aria-labelledby="record-modal-title"><h3 id="record-modal-title">${mode === 'edit' ? 'แก้ไขรายการ EMS' : 'เพิ่มรายการ EMS'}</h3><form id="record-form" data-mode="${mode}" data-id="${esc(record.id || '')}"><div class="form-grid">
    <div class="field"><label for="f-date">วันที่ส่ง</label><input id="f-date" name="date" class="input" type="date" value="${esc(record.date || '')}" /></div>
    <div class="field"><label for="f-company">บริษัท/ลูกค้า</label><input id="f-company" name="company" class="input" value="${esc(record.company || '')}" /></div>
    <div class="field"><label for="f-tracking">เลข EMS / เลขติดตาม</label><input id="f-tracking" name="tracking" class="input" value="${esc(record.tracking || '')}" /></div>
    <div class="field"><label for="f-recipient">ชื่อผู้รับ</label><input id="f-recipient" name="recipient" class="input" value="${esc(record.recipient || '')}" /></div>
    <div class="field span-2"><label for="f-companyAddress">ที่อยู่ผู้ส่ง</label><input id="f-companyAddress" name="companyAddress" class="input" value="${esc(record.companyAddress || '')}" /></div>
    <div class="field span-2"><label for="f-recipientAddress">ที่อยู่ผู้รับ</label><input id="f-recipientAddress" name="recipientAddress" class="input" value="${esc(record.recipientAddress || '')}" /></div>
    <div class="field"><label for="f-cost">ค่าส่ง (บาท)</label><input id="f-cost" name="cost" class="input" inputmode="decimal" value="${esc(record.cost ?? '')}" /></div>
    <div class="field span-2"><label for="f-note">หมายเหตุ</label><input id="f-note" name="note" class="input" value="${esc(record.note || '')}" /></div>
  </div><div class="modal-footer"><button type="button" class="btn" data-action="close-modal">ยกเลิก</button><button type="submit" class="btn primary">บันทึกข้อมูล</button></div></form></section></div>`;
}

function render() {
  const content = state.tab === 'dashboard' ? dashboardMarkup()
    : state.tab === 'records' ? recordsMarkup()
      : state.tab === 'import' ? importMarkup()
        : state.tab === 'assistant' ? assistantMarkup()
          : state.tab === 'backup' ? backupMarkup() : settingsMarkup();
  root.innerHTML = `<div class="app-shell"><header class="topbar"><div class="brand"><div class="brand-mark">E</div><div><h1>EMS Office Pro</h1><p>ระบบจัดการประวัติ EMS • Local-first • v${APP_VERSION}</p></div></div><div class="top-actions"><span class="status">ฐานข้อมูลพร้อมใช้งาน</span><button class="btn small" data-tab="backup">สำรองข้อมูล</button></div></header>${navMarkup()}${noticeMarkup()}<main>${content}</main><footer class="footer-note">EMS Office Pro ${APP_VERSION} • เก็บข้อมูลบนอุปกรณ์ของคุณ • สำรองข้อมูลเป็นประจำ</footer></div>${modalMarkup()}`;
  if (state.tab === 'assistant') {
    const messages = document.getElementById('chat-messages');
    if (messages) messages.scrollTop = messages.scrollHeight;
  }
}

async function refresh() {
  state.records = await getAllRecords();
  state.chats = await getChats();
  state.audit = await getAudit(100);
  state.storage = await getStorageEstimate();
  render();
}

function openRecordModal(mode, record = {}) { state.modal = { mode, record }; render(); }

async function handleFile(file) {
  if (!file) return;
  state.busy = true; note(`กำลังอ่านไฟล์ ${file.name} …`, ''); render();
  try {
    const result = await importFile(file);
    const seenTrackings = new Set(state.records.map((saved) => normalizeTracking(saved.tracking)).filter(Boolean));
    const rows = (result.rows || []).map((row) => {
      const normalized = normalizeTracking(row.tracking);
      const duplicate = Boolean(normalized && seenTrackings.has(normalized));
      if (normalized) seenTrackings.add(normalized);
      return { ...row, warnings: [...new Set([...(row.warnings || []), ...(duplicate ? ['พบเลขติดตามซ้ำกับข้อมูลเดิมหรือซ้ำภายในไฟล์นำเข้า'] : [])])] };
    });
    const unclassified = (result.unclassified || []).map((item) => ({
      date: '', company: '', tracking: '', recipient: '', companyAddress: '', recipientAddress: '', cost: '',
      note: item.rawText, rawText: item.rawText, source: 'unclassified', sourceFile: file.name,
      sourceLocation: item.sourceLocation, warnings: [`${item.reason || 'จำแนกข้อมูลไม่ได้'} — เก็บข้อความต้นฉบับไว้`], confidence: 'low'
    }));
    state.staged = { ...result, fileName: file.name, rows, unclassified };
    note(`อ่านไฟล์สำเร็จ: พบ ${rows.length + unclassified.length} แถว`, 'success');
    state.tab = 'import';
  } catch (error) {
    note(`อ่านไฟล์ไม่สำเร็จ: ${error.message || error}`, 'error');
  } finally { state.busy = false; render(); }
}

async function saveImport() {
  if (!state.staged) return;
  const all = [...state.staged.rows, ...state.staged.unclassified];
  if (!all.length) return;
  const warnings = all.filter((row) => row.warnings?.length).length;
  const approved = confirm(`ยืนยันบันทึก ${all.length} รายการ?\nมี ${warnings} รายการที่มีคำเตือน\nข้อมูลจะถูกบันทึกลงฐานข้อมูลในอุปกรณ์นี้`);
  if (!approved) return;
  try {
    const records = all.map((row) => makeRecord({ ...row, sourceFile: row.sourceFile || state.staged.fileName }));
    await saveRecords(records);
    state.staged = null;
    note(`บันทึกข้อมูล ${records.length} รายการเรียบร้อย`, 'success');
    await refresh();
  } catch (error) { note(`บันทึกไม่สำเร็จ: ${error.message}`, 'error'); render(); }
}

async function downloadBlob(blob, filename) {
  try {
    const { Capacitor } = await import('@capacitor/core');
    if (Capacitor.isNativePlatform()) {
      const [{ Filesystem, Directory }, { Share }] = await Promise.all([
        import('@capacitor/filesystem'), import('@capacitor/share')
      ]);
      const bytes = new Uint8Array(await blob.arrayBuffer());
      let binary = '';
      for (let offset = 0; offset < bytes.length; offset += 0x8000) {
        binary += String.fromCharCode(...bytes.subarray(offset, offset + 0x8000));
      }
      const base64 = btoa(binary);
      const file = await Filesystem.writeFile({ path: filename, data: base64, directory: Directory.Cache, recursive: true });
      await Share.share({ title: filename, url: file.uri, dialogTitle: 'บันทึกหรือแชร์ไฟล์' });
      return;
    }
  } catch (error) {
    // Fall back to the browser download API when running outside a native Capacitor shell.
    if (error?.message?.includes('Share')) console.warn('Native share is unavailable; using browser download.', error);
  }
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url; anchor.download = filename; anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

async function backup() {
  const payload = await exportBackup();
  await downloadBlob(new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json;charset=utf-8' }), `EMS-Office-Pro-Backup-${new Date().toISOString().slice(0, 10)}.json`);
  note('สร้างไฟล์สำรองข้อมูลแล้ว', 'success');
}

async function exportExcel() {
  const bytes = exportWorkbook(state.records);
  await downloadBlob(new Blob([bytes], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }), `EMS-Office-Pro-Records-${new Date().toISOString().slice(0, 10)}.xlsx`);
  note('เตรียมไฟล์ Excel สำหรับบันทึกแล้ว', 'success');
}

async function sendChat(question) {
  const value = String(question || '').trim();
  if (!value || state.busy) return;
  if (state.assistantMode !== 'local') {
    const sendsRecords = /(ems|พัสดุ|เลข|บริษัท|ลูกค้า|ผู้รับ|จำนวน|ส่ง|ขนส่ง|ค้นหา|ประวัติ)/i.test(value);
    const detail = sendsRecords ? 'คำถามและบริบทประวัติ EMS สูงสุด 500 รายการล่าสุด' : 'ข้อความคำถาม';
    if (!confirm(`กำลังส่ง${detail}ไปยัง AI endpoint ที่ตั้งค่าไว้ (${state.assistantEndpoint}) เพื่อสร้างคำตอบ คุณยืนยันหรือไม่?`)) return;
  }
  state.busy = true;
  const history = state.chats.slice(-20).map(({ role, content }) => ({ role, content }));
  await saveChat({ role: 'user', content: value });
  state.chats = await getChats(); render();
  try {
    const result = await askAssistant(value, state.records, {
      mode: state.assistantMode, endpoint: state.assistantEndpoint,
      model: state.assistantModel, apiKey: state.apiKey, history
    });
    let content = result.answer || 'ไม่มีข้อความตอบกลับ';
    if (result.warning) content += `\n\nหมายเหตุ: ${result.warning}`;
    if (result.records?.length) content += `\n\n${result.records.slice(0, 10).map((r, i) => `${i + 1}. ${r.date || 'ไม่ระบุวันที่'} | ${r.company || 'ไม่ระบุบริษัท'} | ${r.tracking || 'ไม่มีเลข EMS'} | ${r.recipient || 'ไม่ระบุผู้รับ'}`).join('\n')}`;
    if (result.ranking?.length) content += `\n\n${result.ranking.map(([name, count], i) => `${i + 1}. ${name}: ${count} รายการ`).join('\n')}`;
    if (result.count !== undefined && result.type === 'count') content += `\nจำนวน: ${result.count}`;
    await saveChat({ role: 'assistant', content });
  } catch (error) {
    await saveChat({ role: 'assistant', content: `เกิดข้อผิดพลาด: ${error.message}` });
  } finally {
    state.busy = false; state.chats = await getChats(); state.notice = ''; render();
  }
}

root.addEventListener('click', async (event) => {
  const target = event.target.closest('[data-tab],[data-action],[data-prompt]');
  if (!target) return;
  if (target.dataset.tab) { state.tab = target.dataset.tab; state.notice = ''; render(); return; }
  if (target.dataset.prompt) { await sendChat(target.dataset.prompt); return; }
  const action = target.dataset.action;
  try {
    if (action === 'add-record') openRecordModal('add');
    else if (action === 'edit-record') {
      const record = state.records.find((r) => r.id === target.dataset.id);
      if (record) openRecordModal('edit', record);
    } else if (action === 'view-record') {
      const record = state.records.find((r) => r.id === target.dataset.id);
      if (record) openRecordModal('view', record);
    } else if (action === 'close-modal') {
      if (target === event.target || target.tagName === 'BUTTON') { state.modal = null; render(); }
    } else if (action === 'delete-record') {
      const record = state.records.find((r) => r.id === target.dataset.id);
      if (record && confirm(`ยืนยันลบรายการ ${record.tracking || record.company || ''} ?`)) {
        await deleteRecord(record.id); note('ลบรายการแล้ว', 'success'); await refresh();
      }
    } else if (action === 'save-import') await saveImport();
    else if (action === 'clear-import') { state.staged = null; state.notice = ''; render(); }
    else if (action === 'backup-json') { await backup(); render(); }
    else if (action === 'export-xlsx') {
      await exportExcel(); render();
    } else if (action === 'clear-chat') {
      if (confirm('ล้างประวัติการสนทนาทั้งหมดหรือไม่?')) {
        const { clearChats } = await import('./database.js'); await clearChats(); state.chats = []; render();
      }
    } else if (action === 'clear-records') {
      if (confirm('คำเตือน: การลบนี้ไม่สามารถย้อนกลับได้ กรุณาสำรองข้อมูลก่อน\nยืนยันลบประวัติทั้งหมดหรือไม่?')) {
        const { clearRecords } = await import('./database.js'); await clearRecords(); note('ลบประวัติทั้งหมดแล้ว', 'success'); await refresh();
      }
    } else if (action === 'save-settings') {
      state.assistantMode = document.getElementById('assistant-mode').value;
      state.assistantEndpoint = document.getElementById('ai-endpoint').value.trim();
      state.assistantModel = document.getElementById('ai-model').value.trim();
      state.apiKey = document.getElementById('ai-key').value.trim();
      await Promise.all([
        setSetting('assistantMode', state.assistantMode),
        setSetting('assistantEndpoint', state.assistantEndpoint),
        setSetting('assistantModel', state.assistantModel)
      ]);
      note('บันทึกการตั้งค่าแล้ว (API key เก็บไว้เฉพาะหน้านี้และไม่บันทึกถาวร)', 'success'); render();
    } else if (action === 'test-ai') {
      state.assistantMode = document.getElementById('assistant-mode').value;
      state.assistantEndpoint = document.getElementById('ai-endpoint').value.trim();
      state.assistantModel = document.getElementById('ai-model').value.trim();
      state.apiKey = document.getElementById('ai-key').value.trim();
      state.tab = 'assistant';
      await sendChat('สวัสดี ทดสอบการเชื่อมต่อและแนะนำตัวสั้น ๆ');
    }
  } catch (error) { note(`ดำเนินการไม่สำเร็จ: ${error.message || error}`, 'error'); render(); }
});

root.addEventListener('input', (event) => {
  if (event.target.id === 'record-search') {
    const cursor = event.target.selectionStart;
    state.query = event.target.value; render();
    const input = document.getElementById('record-search'); input?.focus(); input?.setSelectionRange(cursor, cursor);
  }
});

root.addEventListener('change', async (event) => {
  if (event.target.id === 'import-file') await handleFile(event.target.files?.[0]);
  if (event.target.id === 'backup-file') {
    const file = event.target.files?.[0]; if (!file) return;
    try {
      const payload = JSON.parse(await file.text());
      const replace = confirm('ต้องการแทนที่ข้อมูลเดิมทั้งหมดด้วยไฟล์สำรองหรือไม่?\nกด OK = แทนที่ข้อมูลเดิม\nกด Cancel = รวมข้อมูลเข้ากับข้อมูลเดิม');
      if (replace && !confirm('ยืนยันอีกครั้ง: แทนที่ประวัติและบทสนทนาเดิมทั้งหมด?')) return;
      const result = await restoreBackup(payload, { replace });
      note(`กู้คืนสำเร็จ ${result.records} รายการ`, 'success'); await refresh();
    } catch (error) { note(`กู้คืนไม่สำเร็จ: ${error.message}`, 'error'); render(); }
  }
});

root.addEventListener('submit', async (event) => {
  if (event.target.id === 'record-form') {
    event.preventDefault();
    const form = event.target;
    const data = Object.fromEntries(new FormData(form).entries());
    const previous = state.records.find((r) => r.id === form.dataset.id);
    try {
      const normalizedTracking = normalizeTracking(data.tracking);
      const duplicate = Boolean(normalizedTracking && state.records.some((item) => item.id !== previous?.id && normalizeTracking(item.tracking) === normalizedTracking));
      const keepWarnings = (previous?.warnings || []).filter((warning) => !String(warning).startsWith('รูปแบบเลขติดตาม'));
      const warnings = [...keepWarnings, ...trackingWarnings(data.tracking), ...(duplicate ? ['พบเลขติดตามซ้ำกับรายการอื่นในฐานข้อมูล'] : [])];
      const record = makeRecord({ ...previous, ...data, id: previous?.id || createId(), source: previous?.source || 'manual', warnings }, new Date(), { strictCost: true });
      await saveRecord(record); state.modal = null; note('บันทึกข้อมูลแล้ว', 'success'); await refresh();
    } catch (error) { note(`บันทึกไม่สำเร็จ: ${error.message}`, 'error'); render(); }
  }
  if (event.target.id === 'chat-form') {
    event.preventDefault(); const input = document.getElementById('chat-input'); const value = input?.value;
    if (value) await sendChat(value);
  }
});

async function init() {
  try {
    await openDatabase();
    if (navigator.storage?.persist) navigator.storage.persist().catch(() => false);
    [state.assistantMode, state.assistantEndpoint, state.assistantModel] = await Promise.all([
      getSetting('assistantMode', 'local'), getSetting('assistantEndpoint', 'http://127.0.0.1:11434'), getSetting('assistantModel', 'qwen2.5:7b')
    ]);
    await refresh();
  } catch (error) {
    root.innerHTML = `<div class="app-shell"><section class="panel"><h2>เปิดฐานข้อมูลไม่สำเร็จ</h2><div class="notice error-notice">${esc(error.message)}</div><p class="small-text muted">ลองเปิดแอปในเบราว์เซอร์รุ่นใหม่ และตรวจสอบว่าอุปกรณ์อนุญาตให้เก็บข้อมูลเว็บไซต์</p><button class="btn" onclick="location.reload()">ลองใหม่</button></section></div>`;
  }
}

init();
