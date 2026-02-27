# RD Checker

RD Checker เป็นเครื่องมือช่วยตรวจงานเอกสาร/Log สำหรับงาน RD โดยประกอบด้วย 2 ส่วนหลัก:

1. **Chrome Extension** สำหรับดึงข้อมูลจาก PDF + ข้อมูลจากหน้าเว็บ แล้วเปรียบเทียบผล
2. **Native Updater (Windows)** สำหรับอัปเดตตัว Updater เอง และซิงก์ไฟล์โปรเจกต์จาก GitHub อัตโนมัติ

---

## เวอร์ชันปัจจุบัน

- Extension Version: `1.1.12`
- Native Updater Version: `1.1.12`
- Update Manifest Date: `2026-02-27`

ไฟล์ที่เป็นแหล่งอ้างอิงเวอร์ชัน:

- `manifest.json` (เวอร์ชัน Extension)
- `native-updater/Program.cs` (`CurrentVersion` ของ Updater)
- `updater/update-manifest.json` (เวอร์ชันล่าสุดสำหรับปล่อยอัปเดต)

---

## ฟีเจอร์หลัก

- โหมดตรวจงาน 4 แบบในหน้าเดียว (`ALL`, `SINGLE`, `IPPHONE`, `PDFCHECK`)
- รองรับการดึงข้อมูลจาก PDF และจากหน้าเว็บ (GUI/CLI)
- เปรียบเทียบผลแบบอัตโนมัติพร้อมสถานะสรุป
- มีโหมดไล่รายการจาก `pm_title.php` อัตโนมัติข้ามหลายหน้า
- Updater รองรับ:
  - ตรวจเวอร์ชันจาก GitHub Release + update-manifest
  - ดาวน์โหลดอัปเดตแบบ cache-busting
  - self-replace `.exe` แล้วรีสตาร์ตอัตโนมัติ
  - ซิงก์ไฟล์โปรเจกต์จาก branch `main` เมื่อเวอร์ชัน Updater ล่าสุดอยู่แล้ว

---

## โครงสร้างไฟล์สำคัญ

- `manifest.json`:
  กำหนดค่า Chrome Extension (version, permission, icon, script)
- `popup.html` / `popup.css` / `popup.js`:
  หน้า UI และ logic หลักของ RD Checker
- `pdf-extractor.js`, `data-parser.js`, `pm-pdf-check.js`:
  ตัวช่วยแยกข้อมูล PDF/Website และตรรกะตรวจงาน
- `theme.js`:
  จัดการสลับธีมในหน้า popup
- `background.js`:
  service worker ของ extension
- `content.js`:
  content script สำหรับดึงข้อมูลจากหน้าเว็บ
- `native-updater/Program.cs`:
  โค้ด C# ของโปรแกรมอัปเดต
- `RD-Checker-Updater-Setup.exe`:
  ตัวอัปเดตที่รันใช้งานจริงจากโฟลเดอร์โปรเจกต์
- `updater/update-manifest.json`:
  metadata เวอร์ชันอัปเดต
- `updater/RD-Checker-Updater-Setup.exe`:
  ไฟล์ updater ที่เผยแพร่ให้ตัวแอปดาวน์โหลด

---

## การติดตั้งและเริ่มใช้งาน Extension

1. เปิด Chrome ไปที่ `chrome://extensions`
2. เปิด `Developer mode`
3. กด `Load unpacked`
4. เลือกโฟลเดอร์โปรเจกต์นี้ (โฟลเดอร์ที่มี `manifest.json`)
5. กดไอคอน RD Checker เพื่อเปิดหน้าต่าง popup

หมายเหตุ:
- หากไฟล์โค้ดมีการเปลี่ยน ต้องกด `Reload` ที่หน้า `chrome://extensions` เพื่อให้โค้ดใหม่ทำงาน

---

## โหมดการทำงานใน RD Checker

