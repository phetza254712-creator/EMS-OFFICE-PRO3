# EMS Office Pro 4.0 — New foundation for future national-scale deployment

ระบบจัดการประวัติพัสดุ EMS แบบ Local-first สำหรับ Windows, Android และ Web ใช้ฐานข้อมูล IndexedDB ภายในอุปกรณ์ ไม่ส่งข้อมูลออกโดยอัตโนมัติ

> **สถานะที่ต้องเข้าใจให้ตรงกัน:** โครงการนี้เป็นฐานโปรแกรมใหม่ที่พร้อมให้ทดสอบใช้งานในอุปกรณ์และพัฒนาต่อ ไม่ใช่ระบบศูนย์กลางระดับประเทศที่ผ่านการรับรองหรือ security audit แล้ว การใช้งานหลายสาขา/หลายผู้ใช้พร้อมกันต้องมี backend, authentication, role-based access, central audit, encryption/key management, backup policy, monitoring, load tests และ penetration tests เพิ่มเติม

## สิ่งที่มีในรุ่นนี้

- หน้าภาพรวม ประวัติ EMS และค้นหาจากบริษัท เลขติดตาม ผู้รับ หมายเหตุ และข้อความต้นฉบับ
- เพิ่ม แก้ไข ลบ และดูรายละเอียดรายการ พร้อมบันทึกเหตุการณ์พื้นฐาน
- นำเข้า Excel / XLS / XLSM / ODS / CSV ทุกชีต และเก็บตำแหน่งแถวต้นฉบับ
- นำเข้า Word DOCX, PDF text, PDF ภาพสแกนด้วย OCR และภาพด้วย Tesseract (ไทย + อังกฤษ); การเรียก OCR ครั้งแรกอาจต้องดาวน์โหลดโมเดลภาษา
- จำแนกคอลัมน์จากหัวตารางและรูปแบบค่าจริง เช่น วันที่ไทย พ.ศ., เลขติดตาม, จำนวนเงิน, บริษัท และที่อยู่
- เลขติดตามที่ผิดรูปแบบจะถูกเก็บไว้พร้อมคำเตือน ไม่ปฏิเสธหรือทิ้งทั้งแถว
- แถวที่จำแนกไม่ได้จะถูกเก็บเป็นรายการตรวจสอบพร้อมข้อความต้นฉบับ
- ตรวจเลขติดตามซ้ำกับข้อมูลเดิมก่อนบันทึก แต่ไม่ลบหรือข้ามรายการซ้ำอัตโนมัติ
- หน้าผู้ช่วยข้อมูลภายในสำหรับค้นหาเลข EMS, จำนวนรายการ และจัดอันดับบริษัท
- รองรับการเชื่อมต่อ Ollama ในเครื่อง หรือ API แบบ OpenAI-compatible (เป็นตัวเลือกและขึ้นกับ CORS/ผู้ให้บริการ; บน Android ต้องใส่ IP/URL ของเครื่อง Ollama ที่โทรศัพท์เข้าถึงได้ ไม่ใช่ 127.0.0.1 ของตัวโทรศัพท์)
- สนทนาเก็บใน IndexedDB, ส่งออก/กู้คืน JSON, ส่งออก Excel พร้อมบันทึก/แชร์ไฟล์ผ่าน native share sheet บน Android
- Windows (Electron) และ Android (Capacitor) ใช้ web source ชุดเดียวกัน
- มี GitHub Actions สำหรับทดสอบและสร้าง Web, Android debug APK และ Windows installer

## ตัวอย่าง Excel ที่ใช้ทดสอบ

```text
วัน เดือน ปี | ชื่อบริษัท/ลูกค้า | เลขEMS
1/2/2569    | logisticdigital   | EE 555 555 5
2/2/2569    | oilion            | EE 666 666 6
```

ผลที่คาดหวัง: 2 รายการ, วันที่ 2026-02-01 และ 2026-02-02, บริษัทถูกต้อง และเลขติดตามถูกเก็บตามต้นฉบับพร้อมคำเตือนเรื่องรูปแบบที่ไม่มาตรฐาน

## เริ่มต้นบนคอมพิวเตอร์

