# RD Checker Chrome Extension

ส่วนแรกของระบบช่วยดูใน Chrome Extension เพื่อเทียบข้อมูล RD

## วิธีการติดตั้ง

1. Open Chrome and go to `chrome://extensions/`
2. Enable "Developer mode" (top right)
3. Click "Load unpacked"
4. Select the `rd-checker` folder

## ฟีเจอร์

✅ Extract data from PDF:
   - RD Code (e.g., RD69-3M00166)
   - Completion Date (วันที่ดำเนินเสร็จ)
   - Software Version (16.0(9d))

✅ Extract data from website:
   - Timestamp from configuration page
   - Configuration data

✅ Compare data:
   - Check if completion date <= deadline (09-12-2568 10:23:00)
   - Check if software version = 16.0(9d)
   - Display: "COMPLETE" or "INCOMPLETE, fix [time/version]"

## โครงสร้างไฟล์

```
rd-checker/
├── manifest.json      - Chrome extension configuration
├── popup.html         - User interface
├── popup.css          - Styling
├── popup.js           - Main logic (PDF parsing, comparison)
├── background.js      - Background service worker
├── content.js         - Content script for website extraction
└── README.md          - This file
```

## การใช้งาน

1. **Extract PDF Data:**
   - Click on extension icon
   - Select PDF file
   - Click "Extract PDF Data"

2. **Extract Website Data:**
   - Enter website URL
   - Click "Extract Website Data"

3. **Compare Data:**
   - Click "Compare Data"
   - View results

## สถานะการเทียบ

- **COMPLETE**: ข้อมูลตรงตามเงื่อนไข
- **INCOMPLETE, fix time**: วันที่เกินกำหนด
- **INCOMPLETE, fix version**: เวอร์ชั่นไม่ตรงกัน

## Next Steps

- Improve PDF parsing accuracy
- Add support for Thai Buddhist year conversion
- Test with actual configuration page HTML
- Add ability to save/export results