เมื่อเปิด popup ใหม่ ระบบจะ **บังคับเริ่มที่โหมด `เช็คทั้งหมด (ALL)`** เสมอ

### 1) โหมด `เช็คทั้งหมด` (ALL)

ใช้สำหรับไล่งานจากหน้า `pm_title.php` หลายรายการแบบต่อเนื่อง

ลำดับ chain ต่อรายการ:

`pm_title -> pm_editcall_approve_device -> rack_detail_TOR -> router_product -> view_configuration`

วิธีใช้:

1. วางลิงก์ `pm_title.php?...` ในช่องของโหมดนี้
2. เลือกโหมด Compare (GUI/CLI)
3. กด `Compare (Chain 5 ขั้น)`
4. ระบบจะวนทีละรายการ พร้อมสร้างการ์ดผลเปรียบเทียบ
5. กด `Stop` ได้ระหว่างรัน

ผลลัพธ์:

- มีสรุปผลรวม + filter (`ทั้งหมด`, `ปกติ`, `ผิดปกติ`)
- แต่ละการ์ดจะแสดง URL chain และผล compare ของรายการนั้น

### 2) โหมด `เช็คแบบเดี่ยว` (SINGLE)

เหมาะกับการตรวจเคสเดียวแบบละเอียด

วิธีใช้:

1. วางไฟล์/URL PDF แล้วกด `Extract PDF Data`
2. เลือก `GUI` หรือ `CLI`
3. วาง URL หรือ path สำหรับ Log/Website แล้วกด `Extract Website Data`
4. กด `Compare Data`

หัวข้อ compare หลักที่แสดง:

1. Version Check
2. Time Check (ใบงาน + cfg)
3. Time Log Check
4. CRC Check
5. Detect "Clear counters"
6. Detect "Clear log"
7. LOG Picture (โหมด GUI เท่านั้น, ต้องตรวจรูปด้วยสายตา)

### 3) โหมด `เช็ครูป IP Phone` (IPPHONE)

ใช้ตรวจ flow รูป IP Phone และข้อมูลจาก PDF

ลำดับหลัก:

`pm_title -> pm_editcall_approve_device -> rack_detail_IP/TOR -> pic_ip_phone`

วิธีใช้:

1. วางลิงก์ `pm_title.php?...`
2. กด `เช็ครูป IP Phone`
3. ดูผลรายรายการ (มีตัวเลื่อนหน้าและปุ่มหยุด)

### 4) โหมด `เช็ค pdf` (PDFCHECK)

ใช้ตรวจงาน PDF แบบไล่รายการจาก `pm_title`

ลำดับหลัก:

`pm_title -> pm_editcall_approve_device -> rack_detail_TOR`

จุดตรวจเด่น:

- ตรวจความสอดคล้องเลข S/N หลายจุด
- ตรวจข้อมูลในใบงาน PDF
- สรุปผลพร้อม filter (`ทั้งหมด`, `ปกติ`, `ผิดปกติ`)

---

## การใช้งาน Native Updater

รันไฟล์ `RD-Checker-Updater-Setup.exe` ในโฟลเดอร์โปรเจกต์

ลำดับการทำงาน:

1. อ่านเวอร์ชันล่าสุดจาก 2 แหล่ง
   - GitHub Releases API
   - `updater/update-manifest.json`
2. เลือกแพ็กเกจที่มีเวอร์ชันสูงกว่า
3. ดาวน์โหลดไฟล์ไปที่ `%TEMP%\RDCheckerUpdater`
4. ถ้าไฟล์ที่ดาวน์โหลดเป็น `.exe`
   - ทำ self-replace ตัวเอง
   - รีสตาร์ต updater อัตโนมัติ
5. ถ้า Updater ปัจจุบันเป็นเวอร์ชันล่าสุดอยู่แล้ว
   - จะซิงก์ไฟล์โปรเจกต์จาก GitHub `main` ลงโฟลเดอร์ที่ติดตั้งต่อทันที