ต้องติดตั้ง Node.js 22 และ npm ก่อน และต้องเชื่อมต่ออินเทอร์เน็ตเพื่อดาวน์โหลด dependencies ในครั้งแรก

```bash
npm install
npm test
npm run dev
```

เปิด URL ที่ Vite แสดงในเบราว์เซอร์ คำสั่ง `npm install` จะสร้าง `package-lock.json`; ควรเก็บไฟล์นี้ไว้ใน repository เพื่อให้การติดตั้งครั้งต่อไปทำซ้ำได้แม่นยำขึ้น

### สร้าง Windows installer

```bash
npm install
npm test
npm run desktop:dist
```

ไฟล์ติดตั้งจะอยู่ใน `release/`

### สร้าง Android APK

```bash
npm install
npm run build
npx cap add android
npx cap sync android
```

เปิดโฟลเดอร์ `android` ด้วย Android Studio และ Build APK หรือใช้ GitHub Actions เพื่อสร้าง debug APK อัตโนมัติ

## GitHub Actions

อัปโหลดโฟลเดอร์นี้ไปยัง repository ใหม่ แล้วเปิดแท็บ **Actions** และรัน workflow `Build EMS Office Pro` หรือ push เข้า branch `main` จะได้ artifacts:

- `ems-office-pro-web`
- `ems-office-pro-android-debug`
- `ems-office-pro-windows`

Artifacts ที่สร้างจาก workflow เป็นไฟล์ทดสอบ/ติดตั้ง ไม่ใช่ Android release ที่เซ็นด้วย production signing key

## การรักษาข้อมูล

- ฐานข้อมูลอยู่ใน IndexedDB ของโปรไฟล์แอป/เบราว์เซอร์นั้น ๆ การถอนการติดตั้ง ล้างข้อมูลแอป หรือเสียอุปกรณ์อาจทำให้ข้อมูลหายได้
- ต้องดาวน์โหลดไฟล์สำรอง JSON เป็นประจำและเก็บนอกอุปกรณ์
- ไฟล์สำรองมีข้อมูลทั้งหมด ห้ามส่งให้บุคคลที่ไม่มีสิทธิ์
- API key ของ AI ออนไลน์ไม่ถูกบันทึกลงฐานข้อมูล ก่อนส่งคำถามไปยัง AI ระยะไกลแอปจะแจ้งขออนุญาตทุกครั้ง และคำถามเกี่ยวกับ EMS จะส่งบริบทประวัติสูงสุด 500 รายการล่าสุดไปยัง endpoint ที่ผู้ใช้เลือก
- หลีกเลี่ยงการใช้ AI ออนไลน์กับข้อมูลส่วนบุคคล/ข้อมูลอ่อนไหวโดยไม่มีนโยบายองค์กรอนุมัติ

## ความพร้อมระดับองค์กร/ระดับประเทศที่ยังต้องทำ

1. Backend กลางที่มี API versioning, schema migrations, transaction และ idempotency
2. ผู้ใช้/บทบาท/สิทธิ์, MFA, session lifecycle และ audit log ส่วนกลาง
3. Encryption at rest และ in transit, key rotation, secrets management
4. การซิงก์ข้ามอุปกรณ์พร้อม conflict resolution และ offline queue
5. Backup/restore ที่ทดสอบกู้คืนจริง, retention policy และ disaster recovery
6. Monitoring, error reporting, operational dashboards และ alerting
7. ทดสอบข้อมูลจำนวนมาก, concurrency, load, security และ penetration testing
8. นโยบาย PDPA/การจัดชั้นข้อมูล/ระยะเวลาเก็บรักษา/การลบข้อมูล
9. Android production signing, Windows code signing, release channels และ rollback

## การทดสอบ

ดูสถานะการทดสอบ/Build ใน `docs/BUILD-STATUS.md` ด้วย การเตรียมไฟล์ชุดนี้ไม่สามารถดาวน์โหลด dependencies จาก npm registry ได้ จึงยังไม่ได้ยืนยันผล Vite/Electron/Android Build

รันทดสอบ parser และ validation ด้วย `npm test` ก่อนใช้งานทุกครั้ง การทดสอบผ่านในสภาพแวดล้อมหนึ่งไม่ใช่การรับรองว่าใช้งานได้กับทุก workbook, scanner หรืออุปกรณ์จริง
