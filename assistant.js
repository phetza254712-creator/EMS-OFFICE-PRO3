import { analyzeQuestion } from './core.js';

const SYSTEM_PROMPT = `คุณคือผู้ช่วยของ EMS Office Pro ตอบภาษาไทยเป็นหลัก ตอบได้ทั้งเรื่องทั่วไปและงานจัดการพัสดุ EMS
เมื่อมีข้อมูลฐานข้อมูลแนบมา ให้ใช้ข้อมูลนั้นเป็นแหล่งข้อเท็จจริงสำหรับคำถามเกี่ยวกับประวัติพัสดุเท่านั้น
ห้ามแต่งเลข EMS ชื่อบริษัท วันที่ หรือยอดเงิน หากไม่มีข้อมูลให้บอกว่าไม่พบ
คุณเป็นผู้ช่วยแบบอ่านอย่างเดียว ห้ามอ้างว่าบันทึก แก้ไข หรือลบข้อมูลแล้ว และห้ามสั่งการเปลี่ยนแปลงฐานข้อมูล
หากข้อมูลมีความกำกวม ให้แจ้งข้อจำกัดและขอให้ผู้ใช้ตรวจสอบก่อนดำเนินการใด ๆ`;

export async function askAssistant(question, records, config = {}) {
  const mode = config.mode || 'local';
  if (mode === 'ollama' || mode === 'openai') {
    const remote = await askRemote(question, records, config);
    return { ...remote, mode };
  }
  const result = analyzeQuestion(question, records);
  return { ...result, mode: 'local' };
}

async function askRemote(question, records, config) {
  const asksAboutRecords = /(ems|พัสดุ|เลข|บริษัท|ลูกค้า|ผู้รับ|จำนวน|ส่ง|ขนส่ง|ค้นหา|ประวัติ)/i.test(question);
  const safeRecords = (asksAboutRecords ? records.slice(-500) : []).map((record) => ({
    date: record.date, company: record.company, tracking: record.tracking,
    recipient: record.recipient, cost: record.cost, note: record.note
  }));
  const context = `ข้อมูลฐานข้อมูล EMS ที่อนุญาตให้อ่าน (สูงสุด 500 รายการล่าสุด):\n${JSON.stringify(safeRecords)}`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 60000);
  try {
    if (config.mode === 'ollama') {
      const base = (config.endpoint || 'http://127.0.0.1:11434').replace(/\/$/, '');
      const history = (config.history || []).filter((item) => ['user', 'assistant'].includes(item.role) && typeof item.content === 'string').slice(-20);
      const response = await fetch(`${base}/api/chat`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, signal: controller.signal,
        body: JSON.stringify({ model: config.model || 'qwen2.5:7b', stream: false, messages: [
          { role: 'system', content: SYSTEM_PROMPT }, { role: 'system', content: context }, ...history, { role: 'user', content: question }
        ] })
      });
      if (!response.ok) throw new Error(`Ollama ตอบกลับ HTTP ${response.status}`);
      const data = await response.json();
      const answer = data.message?.content?.trim();
      if (!answer) throw new Error('Ollama ไม่ได้ส่งข้อความตอบกลับ');
      return { type: 'ai', answer };
    }
    const endpoint = (config.endpoint || 'https://api.openai.com/v1').replace(/\/$/, '');
    if (!config.apiKey) throw new Error('กรุณาใส่ API key ในหน้าตั้งค่าเพื่อใช้ AI ออนไลน์');
    const history = (config.history || []).filter((item) => ['user', 'assistant'].includes(item.role) && typeof item.content === 'string').slice(-20);
    const response = await fetch(`${endpoint}/chat/completions`, {
      method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${config.apiKey}` },
      signal: controller.signal,
      body: JSON.stringify({ model: config.model || 'gpt-4o-mini', temperature: 0.2, messages: [
        { role: 'system', content: SYSTEM_PROMPT }, { role: 'system', content: context }, ...history, { role: 'user', content: question }
      ] })
    });
    if (!response.ok) throw new Error(`AI ออนไลน์ตอบกลับ HTTP ${response.status}`);
    const data = await response.json();
    const answer = data.choices?.[0]?.message?.content?.trim();
    if (!answer) throw new Error('AI ออนไลน์ไม่ได้ส่งข้อความตอบกลับ');
    return { type: 'ai', answer };
  } catch (error) {
    const fallback = analyzeQuestion(question, records);
    return { ...fallback, warning: `${error.name === 'AbortError' ? 'หมดเวลารอ AI' : error.message} — แสดงผลจากผู้ช่วยข้อมูลภายในแทน` };
  } finally {
    clearTimeout(timer);
  }
}