หมายเหตุสำคัญ:

- ระหว่าง sync repo จะ **ข้ามไฟล์ updater executable 2 จุด**
  - `RD-Checker-Updater-Setup.exe`
  - `updater/RD-Checker-Updater-Setup.exe`
- หลัง sync ไฟล์เสร็จ ถ้าใช้งานแบบ unpacked extension ให้กด `Reload` ที่ `chrome://extensions`

---

## อธิบายการอัปเดตแบบใช้งานจริง

กรณีที่ใช้งานจากโฟลเดอร์ที่ clone มาจาก GitHub:

1. เปิดโฟลเดอร์นั้น
2. รัน `RD-Checker-Updater-Setup.exe`
3. รอให้ขึ้นสถานะ sync/update จนเสร็จ
4. กลับไป Chrome แล้วกด Reload extension
5. เปิด RD Checker ใหม่

แนวทางตรวจว่าขึ้นเวอร์ชันถูกจริง:

- ดูจาก `manifest.json` (`version`)
- ดูจากหน้าต่าง Updater (`Installed` / `Latest`)
- ดูจาก `updater/update-manifest.json`

---

## ปัญหาที่พบบ่อยและวิธีแก้

### อาการ: Updater บอกล่าสุดแล้ว แต่หน้า Extension เหมือนเดิม

สาเหตุ:
- Chrome ยังถือโค้ดเก่าใน extension cache

วิธีแก้:
1. ไป `chrome://extensions`
2. กด `Reload` ที่ RD Checker
3. ปิด/เปิด popup ใหม่

### อาการ: โหลดโค้ดใหม่จาก GitHub มาแล้ว แต่พฤติกรรมไม่ตรงกับเครื่องที่ใช้อยู่

สาเหตุ:
- โฟลเดอร์ที่ใช้งานจริงกับโฟลเดอร์ที่ clone อาจคนละชุด

วิธีแก้:
1. ยืนยัน path ที่ Chrome โหลด extension อยู่
2. รัน updater ในโฟลเดอร์นั้นโดยตรง
3. Reload extension

### อาการ: ไอคอนหรือรูปยังไม่เปลี่ยน

สาเหตุ:
- Windows icon cache หรือ Chrome cache ยังไม่ refresh

วิธีแก้:
1. ปิดหน้าต่าง/รีสตาร์ตแอป
2. Reload extension
3. ถ้าจำเป็นให้รีสตาร์ต Windows Explorer หรือเครื่อง

---

## คู่มือสำหรับนักพัฒนา (Developer)

### Build Native Updater

คอมไพล์ `native-updater/Program.cs` ด้วย `csc.exe` ตัวอย่าง:

```bat
csc /target:winexe /out:RD-Checker-Updater-Setup.exe ^
  /r:System.dll ^
  /r:System.Core.dll ^
  /r:System.Drawing.dll ^
  /r:System.Windows.Forms.dll ^
  /r:System.Web.Extensions.dll ^
  /r:System.IO.Compression.dll ^
  /r:System.IO.Compression.FileSystem.dll ^
  native-updater\Program.cs
```

หลัง build ให้คัดลอกผลลัพธ์ไป 2 จุด:

1. `RD-Checker-Updater-Setup.exe`
2. `updater/RD-Checker-Updater-Setup.exe`

### ขั้นตอน bump เวอร์ชัน

1. ปรับเวอร์ชันใน `manifest.json`
2. ปรับ `CurrentVersion` และ `CurrentBuildMessage` ใน `native-updater/Program.cs`
3. ปรับ `version` และ `notes` ใน `updater/update-manifest.json`
4. build updater ใหม่ และคัดลอกไฟล์ exe ทั้ง 2 จุด
5. commit + push

---

## License / Internal Use

เอกสารและเครื่องมือนี้จัดทำเพื่อใช้งานภายในทีม RD Checker
