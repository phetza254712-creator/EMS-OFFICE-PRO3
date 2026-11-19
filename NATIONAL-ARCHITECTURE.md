# แนวทางยกระดับสู่ระบบ EMS ระดับองค์กร/หลายจังหวัด/ระดับประเทศ

เอกสารนี้เป็นสถาปัตยกรรมเป้าหมาย ไม่ใช่คุณสมบัติที่ติดตั้งอยู่ในแอป Local-first รุ่น 4.0.0

## 1. สถาปัตยกรรมเป้าหมาย

```text
Windows / Android / Web clients
        │  HTTPS + device/session identity
        ▼
API Gateway / WAF / Rate limits
        │
        ├── Identity & Access (OIDC, MFA, RBAC)
        ├── EMS Record API (versioned, idempotent)
        ├── Import service (staging, parser, human approval)
        ├── Search & Reporting service
        ├── Sync service (offline queue, conflict resolution)
        └── Audit service (append-only)
                │
                ├── PostgreSQL primary + HA replica
                ├── Object storage for originals and backups
                ├── Queue for long OCR/import jobs
                ├── Central audit/security log storage
                └── Metrics, traces, alerts and dashboards
```

## 2. หลักข้อมูล

- กำหนด `organization_id`, `branch_id`, `created_by`, `updated_by`, `record_version`, `created_at`, `updated_at` ในทุกระเบียนที่เกี่ยวข้อง
- ทุก API ที่เขียนข้อมูลต้องรองรับ idempotency key เพื่อป้องกันการบันทึกซ้ำเมื่อเครือข่ายหลุดแล้วส่งซ้ำ
- กำหนดนโยบายความซ้ำของเลข EMS ให้เจ้าของกระบวนการยืนยันก่อน ไม่ควรสมมติว่าเลขติดตามทั่วประเทศไม่ซ้ำกันโดยไม่มี carrier/period/scope
- เก็บเอกสารต้นฉบับใน object storage พร้อม checksum และตำแหน่งอ้างอิง หลีกเลี่ยงการเก็บไฟล์ภาพขนาดใหญ่ในตารางหลัก
- การนำเข้าต้องผ่าน staging: parse → validate → duplicate review → user approval → commit; ห้าม auto-commit โดย AI
- รองรับ versioning และ conflict resolution เมื่อผู้ใช้แก้ไข offline บนอุปกรณ์หลายเครื่อง

## 3. ความปลอดภัยและการกำกับดูแล

- ใช้ HTTPS/TLS สำหรับทุกการเชื่อมต่อ และ encryption at rest สำหรับฐานข้อมูล/ไฟล์สำรอง
- OIDC/SSO, MFA, RBAC และ scope ตามองค์กร/สาขา/บทบาท
- จัดเก็บ audit log แบบ append-only และแยกจากฐานข้อมูลธุรกรรม พร้อม alert เมื่อมีการ export/delete จำนวนมาก
- Secrets/API keys ต้องอยู่ใน secret manager ไม่ฝังในแอปหรือ repository
- แบ่งประเภทข้อมูล กำหนด retention, deletion, access review, consent และขั้นตอนรับมือเหตุข้อมูลรั่วไหลตามนโยบายองค์กรและกฎหมายที่เกี่ยวข้อง
- ทำ threat modeling, SAST, dependency scanning, DAST และ independent penetration test ก่อน production

## 4. ความทนทานและปฏิบัติการ

- กำหนด RPO/RTO กับเจ้าของระบบก่อนเลือก topology และรอบสำรอง
- สำรองแบบ full + incremental/PITR และทดสอบ restore ตามรอบที่กำหนด
- ใช้ queue สำหรับ OCR/นำเข้าจำนวนมาก พร้อม retry, dead-letter queue และ progress tracking
- กำหนด load profile จากจำนวนผู้ใช้/รายการ/ไฟล์จริง แล้วทำ load, soak และ failover test
- มี health checks, metrics, structured logs, distributed tracing, alerting และ incident runbook
- ใช้ staged rollout/canary, database migration ที่ย้อนกลับได้ และ release signing สำหรับ APK/Windows

## 5. เกณฑ์ก่อนเปิดใช้งานจริงในวงกว้าง

1. เจ้าของข้อมูลอนุมัติ data model, retention และสิทธิ์การเข้าถึง
2. ระบบกลางและการซิงก์ผ่านการทดสอบ multi-user concurrency และ conflict scenarios
3. ผ่าน security review และ penetration testing โดยผู้ตรวจอิสระ
4. ผ่าน restore drill และ failover drill ตาม RPO/RTO ที่ตกลงกัน
5. มีผู้ดูแลระบบ, incident response, backup owner และ release owner ชัดเจน
6. ทดสอบกับไฟล์จริงที่หลากหลายและได้ sign-off จากผู้ใช้งานแต่ละหน่วยงาน

แอปเวอร์ชัน 4.0.0 ปัจจุบันเป็นฐาน Local-first สำหรับทดสอบและใช้งานบนอุปกรณ์เดี่ยว/การทดลองวงจำกัด ยังไม่มี backend กลาง, multi-tenant auth, cross-device sync หรือการรับรองด้านความปลอดภัยระดับประเทศ
