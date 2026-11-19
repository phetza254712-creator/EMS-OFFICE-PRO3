import { createId } from './core.js';

const DB_NAME = 'ems-office-pro-national';
const DB_VERSION = 1;
const STORES = Object.freeze({ records: 'records', chats: 'chats', audit: 'audit', settings: 'settings' });

let databasePromise;

function requestResult(request) {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error('IndexedDB request failed'));
  });
}

export function openDatabase() {
  if (databasePromise) return databasePromise;
  databasePromise = new Promise((resolve, reject) => {
    if (!globalThis.indexedDB) {
      reject(new Error('อุปกรณ์นี้ไม่รองรับ IndexedDB จึงไม่สามารถเปิดฐานข้อมูลถาวรได้'));
      return;
    }
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORES.records)) {
        const store = db.createObjectStore(STORES.records, { keyPath: 'id' });
        store.createIndex('tracking', 'tracking', { unique: false });
        store.createIndex('company', 'company', { unique: false });
        store.createIndex('date', 'date', { unique: false });
        store.createIndex('updatedAt', 'updatedAt', { unique: false });
      }
      if (!db.objectStoreNames.contains(STORES.chats)) db.createObjectStore(STORES.chats, { keyPath: 'id' });
      if (!db.objectStoreNames.contains(STORES.audit)) db.createObjectStore(STORES.audit, { keyPath: 'id' });
      if (!db.objectStoreNames.contains(STORES.settings)) db.createObjectStore(STORES.settings, { keyPath: 'key' });
    };
    request.onsuccess = () => {
      const db = request.result;
      db.onversionchange = () => { db.close(); databasePromise = undefined; };
      resolve(db);
    };
    request.onerror = () => reject(request.error || new Error('เปิดฐานข้อมูลไม่สำเร็จ'));
    request.onblocked = () => reject(new Error('ฐานข้อมูลกำลังถูกใช้งานในอีกหน้าต่างหนึ่ง กรุณาปิดหน้าต่างเก่าแล้วลองใหม่'));
  });
  return databasePromise;
}

async function withStore(storeName, mode, operation) {
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, mode);
    const store = tx.objectStore(storeName);
    let result;
    try { result = operation(store); } catch (error) { reject(error); return; }
    tx.oncomplete = () => resolve(result?.result);
    tx.onerror = () => reject(tx.error || new Error('Database transaction failed'));
    tx.onabort = () => reject(tx.error || new Error('Database transaction aborted'));
  });
}

export async function getAllRecords() {
  const result = await withStore(STORES.records, 'readonly', (store) => store.getAll());
  return (result || []).sort((a, b) => String(b.date || '').localeCompare(String(a.date || '')) || String(b.createdAt).localeCompare(String(a.createdAt)));
}

export async function saveRecord(record) {
  await withStore(STORES.records, 'readwrite', (store) => store.put(record));
  await addAudit('record.save', { id: record.id, tracking: record.tracking });
  return record;
}

export async function saveRecords(records) {
  if (!Array.isArray(records) || records.length === 0) return 0;
  await withStore(STORES.records, 'readwrite', (store) => {
    for (const record of records) store.put(record);
  });
  await addAudit('record.import', { count: records.length, ids: records.slice(0, 100).map((r) => r.id) });
  return records.length;
}

export async function deleteRecord(id) {
  await withStore(STORES.records, 'readwrite', (store) => store.delete(id));
  await addAudit('record.delete', { id });
}

export async function clearRecords() {
  const existing = await getAllRecords();
  await withStore(STORES.records, 'readwrite', (store) => store.clear());
  await addAudit('record.clear', { count: existing.length });
  return existing.length;
}

export async function getChats(limit = 200) {
  const rows = await withStore(STORES.chats, 'readonly', (store) => store.getAll());
  return (rows || []).sort((a, b) => a.createdAt.localeCompare(b.createdAt)).slice(-limit);
}

export async function saveChat(message) {
  const entry = { id: message.id || createId(), ...message, createdAt: message.createdAt || new Date().toISOString() };
  await withStore(STORES.chats, 'readwrite', (store) => store.put(entry));
  return entry;
}

export async function clearChats() {
  await withStore(STORES.chats, 'readwrite', (store) => store.clear());
}

export async function addAudit(action, details = {}) {
  const entry = { id: createId(), action, details, createdAt: new Date().toISOString() };
  await withStore(STORES.audit, 'readwrite', (store) => store.put(entry));
  return entry;
}

export async function getAudit(limit = 500) {
  const rows = await withStore(STORES.audit, 'readonly', (store) => store.getAll());
  return (rows || []).sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, limit);
}

export async function getSetting(key, fallback = null) {
  const row = await withStore(STORES.settings, 'readonly', (store) => store.get(key));
  return row ? row.value : fallback;
}

export async function setSetting(key, value) {
  await withStore(STORES.settings, 'readwrite', (store) => store.put({ key, value, updatedAt: new Date().toISOString() }));
}

export async function exportBackup() {
  const [records, chats, audit] = await Promise.all([getAllRecords(), getChats(10000), getAudit(10000)]);
  return {
    schema: 'ems-office-pro-backup', version: 1, appVersion: '4.0.0',
    exportedAt: new Date().toISOString(), records, chats, audit
  };
}

export async function restoreBackup(payload, { replace = false } = {}) {
  if (!payload || payload.schema !== 'ems-office-pro-backup' || !Array.isArray(payload.records)) {
    throw new Error('ไฟล์สำรองไม่ถูกต้องหรือไม่ใช่ไฟล์ EMS Office Pro');
  }
  if (replace) {
    await Promise.all([
      withStore(STORES.records, 'readwrite', (store) => store.clear()),
      withStore(STORES.chats, 'readwrite', (store) => store.clear())
    ]);
  }
  const records = payload.records.filter((r) => r && typeof r.id === 'string' && r.id);
  const chats = Array.isArray(payload.chats) ? payload.chats.filter((c) => c && typeof c.id === 'string' && c.id) : [];
  const audit = Array.isArray(payload.audit) ? payload.audit.filter((item) => item && typeof item.id === 'string' && item.id) : [];
  await Promise.all([
    withStore(STORES.records, 'readwrite', (store) => records.forEach((r) => store.put(r))),
    withStore(STORES.chats, 'readwrite', (store) => chats.forEach((c) => store.put(c))),
    withStore(STORES.audit, 'readwrite', (store) => audit.forEach((item) => store.put(item)))
  ]);
  await addAudit('backup.restore', { records: records.length, chats: chats.length, audit: audit.length, replace });
  return { records: records.length, chats: chats.length, audit: audit.length };
}

export async function getStorageEstimate() {
  if (!navigator.storage?.estimate) return null;
  try { return await navigator.storage.estimate(); } catch { return null; }
}
