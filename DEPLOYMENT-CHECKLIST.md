# Deployment checklist

- [ ] Review all imported preview rows before confirming a batch.
- [ ] Confirm exact tracking-number conventions for the organization's EMS carrier workflow.
- [ ] Run `npm ci`, `npm test`, `npm run build`.
- [ ] Test import on representative Excel, CSV, DOCX, PDF and image samples.
- [ ] Test backup export and restore on a separate device.
- [ ] Verify storage retention after force close/reopen and device restart.
- [ ] Define who may access devices and exported backups.
- [ ] Do not connect cloud AI until the data controller approves what may be transmitted.
- [ ] For multi-site use, implement and security-review a central backend before rollout.
