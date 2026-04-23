  // ข้อความแสดงผล Interface counters เมื่อปกติ (ใช้ทั้งใน checkInterfaceCountersValues และ UI)
  const INTERFACE_COUNTERS_OK_MESSAGE = 'ปกติ (ทั้งหมด --)';
  const CLI_INTERFACE_COUNTERS_OK_MESSAGE = 'ปกติ (ทั้งหมด 0)';
  // ✅ GUI: รองรับคำสั่ง 'show interface counter(s) error(s)' แบบย่อ/ตัดคำ เช่น
  // show interface counters errors
  // show interface counter errors
  // sho interfac counter error
  // sh interf count err
  // sh inter coun er
  // sh inte cou e
  // s int co e
  // s in c e / s i c e
  const GUI_INTERFACE_COUNTERS_CMD_RE = /(?:^|[#\n]|\b)\s*(?:show|sh|sho|s)\s+(?:interfaces?|interfac(?:es?)?|interfa|interfac|interf|inter|inte|int|in|i)\s+(?:counters?|counter|counte|count|coun|cou|co|c)\s+(?:errors?|error|erro|err|er|e)\b/i;


  // แปลง HTML เป็นข้อความแบบเดียวกับ searchShowClock เพื่อให้ดึงเวลาได้ครบแม้มีแท็กคั่น
  // รวมถึงแทนที่ zero-width / non-breaking space ให้เป็นช่องว่างปกติ (เผื่อตัวที่ 2 ใช้ตัวอักษรพิเศษ)
  function normalizeHtmlForClock(text) {
    if (!text || typeof text !== 'string') return '';
    return text
      // Convert basic HTML to plain text
      .replace(/<\s*br\s*\/?\s*>/gi, ' ')
      .replace(/<\s*\/??\s*[a-zA-Z][^>]*>/g, ' ')
      // Decode common HTML entities (important for %CLEAR-... in logs)
      .replace(/&percnt;/gi, '%')
      .replace(/&nbsp;|&#160;/gi, ' ')
      .replace(/&amp;/gi, '&')
      .replace(/&quot;/gi, '"')
      .replace(/&apos;|&#39;/gi, "'")
      .replace(/&lt;/gi, '<')
      .replace(/&gt;/gi, '>')
      // Decode numeric entities (hex + decimal)
      .replace(/&#x([0-9a-f]{1,6});/gi, (_, hex) => {
        const code = parseInt(hex, 16);
        if (!Number.isFinite(code)) return '';
        try { return String.fromCodePoint(code); } catch { return ''; }
      })
      .replace(/&#(\d{1,7});/g, (_, num) => {
        const code = parseInt(num, 10);
        if (!Number.isFinite(code)) return '';
        try { return String.fromCodePoint(code); } catch { return ''; }
      })
      // Normalize invisible spaces
      .replace(/[\u200B\u200C\u200D\uFEFF\u00A0\u2002\u2003]/g, ' ') // zero-width, nbsp, en/em space
      .replace(/\s+/g, ' ');
  }
  // ✅ Normalize timezone labels (TH / THAI / BKK / ICT / UTC) into a consistent "UTC+N" form for parsing.
  // This helps GUI/Website extractor detect "sh clock" outputs like: "06:39:11.053 TH Tue Nov 18 2025".
  function normalizeTimezoneLabels(text) {
    if (!text || typeof text !== 'string') return '';
    return String(text)
      // Thai local timezone aliases
      .replace(/\bT\s*H\s*A\s*I\b/gi, 'UTC+7')
        .replace(/\bT\s*H\b/gi, 'UTC+7')
        .replace(/\bTH\b/gi, 'UTC+7')
      .replace(/\bT\s*H\b/gi, 'UTC+7')
      .replace(/\bTH\b/gi, 'UTC+7')
      .replace(/\bT\s*H\b/gi, 'UTC+7')
      .replace(/\bTHAI\b/gi, 'UTC+7')
      .replace(/\bB\s*K\s*K\b/gi, 'UTC+7')
      .replace(/\bBangkok\b/gi, 'UTC+7')
      .replace(/\bAsia\/Bangkok\b/gi, 'UTC+7')
      .replace(/\bB\s*a\s*n\s*g\s*k\s*o\s*k\b/gi, 'UTC+7')
      .replace(/\bA\s*s\s*i\s*a\s*\/\s*B\s*a\s*n\s*g\s*k\s*o\s*k\b/gi, 'UTC+7')
      .replace(/\bBKK\b/gi, 'UTC+7')
      .replace(/\bI\s*C\s*T\b/gi, 'UTC+7')
      .replace(/\bICT\b/gi, 'UTC+7')
      // GMT markers
      .replace(/\bG\s*M\s*T\s*([+\-])\s*(\d{1,2})(?::\s*\d{2})?\b/gi, 'UTC$1$2')
      .replace(/\bGMT\s*([+\-])\s*(\d{1,2})(?::\s*\d{2})?\b/gi, 'UTC$1$2')
      .replace(/\bG\s*M\s*T\b(?!\s*[+\-])/gi, 'UTC+0')
      .replace(/\bGMT\b(?!\s*[+\-])/gi, 'UTC+0')
      // UTC markers
      .replace(/\bU\s*T\s*C\s*\+\s*(\d{1,2})\b/gi, 'UTC+$1')
      .replace(/\bUTC\s*\+\s*(\d{1,2})\b/gi, 'UTC+$1')
      .replace(/\bU\s*T\s*C\b(?!\s*\+)/gi, 'UTC+0')
      .replace(/\bUTC\b(?!\s*\+)/gi, 'UTC+0');
  }

  // ดึง clock timestamps ทั้งหมดจากข้อความ (รองรับรูปแบบที่มีช่องว่าง และ HTML ที่มีแท็กคั่น)
  // รองรับชม./นาที/วินาที แยกตัว เช่น "1 3 :0 3 :0 6.187433" = 13:03:06.187433
  // ลำดับ alternation: พยายาม \d\s+\d ก่อน เพื่อให้ "1 3" = 13 ไม่ใช่ 1
  // คืนค่า clockEntries = [ { time, index }, ... ] เพื่อใช้แสดง Debug ครบ 3 จุดจาก timestamp
  function extractClockDataFromText(text) {
    if (!text || typeof text !== 'string') return { clockDataArray: [], lastFullTimestamp: null, clockEntries: [], normalized: '' };
    const normalized = normalizeTimezoneLabels(normalizeHtmlForClock(text));
    const normalizeTime = (s) => s.replace(/\s*:\s*/g, ':').replace(/\s+/g, ' ').trim();
    const pad2 = (x) => String(x).padStart(2, '0');
    // ชม./นาที/วินาที: ใช้ (\d)\s+(\d) ก่อน แล้วค่อย (\d{1,2}) เพื่อให้ "1 3" = 13
    const timePartPattern = '(?:(\\d)\\s+(\\d)|(\\d{1,2}))\\s*:\\s*(?:(\\d)\\s+(\\d)|(\\d{1,2}))\\s*:\\s*(?:(\\d)\\s*(\\d)|(\\d{1,2}))\\.(\\d+)\\s+(?:(?:UTC|GMT)\\s*)?([\\+\\-]\\d{1,2})';
    const shortRe = new RegExp(timePartPattern, 'g');
    const fullRe = new RegExp(timePartPattern + '\\s+\\S+\\s+\\S+\\s+\\d{1,2}\\s+\\d{4}', 'g');
    const part = (split1, split2, single) => (split1 !== undefined && split2 !== undefined ? split1 + split2 : single);
    const buildTime = (m) => {
      const hour = part(m[1], m[2], m[3]);
      const min = part(m[4], m[5], m[6]);
      const sec = part(m[7], m[8], m[9]);
      const tzRaw = String(m[11] || '+0').trim();
      const tzSign = tzRaw.startsWith('-') ? '-' : '+';
      const tzNum = tzRaw.replace(/^[+-]/, '');
      const tz = `${tzSign}${pad2(tzNum)}`;
      return normalizeTime(`${pad2(hour)}:${pad2(min)}:${pad2(sec)}.${m[10]} ${tz}`);
    };
    const clockDataArray = [];
    const clockEntries = [];
    let m;
    while ((m = shortRe.exec(normalized)) !== null) {
      const t = buildTime(m);
      clockDataArray.push(t);
      clockEntries.push({ time: t, index: m.index });
    }
    // Fallback: ถ้าได้น้อยกว่า 3 จุด ลอง regex แบบง่าย (ไม่มี split digit) เผื่อ format พิเศษ
    if (clockDataArray.length < 3) {
      const simpleRe = /\d{1,2}\s*:\s*\d{1,2}\s*:\s*\d{2}\.\d+\s+[\+\-]\d{2}/g;
      const existingIndices = new Set(clockEntries.map(e => e.index));
      let sm;
      while ((sm = simpleRe.exec(normalized)) !== null && clockEntries.length < 3) {
        if (existingIndices.has(sm.index)) continue;
        const t = normalizeTime(sm[0]);
        clockEntries.push({ time: t, index: sm.index });
        existingIndices.add(sm.index);
      }
      clockEntries.sort((a, b) => a.index - b.index);
      clockDataArray.length = 0;
      clockEntries.forEach(e => clockDataArray.push(e.time));
    }
    const fullMatches = normalized.match(fullRe) || [];
    let lastFullTimestamp = null;
    if (fullMatches.length > 0) {
      const lastStr = fullMatches[fullMatches.length - 1];
      const timePart = lastStr.match(new RegExp(timePartPattern));
      if (timePart) {
        const rest = lastStr.slice(timePart[0].length).trim();
        lastFullTimestamp = normalizeTime(buildTime(timePart) + ' ' + rest);
      } else {
        lastFullTimestamp = normalizeTime(lastStr);
      }
    }
    if (!lastFullTimestamp && clockDataArray.length > 0) {
      lastFullTimestamp = clockDataArray[clockDataArray.length - 1];
    }
    return { clockDataArray, lastFullTimestamp, clockEntries, normalized };
  }

  // วิเคราะห์ show clock สำหรับ GUI: ต้องมีคำสั่งและบรรทัดเวลาแยกกัน
  function analyzeGuiShowClock(text) {
    if (!text || typeof text !== 'string') {
      return { clockDataArray: [], lastFullTimestamp: null, clockEntries: [], normalized: '', incomplete: true, reason: 'ไม่พบข้อมูล show clock' };
    }
    const normalized = normalizeTimezoneLabels(normalizeTextForLineScan(text));
    const lines = normalized.split('\n');
    const lineOffsets = [];
    let pos = 0;
    for (const l of lines) {
      lineOffsets.push(pos);
      pos += l.length + 1;
    }

    const showWord = 's\\s*h(?:\\s*o(?:\\s*w)?)?'; // match sh / sho / show (รองรับเว้นวรรคคั่นตัวอักษร)
    const clockWord = 'c\\s*l\\s*o(?:\\s*c(?:\\s*k)?)?';
    const showRe = new RegExp(`${showWord}\\s*${clockWord}`, 'i');
    const timePartPattern = '(?:(\\d)\\s+(\\d)|(\\d{1,2}))\\s*:\\s*(?:(\\d)\\s+(\\d)|(\\d{1,2}))\\s*:\\s*(?:(\\d)\\s*(\\d)|(\\d{1,2}))\\.(\\d+)\\s+(?:(?:UTC|GMT)\\s*)?([\\+\\-]\\d{1,2})';
    const wordToken = '([A-Za-z](?:\\s*[A-Za-z]){2,})';
    const tailRe = new RegExp(
      `${timePartPattern}\\s+${wordToken}\\s+${wordToken}\\s+(\\d(?:\\s*\\d)?)\\s+(\\d(?:\\s*\\d){3,4})`,
      'i'
    );
    const timeOnlyRe = new RegExp(timePartPattern, 'i');
    const part = (split1, split2, single) => (split1 !== undefined && split2 !== undefined ? split1 + split2 : single);
    const pad2 = (x) => String(x).padStart(2, '0');
    const normalizeWord = (v) => String(v || '').replace(/\s+/g, '');
    const normalizeNum = (v) => String(v || '').replace(/\s+/g, '');
    const buildTime = (m) => {
      const hour = part(m[1], m[2], m[3]);
      const min = part(m[4], m[5], m[6]);
      const sec = part(m[7], m[8], m[9]);
      const tzRaw = String(m[11] || '+0').trim();
      const tzSign = tzRaw.startsWith('-') ? '-' : '+';
      const tzNum = tzRaw.replace(/^[+-]/, '');
      const tz = `${tzSign}${pad2(tzNum)}`;
      return `${pad2(hour)}:${pad2(min)}:${pad2(sec)}.${m[10]} ${tz}`;
    };

    const entries = [];
    let hasMissingCommand = false;
    let hasMissingTime = false;
    let hasBadTime = false;

    for (let i = 0; i < lines.length; i++) {
      const line = String(lines[i] || '').trim();
      if (!line) continue;
      const hasShow = showRe.test(line);
      const timeMatchInline = line.match(tailRe);
      const timePartInline = timeMatchInline ? null : line.match(timeOnlyRe);

      if (hasShow && timeMatchInline) {
        // show clock and time on same line -> accept as valid (OCR may have removed newline)
        const year = normalizeNum(timeMatchInline[15]);
        if (year.length !== 4) {
          hasBadTime = true;
          continue;
        }
        const dayName = normalizeWord(timeMatchInline[12]);
        const month = normalizeWord(timeMatchInline[13]);
        const date = normalizeNum(timeMatchInline[14]);
        const time = buildTime(timeMatchInline);
        entries.push({
          time,
          full: `${time} ${dayName} ${month} ${date} ${year}`,
          index: lineOffsets[i] + Math.max(0, timeMatchInline.index || 0)
        });
        continue;
      }

      if (hasShow && !timeMatchInline) {
        // look ahead for time line
        let found = false;
        for (let j = i + 1; j < Math.min(i + 4, lines.length); j++) {
          const nextLine = String(lines[j] || '').trim();
          if (!nextLine) continue;
          const tm = nextLine.match(tailRe);
          if (tm) {
            const year = normalizeNum(tm[15]);
            if (year.length !== 4) {
              hasBadTime = true;
              found = true;
              break;
            }
            const dayName = normalizeWord(tm[12]);
            const month = normalizeWord(tm[13]);
            const date = normalizeNum(tm[14]);
            const time = buildTime(tm);
            entries.push({
              time,
              full: `${time} ${dayName} ${month} ${date} ${year}`,
              index: lineOffsets[j] + Math.max(0, tm.index || 0)
            });
            found = true;
            break;
          }
          if (!tm && timeOnlyRe.test(nextLine)) {
            hasBadTime = true;
            found = true;
            break;
          }
          if (showRe.test(nextLine)) break;
        }
        if (!found) hasMissingTime = true;
        continue;
      }

      if (!hasShow && timeMatchInline) {
        // time without show clock command
        hasMissingCommand = true;
      } else if (!hasShow && timePartInline) {
        // time line exists but missing day/month/year or malformed
        hasMissingCommand = true;
        hasBadTime = true;
      }
    }

    const clockDataArray = entries.map(e => e.time);
    const lastFullTimestamp = entries.length > 0 ? entries[entries.length - 1].full : null;
    const incomplete =
      hasMissingCommand || hasMissingTime || hasBadTime || clockDataArray.length < 3;
    const reasonParts = [];
    if (hasMissingCommand) reasonParts.push('พบบรรทัดเวลาแต่ไม่พบคำสั่ง show clock');
    if (hasMissingTime) reasonParts.push('พบบรรทัดคำสั่ง show clock แต่ไม่พบบรรทัดเวลา');
    if (hasBadTime) reasonParts.push('พบบรรทัดเวลาแต่รูปแบบไม่ครบ (วัน/เดือน/ปี)');
    if (clockDataArray.length < 3) reasonParts.push('พบเวลา show clock ไม่ครบ 3 จุด');
    const reason = incomplete
      ? `โชว์ไม่ครบลักษณะ: ${reasonParts.join(' / ')}\nรูปแบบที่ต้องการ: <hostname>#show clock ต่อด้วยบรรทัดเวลา`
      : '';

    return {
      clockDataArray,
      lastFullTimestamp,
      clockEntries: entries.map(e => ({ time: e.time, index: e.index })),
      normalized,
      incomplete,
      reason
    };
  }

  // Convert Gregorian date to Buddhist calendar
  function convertToThaiBuddhistDate(ceDate) {
    // ceDate format: "16:46:11.927684 +07 Mon Nov 24 2025"
    // Extract year and convert to Thai Buddhist year
    const yearMatch = ceDate.match(/\d{4}$/);
    if (!yearMatch) return ceDate;
    
    const ceYear = parseInt(yearMatch[0]);
    const buddhistYear = ceYear + 543;
    
    // Replace CE year with Buddhist year
    const buddhist = ceDate.replace(/\d{4}$/, String(buddhistYear));
    return buddhist;
  }

  // Format timestamp to DD-MM-YYYY HH:MM:SS format (Buddhist year only; no TZ conversion)
  function formatTimestampToThaiDate(ceDate) {
    // ceDate format: "16:46:11.927684 +07 Mon Nov 24 2025"
    // Extract time, date, month, year
    const parts = ceDate.match(/(\d{1,2}):(\d{2}):(\d{2})(?:\.(\d+))?\s+([\+\-]\d{2})\s+(\w+)\s+(\w+)\s+(\d{1,2})\s+(\d{4})/);
    if (!parts) return null;
    
    const hour = String(parts[1]).padStart(2, '0');
    const min = String(parts[2]).padStart(2, '0');
    const sec = String(parts[3]).padStart(2, '0');
    const monthName = parts[7];
    const date = String(parts[8]).padStart(2, '0');
    const ceYear = parseInt(parts[9], 10);
    const buddhistYear = ceYear + 543;
    
    // Map month names to numbers
    const monthMap = {
      'Jan': '01', 'January': '01',
      'Feb': '02', 'February': '02',
      'Mar': '03', 'March': '03',
      'Apr': '04', 'April': '04',
      'May': '05',
      'Jun': '06', 'June': '06',
      'Jul': '07', 'July': '07',
      'Aug': '08', 'August': '08',
      'Sep': '09', 'Sept': '09', 'September': '09',
      'Oct': '10', 'October': '10',
      'Nov': '11', 'November': '11',
      'Dec': '12', 'December': '12'
    };
    
    const month = monthMap[monthName] || '01';
    return `${date}-${month}-${buddhistYear} ${hour}:${min}:${sec}`;
  }

  // ค้นหา "show clock" ในข้อความ (รองรับช่องว่าง/ขึ้นบรรทัด/แท็ก HTML คั่น, zero-width, หรือ show กับ clock ติดกัน)
  function searchShowClock(text) {
    if (!text || typeof text !== 'string') return [];
    const results = [];
    const normalized = normalizeHtmlForClock(text);
    const re = /\b(?:show|sho|sh)\s*clo(?:c(?:k)?)?\b/gi; // รองรับ show clock / sho clock / sh clock
    let m;
    while ((m = re.exec(normalized)) !== null) {
      const start = Math.max(0, m.index - 60);
      const end = Math.min(normalized.length, m.index + m[0].length + 60);
      const snippet = (start > 0 ? '...' : '') + normalized.slice(start, end).replace(/\n/g, '↵') + (end < normalized.length ? '...' : '');
      results.push({ index: m.index, match: m[0], snippet });
    }
    return results;
  }

  // ค้นหา "show interface counter(s) error(s)" (รองรับแบบย่อ/สะกดไม่เต็ม/ช่องว่าง)
  function searchShowInterfaceCountersErrors(text) {
    if (!text || typeof text !== 'string') return [];
    const results = [];
    // ใช้ pattern เดียวกับตัวเช็คจริง เพื่อให้ debug/result ตรงกัน (counter/counters รองรับทั้งคู่)
    const re = new RegExp(GUI_INTERFACE_COUNTERS_CMD_RE.source, 'gi');
    let m;
    while ((m = re.exec(text)) !== null) {
      // หาเริ่มต้นบรรทัด (ย้อนไปถึง \n หรือต้นข้อความ)
      const lineStart = text.lastIndexOf('\n', m.index) + 1;
      const lineEnd = text.indexOf('\n', m.index);
      const lineEndPos = lineEnd === -1 ? text.length : lineEnd;
      const fullLine = text.slice(lineStart, lineEndPos).trim();
      const start = Math.max(0, m.index - 80);
      const end = Math.min(text.length, m.index + m[0].length + 80);
      const snippet = (start > 0 ? '...' : '') + text.slice(start, end).replace(/\n/g, '↵') + (end < text.length ? '...' : '');
      results.push({ index: m.index, match: m[0], fullLine, snippet });
    }
    return results;
  }

  // ตรวจสอบส่วน interface counters: แถวข้อมูลต้องเป็น portname -- -- -- ... เท่านั้น
  // หัวข้อ (Port, Align-Err, CRC-Err, ...) เป็นปกติ ไม่ตรวจ. แถวข้อมูล = mgmt0 หรือ Eth1/X ตามด้วย -- ทั้งหมด
  function checkInterfaceCountersValues(html) {
    if (!html || typeof html !== 'string') {
      return { found: false, message: 'ไม่มีข้อมูล' };
    }
    const normalized = normalizeTextForLineScan(html);
    const hasCmd = GUI_INTERFACE_COUNTERS_CMD_RE.test(normalized);
    if (!hasCmd) {
      return { found: false, message: 'ไม่พบ show interface counter(s) errors' };
    }

    // Only scan the actual command output blocks. This avoids false positives from running-config/description
    // text elsewhere in the PDF that may contain things like "Gi9/9 - 12) TO HQ ...".
    const cmdRe = new RegExp(GUI_INTERFACE_COUNTERS_CMD_RE.source, 'gi');
    const blocks = [];
    const maxBlockChars = 40000; // enough for all tables in one command output (PDF text may be a single long "line")
    let m;
    while ((m = cmdRe.exec(normalized)) !== null) {
      const start = m.index;
      const after = m.index + m[0].length;

      // End at the next CLI prompt if present; otherwise cap by maxBlockChars to avoid bleeding into unrelated text.
      let end = normalized.indexOf('#', after);
      if (end === -1 || end < after || end - start > maxBlockChars) {
        end = Math.min(normalized.length, start + maxBlockChars);
      }
      blocks.push(normalized.slice(start, end));
    }

    let section = blocks.join('\n');
    const portTokenRe = /\b(mgmt0|Eth\d+\/\d+|Po\d+|Gi\d+(?:\/\d+)*|Te\d+(?:\/\d+)*|Fa\d+(?:\/\d+)*)\b/gi;
    const portStartRe = /\b(?:mgmt0|Eth\d+\/\d+|Po\d+|Gi\d+(?:\/\d+)*|Te\d+(?:\/\d+)*|Fa\d+(?:\/\d+)*)\b/i;
    const valueTokenRe = /^(--|\d+)$/;
    const normalizePortSpacing = (s) => String(s)
      .replace(/\b(mgmt)\s*0\b/gi, 'mgmt0')
      .replace(/\b(Po)\s+(\d+)\b/gi, 'Po$2')
      .replace(/\b(Eth)\s*(\d+)\s*\/\s*(\d+)\b/gi, 'Eth$2/$3')
      .replace(/\b(Gi)\s*(\d+)\s*\/\s*(\d+)\b/gi, 'Gi$2/$3')
      .replace(/\b(Te)\s*(\d+)\s*\/\s*(\d+)\b/gi, 'Te$2/$3')
      .replace(/\b(Fa)\s*(\d+)\s*\/\s*(\d+)\b/gi, 'Fa$2/$3');

    // Normalize across the full text so we can recover ports split by wraps/tags/newlines (e.g. "Eth1/\n4").
    section = normalizePortSpacing(section);

    const dashTokenRe = /^[\-\u2010-\u2015\u2043\u2212\uFE63\uFF0D]+$/;
    const dashClusterRe = /[\-\u2010-\u2015\u2043\u2212\uFE63\uFF0D](?:\s*[\-\u2010-\u2015\u2043\u2212\uFE63\uFF0D])+?/g;

    const looksLikeOutOfTableToken = (token) => {
      if (/^(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)$/i.test(token)) return true;
      if (/^\d{1,2}:\d{2}:\d{2}(\.\d+)?$/.test(token)) return true;
      if (/^\d{4}$/.test(token)) return true;
      if (/^#+$/.test(token)) return true;
      if (/^[A-Za-z0-9_.-]+#$/.test(token)) return true;
      if (/^show$/i.test(token) || /^clear$/i.test(token)) return true;
      if (portStartRe.test(token)) return true;
      if (/^(Eth|Gi|Te|Fa)\d+\/$/i.test(token)) return true;
      if (/^(Port|Align|CRC|Err|Stomp|Xmit|Rcv|Undersize|OutDiscards|Single|Col|Multi|Late|Exces|Carri|Sen|Runts|Giants|SQETest|Deferred|Tx|Rx|IntMacTx|IntMacRx|Symbol)$/i.test(token)) return true;
      if (/^[A-Za-z]{3,}$/.test(token)) return true;
      // Device prompts like "Leaf-DC-RA" can be appended after the last table row in OCR/PDF extracts.
      // Treat those as out-of-table tokens to avoid false CRC/interface error anomalies.
      if (/[A-Za-z]/.test(token) && /[-_]/.test(token) && token.length >= 3) return true;
      if (/[A-Za-z]/.test(token) && /\d/.test(token) && token.length >= 3) return true;
      return false;
    };

    const anomalies = [];
    const problemLines = [];
    let rowCount = 0;
    const lines = section.split('\n').map(l => l.trim()).filter(Boolean);

    let expectedCols = 7;
    for (let idx = 0; idx < lines.length; idx++) {
      const line = lines[idx];
      let workLine = normalizePortSpacing(line);

      // OCR sometimes splits a row: "Eth1/4" on one line and the counters on the next line.
      // If we only see a port on this line, try to merge with the next line.
      if (portStartRe.test(workLine)) {
        const firstTokens = workLine.split(/\s+/).filter(Boolean);
        if (firstTokens.length === 1 && idx + 1 < lines.length) {
          const nextLineRaw = normalizePortSpacing(lines[idx + 1]);
          const nextHasPort = portStartRe.test(nextLineRaw);
          const nextLooksHeader = /\bPort\b/i.test(nextLineRaw) && /\bErr\b/i.test(nextLineRaw);
          const nextTokens = nextLineRaw.split(/\s+/).filter(Boolean);
          const nextHasCountersToken = nextTokens.some(t => valueTokenRe.test(t) || dashTokenRe.test(t));
          if (!nextHasPort && !nextLooksHeader && nextHasCountersToken) {
            workLine = `${workLine} ${nextLineRaw}`.trim();
            idx++; // consume the next line
          }
        }
      }

      // learn column count whenever a table header appears
      if (/\bPort\b/i.test(workLine) && /\bErr\b/i.test(workLine)) {
        const headerTokens = workLine.split(/\s+/).filter(Boolean);
        if (headerTokens.length > 2) {
          expectedCols = Math.max(5, Math.min(32, headerTokens.length - 1));
        }
        // Some OCR merges header + first data rows in one line.
        // If a port exists in this line, keep parsing from that port.
        const headerPortIdx = workLine.search(portStartRe);
        if (headerPortIdx === -1) {
          continue;
        }
        if (headerPortIdx > 0) {
          workLine = workLine.slice(headerPortIdx).trim();
        }
      }

      // Find first port token early; some OCR lines contain command/header + table data on same line.
      const firstPortIdx = workLine.search(portStartRe);

      // cut trailing prompt/command text only when it appears AFTER first port token
      const tailCmdIdx = workLine.search(/\s(?:[A-Za-z0-9][A-Za-z0-9_.-]*#\s*(?:show|clear)\b|show\s+clock\b|show\s+env\b|show\s+log\b|clear\s+counters\b)/i);
      if (tailCmdIdx > 0 && (firstPortIdx === -1 || tailCmdIdx > firstPortIdx)) {
        workLine = workLine.slice(0, tailCmdIdx).trim();
      }

      // If line has command/header prefix then table data, keep only part from first port token.
      if (firstPortIdx > 0) {
        workLine = workLine.slice(firstPortIdx).trim();
      } else if (firstPortIdx === -1) {
        // pure command/log line with no port data
        if (/^(?:[A-Za-z0-9][A-Za-z0-9_.-]*#\s*)?(?:show\s+clock|show\s+env|show\s+log|clear\s+counters|show\s+interface\s+counters\s+errors)\b/i.test(workLine)) {
          continue;
        }
      }

      const portMatches = [];
      let pm;
      while ((pm = portTokenRe.exec(workLine)) !== null) {
        portMatches.push({ port: pm[1], index: pm.index });
      }
      portTokenRe.lastIndex = 0;
      if (portMatches.length === 0) continue;

      for (let i = 0; i < portMatches.length; i++) {
        const start = portMatches[i].index;
        const end = i + 1 < portMatches.length ? portMatches[i + 1].index : workLine.length;
        let segment = normalizePortSpacing(workLine.slice(start, end).trim());
        // Collapse OCR-broken dash clusters like "- -" or "— —" into a single "--"
        segment = segment.replace(dashClusterRe, '--');
        const tokens = segment.split(/\s+/).filter(Boolean);
        if (tokens.length < 2) continue;

        const port = tokens[0];
        const cols = [];
        const maxCols = Math.min(32, Math.max(expectedCols, 12));
        let stoppedByNonValue = false;
        const pushColToken = (t) => {
          // Strip common trailing punctuation from OCR like "98)" or "5,"
          const numMatch = /^(\d+)[).,]?$/.exec(t);
          if (numMatch) {
            cols.push(numMatch[1]);
            return true;
          }
          // Treat any dash-like placeholder as "--" (OCR often turns "--" into "-" or long dashes)
          if (dashTokenRe.test(t)) {
            cols.push('--');
            return true;
          }
          // If we hit parentheses tokens (e.g., "12)" from descriptions), stop parsing this row
          if (/[()]/.test(t)) {
            stoppedByNonValue = true;
            return false;
          }
          if (valueTokenRe.test(t)) {
            cols.push(t);
            return true;
          }
          if (looksLikeOutOfTableToken(t)) {
            stoppedByNonValue = true;
            return false;
          }
          // Treat any other token as an anomaly column (e.g., OCR letters like "ห", "a")
          cols.push(t);
          return true;
        };

        for (const t of tokens.slice(1)) {
          // Treat any dash-like placeholder as "--" (OCR often turns "--" into "-" or long dashes)
          if (!pushColToken(t)) break;
          if (cols.length >= maxCols) break;
        }

        // Some extracts split a single row across multiple lines (e.g. port + some cols, then the number on next line).
        // If we haven't collected enough columns and we didn't stop due to a clear non-value token, try to extend with
        // subsequent lines that look like continuation.
        // Safe cases:
        // - The entire line contains only one port.
        // - Or this segment is the last port on the line (a wrap may cut the row mid-way).
        const canContinueRow = portMatches.length === 1 || i === portMatches.length - 1;
        if (!stoppedByNonValue && cols.length < expectedCols && canContinueRow) {
          let lookahead = idx + 1;
          while (cols.length < expectedCols && lookahead < lines.length) {
            let cont = normalizePortSpacing(lines[lookahead] || '');
            if (!cont) break;
            if (/\bPort\b/i.test(cont) && /\bErr\b/i.test(cont)) break;
            const nextPortIdx = cont.search(portStartRe);
            if (nextPortIdx !== -1) {
              // If a new port starts later on the line, the prefix might be continuation values for this row.
              if (nextPortIdx === 0) break;
              const prefix = cont.slice(0, nextPortIdx).trim();
              const rest = cont.slice(nextPortIdx).trim();
              const prefixNorm = prefix.replace(dashClusterRe, '--');
              const prefixTokens = prefixNorm.split(/\s+/).filter(Boolean);
              const prefixLooksLikeValues =
                prefixTokens.length > 0 &&
                prefixTokens.every(t => valueTokenRe.test(t) || dashTokenRe.test(t)) &&
                prefixTokens.some(t => valueTokenRe.test(t) || dashTokenRe.test(t));
              if (prefixLooksLikeValues) {
                for (const t of prefixTokens) {
                  if (!pushColToken(t)) break;
                  if (cols.length >= maxCols) break;
                }
                // Keep the remaining port data for normal parsing in the next outer iteration.
                lines[lookahead] = rest;
              }
              break;
            }
            if (/^(?:[A-Za-z0-9][A-Za-z0-9_.-]*#\s*)?(?:show|clear)\b/i.test(cont)) break;

            const contTrim = cont.trim();
            const looksLikeSeparator = dashTokenRe.test(contTrim) && contTrim.length >= 20;
            if (looksLikeSeparator) break;

            cont = cont.replace(dashClusterRe, '--');
            const contTokens = cont.split(/\s+/).filter(Boolean);
            if (contTokens.length === 0) break;
            const contHasValue = contTokens.some(t => valueTokenRe.test(t) || dashTokenRe.test(t));
            if (!contHasValue) break;

            for (const t of contTokens) {
              if (!pushColToken(t)) break;
              if (cols.length >= maxCols) break;
            }
            // consume this continuation line
            lookahead++;
          }
          if (lookahead > idx + 1) idx = lookahead - 1;
        }
        if (cols.length < 2) continue;
        // table rows must contain "--"; otherwise it is likely non-table numeric text
        if (!cols.includes('--')) continue;

        rowCount++;
        const rowBad = cols.filter(v => v !== '--');
        if (rowBad.length > 0) {
          rowBad.forEach(v => {
            if (!anomalies.includes(v)) anomalies.push(v);
          });
          // Keep duplicates intentionally (same port may fail more than once)
          problemLines.push({ line: `${port} ${cols.join(' ')}`.trim(), anomalies: rowBad });
        }
      }
    }

    // Fallback: if some port rows with numbers slipped through (e.g. unusual wrapping),
    // scan each original line after normalization for a port followed by any digits.
    // This ensures rows like "Eth1/2 -- -- -- -- 98 -- --" or "Eth1/4 -- -- 87 -- -- -- --"
    // are not missed due to aggressive row merging logic above.
    // Guardrails: skip over config lines/descriptions that are obviously longer than a table row.
    const rawLines = section.split('\n');
    for (const raw of rawLines) {
      const line = normalizePortSpacing(raw.trim());
      if (!line) continue;
      const m = line.match(portStartRe);
      if (!m) continue;
      const tokens = line.split(/\s+/).filter(Boolean);
      if (tokens.length > 20) continue; // likely config text, not a table row
      let rest = line.slice(line.indexOf(m[0]) + m[0].length).trim();
      // Normalize dash clusters in the remainder to simplify detection of "--"
      rest = rest.replace(dashClusterRe, '--');
      const restTokens = rest.split(/\s+/).filter(Boolean);
      if (restTokens.length === 0) continue;
      const valTokens = restTokens.filter(t => dashTokenRe.test(t) || /^\d+$/.test(t));
      const hasLetters = restTokens.some(t => /[A-Za-z]/.test(t) && !dashTokenRe.test(t) && !/^\d+$/.test(t));
      // Skip config/description lines that carry any letter tokens (not part of the counters table)
      if (hasLetters) continue;
      if (valTokens.length < 2) continue;
      const nums = rest.match(/\d+/g) || [];
      if (nums.length === 0) continue;
      const already = problemLines.some(pl => pl.line === line);
      if (already) continue;
      const lineAnoms = nums;
      lineAnoms.forEach(v => { if (!anomalies.includes(v)) anomalies.push(v); });
      problemLines.push({ line, anomalies: lineAnoms });
    }

    if (rowCount === 0) {
      return { found: true, ok: false, message: 'ไม่พบแถวข้อมูล interface counters errors', section };
    }
    if (anomalies.length > 0) {
      return {
        found: true,
        ok: false,
        message: 'เตือน: พบตัวเลขหรือค่าผิดปกติ (ควรเป็น -- เท่านั้น)',
        anomalies: anomalies.slice(0, 10),
        problemLines: problemLines,
        section: section
      };
    }
    return { found: true, ok: true, message: INTERFACE_COUNTERS_OK_MESSAGE };
  }

  // คำนวณเวลาระหว่าง 2 กับ 3 จาก clockData array
  // clockData format: "HH:MM:SS.microseconds +TZ" เช่น "16:45:39.652627 +07"
  function calculateTimeBetween2And3(clockDataArray, opts = {}) {
    if (!clockDataArray || !Array.isArray(clockDataArray) || clockDataArray.length < 3) {
      return { error: 'ไม่พบข้อมูลเวลาที่ 2 และ 3' };
    }
    
    const time2 = clockDataArray[1]; // index 1 = เวลาที่ 2
    const time3 = clockDataArray[2]; // index 2 = เวลาที่ 3
    
    if (!time2 || !time3) {
      return { error: 'ไม่พบข้อมูลเวลาที่ 2 หรือ 3' };
    }
    
    // Parse เวลา: "HH:MM:SS.microseconds +TZ" (รองรับ 1 หรือ 2 หลัก สำหรับ H, M)
    const parseTime = (timeStr) => {
      const match = timeStr.match(/(\d{1,2}):(\d{1,2}):(\d{2})\.(\d+)\s+([\+\-]\d{2})/);
      if (!match) return null;
      const [, h, m, s, ms] = match;
      return {
        hours: parseInt(h, 10),
        minutes: parseInt(m, 10),
        seconds: parseInt(s, 10),
        milliseconds: parseInt(ms.substring(0, 3), 10) // ใช้แค่ 3 หลักแรก
      };
    };
    
    const t2 = parseTime(time2);
    const t3 = parseTime(time3);
    
    if (!t2 || !t3) {
      return { error: 'ไม่สามารถ parse เวลาได้' };
    }
    
    // คำนวณความต่างเป็นนาที
    const totalMinutes2 = t2.hours * 60 + t2.minutes + t2.seconds / 60 + t2.milliseconds / 60000;
    const totalMinutes3 = t3.hours * 60 + t3.minutes + t3.seconds / 60 + t3.milliseconds / 60000;
    // signed display rule (CLI):
    // - เวลา 2 > เวลา 3  => ลบ
    // - เวลา 2 < เวลา 3  => บวก
    const signedDiffValue = totalMinutes3 - totalMinutes2;
    const diffMinutes = Math.abs(signedDiffValue);

    const MIN_DIFF_MINUTES = Number.isFinite(Number(opts.minDiffMinutes)) ? Number(opts.minDiffMinutes) : 5;
    const MAX_DIFF_MINUTES = Number.isFinite(Number(opts.maxDiffMinutes)) ? Number(opts.maxDiffMinutes) : null;
    const showSignedDiff = !!opts.signedDiff;
    const diffRounded = diffMinutes.toFixed(2);
    const signedDiffRounded = `${signedDiffValue >= 0 ? '+' : '-'}${diffRounded}`;
    const signedCheckSuffix = (showSignedDiff && signedDiffValue < 0) ? ' (ตรวจสอบเวลา 2 มากกว่าเวลา 3)' : '';
    const displayDiff = showSignedDiff ? signedDiffRounded : diffRounded;
    const reverseOrder = showSignedDiff && signedDiffValue < 0;
    const tooShort = diffMinutes < MIN_DIFF_MINUTES;
    const tooLong = (MAX_DIFF_MINUTES !== null) && (diffMinutes > MAX_DIFF_MINUTES);
    
    return {
      time2,
      time3,
      diffMinutes: diffRounded,
      signedDiffMinutes: signedDiffRounded,
      isValid: !tooShort && !tooLong && !reverseOrder,
      display: tooShort
        ? `${displayDiff} นาที${signedCheckSuffix} (error: ไม่ถึง ${MIN_DIFF_MINUTES} นาที ต้องแก้ไข)`
        : tooLong
          ? `${displayDiff} นาที${signedCheckSuffix} (error: เวลามากกว่า ${MAX_DIFF_MINUTES} นาที ต้องพิจารณา)`
          : `${displayDiff} นาที${signedCheckSuffix}`
    };
  }

  // CLI helpers: parse "sh/show clock" and "sh int | i CRC" output
  function parseCliClockEntries(text) {
    if (!text || typeof text !== 'string') return [];
    const scanText = String(text)
      // tolerate OCR spacing in timezone labels and UTC marker
      .replace(/\bT\s*H\s*A\s*I\b/gi, 'UTC+7')
      .replace(/\bT\s*H\b/gi, 'UTC+7')
      .replace(/\bTH\b/gi, 'UTC+7')
      .replace(/\bB\s*K\s*K\b/gi, 'UTC+7')
      .replace(/\bBangkok\b/gi, 'UTC+7')
      .replace(/\bAsia\/Bangkok\b/gi, 'UTC+7')
      .replace(/\bB\s*a\s*n\s*g\s*k\s*o\s*k\b/gi, 'UTC+7')
      .replace(/\bA\s*s\s*i\s*a\s*\/\s*B\s*a\s*n\s*g\s*k\s*o\s*k\b/gi, 'UTC+7')
      .replace(/\bI\s*C\s*T\b/gi, 'UTC+7')
      .replace(/\bU\s*T\s*C\s*\+\s*(\d{1,2})\b/gi, 'UTC+$1')
      .replace(/\bUTC\s*\+\s*(\d{1,2})\b/gi, 'UTC+$1')
      .replace(/\bU\s*T\s*C\b(?!\s*\+)/gi, 'UTC+0')
  // ✅ รองรับ GMT (เช่น 'GMT+7', 'G M T + 7', 'GMT', 'GMT+07:00') ให้แปลงเป็นรูปแบบเดียวกับ UTC
  .replace(/\bG\s*M\s*T\s*([+\-])\s*(\d{1,2})(?::\s*\d{2})?\b/gi, 'UTC$1$2')
  .replace(/\bGMT\s*([+\-])\s*(\d{1,2})(?::\s*\d{2})?\b/gi, 'UTC$1$2')
  .replace(/\bG\s*M\s*T\b(?!\s*[+\-])/gi, 'UTC+0')
  .replace(/\bGMT\b(?!\s*[+\-])/gi, 'UTC+0')
      .replace(/\bUTC\b(?!\s*\+)/gi, 'UTC+0');
    const lines = scanText.split(/\r?\n/);
    const entries = [];
    const showWord = 's\\s*h(?:\\s*o(?:\\s*w)?)?'; // match sh / sho / show (รองรับเว้นวรรคคั่นตัวอักษร)
    const clockWord = 'c\\s*l\\s*o(?:\\s*c(?:\\s*k)?)?';
    const cmdRe = new RegExp(`#\\s*${showWord}\\s*${clockWord}\\b`, 'i');
    const showClockOnlyRe = new RegExp(`^\\s*${showWord}\\s*${clockWord}\\b`, 'i');
    const promptOnlyRe = /[A-Za-z0-9_.-]+#\s*$/;
    const wordToken = '([A-Za-z](?:\\s*[A-Za-z]){2,})';
    // ✅ CLI: ต้องมาจากไฟล์แบบมาตรฐานเท่านั้น (MM และ SS ต้อง 2 หลัก)
    // ถ้าเป็น 1 หลัก (เช่น 11:6:01 หรือ 11:06:1.498) จะไม่ถูกนับ/ไม่ match
    const timeLineRe = new RegExp(
      `(\\d{1,2})\\s*:\\s*(\\d{2})\\s*:\\s*(\\d{2})(?:\\s*\\.\\s*(\\d+))?\\s+UTC\\+(\\d{1,2})\\s+${wordToken}\\s+${wordToken}\\s+(\\d(?:\\s*\\d)?)\\s+(\\d(?:\\s*\\d){3})`,
      'i'
    );
    const inlineRe = new RegExp(
      `(?:^|\\s)${showWord}\\s*${clockWord}\\b[\\s:=-]*(\\d{1,2})\\s*:\\s*(\\d{2})\\s*:\\s*(\\d{2})(?:\\s*\\.\\s*(\\d+))?\\s+UTC\\+(\\d{1,2})\\s+${wordToken}\\s+${wordToken}\\s+(\\d(?:\\s*\\d)?)\\s+(\\d(?:\\s*\\d){3})`,
      'i'
    );
    const normalizeWord = (v) => String(v || '').replace(/\s+/g, '');
    const normalizeNum = (v) => String(v || '').replace(/\s+/g, '');
    const toParts = (m) => {
      const frac = m[4] || '0';
      const tz = m[5] || '0';
      return [
        normalizeNum(m[1]),
        normalizeNum(m[2]),
        normalizeNum(m[3]),
        frac,
        tz,
        normalizeWord(m[6]),
        normalizeWord(m[7]),
        normalizeNum(m[8]),
        normalizeNum(m[9])
      ];
    };
    const normalizeCliTimeLine = (line) => {
      let s = String(line);
      if (!/UTC\s*\+?/i.test(s)) return s;
      const utcIdx = s.search(/UTC\s*\+?/i);
      if (utcIdx === -1) return s;
      let pre = s.slice(0, utcIdx);
      let post = s.slice(utcIdx);
      // Normalize time part before UTC (merge split digits/colon/dot)
      pre = pre.replace(/(\d)\s+(?=\d)/g, '$1');
      pre = pre.replace(/\s*:\s*/g, ':');
      pre = pre.replace(/\s*\.\s*/g, '.');
      return pre + post;
    };

    let offset = 0;
    for (let i = 0; i < lines.length; i++) {
      const lineRaw = lines[i];
      const line = normalizeCliTimeLine(lineRaw);
      // Inline form: "... sh clock 13:32:09.755 UTC+7 Tue Dec 2 2025"
      let m = line.match(inlineRe);
      if (m) {
        entries.push({ parts: toParts(m), index: offset + Math.max(0, m.index || 0), hasShowCmd: true });
        offset += lineRaw.length + 1;
        continue;
      }
      // Command on one line (with or without prompt), timestamp on next line
      if (cmdRe.test(line) || showClockOnlyRe.test(line)) {
        let innerOffset = offset + lineRaw.length + 1;
        for (let j = i + 1; j < Math.min(i + 4, lines.length); j++) {
          const nextLineRaw = lines[j];
          const nextLine = normalizeCliTimeLine(nextLineRaw);
          const tm = nextLine.match(timeLineRe);
          if (tm) {
            const idx = innerOffset + Math.max(0, tm.index || 0);
            entries.push({ parts: toParts(tm), index: idx, hasShowCmd: true });
            break;
          }
          innerOffset += nextLineRaw.length + 1;
        }
      }
      // Prompt only, timestamp on next line (user may have deleted "sh clock")
      // If a show clock command appears after the prompt, mark it as hasShowCmd.
      if (promptOnlyRe.test(line) && !cmdRe.test(line)) {
        let innerOffset = offset + lineRaw.length + 1;
        let sawShowCmd = false;
        for (let j = i + 1; j < Math.min(i + 4, lines.length); j++) {
          const nextLineRaw = lines[j];
          const nextLine = normalizeCliTimeLine(nextLineRaw);
          if (!sawShowCmd && showClockOnlyRe.test(nextLine)) {
            sawShowCmd = true;
            innerOffset += nextLineRaw.length + 1;
            continue;
          }
          const tm = nextLine.match(timeLineRe);
          if (tm) {
            const idx = innerOffset + Math.max(0, tm.index || 0);
            entries.push({ parts: toParts(tm), index: idx, hasShowCmd: sawShowCmd });
            break;
          }
          innerOffset += nextLineRaw.length + 1;
        }
      }
      offset += lineRaw.length + 1;
    }
    // De-duplicate identical matches (same time + same index)
    const dedup = (list) => {
      const byKey = new Map();
      for (const e of list) {
        const key = `${e.parts.join('|')}@${e.index}`;
        const prev = byKey.get(key);
        if (!prev || (!prev.hasShowCmd && e.hasShowCmd)) {
          byKey.set(key, e);
        }
      }
      return Array.from(byKey.values());
    };
    let deduped = dedup(entries);

    // Fallback for OCR/format drift: grab standalone timestamps even if command line is malformed.
    if (deduped.length === 0) {
      const globalTimeRe = /(\d{1,2})\s*:\s*(\d{2})\s*:\s*(\d{2})(?:\s*\.\s*(\d+))?\s+UTC\+(\d{1,2})\s+([A-Za-z]{3,})\s+([A-Za-z]{3,})\s+(\d{1,2})\s+(\d{4})/gi;
      let gm;
      while ((gm = globalTimeRe.exec(scanText)) !== null) {
        deduped.push({ parts: toParts(gm), index: gm.index, hasShowCmd: false });
      }
      deduped = dedup(deduped);
    }

    return deduped;
  }

  // Analyze CLI show clock points to identify malformed timestamps (e.g. 10:10:1.498 ...).
  // This is used to report "เจอเวลาที่ X แต่ข้อมูลไม่ครบ" for CLI comparisons.
  function analyzeCliClockPoints(text) {
    if (!text || typeof text !== 'string') return { points: [], incompletePoint: null };
    const scanText = String(text)
      .replace(/\bT\s*H\s*A\s*I\b/gi, 'UTC+7')
      .replace(/\bT\s*H\b/gi, 'UTC+7')
      .replace(/\bTH\b/gi, 'UTC+7')
      .replace(/\bB\s*K\s*K\b/gi, 'UTC+7')
      .replace(/\bBangkok\b/gi, 'UTC+7')
      .replace(/\bAsia\/Bangkok\b/gi, 'UTC+7')
      .replace(/\bB\s*a\s*n\s*g\s*k\s*o\s*k\b/gi, 'UTC+7')
      .replace(/\bA\s*s\s*i\s*a\s*\/\s*B\s*a\s*n\s*g\s*k\s*o\s*k\b/gi, 'UTC+7')
      .replace(/\bI\s*C\s*T\b/gi, 'UTC+7')
      .replace(/\bU\s*T\s*C\s*\+\s*(\d{1,2})\b/gi, 'UTC+$1')
      .replace(/\bUTC\s*\+\s*(\d{1,2})\b/gi, 'UTC+$1')
      .replace(/\bU\s*T\s*C\b(?!\s*\+)/gi, 'UTC+0')
      .replace(/\bG\s*M\s*T\s*([+\-])\s*(\d{1,2})(?::\s*\d{2})?\b/gi, 'UTC$1$2')
      .replace(/\bGMT\s*([+\-])\s*(\d{1,2})(?::\s*\d{2})?\b/gi, 'UTC$1$2')
      .replace(/\bG\s*M\s*T\b(?!\s*[+\-])/gi, 'UTC+0')
      .replace(/\bGMT\b(?!\s*[+\-])/gi, 'UTC+0')
      .replace(/\bUTC\b(?!\s*\+)/gi, 'UTC+0');

    const lines = scanText.split(/\r?\n/);
    const points = [];
    const showWord = 's\\s*h(?:\\s*o(?:\\s*w)?)?';
    const clockWord = 'c\\s*l\\s*o(?:\\s*c(?:\\s*k)?)?';
    const cmdLineRe = new RegExp(`(?:#\\s*)?${showWord}\\s*${clockWord}\\b`, 'i');
    const wordToken = '([A-Za-z](?:\\s*[A-Za-z]){2,})';
    // strict format for CLI point validity: HH:MM:SS (all 2-digit)
    const strictTimePattern =
      `(\\d{2})\\s*:\\s*(\\d{2})\\s*:\\s*(\\d{2})(?:\\s*\\.\\s*(\\d+))?\\s+UTC\\+(\\d{1,2})\\s+${wordToken}\\s+${wordToken}\\s+(\\d(?:\\s*\\d)?)\\s+(\\d(?:\\s*\\d){3})`;
    const looseTimePattern =
      `(\\d{1,2})\\s*:\\s*(\\d{1,2})\\s*:\\s*(\\d{1,2})(?:\\s*\\.\\s*(\\d+))?\\s+UTC\\+(\\d{1,2})\\s+${wordToken}\\s+${wordToken}\\s+(\\d(?:\\s*\\d)?)\\s+(\\d(?:\\s*\\d){3})`;
    const strictTimeLineRe = new RegExp(strictTimePattern, 'i');
    const looseTimeLineRe = new RegExp(looseTimePattern, 'i');
    const inlineStrictRe = new RegExp(`${showWord}\\s*${clockWord}\\b[\\s:=-]*${strictTimePattern}`, 'i');
    const inlineLooseRe = new RegExp(`${showWord}\\s*${clockWord}\\b[\\s:=-]*${looseTimePattern}`, 'i');

    const normalizeWord = (v) => String(v || '').replace(/\s+/g, '');
    const normalizeNum = (v) => String(v || '').replace(/\s+/g, '');
    const toRawTimestamp = (m) => {
      const hour = normalizeNum(m[1]);
      const min = normalizeNum(m[2]);
      const sec = normalizeNum(m[3]);
      const frac = normalizeNum(m[4] || '0');
      const tz = normalizeNum(m[5]);
      const dayName = normalizeWord(m[6]);
      const month = normalizeWord(m[7]);
      const date = normalizeNum(m[8]);
      const year = normalizeNum(m[9]);
      return `${hour}:${min}:${sec}.${frac} UTC+${tz} ${dayName} ${month} ${date} ${year}`;
    };
    const normalizeCliTimeLine = (line) => {
      let s = String(line);
      if (!/UTC\s*\+?/i.test(s)) return s;
      const utcIdx = s.search(/UTC\s*\+?/i);
      if (utcIdx === -1) return s;
      let pre = s.slice(0, utcIdx);
      let post = s.slice(utcIdx);
      pre = pre.replace(/(\d)\s+(?=\d)/g, '$1');
      pre = pre.replace(/\s*:\s*/g, ':');
      pre = pre.replace(/\s*\.\s*/g, '.');
      return pre + post;
    };
    const pushPoint = (status, raw) => {
      points.push({
        point: points.length + 1,
        status,
        raw: raw || null
      });
    };

    for (let i = 0; i < lines.length; i++) {
      const line = normalizeCliTimeLine(lines[i]);
      if (!cmdLineRe.test(line)) continue;

      let tm = line.match(inlineStrictRe);
      if (tm) {
        pushPoint('valid', toRawTimestamp(tm));
        continue;
      }
      tm = line.match(inlineLooseRe);
      if (tm) {
        pushPoint('incomplete', toRawTimestamp(tm));
        continue;
      }

      let found = false;
      for (let j = i + 1; j < Math.min(i + 4, lines.length); j++) {
        const nextLine = normalizeCliTimeLine(lines[j]);
        if (cmdLineRe.test(nextLine)) break;

        let nextMatch = nextLine.match(strictTimeLineRe);
        if (nextMatch) {
          pushPoint('valid', toRawTimestamp(nextMatch));
          found = true;
          break;
        }
        nextMatch = nextLine.match(looseTimeLineRe);
        if (nextMatch) {
          pushPoint('incomplete', toRawTimestamp(nextMatch));
          found = true;
          break;
        }
      }

      if (!found) pushPoint('missing', null);
    }

    const incompletePoint = points.find((p) => p.point <= 3 && p.status === 'incomplete') || null;
    return { points, incompletePoint };
  }

  function buildCliClockMatches(entries) {
    return entries.map((entry) => {
      const m = entry.parts;
      // Keep hour formatting as-is from CLI output (do not pad 1-digit hour to 2 digits)
      const hour = m[0];
      // นาที/วินาที: ใช้ตามที่เจอจากไฟล์ (ไม่ pad เพิ่มเอง)
      const min = m[1];
      const sec = m[2];
      const frac = m[3];
      const tz = String(m[4]).padStart(2, '0');
      const dayName = m[5];
      const month = m[6];
      const date = String(m[7]).padStart(2, '0');
      const year = m[8];
      return { time: `${hour}:${min}:${sec}.${frac} +${tz} ${dayName} ${month} ${date} ${year}`, hasShowCmd: !!entry.hasShowCmd };
    });
  }

  function checkCliInterfaceCounters(text) {
    if (!text || typeof text !== 'string') {
      return { found: false, message: 'ไม่มีข้อมูล' };
    }
    const lines = text.split(/\r?\n/);
    // รองรับคำสั่งเต็ม/ย่อหลายแบบ เช่น:
    // show interfaces | include CRC
    // sh int | in CRC
    // sho int | inc CRC / incl CRC / include CRC
    const cmdRe = /#\s*s\s*h(?:\s*o(?:\s*w)?)?\s+int(?:e(?:r(?:f(?:a(?:c(?:e(?:s)?)?)?)?)?)?)?\b(?:\s+.*)?\|\s*i(?:n(?:c(?:l(?:u(?:d(?:e)?)?)?)?)?)?\s*c\s*r\s*c\b/i;
    const countersRe = /^\s*(\d+)\s+input errors,\s+(\d+)\s+CRC,\s+(\d+)\s+frame,\s+(\d+)\s+overrun,\s+(\d+)\s+ignored(?:,\s+(\d+)\s+abort)?/i;
    let foundCmd = false;
    let foundLines = 0;
    let bestBlockBadLines = null;
    let bestBlockBadCount = -1;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (cmdRe.test(line)) {
        foundCmd = true;
        // Read following lines until next prompt or empty block
        let blockFoundLines = 0;
        const blockBadLines = [];
        for (let j = i + 1; j < lines.length; j++) {
          const l = lines[j].trim();
          if (!l) continue;
          if (/[A-Za-z0-9_.-]+#\s/.test(l)) break;
          const m = l.match(countersRe);
          if (m) {
            foundLines++;
            blockFoundLines++;
            const nums = m.slice(1).filter(n => n !== undefined).map(n => parseInt(n, 10));
            const allZero = nums.every(n => n === 0);
            if (!allZero) blockBadLines.push(l.replace(/\s+/g, ' ').trim());
          } else {
            const looksLikeCounters = /input errors/i.test(l) && /CRC/i.test(l) && /frame/i.test(l) && /overrun/i.test(l) && /ignored/i.test(l);
            if (looksLikeCounters) {
              foundLines++;
              blockFoundLines++;
              blockBadLines.push(l.replace(/\s+/g, ' ').trim());
            }
          }
        }
        if (blockFoundLines > 0 && blockBadLines.length > 0) {
          if (blockBadLines.length > bestBlockBadCount) {
            bestBlockBadCount = blockBadLines.length;
            bestBlockBadLines = blockBadLines;
          } else if (blockBadLines.length === bestBlockBadCount) {
            // If tied, prefer the later block in the log.
            bestBlockBadLines = blockBadLines;
          }
        }
      }
    }

    if (!foundCmd) {
      return { found: false, message: 'ไม่พบคำสั่ง CRC (เช่น show/sh/sho ... int/interfaces | i/in/inc/incl/include CRC)' };
    }
    if (foundLines === 0) {
      return { found: true, ok: false, message: 'ไม่พบข้อมูล CRC หลังคำสั่ง' };
    }
    if (bestBlockBadLines && bestBlockBadLines.length > 0) {
      return {
        found: true,
        ok: false,
        message: 'เตือน: พบค่า CRC/Errors ไม่เป็น 0',
        problemLines: bestBlockBadLines.slice(0, 50)
      };
    }
    return { found: true, ok: true, message: CLI_INTERFACE_COUNTERS_OK_MESSAGE };
  }

  // Normalize HTML-ish content into plain-text lines for scanning.
  function normalizeTextForLineScan(text) {
    if (!text || typeof text !== 'string') return '';
    const decoded = String(text)
      .replace(/\r\n/g, '\n')
      .replace(/\r/g, '\n')
      .replace(/[\u2028\u2029]/g, '\n')
      .replace(/<\s*br\s*\/?\s*>/gi, '\n')
      .replace(/<\s*\/\s*p\s*>/gi, '\n')
      .replace(/<\s*p\b[^>]*>/gi, '\n')
      .replace(/<\s*\/\s*pre\s*>/gi, '\n')
      .replace(/<\s*pre\b[^>]*>/gi, '\n')
      .replace(/<\s*\/\s*div\s*>/gi, '\n')
      .replace(/<\s*div\b[^>]*>/gi, '\n')
      .replace(/<\s*\/\s*li\s*>/gi, '\n')
      .replace(/<\s*li\b[^>]*>/gi, '\n')
      .replace(/<\s*\/\s*tr\s*>/gi, '\n')
      .replace(/<\s*tr\b[^>]*>/gi, '\n')
      .replace(/<\s*\/\s*td\s*>/gi, ' ')
      .replace(/<\s*td\b[^>]*>/gi, ' ')
      .replace(/<\s*\/?\s*[a-zA-Z][^>]*>/g, ' ')
      .replace(/&nbsp;/gi, ' ')
      .replace(/&quot;/gi, '"')
      .replace(/&#34;/gi, '"')
      .replace(/&amp;/gi, '&')
      .replace(/&lt;/gi, '<')
      .replace(/&gt;/gi, '>')
      // Decode common numeric entities (helps when logs are HTML-escaped, e.g. Eth1&#x2F;4)
      .replace(/&#x([0-9a-f]{1,6});/gi, (_, hex) => {
        const cp = parseInt(hex, 16);
        if (!Number.isFinite(cp) || cp < 0 || cp > 0x10ffff) return '';
        return String.fromCodePoint(cp);
      })
      .replace(/&#(\d{1,7});/g, (_, dec) => {
        const cp = parseInt(dec, 10);
        if (!Number.isFinite(cp) || cp < 0 || cp > 0x10ffff) return '';
        return String.fromCodePoint(cp);
      })
      .replace(/[\uFF0F\u2044\u2215]/g, '/')
      .replace(/[\u00AD\u034F\u061C\u180E\u200E\u200F\u202A-\u202E\u2060\u2066-\u2069]/g, '')
      .replace(/[\u200B\u200C\u200D\uFEFF\u00A0\u2002\u2003]/g, ' ')
      .replace(/％/g, '%')
      .replace(/[ \t]+\n/g, '\n')
      .replace(/\n{3,}/g, '\n\n')
      .trim();

    return decoded;
  }

  function compressSpaces(s) {
    return String(s).replace(/\s+/g, ' ').trim();
  }

  function toAlphaNumSkeleton(s) {
    return String(s).toLowerCase().replace(/[^a-z0-9]/g, '');
  }

  function formatCountersProblemLines(countersCheck, maxLines = 5) {
    if (!countersCheck) return '';
    const lines = Array.isArray(countersCheck.problemLines) ? countersCheck.problemLines : [];
    if (lines.length > 0) {
      const shown = lines.slice(0, maxLines);
      let out = 'บรรทัดที่มีปัญหา:\n';
      shown.forEach((pl, i) => {
        if (typeof pl === 'string') {
          out += `   [${i + 1}] -\n       พบค่า: ${pl}\n`;
        } else {
          const lineLabel = pl.line || '-';
          const values = Array.isArray(pl.anomalies) ? pl.anomalies.join(', ') : (pl.anomalies || '');
          out += `   [${i + 1}] ${lineLabel}\n       พบค่า: ${values}\n`;
        }
      });
      if (lines.length > shown.length) {
        out += `   ... (${lines.length - shown.length} more)\n`;
      }
      return out.trimEnd();
    }
    if (countersCheck.anomalies && countersCheck.anomalies.length > 0) {
      return `พบค่า: ${countersCheck.anomalies.slice(0, 10).join(', ')}`;
    }
    return '';
  }

  function detectClearCounters(text) {
    if (!text || typeof text !== 'string') return { found: false, matches: [] };

    const normalized = normalizeTextForLineScan(text);
    const matches = [];
    const seen = new Set();
    const buildClearSignature = (line) => {
      // Normalize OCR spacing for reliable dedupe of the same syslog event.
      const normalizedLine = String(line)
        .replace(/\s+/g, ' ')
        .replace(/\s*-\s*/g, '-')
        .trim();
      const ts = normalizedLine.match(/(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\s+\d{1,2}\s+\d{1,2}:\d{2}:\d{2}/i);
      const by = normalizedLine.match(/by\s+([A-Za-z0-9._-]+)/i);
      const ip = normalizedLine.match(/\(\s*([0-9.]+)\s*\)/);
      if (ts && by && ip) {
        return `${ts[0].toLowerCase()}|${by[1].toLowerCase()}|${ip[1]}`;
      }
      return null;
    };
    const push = (lineRaw) => {
      let line = compressSpaces(lineRaw)
        .replace(/\s*-\s*/g, '-')
        .replace(/\s+([#:,()\[\]])/g, '$1')
        .replace(/([#:,()\[\]])\s+/g, '$1 ');

      // If OCR/GUI squashed multiple prompts into one line, keep ONLY the last prompt's context.
      // Example: "Leaf-...# 5454-... 4asd# clear counters" -> "5454-... 4asd# clear counters"
      const sk0 = toAlphaNumSkeleton(line);
      const isSyslogClearEvent0 = /%CLEAR-\d+-COUNTERS:/i.test(line);
      const looksLikeClearCmd0 = !isSyslogClearEvent0 && line.includes('#') && sk0.includes('clearcounters');
      if (looksLikeClearCmd0) {
        const cmdPartRe = /[A-Za-z0-9][A-Za-z0-9 ._-]{0,120}#\s*c\s*l\s*e\s*a\s*r\s*c\s*o\s*u\s*n\s*t\s*e\s*r\s*s\b/gi;
        let mm, last = null, lastIndex = -1;
        while ((mm = cmdPartRe.exec(line)) !== null) {
          last = mm[0];
          lastIndex = mm.index;
        }
        if (last) {
          const before = line.slice(0, lastIndex);
          const prevHash = before.lastIndexOf('#');
          let prefix = (prevHash >= 0) ? before.slice(prevHash + 1) : before;

          prefix = compressSpaces(prefix).replace(/\s*-\s*/g, '-').trim();
          let cmd = compressSpaces(last)
            .replace(/\s*-\s*/g, '-')
            .replace(/\s*#\s*/g, '# ')
            .replace(/\s+/g, ' ')
            .trim();

          // Ensure: "NAME# clear counters" (no space before #, one space after #)
          cmd = cmd.replace(/\s*#\s*/g, '# ').replace(/^(.+?)#\s*/, '$1# ');

          line = prefix ? `${prefix} ${cmd}` : cmd;
        }
      }

      // Remove trailing prompt if OCR glued it to the same log line.
      line = line.replace(/\s*[A-Za-z0-9][A-Za-z0-9 ._-]{0,120}#\s*$/i, '');

      // Remove trailing prompt+command (e.g. "... [confirm] Leaf-...# show clock")
      // BUT do not strip when the line itself is the "X# clear counters" command.
      const sk = toAlphaNumSkeleton(line);
      const isSyslogClearEvent = /%CLEAR-\d+-COUNTERS:/i.test(line);
      const isClearCmdLine = !isSyslogClearEvent && line.includes('#') && sk.includes('clearcounters');
      if (!isClearCmdLine) {
        line = line.replace(/\s+[A-Za-z0-9][A-Za-z0-9 ._-]{0,120}#\s*(?:show|sh|clear)\b.*$/i, '');
      }

      if (!line) return;

      const isClearEvent = /%CLEAR-\d+-COUNTERS:/i.test(line);
      const sig = isClearEvent ? buildClearSignature(line) : null;
      const key = sig || line.toLowerCase();
      if (seen.has(key)) return;
      seen.add(key);
      matches.push(line);
    };

    const monthLoose = '(?:J\\s*a\\s*n|F\\s*e\\s*b|M\\s*a\\s*r|A\\s*p\\s*r|M\\s*a\\s*y|J\\s*u\\s*n|J\\s*u\\s*l|A\\s*u\\s*g|S\\s*e\\s*p|O\\s*c\\s*t|N\\s*o\\s*v|D\\s*e\\s*c)';
    const hhLoose = '(?:\\d{1,2}|\\d\\s+\\d)';
    const mmLoose = '(?:\\d{2}|\\d\\s+\\d)';
    const ssLoose = '(?:\\d{2}|\\d\\s+\\d)';
    const tsLoose = `${monthLoose}\\s+\\d{1,2}\\s+${hhLoose}\\s*:\\s*${mmLoose}\\s*:\\s*${ssLoose}\\s*:`;

    // Break OCR-merged text into scan lines around time headers / prompt / confirm.
    let scan = normalized;
    scan = scan.replace(new RegExp(`\\s+(?=${tsLoose})`, 'gi'), '\n');
    scan = scan.replace(/\s+(?=[A-Za-z0-9][A-Za-z0-9 ._-]{0,120}#\s*(?:show|sh|clear)\b)/gi, '\n');
    scan = scan.replace(/\s+(?=Clear\s*["']?\s*show\s*interface)/gi, '\n');
    const lines = scan.split(/\n+/).map(compressSpaces).filter(Boolean);

    const cmdLineRe = /^[A-Za-z0-9][A-Za-z0-9 ._-]{0,120}#\s*c\s*l\s*e\s*a\s*r\s*c\s*o\s*u\s*n\s*t\s*e\s*r\s*s\b/i;
    const plainCmdRe = /^c\s*l\s*e\s*a\s*r\s*c\s*o\s*u\s*n\s*t\s*e\s*r\s*s\b/i;
    const confirmLineRe = /^Clear\s*["']?\s*show\s*interface\s*["']?\s*c\s*o\s*u\s*n\s*t\s*e\s*r\s*s\s*on\s*all\s*interfaces\s*\[confirm\]/i;

    for (const line of lines) {
      const sk = toAlphaNumSkeleton(line);
      const looksLikePromptCmd = line.includes('#') && sk.includes('clearcounters');
      const looksLikeConfirm = sk.includes('clearshowinterfacecounters') && sk.includes('onallinterfaces') && sk.includes('confirm');
      if (cmdLineRe.test(line) || plainCmdRe.test(line) || confirmLineRe.test(line) || looksLikePromptCmd || looksLikeConfirm) {
        push(line);
      }
    }

    // Fallback global scan for OCR cases where line-splitting fails.
    let m;
    const cmdGlobalRe = /([A-Za-z0-9][A-Za-z0-9 ._-]{0,120}#\s*c\s*l\s*e\s*a\s*r\s*c\s*o\s*u\s*n\s*t\s*e\s*r\s*s\b)/gi;
    while ((m = cmdGlobalRe.exec(scan)) !== null) {
      push(m[1]);
    }
    const plainCmdGlobalRe = /(?:^|\s)(c\s*l\s*e\s*a\s*r\s*c\s*o\s*u\s*n\s*t\s*e\s*r\s*s\b)(?=\s|$)/gi;
    while ((m = plainCmdGlobalRe.exec(scan)) !== null) {
      const left = scan.slice(Math.max(0, (m.index || 0) - 20), m.index || 0);
      if (/#\s*$/.test(left)) continue; // already part of "<host># clear counters"
      push(m[1]);
    }
    const confirmGlobalRe = /(Clear\s*["']?\s*show\s*interface\s*["']?\s*c\s*o\s*u\s*n\s*t\s*e\s*r\s*s\s*on\s*all\s*interfaces\s*\[confirm\])/gi;
    while ((m = confirmGlobalRe.exec(scan)) !== null) {
      push(m[1]);
    }

    // Final dedupe by event signature first, then fallback skeleton.
    const finalMatches = [];
    const finalSeen = new Set();
    for (const line of matches) {
      const cleaned = line.replace(/\s*[A-Za-z0-9][A-Za-z0-9 ._-]{0,120}#\s*$/i, '');
      const sig = /%CLEAR-\d+-COUNTERS:/i.test(cleaned) ? buildClearSignature(cleaned) : null;
      const sk = sig || toAlphaNumSkeleton(cleaned);
      if (finalSeen.has(sk)) continue;
      finalSeen.add(sk);
      finalMatches.push(line);
    }

    return { found: finalMatches.length > 0, matches: finalMatches };
  }

  function detectClear(text) {
    if (!text || typeof text !== 'string') return { found: false, matches: [] };

    const normalized = normalizeTextForLineScan(text);
    if (!normalized) return { found: false, matches: [] };

    // Match Cisco syslog timestamps even if OCR splits letters/digits with spaces.
    // Examples:
    //   Nov 20 2025 07:44:14.779 BKK:
    //   Nov 27 2025 02:54:05.668 UTC+7:
    //   *Mar  1 00:18:42.144:
    const monthLoose =
      '(?:J\\s*a\\s*n|F\\s*e\\s*b|M\\s*a\\s*r|A\\s*p\\s*r|M\\s*a\\s*y|J\\s*u\\s*n|J\\s*u\\s*l|A\\s*u\\s*g|S\\s*e\\s*p|O\\s*c\\s*t|N\\s*o\\s*v|D\\s*e\\s*c)';
    const dd = '(?:\\d\\s*\\d|\\d)'; // 1-2 digits (allows OCR "0 7")
    const yyyy = '(?:\\d\\s*\\d\\s*\\d\\s*\\d|\\d{4})';
    const two = '(?:\\d\\s*\\d|\\d{2})';
    const time = `${dd}\\s*:\\s*${two}\\s*:\\s*${two}(?:\\s*\\.\\s*\\d{1,6})?`;
    const tz = '(?:UTC\\s*\\+\\s*\\d{1,2}|UTC\\+\\s*\\d{1,2}|BKK|THAI|ICT|UTC|GMT)';
    const eventStart = `\\*?\\s*${monthLoose}\\s+${dd}(?:\\s+${yyyy})?\\s+${time}(?:\\s+${tz})?\\s*:`;

    // Put each timestamped log event on its own line (fixes merged HTML/OCR lines).
    const separated = normalized.replace(new RegExp(`\\s+(?=${eventStart})`, 'gi'), '\n');
    const parts = separated.split(/\n+/).map((s) => s.trim()).filter(Boolean);

    // Detect the "clear counters" syslog signature (OCR-tolerant).
    const clearHead = /(?:%|％)?\s*C\s*L\s*E\s*A\s*R\s*-\s*\d+\s*-\s*(?:C\s*O\s*U\s*N\s*T\s*E\s*R\s*S|L\s*O\s*G)\s*:/i;

    const normalizeMonthWords = (line) => {
      return String(line)
        .replace(/\bJ\s*a\s*n\b/gi, 'Jan')
        .replace(/\bF\s*e\s*b\b/gi, 'Feb')
        .replace(/\bM\s*a\s*r\b/gi, 'Mar')
        .replace(/\bA\s*p\s*r\b/gi, 'Apr')
        .replace(/\bM\s*a\s*y\b/gi, 'May')
        .replace(/\bJ\s*u\s*n\b/gi, 'Jun')
        .replace(/\bJ\s*u\s*l\b/gi, 'Jul')
        .replace(/\bA\s*u\s*g\b/gi, 'Aug')
        .replace(/\bS\s*e\s*p\b/gi, 'Sep')
        .replace(/\bO\s*c\s*t\b/gi, 'Oct')
        .replace(/\bN\s*o\s*v\b/gi, 'Nov')
        .replace(/\bD\s*e\s*c\b/gi, 'Dec');
    };

    const normalizeClearLine = (line) => {
    let s = normalizeTextForLineScan(line);
    if (!s) return '';

    // Fix month words like "N o v", then normalize spacing.
    s = normalizeMonthWords(s);

    // Normalize timestamp at the start (remove OCR spaces inside the time).
    s = s.replace(
      /^\s*((?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\s+\d{1,2}(?:\s+\d{4})?\s+)([0-2]\s*\d\s*:\s*[0-5]\s*\d\s*:\s*[0-5]\s*\d(?:\s*\.\s*\d{1,6})?)(\s+(?:UTC\s*[+-]\s*\d{1,2}|BKK|ICT))?\s*:\s*/i,
      (_m, datePart, timePart, tzPart) => {
        const date = compressSpaces(datePart).trim();
        const time = String(timePart)
          .replace(/\s+/g, '')
          .replace(/\s*:\s*/g, ':')
          .replace(/\s*\.\s*/g, '.');

        let tz = tzPart ? String(tzPart).trim() : '';
        if (tz) {
          tz = tz.replace(/\s+/g, '');
          if (/^ICT$/i.test(tz)) tz = 'BKK';
          tz = tz.replace(/^UTC\+?7$/i, 'UTC+7');
        }

        return `${date} ${time}${tz ? ' ' + tz : ''}: `;
      }
    );

    // Normalize the CLEAR signature (avoid missing due to OCR spaces).
    s = s.replace(
      /%\s*C\s*L\s*E\s*A\s*R\s*-\s*(\d+)\s*-\s*C\s*O\s*U\s*N\s*T\s*E\s*R\s*S\s*:\s*/i,
      (_m, n) => `%CLEAR-${n}-COUNTERS: `
    );

    // If we have a %CLEAR message, keep only up to vty(IP) to avoid sucking in prompts/command output.
    const clearIdx = s.search(clearHead);
    if (clearIdx >= 0) {
      const prefix = compressSpaces(s.slice(0, clearIdx)).trim();
      const restRaw = s.slice(clearIdx);

      const ipTailRe =
        /%CLEAR-\d+-COUNTERS:[\s\S]*?vty\s*\d+\s*\(\s*\d{1,3}(?:\.\d{1,3}){3}\s*\)/i;
      const restMatch = restRaw.match(ipTailRe);
      const rest = restMatch ? restMatch[0] : restRaw;

      s = prefix ? `${prefix} ${rest}` : rest;
    }

    // Clean up spacing around vty(ip).
    s = s.replace(
      /(vty)\s*(\d+)\s*\(\s*(\d{1,3}(?:\.\d{1,3}){3})\s*\)/i,
      (_m, v, n, ip) => `${v}${n}(${ip})`
    );

    // Normalize timezone tokens (BKK/ICT -> UTC+7), if any.
    s = s.replace(/BKK/i, 'UTC+7').replace(/ICT/i, 'UTC+7');
    s = s.replace(/UTC\s*([+-])\s*(\d+)/gi, (_m, sign, h) => `UTC${sign}${h}`);

    // Extra safety: cut at any device prompt or common commands if still present.
    const cutRe =
      /\s+(?:[A-Za-z0-9][A-Za-z0-9 _-]{0,120}\s*#\s*|show\s+clock|show\s+interface|clear\s+counters)/i;
    const cutIdx = s.search(cutRe);
    if (cutIdx > 0) s = s.slice(0, cutIdx).trim();

    return compressSpaces(s);
  };

  const seen = new Set();
    const out = [];

    const startsWithTsRe = new RegExp(`^${eventStart}`, 'i');
    const tsOnlyRe = new RegExp(`^${eventStart}\\s*$`, 'i');
    let pendingTs = '';

    // Extra patterns for CLEAR detection (handles PDF/HTML extraction quirks)
    const clearPhraseRe = /Clear\s*counter\s*on\s*(?:interface|all\s+interfaces)\b/i;
    const clearShowInterfaceRe = /Clear\s*["']?\s*show\s*interface\s*["']?\s*counters/i;
    const clearCmdRe2 = /\bclear\s+(?:counters|interface\s+counters|log)\b/i;

    for (const partRaw of parts) {
      const part = partRaw.trim();
      if (!part) continue;

      // If Cisco syslog is split across lines like:
      //   Nov 27 2025 00:14:01.605 UTC+7:
      //   %CLEAR-5-COUNTERS: ...
      // keep the timestamp to prepend to the next CLEAR line.
      if (tsOnlyRe.test(part) && !clearHead.test(part)) {
        pendingTs = part;
        continue;
      }

      const hasClear = clearHead.test(part) || clearPhraseRe.test(part) || clearShowInterfaceRe.test(part) || clearCmdRe2.test(part);
      if (!hasClear) {
        // Reset pending timestamp once we move past it.
        if (startsWithTsRe.test(part)) pendingTs = '';
        continue;
      }

      const merged = (!startsWithTsRe.test(part) && pendingTs) ? `${pendingTs} ${part}` : part;
      pendingTs = '';

      const cleaned = normalizeClearLine(merged);
      if (!cleaned) continue;

      const key = toAlphaNumSkeleton(cleaned);
      if (seen.has(key)) continue;

      seen.add(key);
      out.push(cleaned);
    }

    // Also capture the manual "clear counters" command + confirm prompt (if present).
  const cmdRe = /([A-Za-z0-9][A-Za-z0-9 _-]{0,80})\s*#\s*clear\s+counters\b/gi;
  let lastCmd = null;
  let cm;
  while ((cm = cmdRe.exec(normalized)) !== null) lastCmd = cm[1];

  if (lastCmd) {
    const device = compressSpaces(lastCmd).trim().replace(/\s*-\s*/g, '-');
    const cmdLine = `${device}# clear counters`;
    const k = toAlphaNumSkeleton(cmdLine);
    if (!seen.has(k)) {
      seen.add(k);
      out.push(cmdLine);
    }
  }

  const confirmRe = /Clear\s*["']?\s*show\s*interface\s*["']?\s*counters\s*on\s*all\s*interfaces\s*\[confirm\]/i;
  if (confirmRe.test(normalized)) {
    const confirmLine = 'Clear " show interface " counters on all interfaces[confirm]';
    const k = toAlphaNumSkeleton(confirmLine);
    if (!seen.has(k)) {
      seen.add(k);
      out.push(confirmLine);
    }
  }

  return { found: out.length > 0, matches: out };
  }

  // Detect "clear" occurrences from CLI "show log" output (or any CLI text).
  // Requirement for item 6: detect the word "clear" and return all lines that contain it.
  // This intentionally does NOT require a CLI prompt/command line, because syslog lines
  // (e.g. %CLEAR-5-COUNTERS) must be detected as well.
  function detectClearLogAny(text) {
    const normalized = normalizeTextForLineScan(text)
      // Decode common HTML entities that appear in some exports
      .replace(/&nbsp;|&#160;|&#xA0;/gi, ' ')
      .replace(/\s+/g, ' ');

    // Keep line structure for matching
    const withLines = (text || '')
      .replace(/\r\n/g, '\n')
      .replace(/\r/g, '\n')
      .replace(/&nbsp;|&#160;|&#xA0;/gi, ' ');

    const rawLines = withLines.split('\n');
    const out = [];
    const seen = new Set();

    const clearWord = /\bclear\b/i;
    for (const ln of rawLines) {
      const line = String(ln || '').trim();
      if (!line) continue;

      // Match against a line-normalized variant too (helps with extra spaces/tabs)
      const lineNorm = line.replace(/[\t ]+/g, ' ');
      if (!clearWord.test(lineNorm)) continue;

      const k = toAlphaNumSkeleton(lineNorm);
      if (seen.has(k)) continue;
      seen.add(k);
      out.push(lineNorm);
    }

    // Fallback: if the input lost newlines, scan the normalized blob and try to pull syslog-like snippets
      if (out.length === 0 && clearWord.test(normalized)) {
        const syslogLike = /((?:\b(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\b\s+\d{1,2}(?:\s+\d{4})?\s+\d{2}:\d{2}:\d{2}:\s+[^\n]*?\bclear\b[^\n]*))(?:$|\s{2,}|\n)/gi;
      let m;
      while ((m = syslogLike.exec(normalized)) !== null) {
        const s = compressSpaces(m[1]).trim();
        const k = toAlphaNumSkeleton(s);
        if (!seen.has(k)) {
          seen.add(k);
          out.push(s);
        }
        if (out.length >= 50) break;
      }
    }

    return { found: out.length > 0, matches: out };
  }


  // ===== Software Version (Cisco) Extractor =====
  // รองรับหลายรูปแบบ เช่น 16.0(9d), 12.2(55)SE12, 03.04.04.SG, 17.03.04, 7.0(3)I7(8) ฯลฯ
  // และกันไม่ให้ไปติด IPv4 (เช่น 10.1.1.2) หรือเลขหัวข้อสั้นๆ (เช่น 8.1)
  function isLikelyIPv4(text) {
    if (!text || typeof text !== 'string') return false;
    const s = text.trim();
    if (!/^\d{1,3}(?:\.\d{1,3}){3}$/.test(s)) return false;
    const parts = s.split('.').map(n => parseInt(n, 10));
    return parts.length === 4 && parts.every(n => Number.isFinite(n) && n >= 0 && n <= 255);
  }

  function looksLikeCiscoVersion(text) {
    if (!text || typeof text !== 'string') return false;
    const s = text.trim();
    if (!/^\d/.test(s)) return false;
    if (isLikelyIPv4(s)) return false;

    const dotCount = (s.match(/\./g) || []).length;
    const hasParen = /[()]/.test(s);
    const hasLetter = /[A-Za-z]/.test(s);

    // กันเลขหัวข้อสั้นๆ อย่าง 8.1
    if (!hasParen && !hasLetter && dotCount < 2) return false;

    return true;
  }

  // หา Software Version ที่ "น่าเชื่อถือที่สุด" จากข้อความทั้งก้อน (ให้คะแนนตามบริบท)
  function extractCiscoSoftwareVersion(text) {
    if (!text || typeof text !== 'string') return null;
    // OCR/PDF text often inserts spaces inside version tokens, e.g. "16.0(9 d)" or "12.2(55) SE12".
    // Normalize those so regexes can capture the full version string.
    const src = normalizeTextForLineScan(text)
      .replace(/(\d)\s*\.\s*(\d)/g, '$1.$2')
      .replace(/(\d)\s+\(/g, '$1(')
      .replace(/\(\s*/g, '(')
      .replace(/\s*\)/g, ')')
      .replace(/\(\s*(\d+)\s+([A-Za-z]+)\s*\)/g, '($1$2)')
      // Join common Cisco suffix trains when OCR inserted a space, e.g. "12.2(55) SE12", "7.0(3) I7(8)".
      // Only join when the suffix contains a digit to avoid gluing words like "show" / "BIOS" into the version.
      .replace(/\)\s+([A-Za-z]{1,6}\d[A-Za-z0-9()]*)\b/g, ')$1');

    const candidates = [];

    const pushCandidate = (ver, score, ctx) => {
      if (!ver) return;
      let v = String(ver).trim();

      // ตัดเครื่องหมายท้ายคำ
      v = v.replace(/[,\.;:]+$/g, '').trim();

      // OCR sometimes glues trailing words to version tokens, e.g. "16.0(9d)show", "6.0(9d)BIOS".
      // Strip those known non-version suffixes conservatively.
      v = v.replace(/(?:show|bios|service|system|kickstart)$/i, '').trim();
      v = v.replace(/[,\.;:]+$/g, '').trim();

      if (!looksLikeCiscoVersion(v)) return;

      // ลดความเสี่ยง: ถ้าเป็น 4 dot ทุกส่วนเป็นเลขและอยู่ในช่วง IP -> ปัดตก
      if (isLikelyIPv4(v)) return;

      candidates.push({ v, score, ctx: ctx || '' });
    };

    // 0) NX-OS / ACI: prefer "system: version" (and related) in show version output.
    // This avoids picking PE/BIOS versions such as "6.0(9d)" when the main system version is present.
    let m;
    const nxSystemRe = /\bsystem\s*:\s*version\s+([0-9][0-9A-Za-z.\(\)]+)/gi;
    while ((m = nxSystemRe.exec(src)) !== null) {
      const ctx = src.slice(Math.max(0, m.index - 60), Math.min(src.length, m.index + 160));
      pushCandidate(m[1], 120, ctx);
    }
    const nxSystem2Re = /\bSystem\s+version\s*:\s*([0-9][0-9A-Za-z.\(\)]+)/gi;
    while ((m = nxSystem2Re.exec(src)) !== null) {
      const ctx = src.slice(Math.max(0, m.index - 60), Math.min(src.length, m.index + 160));
      pushCandidate(m[1], 118, ctx);
    }
    const nxKickRe = /\bkickstart\s*:\s*version\s+([0-9][0-9A-Za-z.\(\)]+)/gi;
    while ((m = nxKickRe.exec(src)) !== null) {
      const ctx = src.slice(Math.max(0, m.index - 60), Math.min(src.length, m.index + 160));
      pushCandidate(m[1], 115, ctx);
    }

    // 1) จับจาก label ที่ชัดเจนก่อน (PDF มักมี "Software Version : ...")
    const labelRe = /(?:Software\s*Version|SW\s*Version)\s*[:=]\s*([0-9][0-9A-Za-z.\(\)]+(?:\.[0-9A-Za-z.\(\)]+)*)/gi;
    m = null;
    while ((m = labelRe.exec(src)) !== null) {
      const ctx = src.slice(Math.max(0, m.index - 60), Math.min(src.length, m.index + 200));
      pushCandidate(m[1], 100, ctx);
    }

    // 2) Cisco IOS / IOS-XE / NX-OS บรรทัด show version
    // ตัวอย่าง: "... Version 03.04.04.SG RELEASE SOFTWARE ..."
    const iosLineRe = /(Cisco\s+IOS(?:\s+Software)?[^ \n\r]*|Cisco\s+Internetwork\s+Operating\s+System\s+Software|IOS\s*\(tm\)|IOS-XE\s+Software|IOS\s+XE\s+Software|NX-OS|Cat(?:alyst)?\s+\d+[^ \n\r]*)[\s\S]{0,200}?Version\s+([0-9][0-9A-Za-z.\(\)]+)/gi;
    while ((m = iosLineRe.exec(src)) !== null) {
      const ctx = src.slice(Math.max(0, m.index - 60), Math.min(src.length, m.index + 260));
      pushCandidate(m[2], 90, ctx);
    }

    // 3) ทั่วไป: "Version <token>" (กัน ROM เป็นคะแนนต่ำ)
    const genericVerRe = /Version\s+([0-9][0-9A-Za-z.\(\)]+)/gi;
    while ((m = genericVerRe.exec(src)) !== null) {
      const idx = m.index;
      const ctx = src.slice(Math.max(0, idx - 80), Math.min(src.length, idx + 220));
      let score = 60;

      // ถ้าใกล้ "ROM:" / "Bootstrap" / "BOOTLDR" ให้ลดคะแนน (มักไม่ใช่ IOS/OS version หลัก)
      if (/ROM\s*:/i.test(ctx)) score -= 25;
      if (/(BOOTLDR|BOOT\s*LOADER|BOOTSTRAP|System\s+Bootstrap)/i.test(ctx)) score -= 35;

      // ถ้าใกล้ "RELEASE SOFTWARE" / "SYSTEM SOFTWARE" ให้เพิ่มคะแนน
      if (/RELEASE\s+SOFTWARE/i.test(ctx)) score += 10;
      if (/SYSTEM\s+SOFTWARE/i.test(ctx)) score += 10;

      // ถ้าใกล้คำใบ้ว่าเป็น IOS/OS หลัก ให้เพิ่มคะแนน
      if (/(Cisco\s+IOS|Internetwork\s+Operating\s+System|IOS\s*\(tm\)|IOS-XE|IOS\s+XE|NX-OS)/i.test(ctx)) score += 20;

      pushCandidate(m[1], score, ctx);
    }

    if (candidates.length === 0) return null;

    // เลือกตัวที่คะแนนสูงสุด; ถ้าคะแนนเท่ากันให้เลือกอันที่ยาวกว่า (มักละเอียดกว่า เช่นมี .SG หรือ SE12)
    candidates.sort((a, b) => (b.score - a.score) || (b.v.length - a.v.length));

    return candidates[0].v;
  }
  // ===== /Software Version (Cisco) Extractor =====


  // ===== Company Officer (PDF Signature) Extractor =====
  // ดึงชื่อ "เจ้าหน้าที่บริษัท" จากส่วนลายเซ็นท้ายใบงาน
  // รูปแบบที่พบบ่อยใน PDF: 
  //   (คุณธนิต บุญประกอบ) (คุณนาวี เอกกวี)
  //   เจ้าหน้าที่บริษัท ตำแหน่ง ...
  // ซึ่ง "เจ้าหน้าที่บริษัท" จะเป็นชื่อวงเล็บตัวแรก
  function extractCompanyOfficerNameFromPdfText(text) {
    if (!text || typeof text !== 'string') return null;

    const src = normalizeTextForLineScan(text);

    // 1) รูปแบบคู่ (name1)(name2) แล้วตามด้วย "เจ้าหน้าที่บริษัท" -> เอา name1
    // จำกัดระยะเพื่อกัน match ข้าม section อื่นๆ
    let m = /ลงชื่อ[\s\S]{0,240}?\(\s*(คุณ[^)\n]{2,80})\s*\)\s*\(\s*(คุณ[^)\n]{2,80})\s*\)[\s\S]{0,120}?เจ้าหน้าที่บริษัท(?!\s*ตรวจสอบ|ตรวจสอบ)/.exec(src);
    if (m && m[1]) return compressSpaces(m[1]).trim();

    // 2) รูปแบบเดี่ยว: (คุณ...) ... เจ้าหน้าที่บริษัท
    m = /\(\s*(คุณ[^)\n]{2,80})\s*\)[\s\S]{0,60}?เจ้าหน้าที่บริษัท(?!\s*ตรวจสอบ|ตรวจสอบ)/.exec(src);
    if (m && m[1]) return compressSpaces(m[1]).trim();

    // 3) รูปแบบไม่มีวงเล็บ: คุณ... เจ้าหน้าที่บริษัท (กัน "เจ้าหน้าที่บริษัทตรวจสอบ")
    m = /(?:^|\n)\s*(คุณ[^\n]{2,80}?)\s+เจ้าหน้าที่บริษัท(?!\s*ตรวจสอบ|ตรวจสอบ)/.exec(src);
    if (m && m[1]) return compressSpaces(m[1]).trim();

    return null;
  }
  // ===== /Company Officer (PDF Signature) Extractor =====

  // CLI Data Extractor - Parse CLI output format
  async function extractCLIData(url) {
    try {
      addMessage('Fetching CLI data...', 'warning');
      
      const isFileUrl = url.startsWith('file://');
      const fetchOpts = {
        method: 'GET',
        headers: {
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8'
        },
        credentials: 'omit'
      };
      if (!isFileUrl) {
        fetchOpts.headers['User-Agent'] = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)';
        fetchOpts.headers['Accept-Language'] = 'en-US,en;q=0.5';
        fetchOpts.headers['Cache-Control'] = 'no-cache';
        fetchOpts.credentials = 'include';
      }
      
      const response = await fetch(url, fetchOpts);
      let text = await response.text();

      // If HTML only contains an iframe, try to fetch iframe content for CLI parsing.
      if (text && /<iframe\b/i.test(text)) {
        const iframeMatch = text.match(/<iframe[^>]*\s+src=['"]([^'"]+)['"][^>]*>/i);
        if (iframeMatch && iframeMatch[1]) {
          try {
            const iframeSrc = iframeMatch[1].trim();
            const iframeUrl = iframeSrc.startsWith('http')
              ? iframeSrc
              : new URL(iframeSrc, url).toString();
            const iframeResp = await fetch(iframeUrl, fetchOpts);
            const iframeText = await iframeResp.text();
            if (iframeText && iframeText.length > 50) {
              text = iframeText;
            }
          } catch (iframeErr) {
            console.warn('Failed to fetch iframe content for CLI:', iframeErr);
          }
        }
      }
      
      if (!text || text.length < 50) {
        throw new Error('No data found');
      }
      
      console.log('CLI text fetched, length:', text.length);
      console.log('CLI content preview:', text.substring(0, 1000));
      
      // Normalize local timezone labels to UTC+7 for parsing
      const parseText = text
        .replace(/\bTHAI\b/gi, 'UTC+7')
        .replace(/\bBKK\b/gi, 'UTC+7')
      .replace(/\bBangkok\b/gi, 'UTC+7')
      .replace(/\bAsia\/Bangkok\b/gi, 'UTC+7')
        .replace(/\bICT\b/gi, 'UTC+7')
        .replace(/\bT\s*H\s*A\s*I\b/gi, 'UTC+7')
        .replace(/\bT\s*H\b/gi, 'UTC+7')
        .replace(/\bTH\b/gi, 'UTC+7')
        .replace(/\bB\s*K\s*K\b/gi, 'UTC+7')
        .replace(/\bBangkok\b/gi, 'UTC+7')
        .replace(/\bAsia\/Bangkok\b/gi, 'UTC+7')
        .replace(/\bB\s*a\s*n\s*g\s*k\s*o\s*k\b/gi, 'UTC+7')
        .replace(/\bA\s*s\s*i\s*a\s*\/\s*B\s*a\s*n\s*g\s*k\s*o\s*k\b/gi, 'UTC+7')
        .replace(/\bI\s*C\s*T\b/gi, 'UTC+7')
        .replace(/\bU\s*T\s*C\s*\+\s*(\d{1,2})\b/gi, 'UTC+$1')
        .replace(/\bUTC\s*\+\s*(\d{1,2})\b/gi, 'UTC+$1')
        .replace(/\bU\s*T\s*C\b(?!\s*\+)/gi, 'UTC+0')
        .replace(/\bUTC\b(?!\s*\+)/gi, 'UTC+0');

      // Parse CLI show clock output (supports command on separate line)
      const clockEntriesRaw = parseCliClockEntries(parseText);
      const clockMatches = buildCliClockMatches(clockEntriesRaw);
      const cliClockPointAnalysis = analyzeCliClockPoints(parseText);
      const cliClockPointCount = (cliClockPointAnalysis && Array.isArray(cliClockPointAnalysis.points))
        ? cliClockPointAnalysis.points.filter((p) => p && p.status !== 'missing').length
        : 0;
      const cliClockPointIssue = (cliClockPointAnalysis && cliClockPointAnalysis.incompletePoint)
        ? {
            point: cliClockPointAnalysis.incompletePoint.point,
            raw: cliClockPointAnalysis.incompletePoint.raw
          }
        : null;
      const showWordLoose = 's\\s*h(?:\\s*o\\s*w)?';
      const clockWordLoose = 'c\\s*l\\s*o(?:\\s*c(?:\\s*k)?)?';
      const showClockNearRe = new RegExp(`#\\s*${showWordLoose}\\s*${clockWordLoose}|${showWordLoose}\\s*${clockWordLoose}`, 'i');
      const nearClockMatches = clockEntriesRaw
        .map((e, i) => ({ e, i }))
        .filter(({ e }) => {
          if (!e || e.index === undefined || e.index === null) return false;
          const start = Math.max(0, e.index - 140);
          const end = Math.min(parseText.length, e.index + 140);
          return showClockNearRe.test(parseText.slice(start, end));
        })
        .map(({ i }) => clockMatches[i])
        .filter(Boolean);
      let m;
      
      // หา System restarted at: "System restarted at 13:28:13 UTC+7 Tue Dec 2 2025" (รองรับทั้งมีและไม่มี microseconds)
      const restartPattern = /System\s+restarted\s+at\s+(\d{1,2}):(\d{1,2}):(\d{2})(?:\.(\d+))?\s+UTC\+(\d{1,2})\s+(\w+)\s+(\w+)\s+(\d{1,2})\s+(\d{4})/gi;
      const restartMatches = [];
      while ((m = restartPattern.exec(parseText)) !== null) {
        const hour = m[1].padStart(2, '0');
        const min = m[2].padStart(2, '0');
        const sec = m[3];
        const frac = m[4] || '0';
        const tz = String(m[5]).padStart(2, '0');
        const dayName = m[6];
        const month = m[7];
        const date = String(m[8]).padStart(2, '0');
        const year = m[9];
        const normalized = `${hour}:${min}:${sec}.${frac.padEnd(6, '0')} +${tz} ${dayName} ${month} ${date} ${year}`;
        restartMatches.push(normalized);
      }
      
      // สร้าง clockDataArray จาก show clock ที่ครบรูปแบบเป็นหลัก
      // ถ้ามี show clock >= 3 จะใช้เฉพาะบรรทัดที่มีคำสั่ง show clock คู่กับเวลา
      const showClockEntries = clockMatches.filter(e => e.hasShowCmd);
      const clockMatchesForTiming = nearClockMatches.length >= 3
        ? nearClockMatches
        : (showClockEntries.length >= 3 ? showClockEntries : clockMatches);

      // ✅ CLI only: If hour is 1-digit in the original output (e.g. "1:01:10..."),
      // treat "time 2 & 3" as missing (non-standard CLI file format).
      const hasSingleDigitHour = clockEntriesRaw.some((e) => {
        const h = (e && e.parts && e.parts[0] !== undefined && e.parts[0] !== null) ? String(e.parts[0]).trim() : '';
        return h.length === 1;
      });

      let clockDataArray = clockMatchesForTiming.map(t => {
        const match = t.time.match(/(\d{2}):(\d{2}):(\d{2})\.(\d+)\s+([\+\-]\d{2})/);
        if (match) {
          return `${match[1]}:${match[2]}:${match[3]}.${match[4]} ${match[5]}`;
        }
        return null;
      }).filter(t => t !== null);
      
      // หา lastFullTimestamp (เวลาสุดท้าย)
      const time3FullTimestamp = (clockMatchesForTiming && clockMatchesForTiming.length >= 3)
        ? clockMatchesForTiming[2].time
        : null;
      let missingLastTime3 = !time3FullTimestamp;
      let lastFullTimestamp = time3FullTimestamp;
      // Parse Software Version (Cisco): รองรับหลายรูปแบบ และกัน IP/เลขหัวข้อ
      let softwareVersion = extractCiscoSoftwareVersion(text) || null;

      // Parse Interface counters: หา "show interface counter(s) errors" หรือดูจาก interface list
      // ใช้ฟังก์ชัน checkInterfaceCountersValues เหมือน GUI
      const interfaceCountersCheck = checkCliInterfaceCounters(parseText);
      
      // สร้าง clockEntries สำหรับ debug (ใช้ index จากบรรทัดเวลาจริง)
      const clockEntries = clockEntriesRaw.map((entry, idx) => {
        const cm = clockMatches[idx] || { time: '' };
        const timePart = cm.time.match(/(\d{2}):(\d{2}):(\d{2})\.(\d+)\s+([\+\-]\d{2})/);
        return {
          time: timePart ? `${timePart[1]}:${timePart[2]}:${timePart[3]}.${timePart[4]} ${timePart[5]}` : cm.time,
          index: entry.index,
          hasShowCmd: !!cm.hasShowCmd
        };
      });

      const cmdCount = (parseText.match(new RegExp(`#\\s*${showWordLoose}\\s*${clockWordLoose}\\b`, 'gi')) || []).length;
      let clockIncomplete = clockMatchesForTiming.length >= 3
        ? !((nearClockMatches.length >= 3) || (showClockEntries.length >= 3) || (cmdCount >= 3))
        : (clockMatchesForTiming.length > 0 ? clockMatchesForTiming.some(e => !e.hasShowCmd) : true);
      let clockIncompleteReason = null;

      if (hasSingleDigitHour) {
        clockIncomplete = true;
        clockIncompleteReason = 'ไม่พบข้อมูลเวลาที่ 2 และ 3';
        clockDataArray = [];
        missingLastTime3 = true;
        lastFullTimestamp = null;
      }
      if (cliClockPointIssue && cliClockPointIssue.point) {
        clockIncomplete = true;
        clockIncompleteReason = `เจอเวลาที่ ${cliClockPointIssue.point} แต่ข้อมูลไม่ครบ (ผลลัพท์ที่พบ : ${cliClockPointIssue.raw})`;
        missingLastTime3 = true;
        lastFullTimestamp = null;
      }
      
      return {
        timestamp: lastFullTimestamp,
        clockData: clockDataArray.length > 0 ? clockDataArray[clockDataArray.length - 1] : null,
        clockDataArray: clockDataArray,
        lastFullTimestamp: lastFullTimestamp,
        missingLastTime3: missingLastTime3,
        cliClockPointCount: cliClockPointCount,
        cliClockPointIssue: cliClockPointIssue,
        softwareVersion: softwareVersion,
        html: text,
        clockEntries: clockEntries,
        normalized: parseText,
        interfaceCountersCheck: interfaceCountersCheck,
        clearCountersCheck: detectClearCounters(parseText),
        // Item 6: detect any "clear" occurrences (including syslog %CLEAR-*) and return all matching lines.
        clearCheck: detectClearLogAny(parseText),
        clockIncomplete: clockIncomplete,
        clockIncompleteReason: clockIncompleteReason,
        source: 'cli',
        success: true
      };
    } catch (error) {
      console.error('CLI data extraction error:', error);
      throw new Error(`CLI fetch failed: ${error.message}`);
    }
  }

  // Web Page Data Extractor - Enhanced to handle iframe PDFs
  async function extractWebData(url) {
    try {
      addMessage('Fetching website data...', 'warning');

      const isFileUrl = url.startsWith('file://');
      const fetchOpts = {
        method: 'GET',
        headers: {
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8'
        },
        credentials: 'omit'
      };
      if (!isFileUrl) {
        fetchOpts.headers['User-Agent'] = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)';
        fetchOpts.headers['Accept-Language'] = 'en-US,en;q=0.5';
        fetchOpts.headers['Cache-Control'] = 'no-cache';
        fetchOpts.credentials = 'include';
      }

      const fetchWithTimeout = async (targetUrl, opts = {}, timeoutMs = 25000) => {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), timeoutMs);
        try {
          return await fetch(targetUrl, { ...opts, signal: controller.signal });
        } finally {
          clearTimeout(timer);
        }
      };

      const looksLikePdfArrayBuffer = (arrayBuffer) => {
        if (!arrayBuffer || arrayBuffer.byteLength < 4) return false;
        const len = Math.min(arrayBuffer.byteLength, 1024);
        const bytes = new Uint8Array(arrayBuffer, 0, len);
        for (let i = 0; i <= len - 4; i++) {
          if (
            bytes[i] === 0x25 && // %
            bytes[i + 1] === 0x50 && // P
            bytes[i + 2] === 0x44 && // D
            bytes[i + 3] === 0x46 // F
          ) return true;
        }
        return false;
      };

      const decodeHtmlFromArrayBuffer = (arrayBuffer) => {
        if (!arrayBuffer || arrayBuffer.byteLength < 2) return '';
        const decodeWith = (enc) => {
          try {
            return new TextDecoder(enc, { fatal: false }).decode(arrayBuffer);
          } catch (_) {
            return '';
          }
        };
        const utf8 = decodeWith('utf-8');
        const htmlHintRe = /<(?:html|body|iframe|embed|object|a|center)\b/i;
        if (htmlHintRe.test(utf8)) return utf8;
        const win874 = decodeWith('windows-874');
        if (htmlHintRe.test(win874)) return win874;
        return utf8 || win874 || '';
      };

      const extractEmbeddedDocumentUrls = (html, baseUrl) => {
        const out = [];
        const seen = new Set();
        const scoreOf = (u) => {
          let s = 0;
          if (/\.pdf(?:$|[?#])/i.test(u)) s += 100;
          if (/view_ground\.php/i.test(u)) s += 80;
          if (/pm_pic\d*\//i.test(u)) s += 60;
          if (/upload\d+\//i.test(u)) s += 40;
          if (/view_configuration\.php/i.test(u)) s += 20;
          if (/\.php(?:$|[?#])/i.test(u)) s += 10;
          return s;
        };
        const add = (raw) => {
          const v = String(raw || '').trim();
          if (!v) return;
          if (/^(?:javascript:|data:|mailto:|#)/i.test(v)) return;
          let abs = '';
          try { abs = new URL(v, baseUrl).toString(); } catch (_) { return; }
          if (seen.has(abs)) return;
          seen.add(abs);
          out.push({ url: abs, score: scoreOf(abs) });
        };
        try {
          const doc = new DOMParser().parseFromString(String(html || ''), 'text/html');
          for (const el of Array.from(doc.querySelectorAll('iframe[src]'))) add(el.getAttribute('src'));
          for (const el of Array.from(doc.querySelectorAll('embed[src]'))) add(el.getAttribute('src'));
          for (const el of Array.from(doc.querySelectorAll('object[data]'))) add(el.getAttribute('data'));
          for (const el of Array.from(doc.querySelectorAll('a[href]'))) add(el.getAttribute('href'));
        } catch (_) {}

        const absPdf = String(html || '').match(/https?:\/\/[^\s"'<>]+\.pdf[^\s"'<>]*/ig) || [];
        for (const u of absPdf) add(u);

        out.sort((a, b) => b.score - a.score);
        return out.slice(0, 12).map((x) => x.url);
      };

      const tryParsePdfFromUrl = async (targetUrl, sourceLabel, visited, depth = 0) => {
        if (!targetUrl) return null;
        if (visited.has(targetUrl)) return null;
        visited.add(targetUrl);
        try {
          const res = await fetchWithTimeout(targetUrl, fetchOpts, 25000);
          const ct = String(res.headers.get('content-type') || '').toLowerCase();
          const ab = await res.arrayBuffer();
          const pdfByHeader = looksLikePdfArrayBuffer(ab);
          if (ct.includes('application/pdf') || pdfByHeader) {
            const parsed = await parsePdfTextResult(ab, sourceLabel);
            if (parsed) return parsed;
          }
          if (depth >= 1) return null;

          const nestedHtml = decodeHtmlFromArrayBuffer(ab);
          if (!nestedHtml || nestedHtml.length < 20) return null;
          const nestedUrls = extractEmbeddedDocumentUrls(nestedHtml, targetUrl);
          for (const nested of nestedUrls) {
            const parsed = await tryParsePdfFromUrl(nested, `${sourceLabel}_nested`, visited, depth + 1);
            if (parsed) return parsed;
          }
        } catch (_) {
          // ignore candidate failures and continue with next candidate
        }
        return null;
      };

      const parsePdfTextResult = async (pdfArrayBuffer, sourceLabel) => {
        if (!pdfArrayBuffer || pdfArrayBuffer.byteLength <= 100) return null;

        // Set up PDF.js worker
        try {
          pdfjsLib.GlobalWorkerOptions.workerSrc = chrome.runtime.getURL('pdf.worker.min.js');
        } catch (_) {
          // ignore
        }

        // Safe mode for Website extractor: keep popup responsive on large PDFs.
        const maxChars = 900000;
        const yieldEveryPages = 2;

        let pdfDoc = null;
        try {
          pdfDoc = await pdfjsLib.getDocument({ data: pdfArrayBuffer }).promise;
          let pdfText = '';
          for (let pageNum = 1; pageNum <= pdfDoc.numPages; pageNum++) {
            const page = await pdfDoc.getPage(pageNum);
            const textContent = await page.getTextContent();
            const pageText = (textContent.items || []).map(item => item.str).join(' ');
            pdfText += pageText + '\n';

            if (pdfText.length >= maxChars) {
              pdfText = pdfText.slice(0, maxChars);
              break;
            }
            if (yieldEveryPages > 0 && pageNum % yieldEveryPages === 0) {
              await PDFExtractor.pauseTick();
            }
          }

          const lastPagePreview = await buildGuiPdfLastPagePreview(pdfDoc);
          const leafPromptsDoc = findLeafPromptMatches(pdfText);
          if (lastPagePreview) {
            lastPagePreview.leafPromptsDoc = leafPromptsDoc;
          }

          const parsed = DataParser.extractAllMatches(pdfText);
          const guiClock = analyzeGuiShowClock(pdfText);
          const { clockDataArray, lastFullTimestamp } = extractClockDataFromText(pdfText);

          // Keep PDF doc for zoomable, sharp last-page rendering.
          clearLastPagePreviewPdfDoc();
          lastPagePreviewPdfDoc = pdfDoc;
          lastPagePreviewPageNumber = (lastPagePreview && lastPagePreview.pageNumber) ? lastPagePreview.pageNumber : pdfDoc.numPages;
          pdfDoc = null; // owned by preview state now

          // Free page caches from full-text scan (preview rendering will re-load last page as needed).
          try {
            await lastPagePreviewPdfDoc.cleanup();
          } catch (_) {
            // ignore
          }

          return {
            timestamp: guiClock.lastFullTimestamp || lastFullTimestamp || parsed.date || null,
            softwareVersion: extractCiscoSoftwareVersion(pdfText) || parsed.version || null,
            rdCode: parsed.rdCode || null,
            companyOfficer: extractCompanyOfficerNameFromPdfText(pdfText) || null,
            allDates: parsed.allDates || [],
            allVersions: (parsed.allVersions || []).filter(v => looksLikeCiscoVersion(String(v)) && !isLikelyIPv4(String(v))),
            clockDataArray: guiClock.clockDataArray.length > 0 ? guiClock.clockDataArray : clockDataArray,
            clockData: (guiClock.clockDataArray[guiClock.clockDataArray.length - 1] || clockDataArray[clockDataArray.length - 1]) || null,
            lastFullTimestamp: guiClock.lastFullTimestamp || lastFullTimestamp || null,
            html: pdfText,
            clockEntries: guiClock.clockEntries,
            clockNormalized: guiClock.normalized,
            clockIncomplete: guiClock.incomplete,
            clockIncompleteReason: guiClock.reason,
            clearCountersCheck: detectClearCounters(pdfText),
            clearCheck: detectClear(pdfText),
            lastPagePreview,
            source: sourceLabel,
            success: true
          };
        } finally {
          if (pdfDoc && typeof pdfDoc.destroy === 'function') {
            try {
              await pdfDoc.destroy();
            } catch (_) {
              // ignore
            }
          }
        }
      };

      try {
        const response = await fetchWithTimeout(url, fetchOpts, 25000);
        const contentType = (response.headers.get('content-type') || '').toLowerCase();
        const responseArrayBuffer = await response.arrayBuffer();
        const isPdfResponse = contentType.includes('application/pdf');
        const directLooksPdf = looksLikePdfArrayBuffer(responseArrayBuffer);
        if (isPdfResponse || directLooksPdf) {
          const directPdfResult = await parsePdfTextResult(responseArrayBuffer, 'direct_pdf');
          if (directPdfResult) return directPdfResult;
        }

        const html = decodeHtmlFromArrayBuffer(responseArrayBuffer);

        if (html && html.length > 50) {
          console.log('HTML fetched, length:', html.length);
          console.log('HTML content:', html.substring(0, 500));

          // Try embedded document targets (iframe/embed/object/link),
          // including non-.pdf URLs that actually return PDF content.
          const embeddedUrls = extractEmbeddedDocumentUrls(html, url);
          if (embeddedUrls.length) {
            const visited = new Set([url]);
            for (const candidateUrl of embeddedUrls) {
              const parsed = await tryParsePdfFromUrl(candidateUrl, 'embedded_pdf', visited, 0);
              if (parsed) return parsed;
            }
          } else {
            console.log('No embedded document URL found in HTML');
          }

          // Fallback: parse HTML for timestamps
          const timestamps = html.match(/(\d{2}):(\d{2}):(\d{2})/g) || [];
          const guiClock = analyzeGuiShowClock(html);
          const { clockDataArray, lastFullTimestamp } = extractClockDataFromText(html);

          return {
            timestamp: timestamps[timestamps.length - 1] || null,
            clockData: (guiClock.clockDataArray[guiClock.clockDataArray.length - 1] || clockDataArray[clockDataArray.length - 1]) || null,
            clockDataArray: guiClock.clockDataArray.length > 0 ? guiClock.clockDataArray : clockDataArray,
            lastFullTimestamp: guiClock.lastFullTimestamp || lastFullTimestamp || null,
            html: html,
            clockEntries: guiClock.clockEntries,
            clockNormalized: guiClock.normalized,
            clockIncomplete: guiClock.incomplete,
            clockIncompleteReason: guiClock.reason,
            clearCountersCheck: detectClearCounters(html),
            clearCheck: detectClear(html),
            source: 'direct_html',
            success: true
          };
        }
      } catch (directError) {
        console.log('Direct fetch failed, trying alternative method...', directError);
      }

      // Fallback: Use content script via chrome tabs
      return new Promise((resolve, reject) => {
        chrome.tabs.create({ url: url, active: true }, (tab) => {
          const timeoutId = setTimeout(() => {
            chrome.tabs.remove(tab.id);
            reject(new Error('Timeout waiting for page data'));
          }, 5000);

          const listener = (request, sender, sendResponse) => {
            if (sender.tab.id === tab.id && request.action === 'pageDataReady') {
              clearTimeout(timeoutId);
              chrome.runtime.onMessage.removeListener(listener);
              chrome.tabs.remove(tab.id);
              // convert clockDatas to clockDataArray for compatibility
              const data = request.data;
              if (data.clockDatas && !data.clockDataArray) {
                data.clockDataArray = data.clockDatas;
              }
              resolve(data);
            }
          };

          chrome.runtime.onMessage.addListener(listener);

          // Send message to content script
          setTimeout(() => {
            chrome.tabs.sendMessage(tab.id, { action: 'extractData' }, (response) => {
              if (chrome.runtime.lastError) {
                console.log('Content script error:', chrome.runtime.lastError);
              }
            });
          }, 1000);
        });
      });
    } catch (error) {
      console.error('Web data extraction error:', error);
      throw new Error(`Website fetch failed: ${error.message}`);
    }
  }
  // Date Comparison Function - Extract date only part
  function extractDatePart(dateStr) {
    // Handle both CE and Thai Buddhist years
    const match = dateStr.match(/(\d{2})-(\d{2})-(\d{4})\s+(\d{2}):(\d{2}):(\d{2})/);
    if (!match) return null;
    
    let [, day, month, year, hour, minute, second] = match;
    day = parseInt(day);
    month = parseInt(month);
    year = parseInt(year);
    hour = parseInt(hour);
    minute = parseInt(minute);
    second = parseInt(second);
    
    // If year > 2400, it's Buddhist year
    if (year > 2400) {
      year = year - 543;
    }
    
    return new Date(year, month - 1, day, hour, minute, second);
  }

  // Compare if website time is less than or equal to completion date
  function compareDates(webDateStr, completionDateStr) {
    try {
      const webDate = extractDatePart(webDateStr);
      const completionDate = extractDatePart(completionDateStr);
      
      if (!webDate || !completionDate) return null;
      // Return true if webDate <= completionDate (meaning it's on time)
      return webDate <= completionDate;
    } catch (e) {
      console.error('Date comparison error:', e);
      return null;
    }
  }

  // Compare Data - เทียบ Version และ Time
  function compareData(pdfData, webData) {
    // Normalize & canonicalize versions so formats like "17.3.4" and "17.03.04" are treated as the same.
    const normalizeVersionRaw = (v) => {
      if (!v) return null;
      return String(v)
        .trim()
        .replace(/[\u200B\u200C\u200D\uFEFF\u00A0]/g, ' ')
        .replace(/\s+/g, ' ')
        .replace(/[\s,\.;:]+$/g, '');
    };

    const canonicalizeVersion = (v) => {
      const raw = normalizeVersionRaw(v);
      if (!raw) return null;

      // remove wrapping brackets if user copied "(17.03.04)" etc
      let s = raw.replace(/^\s*[\(\[]\s*/, '').replace(/\s*[\)\]]\s*$/, '');

      // split into "main dotted numeric" + "suffix" (e.g. 16.0(9d), 17.3.4b)
      let main = s;
      let suffix = '';
      const mParen = s.match(/^([0-9]+(?:\.[0-9]+)*)(\(.*\))$/);
      if (mParen) {
        main = mParen[1];
        suffix = mParen[2];
      } else {
        const mRest = s.match(/^([0-9]+(?:\.[0-9]+)*)(.*)$/);
        if (mRest) {
          main = mRest[1];
          suffix = mRest[2] || '';
        }
      }

      // remove leading zeros in dot segments: 17.03.04 -> 17.3.4
      const parts = main.split('.').map(p => {
        const n = parseInt(p, 10);
        return Number.isFinite(n) ? String(n) : p;
      });
      let canon = parts.join('.');

      // normalize common "(09d)" -> "(9d)" (keep letters)
      suffix = String(suffix || '')
        .replace(/\s+/g, '')
        .replace(/\((\d+)([a-zA-Z]+)\)/g, (_, num, letters) => `(${parseInt(num, 10)}${letters.toLowerCase()})`)
        .toLowerCase();

      return canon + suffix;
    };

  // Allow match when one side is the other + dot-suffix (e.g. 03.04.04 vs 03.04.04.SG)
  // But do NOT loosen matching for trains in parentheses (e.g. 16.0(9d) vs 16.0(9e)).
  const isDotSuffixCompatible = (a, b) => {
    if (!a || !b) return false;
    if (a === b) return true;

    const isSafeExtra = (extra) => /^[a-z0-9.]+$/.test(extra || '');

    if (a.startsWith(b + '.')) {
      const extra = a.slice((b + '.').length);
      return isSafeExtra(extra);
    }
    if (b.startsWith(a + '.')) {
      const extra = b.slice((a + '.').length);
      return isSafeExtra(extra);
    }
    return false;
  };

    // Version Check (PM vs Log Switch)
    let versionStatus = '❌ version ไม่ตรงกัน';
    let versionMessage = '';
    const pdfVersionRaw = normalizeVersionRaw(pdfData.softwareVersion || null);
    const logVersionRaw = normalizeVersionRaw(webData && webData.softwareVersion ? webData.softwareVersion : null);
    const pdfVersion = canonicalizeVersion(pdfVersionRaw);
    const logVersion = canonicalizeVersion(logVersionRaw);
    if (pdfVersion && logVersion) {
      if (pdfVersion === logVersion || isDotSuffixCompatible(pdfVersion, logVersion)) {
        versionStatus = '✅ Version ตรงกัน';
        const versionNote = (pdfVersion === logVersion) ? '' : ' (ตรวจพบ suffix ต่างกัน แต่ base version ตรงกัน)';
        versionMessage = `ไฟล์ใบงาน Version ${pdfVersionRaw || pdfVersion}${versionNote} ตรงกับจากไฟล์ที่เก็บ Config Switch Version (${logVersionRaw || logVersion})`;
      } else {
        versionStatus = '❌ version ไม่ตรงกัน';
        versionMessage = `ไฟล์ใบงาน Version ${pdfVersionRaw || pdfVersion} ไม่ตรงกับจากไฟล์ที่เก็บ Config Switch Version (${logVersionRaw || logVersion})`;
      }
    } else {
      versionStatus = '❌ version ไม่ตรงกัน';
      versionMessage = 'ไม่สามารถหา Version ได้';
    }

    // Time Check (Last log time <= completion date)
    let timeStatus = '❌ เวลาสุดท้ายในการเก็บ log เทียบกับเวลาที่ดำเนินการเสร็จ';
    let timeMessage = '';

    const resolveLastLogTimestamp = (data) => {
      if (!data) return null;
      if (data.lastFullTimestamp) return data.lastFullTimestamp;
      if (data.timestamp) return data.timestamp;
      if (data.html) {
        const fromHtml = extractClockDataFromText(data.html);
        if (fromHtml && fromHtml.lastFullTimestamp) return fromHtml.lastFullTimestamp;
      }
      return null;
    };

    const isCliSource = !!(webData && webData.source === 'cli');
    const cliClockPointIssue = isCliSource && webData && webData.cliClockPointIssue
      ? webData.cliClockPointIssue
      : null;
    const cliPointCountRaw = isCliSource ? Number(webData && webData.cliClockPointCount) : NaN;
    const cliFoundClockCount = (isCliSource && Number.isFinite(cliPointCountRaw) && cliPointCountRaw >= 0)
      ? cliPointCountRaw
      : ((isCliSource && Array.isArray(webData && webData.clockDataArray)) ? webData.clockDataArray.length : 0);
    const cliFoundClockMessage = `หาเวลาเจอ ${cliFoundClockCount} เวลา`;

    // ✅ CLI only: require exactly 3 time points before comparing with completion time.
    if (pdfData.completionDate && isCliSource && cliFoundClockCount !== 3) {
      timeStatus = '❌ เวลาสุดท้ายในการเก็บ log เทียบกับเวลาที่ดำเนินการเสร็จ';
      timeMessage =
        `เวลาสุดท้ายในการเก็บ (${cliFoundClockMessage})\n` +
        `ไม่สามารถเทียบกับ\n` +
        `เวลาที่ดำเนินการเสร็จ (${pdfData.completionDate})`;
    } else if (pdfData.completionDate && cliClockPointIssue && cliClockPointIssue.point) {
      const issueRaw = cliClockPointIssue.raw || '-';
      timeStatus = '❌ เวลาสุดท้ายในการเก็บ log เทียบกับเวลาที่ดำเนินการเสร็จ';
      timeMessage =
        `เวลาสุดท้ายในการเก็บ (เจอเวลาที่ ${cliClockPointIssue.point} แต่ข้อมูลไม่ครบ)\n` +
        `(ผลลัพท์ที่พบ : ${issueRaw})\n` +
        `ไม่สามารถเทียบกับ\n` +
        `เวลาที่ดำเนินการเสร็จ (${pdfData.completionDate})`;
    } else {
    const lastLogTimestamp = resolveLastLogTimestamp(webData);
    if (pdfData.completionDate && lastLogTimestamp) {
      let webTimestampFormatted = lastLogTimestamp;
      const thaiDateMatch = lastLogTimestamp.match(/(\d{2})-(\d{2})-(\d{4})\s+(\d{2}):(\d{2}):(\d{2})/);
      if (thaiDateMatch) {
        webTimestampFormatted = thaiDateMatch[0];
      } else if (lastLogTimestamp.match(/\d{1,2}:\d{2}:\d{2}\.\d+\s+[\+\-]\d{2}\s+\w+\s+\w+\s+\d+\s+\d{4}/)) {
        const thaiDate = formatTimestampToThaiDate(lastLogTimestamp);
        if (thaiDate) webTimestampFormatted = thaiDate;
      }

      const isOnTime = compareDates(webTimestampFormatted, pdfData.completionDate);
      if (isOnTime === true) {
        timeStatus = '✅ เวลาสุดท้ายในการเก็บ log เทียบกับเวลาที่ดำเนินการเสร็จ';
        timeMessage =
          `เวลาสุดท้ายในการเก็บ log (${webTimestampFormatted})\n` +
          `น้อยกว่าหรือเท่ากับ\n` +
          `เวลาที่ดำเนินการเสร็จ (${pdfData.completionDate})`;
      } else if (isOnTime === false) {
        timeStatus = '❌ เวลาสุดท้ายในการเก็บ log เทียบกับเวลาที่ดำเนินการเสร็จ';
        timeMessage =
          `เวลาสุดท้ายในการเก็บ log (${webTimestampFormatted})\n` +
          `มากกว่า\n` +
          `เวลาที่ดำเนินการเสร็จ (${pdfData.completionDate})`;
      } else {
        timeStatus = '⚠️ เวลาสุดท้ายในการเก็บ log เทียบกับเวลาที่ดำเนินการเสร็จ';
        timeMessage = 'ข้อมูลเวลาไม่ถูกต้อง';
      }
    } else {
      timeStatus = '⚠️ เวลาสุดท้ายในการเก็บ log เทียบกับเวลาที่ดำเนินการเสร็จ';
      timeMessage = 'ไม่พบข้อมูลเวลา';
    }
    }

    // Time Log Check (between 2 and 3)
    let timeLogStatus = '⚠️ เวลาของ Log Switch ระหว่างเวลาที่ 2 กับ 3';
    let timeLogMessage = 'ไม่พบข้อมูลเวลา';

    const clockArr = (webData && Array.isArray(webData.clockDataArray)) ? webData.clockDataArray : [];
    const clockCount = isCliSource ? cliFoundClockCount : clockArr.length;

    if (clockCount !== 3) {
      timeLogStatus = '❌ เวลาของ Log Switch ระหว่างเวลาที่ 2 กับ 3';
      if (clockCount < 3 && webData && webData.source === 'cli') {
        timeLogMessage = `เวลาระหว่าง 2 กับ 3 : ${cliFoundClockMessage}`;
      } else {
        timeLogMessage = `พบเวลา show clock ${clockCount} จุด`;
      }
    } else if (cliClockPointIssue && cliClockPointIssue.point) {
      const issueRaw = cliClockPointIssue.raw || '-';
      timeLogStatus = '❌ เวลาของ Log Switch ระหว่างเวลาที่ 2 กับ 3';
      timeLogMessage =
        `เวลาระหว่าง 2 กับ 3 : เจอเวลาที่ ${cliClockPointIssue.point} แต่ข้อมูลไม่ครบ\n` +
        `(ผลลัพท์ที่พบ : ${issueRaw})`;
    } else {
      const timeBetween = calculateTimeBetween2And3(
        clockArr,
        (webData && webData.source === 'cli') ? { maxDiffMinutes: 30, signedDiff: true } : {}
      );
      if (timeBetween.error) {
        timeLogStatus = '❌ เวลาของ Log Switch ระหว่างเวลาที่ 2 กับ 3';
        timeLogMessage =
          `${timeBetween.error}\n` +
          `(พบเวลา show clock ${clockCount} จุด)`;
      } else {
        timeLogStatus = timeBetween.isValid
          ? '✅ เวลาของ Log Switch ระหว่างเวลาที่ 2 กับ 3'
          : '❌ เวลาของ Log Switch ระหว่างเวลาที่ 2 กับ 3';
        const base = timeBetween.display || `${timeBetween.diffMinutes} นาที`;
        const errorPartMatch = base.match(/^(.*?)(\s*\(error:[^)]+\))$/);
        if (errorPartMatch) {
          const mainLine = String(errorPartMatch[1] || '').trim();
          const errorLine = String(errorPartMatch[2] || '').trim();
          timeLogMessage =
            `เวลาระหว่าง 2 กับ 3 : ${mainLine}\n` +
            `${errorLine}\n` +
            `(พบเวลา show clock ${clockCount} จุด)`;
        } else {
          timeLogMessage =
            `เวลาระหว่าง 2 กับ 3 : ${base}\n` +
            `(พบเวลา show clock ${clockCount} จุด)`;
        }
      }
    }


    // CRC / interface errors
    let crcStatus = '⚠️ เช็ค CRC / interface errors';
    let crcMessage = 'ไม่พบข้อมูล';
    let countersCheckCompare = null;
    if (webData && webData.interfaceCountersCheck) {
      countersCheckCompare = webData.interfaceCountersCheck;
    } else if (webData && webData.html) {
      countersCheckCompare = checkInterfaceCountersValues(webData.html);
    }
    if (countersCheckCompare && countersCheckCompare.found) {
      if (countersCheckCompare.ok) {
        crcStatus = '✅ เช็ค CRC / interface errors';
        crcMessage = countersCheckCompare.message || INTERFACE_COUNTERS_OK_MESSAGE;
      } else {
        crcStatus = '❌ เช็ค CRC / interface errors';
        let detail = countersCheckCompare.message || 'เตือน: พบตัวเลขหรือค่าผิดปกติ';
        const detailBlock = formatCountersProblemLines(countersCheckCompare, 50);
        if (detailBlock) detail += `\n${detailBlock}`;
        crcMessage = detail;
      }
    }

    // Detect Clear counters / Clear
    let clearCountersStatus = '✅ clear counters [Clear "show interface" counters on all interfaces [confirm]]';
    let clearCountersMessage = 'ไม่มี clear counters';
    let clearStatus = '✅ clear counters [LOG]';
    let clearMessage = 'ถูก Detect "Clear": ไม่มี clear';
      // Clear detection: prefer precomputed results; if missing/false, rescan on best-available text (CLI/HTML-safe)
    const clearTextForCompare =
      (webData && typeof webData.normalized === 'string' && webData.normalized) ||
      (webData && typeof webData.html === 'string' && webData.html) ||
      '';

    let clearCountersCheckCompare = (webData && webData.clearCountersCheck) ? webData.clearCountersCheck : null;
    if (!clearCountersCheckCompare) clearCountersCheckCompare = detectClearCounters(clearTextForCompare);

    let clearCheckCompare = (webData && webData.clearCheck) ? webData.clearCheck : null;
    if (!clearCheckCompare) {
      clearCheckCompare = detectClearLogAny(clearTextForCompare);
    } else if (clearCheckCompare.found === false) {
      const rescanned = detectClearLogAny(clearTextForCompare);
      if (rescanned && rescanned.found) clearCheckCompare = rescanned;
    }

    const formatFoundLines = (arr, maxLines = 50) => {
      if (!arr || arr.length === 0) return '';
      const shown = arr.slice(0, maxLines);
      let out = shown.join('\n');
      if (arr.length > shown.length) {
        out += `
  ... (${arr.length - shown.length} more)`;
      }
      return out;
    };

    if (clearCountersCheckCompare) {
      const clearCountersFound = !!(clearCountersCheckCompare.found || (Array.isArray(clearCountersCheckCompare.matches) && clearCountersCheckCompare.matches.length));
      if (clearCountersFound) {
        clearCountersStatus = '❌ clear counters [Clear "show interface" counters on all interfaces [confirm]]';
        const details = formatFoundLines(clearCountersCheckCompare.matches, 50);
        clearCountersMessage = details
          ? `มี clear counters แก้ไขด่วน\nพบ:\n${details}`
          : 'มี clear counters แก้ไขด่วน';
      }
    }
    if (clearCheckCompare) {
      const clearLogFound = !!(clearCheckCompare.found || (Array.isArray(clearCheckCompare.matches) && clearCheckCompare.matches.length));
      if (clearLogFound) {
        clearStatus = '❌ clear counters [LOG]';
        const details = formatFoundLines(clearCheckCompare.matches, 50);
        clearMessage = details
          ? `มี clear แก้ไขด่วน\nพบ:\n${details}`
          : 'มี clear แก้ไขด่วน';
      }
    }

    // Final overall status
    let overallStatus = '✅ Complete';
    const hasError = [versionStatus, timeStatus, timeLogStatus, crcStatus, clearCountersStatus, clearStatus].some(s => s.includes('❌'));
    const hasWarn = [versionStatus, timeStatus, timeLogStatus, crcStatus, clearCountersStatus, clearStatus].some(s => s.includes('⚠️'));
    if (hasError) {
      overallStatus = '❌ ไม่สมบูรณ์';
    } else if (hasWarn) {
      overallStatus = '⚠️ ตรวจสอบใหม่';
    }

    return {
      timeStatus,
      timeMessage,
      versionStatus,
      versionMessage,
      timeLogStatus,
      timeLogMessage,
      crcStatus,
      crcMessage,
      clearCountersStatus,
      clearCountersMessage,
      clearStatus,
      clearMessage,
      overallStatus
    };
  }

  // ==========================================================
  // GUI PDF - Last Page Preview + Leaf prompt detection
  // ==========================================================

  let lastPagePreviewObjectUrl = null;
  let lastPagePreviewPdfDoc = null;
  let lastPagePreviewPageNumber = null;
  let lastPagePreviewRenderTimerId = null;
  let lastPagePreviewRenderSeq = 0;

  let logPicturePreviewObjectUrl = null;
  let logPicturePreviewRenderTimerId = null;
  let logPicturePreviewRenderSeq = 0;

  // Retry rendering when the preview viewport has not been laid out yet (width=0)
  const PREVIEW_VIEWPORT_RETRY_LIMIT = 12;
  const PREVIEW_VIEWPORT_RETRY_DELAY_MS = 80;
  let lastPagePreviewViewportRetryCount = 0;
  let logPicturePreviewViewportRetryCount = 0;

  const LAST_PAGE_PREVIEW_MIN_ZOOM = 100;
  const LAST_PAGE_PREVIEW_MAX_ZOOM = 500;
  const LAST_PAGE_PREVIEW_RENDER_DEBOUNCE_MS = 180;
  const LAST_PAGE_PREVIEW_MAX_RENDER_PIXELS = 24_000_000; // ~96MB for RGBA, best-effort cap
  const LAST_PAGE_PREVIEW_MAX_DPR = 3;

  function revokeLastPagePreviewUrl() {
    if (lastPagePreviewObjectUrl) {
      try {
        URL.revokeObjectURL(lastPagePreviewObjectUrl);
      } catch (_) {
        // ignore
      }
      lastPagePreviewObjectUrl = null;
    }
  }

  function clearLastPagePreviewPdfDoc() {
    const doc = lastPagePreviewPdfDoc;
    lastPagePreviewPdfDoc = null;
    lastPagePreviewPageNumber = null;
    resetLogPicturePreviewUI();
    if (doc && typeof doc.destroy === 'function') {
      Promise.resolve()
        .then(() => doc.destroy())
        .catch(() => { });
    }
  }

  function getLastPageViewportInnerWidth() {
    const viewportEl = document.getElementById('lastPageViewport');
    if (!viewportEl) return null;
    const styles = window.getComputedStyle(viewportEl);
    const padL = parseFloat(styles.paddingLeft) || 0;
    const padR = parseFloat(styles.paddingRight) || 0;
    const w = viewportEl.clientWidth - padL - padR;
    return w > 0 ? w : null;
  }

  async function renderLastPagePreviewImage(zoomPercent, renderSeq) {
    const pdfDoc = lastPagePreviewPdfDoc;
    const pageNumber = lastPagePreviewPageNumber;
    const imgEl = document.getElementById('lastPageImage');
    const viewportWidth = getLastPageViewportInnerWidth();
    if (!pdfDoc || !pageNumber || !imgEl) return;

    // If the viewport hasn't been laid out yet (width=0), retry a few times.
    if (!viewportWidth) {
      if (renderSeq === lastPagePreviewRenderSeq && lastPagePreviewViewportRetryCount < PREVIEW_VIEWPORT_RETRY_LIMIT) {
        lastPagePreviewViewportRetryCount += 1;
        setTimeout(() => renderLastPagePreviewImage(zoomPercent, renderSeq), PREVIEW_VIEWPORT_RETRY_DELAY_MS);
      }
      return;
    }

    const detailsEl = document.getElementById('lastPagePreviewDetails');
    if (detailsEl && detailsEl.style.display === 'none') return;

    try {
      const page = await pdfDoc.getPage(pageNumber);
      if (renderSeq !== lastPagePreviewRenderSeq) return;

      const baseViewport = page.getViewport({ scale: 1 });
      const fitScale = viewportWidth / Math.max(1, Number(baseViewport.width) || 1);
      const zoomScale = clampNumber(zoomPercent, LAST_PAGE_PREVIEW_MIN_ZOOM, LAST_PAGE_PREVIEW_MAX_ZOOM) / 100;
      const dpr = Math.min(Number(window.devicePixelRatio) || 1, LAST_PAGE_PREVIEW_MAX_DPR);
      const desiredScale = fitScale * zoomScale * dpr;
      const renderScale = computeSafePdfRenderScale(page, desiredScale, LAST_PAGE_PREVIEW_MAX_RENDER_PIXELS);
      const viewport = page.getViewport({ scale: renderScale });

      const canvas = document.createElement('canvas');
      canvas.width = Math.max(1, Math.floor(viewport.width));
      canvas.height = Math.max(1, Math.floor(viewport.height));

      const ctx = canvas.getContext('2d', { alpha: false });
      if (!ctx) throw new Error('Canvas context not available');

      await page.render({ canvasContext: ctx, viewport }).promise;
      if (renderSeq !== lastPagePreviewRenderSeq) return;

      const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/png'));
      const newUrl = blob ? URL.createObjectURL(blob) : canvas.toDataURL('image/png');
      if (renderSeq !== lastPagePreviewRenderSeq) {
        if (typeof newUrl === 'string' && newUrl.startsWith('blob:')) {
          try { URL.revokeObjectURL(newUrl); } catch (_) { }
        }
        return;
      }

      const oldUrl = lastPagePreviewObjectUrl;
      imgEl.src = newUrl;

      lastPagePreviewObjectUrl = (typeof newUrl === 'string' && newUrl.startsWith('blob:')) ? newUrl : null;
      if (oldUrl && typeof oldUrl === 'string' && oldUrl.startsWith('blob:')) {
        try { URL.revokeObjectURL(oldUrl); } catch (_) { }
      }
    } catch (e) {
      console.warn('Last page preview render failed:', e);
    }
  }

  function scheduleLastPagePreviewRender(zoomPercent, opts = {}) {
    if (!lastPagePreviewPdfDoc || !lastPagePreviewPageNumber) return;
    const detailsEl = document.getElementById('lastPagePreviewDetails');
    if (!detailsEl || detailsEl.style.display === 'none') return;

    if (lastPagePreviewRenderTimerId) {
      clearTimeout(lastPagePreviewRenderTimerId);
      lastPagePreviewRenderTimerId = null;
    }

    lastPagePreviewRenderSeq += 1;
    const renderSeq = lastPagePreviewRenderSeq;
    lastPagePreviewViewportRetryCount = 0;
    const immediate = !!(opts && opts.immediate);
    const delay = immediate ? 0 : LAST_PAGE_PREVIEW_RENDER_DEBOUNCE_MS;
    lastPagePreviewRenderTimerId = setTimeout(() => {
      lastPagePreviewRenderTimerId = null;
      renderLastPagePreviewImage(zoomPercent, renderSeq);
    }, delay);
  }

  function resetLastPagePreviewUI() {
    const detailsEl = document.getElementById('lastPagePreviewDetails');
    const infoEl = document.getElementById('lastPageInfo');
    const promptEl = document.getElementById('leafPromptText');
    const imgEl = document.getElementById('lastPageImage');
    const zoomEl = document.getElementById('lastPageZoom');
    const zoomLabelEl = document.getElementById('lastPageZoomLabel');

    if (lastPagePreviewRenderTimerId) {
      clearTimeout(lastPagePreviewRenderTimerId);
      lastPagePreviewRenderTimerId = null;
    }
    lastPagePreviewRenderSeq += 1; // cancel in-flight renders
    clearLastPagePreviewPdfDoc();
    revokeLastPagePreviewUrl();

    if (detailsEl) {
      detailsEl.open = false;
      detailsEl.style.display = 'none';
    }
    if (infoEl) infoEl.textContent = '-';
    if (promptEl) {
      promptEl.textContent = '-';
      promptEl.style.color = '';
      promptEl.title = '';
    }
    if (imgEl) {
      imgEl.removeAttribute('src');
      imgEl.style.width = '100%';
    }
    if (zoomEl) zoomEl.value = '100';
    if (zoomLabelEl) zoomLabelEl.textContent = '100%';
  }

  function clampNumber(value, min, max) {
    const n = Number(value);
    if (!Number.isFinite(n)) return min;
    return Math.min(max, Math.max(min, n));
  }

  function setLastPageZoom(percent, opts = {}) {
    const imgEl = document.getElementById('lastPageImage');
    const zoomEl = document.getElementById('lastPageZoom');
    const zoomLabelEl = document.getElementById('lastPageZoomLabel');
    const clamped = Math.round(clampNumber(percent, LAST_PAGE_PREVIEW_MIN_ZOOM, LAST_PAGE_PREVIEW_MAX_ZOOM));
    if (zoomEl) zoomEl.value = String(clamped);
    if (imgEl) imgEl.style.width = `${clamped}%`;
    if (zoomLabelEl) zoomLabelEl.textContent = `${clamped}%`;

    scheduleLastPagePreviewRender(clamped, { immediate: !!opts.immediateRender });
  }

  function setupLastPageZoomControls() {
    const zoomEl = document.getElementById('lastPageZoom');

    if (zoomEl && !zoomEl.dataset.bound) {
      zoomEl.addEventListener('input', () => {
        setLastPageZoom(zoomEl.value);
      });
      zoomEl.dataset.bound = '1';
    }
  }

  function setupLastPageViewportInteractions() {
    const viewportEl = document.getElementById('lastPageViewport');
    const imgEl = document.getElementById('lastPageImage');
    if (!viewportEl || !imgEl) return;

    if (viewportEl.dataset.interactionsBound) return;
    viewportEl.dataset.interactionsBound = '1';

    // Prevent default image drag ghost
    imgEl.addEventListener('dragstart', (e) => e.preventDefault());

    viewportEl.addEventListener('wheel', (e) => {
      const zoomEl = document.getElementById('lastPageZoom');
      if (!zoomEl) return;

      const currentZoom = Math.round(clampNumber(zoomEl.value, LAST_PAGE_PREVIEW_MIN_ZOOM, LAST_PAGE_PREVIEW_MAX_ZOOM));
      if (!Number.isFinite(currentZoom) || currentZoom <= 0) return;

      const direction = e.deltaY === 0 ? 0 : (e.deltaY > 0 ? -1 : 1); // wheel down -> zoom out
      if (direction === 0) return;

      const step = e.shiftKey ? 25 : 10;
      const nextZoom = Math.round(clampNumber(currentZoom + direction * step, LAST_PAGE_PREVIEW_MIN_ZOOM, LAST_PAGE_PREVIEW_MAX_ZOOM));
      if (nextZoom === currentZoom) {
        // If user is trying to zoom beyond bounds, don't convert it into scrolling.
        // (Prevents the viewport from auto-scrolling when already at 100%/500%.)
        if (
          (direction > 0 && currentZoom >= LAST_PAGE_PREVIEW_MAX_ZOOM) ||
          (direction < 0 && currentZoom <= LAST_PAGE_PREVIEW_MIN_ZOOM)
        ) {
          e.preventDefault();
        }
        return;
      }

      const rect = viewportEl.getBoundingClientRect();
      const styles = window.getComputedStyle(viewportEl);
      const padL = parseFloat(styles.paddingLeft) || 0;
      const padT = parseFloat(styles.paddingTop) || 0;

      const pointerX = e.clientX - rect.left - viewportEl.clientLeft; // relative to padding box
      const pointerY = e.clientY - rect.top - viewportEl.clientTop;

      // Keep point-under-cursor stable while zooming (exclude padding from scale math)
      const imgX = viewportEl.scrollLeft + pointerX - padL;
      const imgY = viewportEl.scrollTop + pointerY - padT;
      const ratio = nextZoom / currentZoom;

      e.preventDefault();
      setLastPageZoom(nextZoom);

      requestAnimationFrame(() => {
        viewportEl.scrollLeft = (imgX * ratio) - pointerX + padL;
        viewportEl.scrollTop = (imgY * ratio) - pointerY + padT;
      });
    }, { passive: false });

    let isDragging = false;
    let dragPointerId = null;
    let startX = 0;
    let startY = 0;
    let startScrollLeft = 0;
    let startScrollTop = 0;

    const isOnScrollbar = (ev) => {
      const rect = viewportEl.getBoundingClientRect();
      const x = ev.clientX - rect.left;
      const y = ev.clientY - rect.top;
      const onVScrollbar = x > (viewportEl.clientLeft + viewportEl.clientWidth);
      const onHScrollbar = y > (viewportEl.clientTop + viewportEl.clientHeight);
      return onVScrollbar || onHScrollbar;
    };

    viewportEl.addEventListener('pointerdown', (e) => {
      if (e.button !== 0) return;
      if (isOnScrollbar(e)) return;

      isDragging = true;
      dragPointerId = e.pointerId;
      startX = e.clientX;
      startY = e.clientY;
      startScrollLeft = viewportEl.scrollLeft;
      startScrollTop = viewportEl.scrollTop;
      viewportEl.classList.add('is-dragging');

      try {
        viewportEl.setPointerCapture(e.pointerId);
      } catch (_) {
        // ignore
      }
      e.preventDefault();
    });

    viewportEl.addEventListener('pointermove', (e) => {
      if (!isDragging) return;
      if (dragPointerId != null && e.pointerId !== dragPointerId) return;

      const dx = e.clientX - startX;
      const dy = e.clientY - startY;
      viewportEl.scrollLeft = startScrollLeft - dx;
      viewportEl.scrollTop = startScrollTop - dy;
    });

    const endDrag = (e) => {
      if (!isDragging) return;
      if (dragPointerId != null && e && e.pointerId != null && e.pointerId !== dragPointerId) return;

      isDragging = false;
      dragPointerId = null;
      viewportEl.classList.remove('is-dragging');
    };

    viewportEl.addEventListener('pointerup', endDrag);
    viewportEl.addEventListener('pointercancel', endDrag);
    viewportEl.addEventListener('lostpointercapture', endDrag);
  }

  function normalizeTextForPromptScan(text) {
    if (!text || typeof text !== 'string') return '';
    return text
      // Normalize dash/hash variants commonly seen in PDFs
      .replace(/[\u2010\u2011\u2012\u2013\u2014\u2212\uFE63\uFF0D\u2043\u02D7\u00AD]/g, '-')
      .replace(/[\uFF03]/g, '#')
      .replace(/[\u200B\u200C\u200D\uFEFF\u00A0\u2002\u2003]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  function stripPromptHash(token) {
    return String(token || '').replace(/#+$/, '');
  }

  function extractDeviceNameFromText(text) {
    const normalized = normalizeTextForPromptScan(text);
    if (!normalized) return null;
    const m = /Device\s*name\s*:\s*([A-Za-z0-9][A-Za-z0-9-]{2,})/i.exec(normalized);
    if (m) return m[1];
    return null;
  }

  function findLeafPromptMatches(text) {
    const normalized = normalizeTextForPromptScan(text);
    if (!normalized) return [];

    const out = [];
    const squeezed = normalized.replace(/\s+/g, '');

    const cleanToken = (raw, ensureHash = false) => {
      let token = String(raw || '').trim();
      token = token.replace(/\s+/g, '').replace(/-+/g, '-');
      token = token.replace(/^(Leaf|Spine)-(?:\1-)+/i, '$1-'); // collapse duplicate prefix

      if (ensureHash && !token.endsWith('#')) token += '#';

      // must contain a digit (reduce false positives)
      if (!/\d/.test(token)) return null;

      // must end with "-Rxxxx-<digits>#"
      if (!/-r[a-z0-9]+-\d{2,5}#$/i.test(token)) return null;

      // length guard (avoid spanning across whole HTML)
      if (token.length < 8 || token.length > 60) return null;

      return /^(?:Leaf|Spine)-[A-Za-z0-9-]+#$/i.test(token) ? token : null;
    };

    // Prefer exact CLI-like prompt with '#'
    const withHashRe = /(?:Leaf|Spine)-[A-Za-z0-9-]{5,60}#/gi;
    let m;
    while ((m = withHashRe.exec(squeezed)) !== null) {
      const token = cleanToken(m[0], false);
      if (token) out.push(token);
    }

    // Fallback: device name without '#': Leaf/Spine-DC/DR-Rxxx-1203
    if (out.length === 0) {
      const noHashRe = /(?:Leaf|Spine)-(?:DC|DR)-R[A-Za-z0-9]+-\d{2,5}/gi;
      while ((m = noHashRe.exec(squeezed)) !== null) {
        const token = cleanToken(m[0], true);
        if (token) out.push(token);
      }
    }

    // Final fallback: older loose pattern (still validated by cleanToken)
    if (out.length === 0) {
      const looseRe = /(?:Leaf|Spine)-(?:[A-Za-z0-9]+-){2,}[A-Za-z0-9]+/gi;
      while ((m = looseRe.exec(squeezed)) !== null) {
        const token = cleanToken(m[0], true);
        if (token) out.push(token);
      }
    }

    // De-dupe while keeping order
    const seen = new Set();
    return out.filter((x) => {
      const key = String(x).toLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }

  function computeSafePdfRenderScale(page, desiredScale, maxPixels = 8_000_000) {
    try {
      const baseViewport = page.getViewport({ scale: 1 });
      const basePixels = Number(baseViewport.width) * Number(baseViewport.height);
      if (!Number.isFinite(basePixels) || basePixels <= 0) return desiredScale;
      const desiredPixels = basePixels * desiredScale * desiredScale;
      if (desiredPixels <= maxPixels) return desiredScale;
      const safeScale = Math.sqrt(maxPixels / basePixels);
      return Math.max(0.35, Math.min(desiredScale, safeScale));
    } catch (e) {
      return desiredScale;
    }
  }

  async function buildGuiPdfLastPagePreview(pdfDoc) {
    if (!pdfDoc || !pdfDoc.numPages) return null;

    const numPages = pdfDoc.numPages;
    const pageNumber = numPages;
    try {
      const page = await pdfDoc.getPage(pageNumber);

      // Extract text (for Leaf prompt detection)
      let lastPageText = '';
      try {
        const textContent = await page.getTextContent();
        lastPageText = (textContent.items || []).map((it) => it.str).join(' ');
      } catch (e) {
        lastPageText = '';
      }
      const leafPrompts = findLeafPromptMatches(lastPageText);

      return {
        numPages,
        pageNumber,
        leafPrompts,
        leafPromptFound: leafPrompts.length > 0,
        textSnippet: normalizeTextForPromptScan(lastPageText).slice(0, 4000),
      };
    } catch (e) {
      console.warn('Failed to build last page preview:', e);
      return {
        numPages,
        pageNumber,
        leafPrompts: [],
        leafPromptFound: false,
        error: e && e.message ? e.message : String(e)
      };
    }
  }

  function updateLastPagePreviewUI(lastPagePreview, selectedMode) {
    const detailsEl = document.getElementById('lastPagePreviewDetails');
    if (!detailsEl) return;

    if (selectedMode !== 'GUI' || !lastPagePreview) {
      resetLastPagePreviewUI();
      return;
    }

    const infoEl = document.getElementById('lastPageInfo');
    const promptEl = document.getElementById('leafPromptText');
    const imgEl = document.getElementById('lastPageImage');

    detailsEl.style.display = 'block';
    detailsEl.open = true;

    if (infoEl) {
      const pn = lastPagePreview.pageNumber || '-';
      const np = lastPagePreview.numPages || '-';
      infoEl.textContent = `${pn}/${np}`;
    }

    if (promptEl) {
      const prompts = (Array.isArray(lastPagePreview.leafPrompts) && lastPagePreview.leafPrompts.length > 0)
        ? lastPagePreview.leafPrompts
        : (Array.isArray(lastPagePreview.leafPromptsDoc) ? lastPagePreview.leafPromptsDoc : []);
      if (prompts.length > 0) {
        promptEl.textContent = prompts[0];
        promptEl.style.color = 'green';
        promptEl.title = prompts.length > 1 ? prompts.join(', ') : prompts[0];
      } else {
        promptEl.textContent = 'Not found';
        promptEl.style.color = 'red';
        promptEl.title = 'ไม่พบ Leaf-...# ในหน้าสุดท้าย (ถ้า PDF เป็นรูป อาจไม่มี text layer)';
      }
    }

    revokeLastPagePreviewUrl();
    if (imgEl) {
      imgEl.removeAttribute('src');
      imgEl.style.width = '100%';
    }

    // Default: 100% (no zoom-out), then render a sharp preview for current zoom.
    setLastPageZoom(100, { immediateRender: true });
  }


  // ==========================================================
  // Comparison - "LOG Picture" preview (GUI only)
  // Uses the same pdfDoc/pageNumber as the Last Page Preview, but renders
  // into its own viewport so users can check the picture directly in item #7.
  // ==========================================================

  function revokeLogPicturePreviewUrl() {
    if (logPicturePreviewObjectUrl) {
      try {
        URL.revokeObjectURL(logPicturePreviewObjectUrl);
      } catch (_) {
        // ignore
      }
      logPicturePreviewObjectUrl = null;
    }
  }

  function getLogPictureViewportInnerWidth() {
    const viewportEl = document.getElementById('logPictureViewport');
    if (!viewportEl) return null;
    const styles = window.getComputedStyle(viewportEl);
    const padL = parseFloat(styles.paddingLeft) || 0;
    const padR = parseFloat(styles.paddingRight) || 0;
    const w = viewportEl.clientWidth - padL - padR;
    return w > 0 ? w : null;
  }

  async function renderLogPicturePreviewImage(zoomPercent, renderSeq) {
    const pdfDoc = lastPagePreviewPdfDoc;
    const pageNumber = lastPagePreviewPageNumber;
    const previewWrap = document.getElementById('logPicturePreview');
    const imgEl = document.getElementById('logPictureImage');
    const viewportWidth = getLogPictureViewportInnerWidth();

    if (!pdfDoc || !pageNumber || !previewWrap || previewWrap.style.display === 'none' || !imgEl) return;

    // If the viewport hasn't been laid out yet (width=0), retry a few times.
    if (!viewportWidth) {
      if (renderSeq === logPicturePreviewRenderSeq && logPicturePreviewViewportRetryCount < PREVIEW_VIEWPORT_RETRY_LIMIT) {
        logPicturePreviewViewportRetryCount += 1;
        setTimeout(() => renderLogPicturePreviewImage(zoomPercent, renderSeq), PREVIEW_VIEWPORT_RETRY_DELAY_MS);
      }
      return;
    }

    try {
      const page = await pdfDoc.getPage(pageNumber);
      if (renderSeq !== logPicturePreviewRenderSeq) return;

      const baseViewport = page.getViewport({ scale: 1 });
      const fitScale = viewportWidth / Math.max(1, Number(baseViewport.width) || 1);
      const zoomScale = clampNumber(zoomPercent, LAST_PAGE_PREVIEW_MIN_ZOOM, LAST_PAGE_PREVIEW_MAX_ZOOM) / 100;
      const dpr = Math.min(Number(window.devicePixelRatio) || 1, LAST_PAGE_PREVIEW_MAX_DPR);
      const desiredScale = fitScale * zoomScale * dpr;
      const renderScale = computeSafePdfRenderScale(page, desiredScale, LAST_PAGE_PREVIEW_MAX_RENDER_PIXELS);
      const viewport = page.getViewport({ scale: renderScale });

      const canvas = document.createElement('canvas');
      canvas.width = Math.max(1, Math.floor(viewport.width));
      canvas.height = Math.max(1, Math.floor(viewport.height));

      const ctx = canvas.getContext('2d', { alpha: false });
      if (!ctx) throw new Error('Canvas context not available');

      await page.render({ canvasContext: ctx, viewport }).promise;
      if (renderSeq !== logPicturePreviewRenderSeq) return;

      const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/png'));
      const newUrl = blob ? URL.createObjectURL(blob) : canvas.toDataURL('image/png');
      if (renderSeq !== logPicturePreviewRenderSeq) {
        if (typeof newUrl === 'string' && newUrl.startsWith('blob:')) {
          try { URL.revokeObjectURL(newUrl); } catch (_) { }
        }
        return;
      }

      const oldUrl = logPicturePreviewObjectUrl;
      imgEl.src = newUrl;
      logPicturePreviewObjectUrl = (typeof newUrl === 'string' && newUrl.startsWith('blob:')) ? newUrl : null;

      if (oldUrl && typeof oldUrl === 'string' && oldUrl.startsWith('blob:')) {
        try { URL.revokeObjectURL(oldUrl); } catch (_) { }
      }
    } catch (e) {
      console.warn('LOG Picture preview render failed:', e);
    }
  }

  function scheduleLogPicturePreviewRender(zoomPercent, opts = {}) {
    const previewWrap = document.getElementById('logPicturePreview');
    if (!previewWrap || previewWrap.style.display === 'none') return;
    if (!lastPagePreviewPdfDoc || !lastPagePreviewPageNumber) return;

    if (logPicturePreviewRenderTimerId) {
      clearTimeout(logPicturePreviewRenderTimerId);
      logPicturePreviewRenderTimerId = null;
    }

    logPicturePreviewRenderSeq += 1;
    const renderSeq = logPicturePreviewRenderSeq;
    logPicturePreviewViewportRetryCount = 0;
    const immediate = !!(opts && opts.immediate);
    const delay = immediate ? 0 : LAST_PAGE_PREVIEW_RENDER_DEBOUNCE_MS;

    logPicturePreviewRenderTimerId = setTimeout(() => {
      logPicturePreviewRenderTimerId = null;
      renderLogPicturePreviewImage(zoomPercent, renderSeq);
    }, delay);
  }

  function setLogPictureZoom(percent, opts = {}) {
    const imgEl = document.getElementById('logPictureImage');
    const zoomEl = document.getElementById('logPictureZoom');
    const zoomLabelEl = document.getElementById('logPictureZoomLabel');
    const clamped = Math.round(clampNumber(percent, LAST_PAGE_PREVIEW_MIN_ZOOM, LAST_PAGE_PREVIEW_MAX_ZOOM));

    if (zoomEl) zoomEl.value = String(clamped);
    if (imgEl) imgEl.style.width = `${clamped}%`;
    if (zoomLabelEl) zoomLabelEl.textContent = `${clamped}%`;

    scheduleLogPicturePreviewRender(clamped, { immediate: !!opts.immediateRender });
  }

  function resetLogPicturePreviewUI() {
    revokeLogPicturePreviewUrl();
    const imgEl = document.getElementById('logPictureImage');
    if (imgEl) {
      imgEl.removeAttribute('src');
      imgEl.style.width = '100%';
    }
    const infoEl = document.getElementById('logPictureInfo');
    if (infoEl) infoEl.textContent = '-';
    const zoomEl = document.getElementById('logPictureZoom');
    const zoomLabelEl = document.getElementById('logPictureZoomLabel');
    if (zoomEl) zoomEl.value = '100';
    if (zoomLabelEl) zoomLabelEl.textContent = '100%';
  }

  function setupLogPictureZoomControls() {
    const zoomEl = document.getElementById('logPictureZoom');
    if (zoomEl && !zoomEl.dataset.bound) {
      zoomEl.addEventListener('input', () => {
        setLogPictureZoom(zoomEl.value);
      });
      zoomEl.dataset.bound = '1';
    }
  }

  function setupLogPictureViewportInteractions() {
    const viewportEl = document.getElementById('logPictureViewport');
    const imgEl = document.getElementById('logPictureImage');
    if (!viewportEl || !imgEl) return;

    if (viewportEl.dataset.interactionsBound) return;
    viewportEl.dataset.interactionsBound = '1';

    imgEl.addEventListener('dragstart', (e) => e.preventDefault());

    viewportEl.addEventListener('wheel', (e) => {
      const zoomEl = document.getElementById('logPictureZoom');
      if (!zoomEl) return;

      const currentZoom = Math.round(clampNumber(zoomEl.value, LAST_PAGE_PREVIEW_MIN_ZOOM, LAST_PAGE_PREVIEW_MAX_ZOOM));
      if (!Number.isFinite(currentZoom) || currentZoom <= 0) return;

      const direction = e.deltaY === 0 ? 0 : (e.deltaY > 0 ? -1 : 1); // wheel down -> zoom out
      if (direction === 0) return;

      const step = e.shiftKey ? 25 : 10;
      const nextZoom = Math.round(clampNumber(currentZoom + direction * step, LAST_PAGE_PREVIEW_MIN_ZOOM, LAST_PAGE_PREVIEW_MAX_ZOOM));
      if (nextZoom === currentZoom) {
        if (
          (direction > 0 && currentZoom >= LAST_PAGE_PREVIEW_MAX_ZOOM) ||
          (direction < 0 && currentZoom <= LAST_PAGE_PREVIEW_MIN_ZOOM)
        ) {
          e.preventDefault();
        }
        return;
      }

      const rect = viewportEl.getBoundingClientRect();
      const styles = window.getComputedStyle(viewportEl);
      const padL = parseFloat(styles.paddingLeft) || 0;
      const padT = parseFloat(styles.paddingTop) || 0;

      const pointerX = e.clientX - rect.left - viewportEl.clientLeft;
      const pointerY = e.clientY - rect.top - viewportEl.clientTop;

      const imgX = viewportEl.scrollLeft + pointerX - padL;
      const imgY = viewportEl.scrollTop + pointerY - padT;
      const ratio = nextZoom / currentZoom;

      e.preventDefault();
      setLogPictureZoom(nextZoom);

      requestAnimationFrame(() => {
        viewportEl.scrollLeft = (imgX * ratio) - pointerX + padL;
        viewportEl.scrollTop = (imgY * ratio) - pointerY + padT;
      });
    }, { passive: false });

    let isDragging = false;
    let dragPointerId = null;
    let startX = 0;
    let startY = 0;
    let startScrollLeft = 0;
    let startScrollTop = 0;

    const isOnScrollbar = (ev) => {
      const rect = viewportEl.getBoundingClientRect();
      const x = ev.clientX - rect.left;
      const y = ev.clientY - rect.top;
      const onVScrollbar = x > (viewportEl.clientLeft + viewportEl.clientWidth);
      const onHScrollbar = y > (viewportEl.clientTop + viewportEl.clientHeight);
      return onVScrollbar || onHScrollbar;
    };

    viewportEl.addEventListener('pointerdown', (e) => {
      if (e.button !== 0) return;
      if (isOnScrollbar(e)) return;

      isDragging = true;
      dragPointerId = e.pointerId;
      startX = e.clientX;
      startY = e.clientY;
      startScrollLeft = viewportEl.scrollLeft;
      startScrollTop = viewportEl.scrollTop;
      viewportEl.classList.add('is-dragging');

      try { viewportEl.setPointerCapture(e.pointerId); } catch (_) { }
      e.preventDefault();
    });

    viewportEl.addEventListener('pointermove', (e) => {
      if (!isDragging) return;
      if (dragPointerId != null && e.pointerId !== dragPointerId) return;

      const dx = e.clientX - startX;
      const dy = e.clientY - startY;
      viewportEl.scrollLeft = startScrollLeft - dx;
      viewportEl.scrollTop = startScrollTop - dy;
    });

    const endDrag = (e) => {
      if (!isDragging) return;
      if (dragPointerId != null && e && e.pointerId != null && e.pointerId !== dragPointerId) return;

      isDragging = false;
      dragPointerId = null;
      viewportEl.classList.remove('is-dragging');
    };

    viewportEl.addEventListener('pointerup', endDrag);
    viewportEl.addEventListener('pointercancel', endDrag);
    viewportEl.addEventListener('lostpointercapture', endDrag);
  }

  // Bind zoom controls once (popup runs in a single document)
  setupLastPageZoomControls();
  setupLastPageViewportInteractions();
  setupLogPictureZoomControls();
  setupLogPictureViewportInteractions();
  resetLastPagePreviewUI();
  resetLogPicturePreviewUI();

  // Re-render on resize to keep preview sharp (fit-scale depends on viewport width)
  window.addEventListener('resize', () => {
    const zoomEl = document.getElementById('lastPageZoom');
    if (zoomEl) scheduleLastPagePreviewRender(zoomEl.value);

    const logZoomEl = document.getElementById('logPictureZoom');
    if (logZoomEl) scheduleLogPicturePreviewRender(logZoomEl.value);
  });

  // Clear preview when switching GUI/CLI modes (avoid stale preview)
  const modeGuiRadio = document.getElementById('modeGUI');
  const modeCliRadio = document.getElementById('modeCLI');
  if (modeGuiRadio) modeGuiRadio.addEventListener('change', () => resetLastPagePreviewUI());
  if (modeCliRadio) modeCliRadio.addEventListener('change', () => resetLastPagePreviewUI());

  function setActionLoading(buttonId, loadingBarId, isLoading) {
    const btn = document.getElementById(buttonId);
    const bar = document.getElementById(loadingBarId);

    if (bar) {
      bar.hidden = !isLoading;
    }

    if (!btn) return;

    if (isLoading) {
      btn.dataset.wasDisabled = btn.disabled ? '1' : '0';
      btn.disabled = true;
      btn.setAttribute('aria-busy', 'true');
    } else {
      const prev = btn.dataset.wasDisabled;
      if (prev != null) {
        btn.disabled = prev === '1';
        delete btn.dataset.wasDisabled;
      } else {
        btn.disabled = false;
      }
      btn.removeAttribute('aria-busy');
    }
  }

  function setResultsState(resultsEl, state) {
    if (!resultsEl) return;
    resultsEl.classList.remove('results--warning', 'results--error');
    // Clear legacy inline styling so theme CSS can apply
    resultsEl.style.borderLeftColor = '';
    resultsEl.style.backgroundColor = '';
    if (state === 'warning') resultsEl.classList.add('results--warning');
    if (state === 'error') resultsEl.classList.add('results--error');
  }

  function setCmpClass(el, cls) {
    if (!el) return;
    el.classList.remove('cmp-ok', 'cmp-warning', 'cmp-error');
    // Clear legacy inline styling so theme CSS can apply
    el.style.color = '';
    if (cls) el.classList.add(cls);
  }

  // ==========================================================
  // Check mode toggle:
  // - ALL: show only #pmDebugSection
  // - SINGLE: show PDF/LOG/Compare sections
  // - IPPHONE: show only #ipPhoneSection
  // - PDFCHECK: show only #pdfCheckSection
  // ==========================================================
  (function setupCheckModeToggle() {
    const allRadio = document.getElementById('checkModeAll');
    const singleRadio = document.getElementById('checkModeSingle');
    const ipPhoneRadio = document.getElementById('checkModeIpPhone');
    const pdfCheckRadio = document.getElementById('checkModePdf');
    if (!allRadio || !singleRadio) return;

    const pmDebugSection = document.getElementById('pmDebugSection');
    const ipPhoneSection = document.getElementById('ipPhoneSection');
    const pdfCheckSection = document.getElementById('pdfCheckSection');
    const pdfSection = document.getElementById('pdfSection');
    const logSection = document.getElementById('logSection');
    const compareSection = document.getElementById('compareSection');
    const messagesEl = document.getElementById('messages');

    // Force the popup to always start from "ALL" mode on open.
    allRadio.checked = true;
    singleRadio.checked = false;
    if (ipPhoneRadio) ipPhoneRadio.checked = false;
    if (pdfCheckRadio) pdfCheckRadio.checked = false;

    const apply = () => {
      const isAll = !!allRadio.checked;
      const isIpPhone = !!(ipPhoneRadio && ipPhoneRadio.checked);
      const isPdfCheck = !!(pdfCheckRadio && pdfCheckRadio.checked);
      const hideSingleModeSections = isAll || isIpPhone || isPdfCheck;

      if (pmDebugSection) pmDebugSection.hidden = !isAll;
      if (ipPhoneSection) ipPhoneSection.hidden = !isIpPhone;
      if (pdfCheckSection) pdfCheckSection.hidden = !isPdfCheck;
      if (pdfSection) pdfSection.hidden = hideSingleModeSections;
      if (logSection) logSection.hidden = hideSingleModeSections;
      if (compareSection) compareSection.hidden = hideSingleModeSections;
      if (messagesEl) messagesEl.hidden = hideSingleModeSections;
    };

    const onChange = () => {
      apply();
    };

    allRadio.addEventListener('change', onChange);
    singleRadio.addEventListener('change', onChange);
    if (ipPhoneRadio) ipPhoneRadio.addEventListener('change', onChange);
    if (pdfCheckRadio) pdfCheckRadio.addEventListener('change', onChange);
    apply();
  })(); 

  /* =========================================================
    IP Phone Photo Check:
    pm_title -> pm_editcall_approve_device -> rack_detail_IP/TOR -> pic_ip_phone
    + validate worksheet PDF fields
  ========================================================= */
  (function setupIpPhonePhotoChecker() {
    const pmTitleInput = document.getElementById('ipPhonePmTitleUrl');
    const runBtn = document.getElementById('ipPhoneCheckBtn');
    const stopBtn = document.getElementById('ipPhoneStopBtn');
    const progressEl = document.getElementById('ipPhoneProgress');
    const summaryEl = document.getElementById('ipPhoneSummary');
    const resultsEl = document.getElementById('ipPhoneResults');
    const pagerEl = document.getElementById('ipPhonePager');
    const pagerBottomEl = document.getElementById('ipPhonePagerBottom');
    const prevBtn = document.getElementById('ipPhonePrevBtn');
    const nextBtn = document.getElementById('ipPhoneNextBtn');
    const pageInfoEl = document.getElementById('ipPhonePageInfo');
    const prevBtnBottom = document.getElementById('ipPhonePrevBtnBottom');
    const nextBtnBottom = document.getElementById('ipPhoneNextBtnBottom');
    const pageInfoBottomEl = document.getElementById('ipPhonePageInfoBottom');

    if (!pmTitleInput || !runBtn || !stopBtn || !progressEl || !summaryEl || !resultsEl || !pagerEl || !prevBtn || !nextBtn || !pageInfoEl) return;

    const MAX_PAGES = 200;
    let abortFlag = false;
    let isRunning = false;
    let currentBaseUrl = '';
    let currentPage = 1;
    let maxKnownPage = null;
    const pageCache = new Map();

    function setProgress(text) {
      progressEl.textContent = text || '';
    }

    function resetResultArea() {
      resultsEl.innerHTML = '';
      summaryEl.textContent = '';
      summaryEl.style.display = 'none';
    }

    function setPagerVisible(visible) {
      pagerEl.style.display = visible ? 'flex' : 'none';
      if (pagerBottomEl) pagerBottomEl.style.display = visible ? 'flex' : 'none';
    }

    function getPageStartIndex(page, rowCountForFallback) {
      let start = 1;
      for (let p = 1; p < page; p++) {
        const prevRows = pageCache.get(p);
        if (!prevRows) {
          const fallbackRowCount = Math.max(1, Number(rowCountForFallback) || 1);
          return ((page - 1) * fallbackRowCount) + 1;
        }
        start += prevRows.length;
      }
      return start;
    }

    function getPageRange(page, rowCount) {
      const count = Math.max(0, Number(rowCount) || 0);
      const start = getPageStartIndex(page, count);
      const end = count > 0 ? (start + count - 1) : (start - 1);
      return { start, end };
    }

    function buildPageProgressText(page, rowCount) {
      const range = getPageRange(page, rowCount);
      const hasNext = !maxKnownPage || page < maxKnownPage;
      const nextHint = hasNext ? ' • ยังมีหน้าถัดไป' : '';
      return `หน้า ${page} • แสดงลำดับ ${range.start}-${range.end} (${rowCount} รายการ)${nextHint}`;
    }

    function syncPagerState() {
      const hasPrev = currentPage > 1;
      const hasNext = !maxKnownPage || currentPage < maxKnownPage;
      prevBtn.disabled = isRunning || !hasPrev;
      nextBtn.disabled = isRunning || !hasNext;
      if (prevBtnBottom) prevBtnBottom.disabled = isRunning || !hasPrev;
      if (nextBtnBottom) nextBtnBottom.disabled = isRunning || !hasNext;
      const pageText = maxKnownPage
        ? `หน้า ${currentPage} / ${maxKnownPage}`
        : `หน้า ${currentPage}`;
      pageInfoEl.textContent = pageText;
      if (pageInfoBottomEl) pageInfoBottomEl.textContent = pageText;
    }

    function normalizeSerial(v) {
      return String(v || '').replace(/\s+/g, '').trim().toUpperCase();
    }

    function escapeHtml(s) {
      return String(s)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
    }

    function toAbsUrl(raw, baseUrl) {
      try {
        if (!raw) return null;
        return new URL(String(raw).trim(), baseUrl).toString();
      } catch (_) {
        return null;
      }
    }

    function updateSummary() {
      const cards = Array.from(resultsEl.querySelectorAll('.debug-card'));
      const total = cards.length;
      if (!total) {
        summaryEl.textContent = '';
        summaryEl.style.display = 'none';
        return;
      }

      let okCount = 0;
      let errCount = 0;
      for (const card of cards) {
        const statusEl = card.querySelector('.sn-status');
        if (!statusEl) continue;
        if (statusEl.classList.contains('sn-status-ok')) okCount++;
        else if (statusEl.classList.contains('sn-status-err')) errCount++;
      }

      summaryEl.textContent = `สถานะ : ปกติ ${okCount} อัน | สถานะ : ผิดปกติ ${errCount} อัน | ทั้งหมด : ${total} อัน`;
      summaryEl.style.display = 'block';
    }

    function extractWorksheetSerialFromPdfText(text, fallbackSn) {
      const src = normalizeTextForLineScan(text || '');
      const srcUpper = src.toUpperCase();
      const fallback = normalizeSerial(fallbackSn);

      const labelRe = /(?:หมายเลขเครื่อง|SERIAL\s*NO\.?|SERIAL\s*NUMBER|S\/N|SN)\s*[:：]?\s*([A-Z0-9\-]{6,})/i;
      const labeled = srcUpper.match(labelRe);
      if (labeled && labeled[1]) return normalizeSerial(labeled[1]);

      const tokenRe = /\b[A-Z]{2,6}[0-9][A-Z0-9\-]{5,}\b/g;
      const allTokens = srcUpper.match(tokenRe) || [];
      const filtered = allTokens.filter((t) => !/^RD\d{2}/i.test(t));

      if (filtered.length) {
        const preferred = filtered.find((t) => !fallback || normalizeSerial(t) !== fallback);
        return normalizeSerial(preferred || filtered[0]);
      }

      return fallback || null;
    }

    async function fetchText(url) {
      const res = await fetch(url, { credentials: 'include', cache: 'no-store' });
      if (!res.ok) throw new Error(`HTTP ${res.status} ${res.statusText}`);
      return await res.text();
    }

    async function fetchPdfArrayBuffer(url) {
      const res = await fetch(url, { credentials: 'include', cache: 'no-store' });
      if (!res.ok) throw new Error(`Failed to fetch PDF: ${res.status} ${res.statusText}`);
      const arrayBuffer = await res.arrayBuffer();
      if (!arrayBuffer || arrayBuffer.byteLength < 100) throw new Error('Invalid PDF structure - file too small');
      const bytes = new Uint8Array(arrayBuffer);
      const header = String.fromCharCode(bytes[0], bytes[1], bytes[2], bytes[3]);
      if (header !== '%PDF') throw new Error('Not a valid PDF file');
      return arrayBuffer;
    }

    async function extractWorksheetPdfInfo(pdfUrl, fallbackSn) {
      const ab = await fetchPdfArrayBuffer(pdfUrl);
      if (abortFlag) throw new Error('aborted');

      const blob = new Blob([ab], { type: 'application/pdf' });
      const file = new File([blob], 'ip-phone-worksheet.pdf', { type: 'application/pdf' });
      const fullText = await PDFExtractor.extractText(file);
      if (!fullText || fullText.length < 5) throw new Error('No text found in PDF');

      const parsed = DataParser.extractAllMatches(fullText) || {};
      return {
        companyOfficer: extractCompanyOfficerNameFromPdfText(fullText) || null,
        rdCode: parsed.rdCode || null,
        completionDate: parsed.date || null,
        machineSerial: extractWorksheetSerialFromPdfText(fullText, fallbackSn),
        rawTextPreview: fullText.slice(0, 1200)
      };
    }

    function parsePmTitlePageItems(html, pageUrl) {
      const doc = new DOMParser().parseFromString(html, 'text/html');
      const forms = Array.from(doc.querySelectorAll('form[action*="pm_editcall_approve_device.php"]'));
      const items = [];

      for (const form of forms) {
        const action = form.getAttribute('action') || '';
        const approveUrl = toAbsUrl(action, pageUrl);
        if (!approveUrl) continue;

        let sn = '';
        let callId = '';
        let idAdd = '';
        try {
          const u = new URL(approveUrl);
          sn = (u.searchParams.get('sn') || '').trim();
          callId = (u.searchParams.get('new_id') || '').trim();
          idAdd = (u.searchParams.get('id_add') || '').trim();
        } catch (_) {}

        let pdfUrlFromList = null;
        const row = form.closest('tr');
        const anchors = row
          ? Array.from(row.querySelectorAll('a[href*=".pdf"]'))
          : Array.from(doc.querySelectorAll('a[href*=".pdf"]'));
        let picked = null;
        if (sn) {
          const snNorm = normalizeSerial(sn);
          picked = anchors.find((a) => {
            const href = normalizeSerial(a.getAttribute('href') || '');
            const txt = normalizeSerial(a.textContent || '');
            return href.includes(snNorm) || txt === snNorm;
          }) || null;
        }
        if (!picked && anchors.length) picked = anchors[0];
        if (picked) {
          pdfUrlFromList = toAbsUrl(picked.getAttribute('href') || '', pageUrl);
        }

        items.push({ sn, callId, idAdd, approveUrl, pdfUrlFromList });
      }

      return items;
    }

    function findWorksheetPdfUrlFromApprove(html, approveUrl, sn) {
      const doc = new DOMParser().parseFromString(html, 'text/html');
      const snNorm = normalizeSerial(sn);

      let links = [];
      if (snNorm) {
        const rows = Array.from(doc.querySelectorAll('tr'));
        for (const row of rows) {
          const textNorm = normalizeSerial(row.textContent || '');
          if (!textNorm.includes(snNorm)) continue;
          const rowLinks = Array.from(row.querySelectorAll('a[href*=".pdf"]'));
          if (rowLinks.length) {
            links = rowLinks;
            break;
          }
        }
      }

      if (!links.length) {
        links = Array.from(doc.querySelectorAll('a[href*=".pdf"]'));
      }

      if (!links.length) return null;

      let picked = null;
      if (snNorm) {
        picked = links.find((a) => {
          const hrefNorm = normalizeSerial(a.getAttribute('href') || '');
          const txtNorm = normalizeSerial(a.textContent || '');
          return hrefNorm.includes(snNorm) || txtNorm === snNorm;
        }) || null;
      }
      if (!picked) picked = links[0];

      return toAbsUrl(picked.getAttribute('href') || '', approveUrl);
    }

    function findRackDetailUrlFromApprove(html, approveUrl, sn, callId) {
      const doc = new DOMParser().parseFromString(html, 'text/html');
      const selector = 'a[href*="rack_detail_IP.php"], a[href*="rack_detail_TOR.php"], a[href*="rack_detail_out.php"]';
      const snNorm = normalizeSerial(sn);
      const callNorm = normalizeSerial(callId);

      let links = Array.from(doc.querySelectorAll(selector));

      if (snNorm) {
        const rows = Array.from(doc.querySelectorAll('tr'));
        for (const row of rows) {
          const rowTextNorm = normalizeSerial(row.textContent || '');
          if (!rowTextNorm.includes(snNorm)) continue;
          const inRow = Array.from(row.querySelectorAll(selector));
          if (inRow.length) {
            links = inRow;
            break;
          }
        }
      }

      if (!links.length) return null;

      const byCallId = links.find((a) => {
        const href = a.getAttribute('href') || '';
        try {
          const u = new URL(href, approveUrl);
          const qCall = normalizeSerial(
            u.searchParams.get('id_project_call') ||
            u.searchParams.get('call_id') ||
            u.searchParams.get('new_id') ||
            ''
          );
          return callNorm && qCall && qCall === callNorm;
        } catch (_) {
          return callNorm ? normalizeSerial(href).includes(callNorm) : false;
        }
      });

      const bySn = links.find((a) => {
        const href = a.getAttribute('href') || '';
        try {
          const u = new URL(href, approveUrl);
          const qSn = normalizeSerial(
            u.searchParams.get('sn') ||
            u.searchParams.get('sn_tor') ||
            u.searchParams.get('rack_sn') ||
            u.searchParams.get('product_sn') ||
            ''
          );
          return snNorm && qSn && qSn === snNorm;
        } catch (_) {
          return snNorm ? normalizeSerial(href).includes(snNorm) : false;
        }
      });

      const chosen = byCallId || bySn || links[0];
      return toAbsUrl(chosen.getAttribute('href') || '', approveUrl);
    }

    function findIpPhonePicUrlFromRack(html, rackUrl, expectedSn, expectedCallId) {
      const doc = new DOMParser().parseFromString(html, 'text/html');
      const snNorm = normalizeSerial(expectedSn || '');
      const callNorm = normalizeSerial(expectedCallId || '');

      const expectedRackSnByTor = new Set();
      for (const a of Array.from(doc.querySelectorAll('a[href*="report_call_sn_tor_ma.php"]'))) {
        const href = a.getAttribute('href') || '';
        const abs = toAbsUrl(href, rackUrl);
        if (!abs) continue;
        try {
          const u = new URL(abs);
          const snTor = normalizeSerial(u.searchParams.get('sn_tor') || '');
          const rackSnText = normalizeSerial(a.textContent || '');
          if (snNorm && snTor === snNorm && rackSnText) {
            expectedRackSnByTor.add(rackSnText);
          }
        } catch (_) {}
      }

      const candidates = [];
      const seen = new Set();

      const addCandidate = (rawUrl) => {
        const abs = toAbsUrl(rawUrl, rackUrl);
        if (!abs || seen.has(abs)) return;
        seen.add(abs);

        try {
          const u = new URL(abs);
          const qRackSn = normalizeSerial(u.searchParams.get('rack_sn') || '');
          const qRackSn2 = normalizeSerial(
            u.searchParams.get('rack_sn2') ||
            u.searchParams.get('sn') ||
            ''
          );
          const qCall = normalizeSerial(
            u.searchParams.get('call_id') ||
            u.searchParams.get('id_project_call') ||
            u.searchParams.get('new_id') ||
            ''
          );
          candidates.push({ url: abs, qRackSn, qRackSn2, qCall });
        } catch (_) {
          candidates.push({ url: abs, qRackSn: '', qRackSn2: '', qCall: '' });
        }
      };

      for (const a of Array.from(doc.querySelectorAll('a[href*="view_ip_phone_pic.php"]'))) {
        addCandidate(a.getAttribute('href') || '');
      }

      const clickables = Array.from(doc.querySelectorAll('[onclick*="view_ip_phone_pic.php"]'));
      for (const el of clickables) {
        const onclick = String(el.getAttribute('onclick') || '');
        for (const m of onclick.matchAll(/https?:\/\/[^'")\s]*view_ip_phone_pic\.php[^'")\s]*/ig)) {
          addCandidate(m[0]);
        }
        for (const m of onclick.matchAll(/view_ip_phone_pic\.php\?[^'")\s]*/ig)) {
          addCandidate(m[0]);
        }
      }

      for (const m of String(html || '').matchAll(/https?:\/\/[^'"<>\s]*view_ip_phone_pic\.php[^'"<>\s]*/ig)) {
        addCandidate(m[0]);
      }
      for (const m of String(html || '').matchAll(/view_ip_phone_pic\.php\?[^'"<>\s]*/ig)) {
        addCandidate(m[0]);
      }

      if (!candidates.length) return null;

      // 1) sn_tor จาก rack_detail ต้องตรง SN ใบงาน + call_id ตรง
      if (snNorm && callNorm && expectedRackSnByTor.size) {
        const byTorAndCall = candidates.find((c) =>
          c.qRackSn2 === snNorm &&
          c.qCall === callNorm &&
          c.qRackSn &&
          expectedRackSnByTor.has(c.qRackSn)
        );
        if (byTorAndCall) return byTorAndCall.url;
      }

      // 2) sn_tor จาก rack_detail ต้องตรง SN ใบงาน (ไม่บังคับ call_id)
      if (snNorm && expectedRackSnByTor.size) {
        const byTorOnly = candidates.find((c) =>
          c.qRackSn2 === snNorm &&
          c.qRackSn &&
          expectedRackSnByTor.has(c.qRackSn) &&
          (!callNorm || !c.qCall || c.qCall === callNorm)
        );
        if (byTorOnly) return byTorOnly.url;
      }

      // 3) fallback: rack_sn2 + call_id ตรง
      if (snNorm && callNorm) {
        const byRackSn2AndCall = candidates.find((c) => c.qRackSn2 === snNorm && c.qCall === callNorm);
        if (byRackSn2AndCall) return byRackSn2AndCall.url;
      }

      // 4) fallback: rack_sn2 ตรง
      if (snNorm) {
        const byRackSn2 = candidates.find((c) => c.qRackSn2 === snNorm && (!callNorm || !c.qCall || c.qCall === callNorm));
        if (byRackSn2) return byRackSn2.url;
      }

      // 5) fallback: call_id ตรง
      if (callNorm) {
        const byCall = candidates.find((c) => c.qCall === callNorm);
        if (byCall) return byCall.url;
      }

      return candidates[0].url;
    }

    function parseIpPhonePicturePage(html, picPageUrl, expectedWorksheetSn) {
      const doc = new DOMParser().parseFromString(html, 'text/html');
      let serialFromPhoto = null;
      let rackSnFromUrl = null;
      let rackSn2FromUrl = null;

      try {
        const u = new URL(picPageUrl);
        rackSnFromUrl = normalizeSerial(u.searchParams.get('rack_sn') || '');
        rackSn2FromUrl = normalizeSerial(
          u.searchParams.get('rack_sn2') ||
          u.searchParams.get('sn') ||
          ''
        );
      } catch (_) {}

      // ถ้า URL ระบุคู่ rack_sn/rack_sn2 และ rack_sn2 ตรงกับ SN ใบงาน ให้ใช้ rack_sn เป็น serial ฝั่งรูปทันที
      if (rackSnFromUrl && rackSn2FromUrl) {
        const expectedNorm = normalizeSerial(expectedWorksheetSn || '');
        if (!expectedNorm || rackSn2FromUrl === expectedNorm) {
          serialFromPhoto = rackSnFromUrl;
        }
      }

      // Prefer heading text first (prevents "INM...87" + "1.รูป..." from sticking together as "...871")
      if (!serialFromPhoto) {
        const headingEls = Array.from(doc.querySelectorAll('h1, h2, h3, h4'));
        for (const el of headingEls) {
          const headingText = normalizeTextForLineScan(el.textContent || '');
          const m = headingText.match(/SERIAL\s*IP\s*PHONE\s*[:：]?\s*([A-Z0-9\-]{4,})\b/i);
          if (m && m[1]) {
            serialFromPhoto = normalizeSerial(m[1]);
            break;
          }
        }
      }

      if (!serialFromPhoto) {
        const bodyHtml = String((doc.body && doc.body.innerHTML) || html || '');
        const htmlMatch = bodyHtml.match(/SERIAL\s*IP\s*PHONE\s*[:：]?\s*([A-Z0-9\-]{4,})\s*(?=<)/i);
        if (htmlMatch && htmlMatch[1]) {
          serialFromPhoto = normalizeSerial(htmlMatch[1]);
        }
      }

      if (!serialFromPhoto) {
        const bodyText = normalizeTextForLineScan(doc.body ? doc.body.textContent || '' : html || '');
        const serialMatch = bodyText.match(/SERIAL\s*IP\s*PHONE\s*[:：]?\s*([A-Z0-9\-]{4,})/i);
        serialFromPhoto = serialMatch ? normalizeSerial(serialMatch[1]) : null;
      }

      if (!serialFromPhoto) {
        try {
          const u = new URL(picPageUrl);
          serialFromPhoto = normalizeSerial(
            u.searchParams.get('rack_sn') ||
            u.searchParams.get('rack_sn2') ||
            u.searchParams.get('sn') ||
            ''
          ) || null;
        } catch (_) {}
      }

      const seen = new Set();
      const images = [];
      for (const img of Array.from(doc.querySelectorAll('img[src]'))) {
        const src = img.getAttribute('src') || '';
        const abs = toAbsUrl(src, picPageUrl);
        if (!abs || seen.has(abs)) continue;
        seen.add(abs);
        images.push(abs);
      }

      return { serialFromPhoto, images, rackSnFromUrl, rackSn2FromUrl };
    }

    function evaluateItemStatus(item, pdfInfo, picInfo, errors) {
      const reasons = [];
      const itemSnNorm = normalizeSerial(item && item.sn ? item.sn : '');
      const worksheetSerialOriginal = normalizeSerial((pdfInfo && pdfInfo.machineSerial) || item.sn || '');
      let worksheetSerial = worksheetSerialOriginal;
      const photoSerial = normalizeSerial((picInfo && picInfo.serialFromPhoto) || '');
      const imageCount = Array.isArray(picInfo && picInfo.images) ? picInfo.images.length : 0;
      let worksheetSerialChangedFrom = null;
      if (worksheetSerialOriginal && worksheetSerial && worksheetSerialOriginal !== worksheetSerial) {
        worksheetSerialChangedFrom = worksheetSerialOriginal;
      } else if (itemSnNorm && worksheetSerial && itemSnNorm !== worksheetSerial) {
        // กรณี PDF ถูก normalize เป็น rack_sn แล้ว แต่ต้นทาง pm_editcall ยังเป็น sn_tor
        worksheetSerialChangedFrom = itemSnNorm;
      }

      const serialMatched = !!(worksheetSerial && photoSerial && worksheetSerial === photoSerial);
      if (!serialMatched) reasons.push('Serial จากภาพถ่ายไม่ตรงกับ Serial ในใบงาน');

      if (imageCount >= 4 || imageCount < 2) {
        reasons.push(`จำนวนรูปไม่ผ่านเงื่อนไข (${imageCount} รูป)`);
      }

      if (!pdfInfo || !pdfInfo.companyOfficer) reasons.push('ไม่พบเจ้าหน้าที่บริษัทในใบงาน PDF');
      if (!pdfInfo || !pdfInfo.rdCode) reasons.push('ไม่พบ RD Code ในใบงาน PDF');
      if (!pdfInfo || !pdfInfo.completionDate) reasons.push('ไม่พบวันที่ดำเนินเสร็จในใบงาน PDF');

      if (Array.isArray(errors) && errors.length) {
        for (const e of errors) reasons.push(String(e));
      }

      const isNormal = reasons.length === 0;
      return {
        isNormal,
        reasons,
        worksheetSerial,
        worksheetSerialOriginal,
        worksheetSerialChangedFrom,
        photoSerial,
        serialMatched,
        imageCount
      };
    }

    function createZoomablePhotoItem(options) {
      const { title, imageUrl, worksheetSerial, completionDate, showCompletionDate } = options;

      const box = document.createElement('div');
      box.className = 'ip-photo-item';

      const titleEl = document.createElement('div');
      titleEl.className = 'ip-photo-title';
      titleEl.textContent = title;
      box.appendChild(titleEl);

      const snEl = document.createElement('div');
      snEl.className = 'ip-phone-line';
      snEl.innerHTML = `หมายเลขเครื่อง: <strong>${escapeHtml(worksheetSerial || '-')}</strong> (จากใบงาน)`;
      box.appendChild(snEl);

      if (showCompletionDate) {
        const dateEl = document.createElement('div');
        dateEl.className = 'ip-phone-line';
        dateEl.innerHTML = `วันที่ดำเนินเสร็จ(ว/ด/ป) : <strong>${escapeHtml(completionDate || '-')}</strong>`;
        box.appendChild(dateEl);
      }

      const wrap = document.createElement('div');
      wrap.className = 'ip-photo-image-wrap';

      const imageHolder = document.createElement('div');
      imageHolder.className = 'ip-photo-image-link';

      const img = document.createElement('img');
      img.className = 'ip-photo-image';
      img.src = imageUrl;
      img.alt = title;
      img.draggable = false;
      img.style.width = '100%';
      imageHolder.appendChild(img);
      wrap.appendChild(imageHolder);
      box.appendChild(wrap);

      const controls = document.createElement('div');
      controls.className = 'ip-photo-controls';

      const zoomLabel = document.createElement('span');
      zoomLabel.className = 'ip-photo-zoom-left';
      zoomLabel.textContent = 'Zoom';
      controls.appendChild(zoomLabel);

      const range = document.createElement('input');
      range.className = 'ip-photo-zoom';
      range.type = 'range';
      range.min = '100';
      range.max = '400';
      range.step = '10';
      range.value = '100';
      controls.appendChild(range);

      const value = document.createElement('span');
      value.className = 'ip-photo-zoom-label';
      value.textContent = '100%';
      controls.appendChild(value);

      const clamp = (n, min, max) => Math.max(min, Math.min(max, Number(n) || min));
      const getViewportInnerWidth = () => {
        const styles = window.getComputedStyle(wrap);
        const padL = parseFloat(styles.paddingLeft) || 0;
        const padR = parseFloat(styles.paddingRight) || 0;
        const w = wrap.clientWidth - padL - padR;
        return w > 0 ? w : null;
      };
      const setZoom = (nextPct) => {
        const pct = Math.round(clamp(nextPct, 100, 400));
        range.value = String(pct);
        const innerWidth = getViewportInnerWidth();
        if (innerWidth) {
          img.style.width = `${Math.round(innerWidth * (pct / 100))}px`;
        } else {
          img.style.width = `${pct}%`;
        }
        value.textContent = `${pct}%`;
        return pct;
      };

      range.addEventListener('input', () => {
        setZoom(range.value);
      });

      img.addEventListener('load', () => {
        setZoom(range.value);
      });
      setZoom(100);

      // Wheel zoom (similar to GUI preview)
      wrap.addEventListener('wheel', (e) => {
        const current = Math.round(clamp(range.value, 100, 400));
        if (!Number.isFinite(current) || current <= 0) return;

        const direction = e.deltaY === 0 ? 0 : (e.deltaY > 0 ? -1 : 1);
        if (direction === 0) return;

        const step = e.shiftKey ? 25 : 10;
        const next = Math.round(clamp(current + direction * step, 100, 400));
        if (next === current) {
          e.preventDefault();
          return;
        }

        const rect = wrap.getBoundingClientRect();
        const styles = window.getComputedStyle(wrap);
        const padL = parseFloat(styles.paddingLeft) || 0;
        const padT = parseFloat(styles.paddingTop) || 0;

        const pointerX = e.clientX - rect.left - wrap.clientLeft;
        const pointerY = e.clientY - rect.top - wrap.clientTop;

        const imgX = wrap.scrollLeft + pointerX - padL;
        const imgY = wrap.scrollTop + pointerY - padT;
        const ratio = next / current;

        setZoom(next);

        wrap.scrollLeft = Math.max(0, (imgX * ratio) - pointerX + padL);
        wrap.scrollTop = Math.max(0, (imgY * ratio) - pointerY + padT);
        e.preventDefault();
      }, { passive: false });

      // Drag to pan (similar to GUI preview)
      let dragging = false;
      let startX = 0;
      let startY = 0;
      let startScrollLeft = 0;
      let startScrollTop = 0;

      const stopDrag = () => {
        dragging = false;
        wrap.classList.remove('is-dragging');
        document.removeEventListener('mousemove', onMove);
        document.removeEventListener('mouseup', stopDrag);
        document.removeEventListener('mouseleave', stopDrag);
      };

      const onMove = (e) => {
        if (!dragging) return;
        const dx = e.clientX - startX;
        const dy = e.clientY - startY;
        wrap.scrollLeft = startScrollLeft - dx;
        wrap.scrollTop = startScrollTop - dy;
      };

      wrap.addEventListener('mousedown', (e) => {
        if (e.button !== 0) return;
        dragging = true;
        wrap.classList.add('is-dragging');
        startX = e.clientX;
        startY = e.clientY;
        startScrollLeft = wrap.scrollLeft;
        startScrollTop = wrap.scrollTop;

        document.addEventListener('mousemove', onMove);
        document.addEventListener('mouseup', stopDrag);
        document.addEventListener('mouseleave', stopDrag);
      });

      box.appendChild(controls);
      return box;
    }

    function buildDebugLines(index, item, chain, pdfInfo, picInfo, evaluation) {
      const lines = [];
      lines.push(`index: ${index}`);
      lines.push(`sn(pm_title): ${item.sn || ''}`);
      lines.push(`call_id: ${item.callId || ''}`);
      lines.push(`id_add: ${item.idAdd || ''}`);
      lines.push('');
      lines.push(`1) pm_title: ${chain.step1 || ''}`);
      lines.push(`2) pm_editcall_approve_device: ${chain.step2 || ''}`);
      lines.push(`3) rack_detail_IP/TOR: ${chain.step3 || ''}`);
      lines.push(`4) pic_ip_phone: ${chain.step4 || ''}`);
      lines.push(`PDF: ${chain.pdf || ''}`);
      lines.push('');
      lines.push(`companyOfficer: ${pdfInfo && pdfInfo.companyOfficer ? pdfInfo.companyOfficer : '(not found)'}`);
      lines.push(`rdCode: ${pdfInfo && pdfInfo.rdCode ? pdfInfo.rdCode : '(not found)'}`);
      lines.push(`completionDate: ${pdfInfo && pdfInfo.completionDate ? pdfInfo.completionDate : '(not found)'}`);
      lines.push(`worksheetSerial: ${evaluation.worksheetSerial || '(not found)'}`);
      lines.push(`photoSerial: ${evaluation.photoSerial || '(not found)'}`);
      lines.push(`imageCount: ${evaluation.imageCount}`);
      lines.push(`status: ${evaluation.isNormal ? 'normal' : 'abnormal'}`);
      lines.push('');
      if (Array.isArray(evaluation.reasons) && evaluation.reasons.length) {
        lines.push('reasons:');
        for (const r of evaluation.reasons) lines.push(`- ${r}`);
      }
      if (pdfInfo && pdfInfo.rawTextPreview) {
        lines.push('');
        lines.push('pdfTextPreview:');
        lines.push(pdfInfo.rawTextPreview);
      }
      return lines.join('\n');
    }

    function renderResultCard(index, item, chain, pdfInfo, picInfo, evaluation) {
      const card = document.createElement('div');
      card.className = `debug-card ${evaluation.isNormal ? 'ok' : 'err'}`;
      const worksheetSerialFromPdf =
        evaluation.worksheetSerialOriginal ||
        evaluation.worksheetSerial ||
        item.sn ||
        '';

      const head = document.createElement('div');
      head.className = 'debug-head';

      const left = document.createElement('div');

      const snEl = document.createElement('div');
      snEl.className = 'debug-sn';
      snEl.setAttribute('data-debug-index', String(index));
      snEl.innerHTML = `${escapeHtml(item.sn || evaluation.worksheetSerial || '(no-sn)')} ` +
        `<span class="sn-status ${evaluation.isNormal ? 'sn-status-ok' : 'sn-status-err'}">สถานะ : ${evaluation.isNormal ? 'ปกติ' : 'ผิดปกติ'}</span>`;
      left.appendChild(snEl);

      const meta = document.createElement('div');
      meta.className = 'debug-meta';
      meta.innerHTML =
        `เจ้าหน้าที่บริษัท: ${escapeHtml((pdfInfo && pdfInfo.companyOfficer) || '(not found)')}` +
        `<br/>ใบงาน : ${chain.step2 ? `<a href="${escapeHtml(chain.step2)}" target="_blank" rel="noreferrer">${escapeHtml(chain.step2)}</a>` : '<span class="debug-missing">(missing)</span>'}`;
      left.appendChild(meta);

      const actions = document.createElement('div');
      actions.className = 'debug-actions';

      const toggleBtn = document.createElement('button');
      toggleBtn.className = 'debug-mini-btn';
      toggleBtn.type = 'button';
      toggleBtn.textContent = 'ซ่อนรายละเอียด';
      actions.appendChild(toggleBtn);

      head.appendChild(left);
      head.appendChild(actions);
      card.appendChild(head);

      const body = document.createElement('div');
      body.className = 'ip-phone-body';
      body.style.display = 'flex';

      const serialLine = document.createElement('div');
      serialLine.className = 'ip-phone-line';
      const changedFromText = evaluation.worksheetSerialChangedFrom
        ? ` (เปลี่ยนจาก ${escapeHtml(evaluation.worksheetSerialChangedFrom)})`
        : '';
      serialLine.innerHTML =
        `Serial Ip Phone ภาพถ่าย vs ใบงาน: ` +
        `<strong>${escapeHtml(evaluation.photoSerial || '-')}</strong>${changedFromText} ` +
        `${evaluation.serialMatched ? 'เหมือนกับ' : 'ไม่เหมือนกับ'} ` +
        `<strong>${escapeHtml(evaluation.worksheetSerial || '-')}</strong>`;
      body.appendChild(serialLine);

      const machineLine = document.createElement('div');
      machineLine.className = 'ip-phone-line';
      machineLine.innerHTML = `หมายเลขเครื่อง: <strong>${escapeHtml(worksheetSerialFromPdf || '-')}</strong> (จากใบงาน)`;
      body.appendChild(machineLine);

      const rdCodeLine = document.createElement('div');
      rdCodeLine.className = 'ip-phone-line';
      rdCodeLine.innerHTML = `RD Code: <strong>${escapeHtml((pdfInfo && pdfInfo.rdCode) || '-')}</strong>`;
      body.appendChild(rdCodeLine);

      const dateLine = document.createElement('div');
      dateLine.className = 'ip-phone-line';
      dateLine.innerHTML = `วันที่ดำเนินเสร็จ(ว/ด/ป) : <strong>${escapeHtml((pdfInfo && pdfInfo.completionDate) || '-')}</strong>`;
      body.appendChild(dateLine);

      if (!evaluation.isNormal) {
        const reasons = document.createElement('div');
        reasons.className = 'ip-phone-line cmp-error';
        reasons.innerHTML = `สาเหตุ: ${escapeHtml(evaluation.reasons.join(' | '))}`;
        body.appendChild(reasons);
      }

      const photosWrap = document.createElement('div');
      photosWrap.className = 'ip-photo-grid';

      const images = Array.isArray(picInfo && picInfo.images) ? picInfo.images : [];
      const captions = [
        '1.รูปถ่ายก่อนทำ (รูปไกล)',
        '2.รูปถ่ายก่อนทำ (รูปใกล้)',
        '3.รูปถ่ายหลังทำ (รูปใกล้)'
      ];

      if (!images.length) {
        const noImg = document.createElement('div');
        noImg.className = 'ip-phone-line cmp-error';
        noImg.textContent = 'ไม่พบรูปภาพจากลิงก์ pic_ip_phone';
        photosWrap.appendChild(noImg);
      } else {
        for (let i = 0; i < images.length; i++) {
          const caption = captions[i] || `${i + 1}.รูปเพิ่มเติม`;
          photosWrap.appendChild(createZoomablePhotoItem({
            title: caption,
            imageUrl: images[i],
            worksheetSerial: worksheetSerialFromPdf,
            completionDate: (pdfInfo && pdfInfo.completionDate) || '',
            showCompletionDate: i === 2
          }));
        }
      }

      body.appendChild(photosWrap);

      const debugDetails = document.createElement('details');
      debugDetails.className = 'cmp-debug-details';
      const debugSummary = document.createElement('summary');
      debugSummary.textContent = 'Debug (ซ่อนไว้)';
      debugDetails.appendChild(debugSummary);

      const debugInner = document.createElement('div');
      debugInner.className = 'cmp-debug-inner';
      const debugPre = document.createElement('pre');
      debugPre.className = 'cmp-data-pre';
      debugPre.textContent = buildDebugLines(index, item, chain, pdfInfo, picInfo, evaluation);
      debugInner.appendChild(debugPre);
      debugDetails.appendChild(debugInner);

      body.appendChild(debugDetails);
      card.appendChild(body);

      toggleBtn.addEventListener('click', () => {
        const isOpen = body.style.display !== 'none';
        body.style.display = isOpen ? 'none' : 'flex';
        toggleBtn.textContent = isOpen ? 'ดูเพิ่มเติม' : 'ซ่อนรายละเอียด';
      });

      resultsEl.appendChild(card);
      updateSummary();
    }

    function buildPageUrl(baseUrl, page) {
      const u = new URL(baseUrl);
      u.searchParams.set('page', String(page));
      return u.toString();
    }

    async function processItem(item, pageUrl) {
      const chain = {
        step1: pageUrl,
        step2: item.approveUrl || null,
        step3: null,
        step4: null,
        pdf: item.pdfUrlFromList || null
      };
      const errors = [];

      let approveHtml = '';
      try {
        approveHtml = await fetchText(chain.step2);
      } catch (e) {
        errors.push(`โหลด pm_editcall ไม่สำเร็จ: ${e.message || e}`);
        return {
          chain,
          pdfInfo: null,
          picInfo: { serialFromPhoto: null, images: [] },
          evaluation: evaluateItemStatus(item, null, null, errors)
        };
      }

      if (abortFlag) throw new Error('aborted');

      const pdfUrlFromApprove = findWorksheetPdfUrlFromApprove(approveHtml, chain.step2, item.sn);
      chain.pdf = pdfUrlFromApprove || chain.pdf || null;

      chain.step3 = findRackDetailUrlFromApprove(approveHtml, chain.step2, item.sn, item.callId);
      if (!chain.step3) errors.push('ไม่พบลิงก์ rack_detail_IP/TOR');

      let picInfo = { serialFromPhoto: null, images: [] };
      if (chain.step3) {
        try {
          const rackHtml = await fetchText(chain.step3);
          if (abortFlag) throw new Error('aborted');

          chain.step4 = findIpPhonePicUrlFromRack(rackHtml, chain.step3, item.sn, item.callId);
          if (!chain.step4) {
            errors.push('ไม่พบลิงก์ pic_ip_phone');
          } else {
            const picHtml = await fetchText(chain.step4);
            if (abortFlag) throw new Error('aborted');
            picInfo = parseIpPhonePicturePage(picHtml, chain.step4, item.sn);
          }
        } catch (e) {
          errors.push(`โหลดรูปจาก rack_detail ไม่สำเร็จ: ${e.message || e}`);
        }
      }

      let pdfInfo = null;
      if (chain.pdf) {
        try {
          pdfInfo = await extractWorksheetPdfInfo(chain.pdf, item.sn);
        } catch (e) {
          errors.push(`อ่านใบงาน PDF ไม่สำเร็จ: ${e.message || e}`);
        }
      } else {
        errors.push('ไม่พบลิงก์ใบงาน PDF');
      }

      const evaluation = evaluateItemStatus(item, pdfInfo, picInfo, errors);
      return { chain, pdfInfo, picInfo, evaluation };
    }

    function setBusy(busy) {
      isRunning = !!busy;
      runBtn.disabled = !!busy;
      stopBtn.style.display = busy ? 'inline-flex' : 'none';
      syncPagerState();
    }

    function renderCachedPage(page, rows) {
      resetResultArea();
      const range = getPageRange(page, rows.length);
      for (let i = 0; i < rows.length; i++) {
        const row = rows[i];
        renderResultCard(range.start + i, row.item, row.chain, row.pdfInfo, row.picInfo, row.evaluation);
      }
      currentPage = page;
      setProgress(buildPageProgressText(page, rows.length));
      syncPagerState();
    }

    async function loadIpPhonePage(page) {
      if (!currentBaseUrl) return false;
      if (page < 1 || page > MAX_PAGES) return false;

      if (pageCache.has(page)) {
        renderCachedPage(page, pageCache.get(page));
        return true;
      }

      const pageUrl = buildPageUrl(currentBaseUrl, page);
      setProgress(`กำลังดึงหน้า ${page}...`);

      let html = '';
      try {
        html = await fetchText(pageUrl);
      } catch (e) {
        if (page === 1) throw e;
        maxKnownPage = page - 1;
        setProgress(`ไม่พบข้อมูลหน้า ${page} • หน้าสุดท้ายคือหน้า ${maxKnownPage}`);
        syncPagerState();
        return false;
      }

      if (abortFlag) throw new Error('aborted');

      const rawItems = parsePmTitlePageItems(html, pageUrl);
      if (!rawItems.length) {
        if (page === 1) {
          resetResultArea();
          setProgress('ไม่พบรายการในหน้า 1 (หรือ URL ผิด / ไม่มีสิทธิ์)');
        } else {
          maxKnownPage = page - 1;
          setProgress(`หน้าสุดท้ายคือหน้า ${maxKnownPage}`);
        }
        syncPagerState();
        return false;
      }

      const seenItemKeys = new Set();
      const items = rawItems.filter((x) => {
        const key = `${x.sn}|${x.callId}|${x.idAdd}|${x.approveUrl}`;
        if (seenItemKeys.has(key)) return false;
        seenItemKeys.add(key);
        return true;
      });

      if (!items.length) {
        if (page === 1) {
          resetResultArea();
          setProgress('ไม่พบรายการในหน้า 1 (หรือ URL ผิด / ไม่มีสิทธิ์)');
        } else {
          maxKnownPage = page - 1;
          setProgress(`หน้าสุดท้ายคือหน้า ${maxKnownPage}`);
        }
        syncPagerState();
        return false;
      }

      // Reflect the target page in pager immediately while this page is processing.
      currentPage = page;
      syncPagerState();

      resetResultArea();
      const rows = [];
      const pageStartIndex = getPageStartIndex(page, items.length);
      for (let i = 0; i < items.length; i++) {
        if (abortFlag) throw new Error('aborted');
        const item = items[i];

        const globalIndex = pageStartIndex + i;
        setProgress(`หน้า ${page} • กำลังตรวจลำดับ ${globalIndex} (${i + 1}/${items.length} ของหน้านี้)`);
        try {
          const out = await processItem(item, pageUrl);
          if (abortFlag) throw new Error('aborted');
          const row = { item, chain: out.chain, pdfInfo: out.pdfInfo, picInfo: out.picInfo, evaluation: out.evaluation };
          rows.push(row);
          renderResultCard(pageStartIndex + rows.length - 1, row.item, row.chain, row.pdfInfo, row.picInfo, row.evaluation);
        } catch (e) {
          if (String(e && e.message || e) === 'aborted') throw e;
          const fallback = {
            item,
            chain: { step1: pageUrl, step2: item.approveUrl || '', step3: '', step4: '', pdf: item.pdfUrlFromList || '' },
            pdfInfo: null,
            picInfo: { serialFromPhoto: null, images: [] },
            evaluation: evaluateItemStatus(item, null, null, [`เกิดข้อผิดพลาด: ${e.message || e}`])
          };
          rows.push(fallback);
          renderResultCard(pageStartIndex + rows.length - 1, fallback.item, fallback.chain, fallback.pdfInfo, fallback.picInfo, fallback.evaluation);
        }
      }

      pageCache.set(page, rows);
      currentPage = page;
      setProgress(buildPageProgressText(page, rows.length));
      syncPagerState();
      return true;
    }

    async function navigateToPage(targetPage) {
      if (!currentBaseUrl || isRunning) return;
      if (targetPage < 1) return;
      if (maxKnownPage && targetPage > maxKnownPage) return;

      abortFlag = false;
      setBusy(true);
      try {
        await loadIpPhonePage(targetPage);
      } catch (e) {
        if (String(e && e.message || e) === 'aborted') {
          setProgress('กำลังหยุด...');
        } else {
          console.error('IP Phone page navigation error:', e);
          setProgress(`เกิดข้อผิดพลาด: ${e.message || e}`);
          alert(`เช็ครูป IP Phone ไม่สำเร็จ: ${e.message || e}`);
        }
      } finally {
        setBusy(false);
      }
    }

    runBtn.addEventListener('click', async () => {
      if (isRunning) return;

      const baseUrl = String(pmTitleInput.value || '').trim();
      if (!baseUrl) {
        alert('กรุณาวาง PM Title URL (pm_title.php?... )');
        return;
      }

      let parsed;
      try {
        parsed = new URL(baseUrl);
      } catch (_) {
        alert('ลิงก์ไม่ถูกต้อง');
        return;
      }
      if (!/pm_title\.php/i.test(parsed.pathname || '')) {
        alert('ลิงก์ต้องเป็น pm_title.php');
        return;
      }

      currentBaseUrl = baseUrl;
      currentPage = 1;
      maxKnownPage = null;
      pageCache.clear();
      setPagerVisible(true);
      setProgress('');
      resetResultArea();

      abortFlag = false;
      setBusy(true);
      try {
        const ok = await loadIpPhonePage(1);
        if (!ok) setPagerVisible(false);
      } catch (e) {
        if (String(e && e.message || e) === 'aborted') {
          setProgress('กำลังหยุด...');
        } else {
          console.error('IP Phone check error:', e);
          setProgress(`เกิดข้อผิดพลาด: ${e.message || e}`);
          alert(`เช็ครูป IP Phone ไม่สำเร็จ: ${e.message || e}`);
        }
      } finally {
        setBusy(false);
      }
    });

    prevBtn.addEventListener('click', async () => {
      await navigateToPage(currentPage - 1);
    });

    nextBtn.addEventListener('click', async () => {
      await navigateToPage(currentPage + 1);
    });
    if (prevBtnBottom) {
      prevBtnBottom.addEventListener('click', async () => {
        await navigateToPage(currentPage - 1);
      });
    }
    if (nextBtnBottom) {
      nextBtnBottom.addEventListener('click', async () => {
        await navigateToPage(currentPage + 1);
      });
    }

    stopBtn.addEventListener('click', () => {
      abortFlag = true;
      setProgress('กำลังหยุด...');
    });

    setPagerVisible(false);
    syncPagerState();
  })();

  // UI Event Handlers

  // PDF Extract Handler
  document.getElementById('extractPdfBtn').addEventListener('click', async () => {
    const pdfPathInput = document.getElementById('pdfFile');
    let pdfPath = pdfPathInput.value.trim();
    // Always re-extract to refresh debug output
    window.pdfData = null;
    
    if (!pdfPath) {
      addMessage('กรุณาใส่ path ไฟล์ PDF หรือ URL', 'error');
      return;
    }

    setActionLoading('extractPdfBtn', 'extractPdfLoadingBar', true);
    try {
      addMessage('กำลังดึงข้อมูลจาก PDF...', 'warning');

      // Allow users to paste a normal Windows path (e.g. C:\Users\...\file.pdf) instead of file:///...
      const isFile = pdfPath.startsWith('file://') || pdfPath.startsWith('file:\\') || /^[A-Za-z]:[\\/]/.test(pdfPath.trim()) || (pdfPath.trim().startsWith('/') && !pdfPath.trim().startsWith('http'));
      if (isFile) {
        pdfPath = encodeURI(toFileUrl(pdfPath));
        addMessage('โหมดทดสอบ: ใช้ไฟล์จากเครื่อง', 'warning');
      }
      
      // Fetch the PDF (รองรับทั้ง file path และ https URL)
      let file;
      try {
        const response = await fetch(pdfPath);
        if (!response.ok) {
          throw new Error(`Failed to fetch PDF: ${response.statusText}`);
        }
        const arrayBuffer = await response.arrayBuffer();
        
        // Validate PDF structure
        if (arrayBuffer.byteLength < 100) {
          throw new Error('Invalid PDF structure - file too small');
        }
        
        // Check PDF header
        const view = new Uint8Array(arrayBuffer);
        const header = String.fromCharCode(view[0], view[1], view[2], view[3]);
        if (header !== '%PDF') {
          throw new Error('Invalid PDF structure - not a valid PDF file');
        }
        
        const blob = new Blob([arrayBuffer], { type: 'application/pdf' });
        file = new File([blob], 'temp.pdf', { type: 'application/pdf' });
      } catch (fetchError) {
        console.error('Fetch error:', fetchError);
        // Show error in PDF Results
        const pdfResultsEl = document.getElementById('pdfResults');
        if (pdfResultsEl) {
          pdfResultsEl.style.display = 'block';
          setResultsState(pdfResultsEl, 'error');
        }
        const companyOfficerEl = document.getElementById('companyOfficer');
        if (companyOfficerEl) companyOfficerEl.textContent = '❌ Error';
        document.getElementById('rdCode').textContent = '❌ Error';
        document.getElementById('completionDate').textContent = '❌ Error';
        document.getElementById('softwareVersion').textContent = '❌ Error';
        document.getElementById('textPreview').value = `❌ Error: ${fetchError.message}\n\nตรวจสอบ:\n1. Path หรือ URL ถูกต้องหรือไม่\n2. ไฟล์/ลิงก์มีอยู่จริงหรือไม่\n3. เป็น PDF จริงหรือไม่ (หรือ CORS ถ้าใช้ URL)`;
        throw fetchError;
      }
      
      // Use PDF.js to extract text directly
      const fullText = await PDFExtractor.extractText(file);
      
      if (!fullText || fullText.length < 5) {
        throw new Error('No text found in PDF');
      }
      
      addMessage(`✓ Extracted ${fullText.length} characters from PDF`, 'success');
      
      // Parse data from extracted text
      const parsed = DataParser.extractAllMatches(fullText);
      
      console.log('===== PDF TEXT (first 1000 chars) =====');
      console.log(fullText.substring(0, 1000));
      console.log('===== PARSED RESULTS =====');
      console.log('RD Code found:', parsed.rdCode);
      console.log('Date found (normalized):', parsed.date);
      console.log('All dates found (normalized):', parsed.allDates);
      console.log('Version found:', parsed.version);
      console.log('All versions found:', parsed.allVersions);
      console.log('====================================');
      
        const pdfData = {
          rdCode: parsed.rdCode,
          companyOfficer: extractCompanyOfficerNameFromPdfText(fullText) || null,
          completionDate: parsed.date,
          softwareVersion: extractCiscoSoftwareVersion(fullText) || parsed.version,
          fullText: fullText,
          allDates: parsed.allDates,
          allVersions: (parsed.allVersions || []).filter(v => looksLikeCiscoVersion(String(v)) && !isLikelyIPv4(String(v))),
          labeledDates: parsed.labeledDates || []
        };
      
      // Display main results
      const companyOfficerEl = document.getElementById('companyOfficer');
      if (companyOfficerEl) companyOfficerEl.textContent = pdfData.companyOfficer || 'Not found';
      document.getElementById('rdCode').textContent = pdfData.rdCode || 'Not found';
      document.getElementById('completionDate').textContent = pdfData.completionDate || 'Not found';
      document.getElementById('softwareVersion').textContent = pdfData.softwareVersion || 'Not found';
      
      // Debug info - show extracted text
      let debugInfo = fullText.substring(0, 3000);
      debugInfo += '\n\n=== ALL DATES FOUND ===\n' +
        (pdfData.allDates.length > 0 ? pdfData.allDates.join('\n') : 'NONE');
      debugInfo += '\n\n=== LABELED DATES FOUND ===\n' +
        (pdfData.labeledDates.length > 0 ? pdfData.labeledDates.join('\n') : 'NONE');
      debugInfo += '\n\n=== COMPANY OFFICER ===\n' + (pdfData.companyOfficer || 'NONE');
      if (pdfData.allVersions.length > 0) {
        debugInfo += '\n\n=== ALL VERSIONS FOUND ===\n' + pdfData.allVersions.join('\n');
      }
      document.getElementById('textPreview').value = debugInfo;
      {
        const pdfResultsEl = document.getElementById('pdfResults');
        if (pdfResultsEl) {
          pdfResultsEl.style.display = 'block';
          setResultsState(pdfResultsEl, null);
        }
      }
      
      addMessage('✓ PDF extraction completed', 'success');
      
      // Only save data if extraction was successful
      window.pdfData = pdfData;
    } catch (error) {
      console.error('PDF Error:', error);
      // Show error in PDF Results section with red styling
      {
        const pdfResultsEl = document.getElementById('pdfResults');
        if (pdfResultsEl) {
          pdfResultsEl.style.display = 'block';
          setResultsState(pdfResultsEl, 'error');
        }
      }
      const companyOfficerEl = document.getElementById('companyOfficer');
      if (companyOfficerEl) companyOfficerEl.textContent = '❌ Error';
      document.getElementById('rdCode').textContent = '❌ Error';
      document.getElementById('completionDate').textContent = '❌ Error';
      document.getElementById('softwareVersion').textContent = '❌ Error';
      document.getElementById('textPreview').value = `❌ Error: ${error.message}\n\nตรวจสอบ:\n1. File path ถูกต้องหรือไม่\n2. ไฟล์มีอยู่จริงหรือไม่\n3. ไฟล์เป็น PDF จริงหรือไม่`;
      // Do NOT save pdfData when error
      window.pdfData = null;
      addMessage(`❌ Error: ${error.message}`, 'error');
    } finally {
      setActionLoading('extractPdfBtn', 'extractPdfLoadingBar', false);
    }
  });

  // แปลง path ไฟล์ในเครื่องเป็น file:// URL (ใช้ชั่วคราวสำหรับทดสอบ)
  function toFileUrl(input) {
    let t = input.trim();
    // Windows "Copy as path" often adds quotes: "C:\path\file.pdf"
    if ((t.startsWith('"') && t.endsWith('"')) || (t.startsWith("'") && t.endsWith("'"))) {
      t = t.slice(1, -1);
    }
    if (t.startsWith('file://') || t.startsWith('file:\\')) {
      return t.replace(/^file:\\\\?\/?/, 'file:///').replace(/\\/g, '/');
    }
    if (/^[A-Za-z]:[\\/]/.test(t) || t.startsWith('/')) {
      const normalized = t.replace(/\\/g, '/').replace(/^\/+/, '');
      const withDrive = /^[A-Za-z]:\//.test(normalized) ? normalized : normalized;
      return 'file:///' + withDrive;
    }
    return t;
  }

  document.getElementById('extractWebBtn').addEventListener('click', async () => {
    let url = document.getElementById('websiteUrl').value;
    if (!url) {
      addMessage('Please enter a URL หรือ path ไฟล์ (โหมดทดสอบ)', 'error');
      return;
    }

    // Clear previous GUI PDF preview (if any)
    resetLastPagePreviewUI();

    // ตรวจสอบว่าเลือก GUI หรือ CLI
    const modeRadios = document.querySelectorAll('input[name="mode"]');
    const selectedMode = Array.from(modeRadios).find(r => r.checked)?.value || 'GUI';

    const isFile = url.startsWith('file://') || url.startsWith('file:\\') || /^[A-Za-z]:[\\/]/.test(url.trim()) || (url.trim().startsWith('/') && !url.trim().startsWith('http'));
    if (isFile) {
      url = toFileUrl(url);
      addMessage('โหมดทดสอบ: ใช้ไฟล์จากเครื่อง', 'warning');
    }

    setActionLoading('extractWebBtn', 'extractWebLoadingBar', true);
    try {
      addMessage(isFile ? 'กำลังโหลดไฟล์และดึงข้อมูล...' : `Opening ${selectedMode === 'CLI' ? 'CLI' : 'website'} and extracting data...`, 'warning');
      const data = selectedMode === 'CLI' ? await extractCLIData(url) : await extractWebData(url);
      
      console.log('Web/CLI data extracted:', data);
      
      // Build debug info
      let debugInfo = `=== EXTRACTION RESULTS (${selectedMode}) ===\n`;
      debugInfo += `Source: ${data.source || 'unknown'}\n`;
      debugInfo += `Timestamp found: ${data.timestamp || 'NOT FOUND'}\n`;
      debugInfo += `Software Version: ${data.softwareVersion || 'NOT FOUND'}\n`;
      debugInfo += `RD Code: ${data.rdCode || 'NOT FOUND'}\n`;
      debugInfo += `All dates: ${(data.allDates && data.allDates.length > 0) ? data.allDates.join(', ') : 'NONE'}\n`;
      debugInfo += `All versions: ${(data.allVersions && data.allVersions.length > 0) ? data.allVersions.join(', ') : 'NONE'}\n\n`;
      
      if (data.html) {
        const contentPreview = data.html.substring(0, 3000);
        debugInfo += `=== CONTENT (First 3000 chars) ===\n`;
        debugInfo += contentPreview;

        // สำหรับ CLI ใช้ clockEntries ที่มีอยู่แล้ว, สำหรับ GUI ใช้ extractClockDataFromText
        let clockEntries = [];
        let normalizedForSnippet = '';
        if (selectedMode === 'CLI' && data.clockEntries) {
          const rawEntries = data.clockEntries;
          const hasShowCmd = rawEntries.some(e => e && e.hasShowCmd);
          clockEntries = hasShowCmd ? rawEntries.filter(e => e && e.hasShowCmd) : rawEntries;
          normalizedForSnippet = data.normalized || data.html;
        } else {
          if (data.clockEntries && data.clockEntries.length > 0) {
            clockEntries = data.clockEntries;
            normalizedForSnippet = data.clockNormalized || normalizeTextForLineScan(data.html);
          } else {
            const fromHtmlForDebug = extractClockDataFromText(data.html);
            clockEntries = fromHtmlForDebug.clockEntries || [];
            normalizedForSnippet = fromHtmlForDebug.normalized || normalizeHtmlForClock(data.html);
          }
        }

        debugInfo += `\n\n=== SHOW CLOCK SEARCH ===\n`;
        if (clockEntries.length > 0) {
          debugInfo += `พบ ${clockEntries.length} จุด (จาก timestamp ของ show clock):\n\n`;
          clockEntries.forEach((entry, i) => {
            const start = Math.max(0, entry.index - 50);
            const end = Math.min(normalizedForSnippet.length, entry.index + 80);
            const snippet = (start > 0 ? '...' : '') + normalizedForSnippet.slice(start, end).replace(/\n/g, '↵') + (end < normalizedForSnippet.length ? '...' : '');
            debugInfo += `[${i + 1}] เวลา: ${entry.time}\n`;
            debugInfo += `    บริบทรอบๆ: ${snippet}\n\n`;
          });
        } else {
          debugInfo += `ไม่พบ timestamp ของ show clock\n`;
        }

        // สำหรับ CLI ใช้ interfaceCountersCheck ที่มีอยู่แล้ว, สำหรับ GUI หาใหม่
        let countersCheck;
        if (selectedMode === 'CLI' && data.interfaceCountersCheck) {
          countersCheck = data.interfaceCountersCheck;
        } else {
          const showInterfaceMatches = searchShowInterfaceCountersErrors(data.html);
          debugInfo += `\n=== SHOW INTERFACE COUNTERS ERRORS SEARCH ===\n`;
          if (showInterfaceMatches.length === 0) {
            debugInfo += `ไม่พบคำว่า "show interface counter(s) errors"\n`;
          } else {
            debugInfo += `พบ ${showInterfaceMatches.length} จุด (เอาทั้งคู่):\n\n`;
            showInterfaceMatches.forEach((r, i) => {
              debugInfo += `[${i + 1}] ตำแหน่ง ${r.index}\n`;
              debugInfo += `    บรรทัด: ${r.fullLine || r.match}\n`;
              debugInfo += `    บริบทรอบๆ: ${r.snippet}\n\n`;
            });
          }
          countersCheck = checkInterfaceCountersValues(data.html);
        }
        debugInfo += `\n=== INTERFACE COUNTERS CHECK ===\n`;
        if (countersCheck.found) {
          if (countersCheck.ok) {
            debugInfo += `✅ สถานะ: ${countersCheck.message || INTERFACE_COUNTERS_OK_MESSAGE}\n`;
            if (selectedMode === 'CLI') {
              debugInfo += `   ทุกบรรทัดต้องเป็น "0 input errors, 0 CRC, 0 frame, 0 overrun, 0 ignored"\n`;
            } else {
              debugInfo += `   ทุกแถวข้อมูล (mgmt0, Eth1/1, Eth1/2, ...) มีค่าหลัง port เป็น "--" ตามที่คาดหวัง\n`;
            }
          } else {
            debugInfo += `⚠️ สถานะ: เตือน - พบตัวเลขหรือค่าผิดปกติ\n`;
            debugInfo += selectedMode === 'CLI'
              ? `   รูปแบบที่ถูก: 0 input errors, 0 CRC, 0 frame, 0 overrun, 0 ignored\n`
              : `   รูปแบบที่ถูก: portname -- -- -- ... (ค่าหลัง port ต้องเป็น "--" เท่านั้น)\n`;
            if (countersCheck.anomalies && countersCheck.anomalies.length > 0) {
              debugInfo += `   ค่าที่พบผิดปกติ: ${countersCheck.anomalies.join(', ')}\n`;
            }
            if (countersCheck.problemLines && countersCheck.problemLines.length > 0) {
              debugInfo += `\n   บรรทัดที่มีปัญหา:\n`;
              countersCheck.problemLines.forEach((pl, i) => {
                debugInfo += `   [${i + 1}] ${pl.line}\n`;
                debugInfo += `       พบค่า: ${pl.anomalies ? pl.anomalies.join(', ') : pl}\n`;
              });
            }
            if (selectedMode !== 'CLI') {
              debugInfo += `\n   หมายเหตุ: หัวข้อ (Port, Align-Err, CRC-Err, ...) เป็นปกติ\n`;
              debugInfo += `              แถวข้อมูล = mgmt0 หรือ Eth1/X ตามด้วย -- ทั้งหมด\n`;
              debugInfo += `              ถ้าพบตัวเลขหรือค่าอื่นในแถวข้อมูล = ผิดปกติ\n`;
            }
          }
        } else {
          debugInfo += selectedMode === 'CLI'
            ? `ไม่พบคำสั่ง CRC (sh/sho/show ... | i/in/inc/incl/include CRC)\n`
            : `ไม่พบข้อมูล show interface counter(s) errors\n`;
        }
      }

      document.getElementById('webDebug').value = debugInfo;
      
      // Extract and format the data for display (ดึงจาก html ด้วย flexible regex เพื่อให้ได้เวลาสุดท้ายจริงและครบ 3 จุด)
      // สำหรับ CLI ใช้ clockDataArray ที่มีอยู่แล้ว, สำหรับ GUI ใช้ extractClockDataFromText
      let clockDataArray = [];
      let fromHtml = { clockDataArray: [], lastFullTimestamp: null };
      if (selectedMode === 'CLI' && data.clockDataArray) {
        clockDataArray = data.clockDataArray;
      } else {
        fromHtml = data.html ? extractClockDataFromText(data.html) : { clockDataArray: [], lastFullTimestamp: null };
        if (data.clockDataArray && data.clockDataArray.length > 0) {
          clockDataArray = data.clockDataArray;
        } else {
          clockDataArray = fromHtml.clockDataArray.length > 0 ? fromHtml.clockDataArray : (data.clockDataArray || data.clockDatas || []);
        }
      }
      let timeDisplay = 'Not found';
      
      // Last Time = เวลาสุดท้ายจริง (รองรับรูปแบบที่มีช่องว่าง เช่น 17: 23 :22)
      if (selectedMode === 'CLI' && data && data.missingLastTime3) {
        timeDisplay = 'ไม่เจอเวลาที่ 3 เวลาสุดท้าย';
      } else {
        const lastFull = data.lastFullTimestamp || fromHtml.lastFullTimestamp;
        if (lastFull) {
          const thaiDate = formatTimestampToThaiDate(lastFull);
          if (thaiDate) {
            timeDisplay = `${lastFull} or ${thaiDate}`;
          } else {
            timeDisplay = lastFull;
          }
        } else if (clockDataArray && clockDataArray.length > 0) {
          const latestClock = clockDataArray[clockDataArray.length - 1];
          timeDisplay = latestClock;
        } else if (data.timestamp && data.timestamp.match(/\d{2}:\d{2}:\d{2}\.\d+\s+[\+\-]\d{2}\s+\w+\s+\w+\s+\d+\s+\d{4}/)) {
          // This is a clock format timestamp
          const thaiDate = formatTimestampToThaiDate(data.timestamp);
          if (thaiDate) {
            timeDisplay = `${data.timestamp} or ${thaiDate}`;
          } else {
            timeDisplay = data.timestamp;
          }
        } else if (data.timestamp && data.timestamp.includes('2568')) {
          // This is a completion date from PDF, show as time reference
          timeDisplay = `${data.timestamp} (from PDF)`;
        } else if (data.clockData) {
          timeDisplay = data.clockData;
        } else if (data.timestamp) {
          timeDisplay = data.timestamp;
        }
      }
      
      document.getElementById('webTimestamp').textContent = timeDisplay;
      
      // คำนวณและแสดงเวลาระหว่าง 2 กับ 3
      const timeBetweenResult = calculateTimeBetween2And3(
        clockDataArray,
        selectedMode === 'CLI' ? { maxDiffMinutes: 30, signedDiff: true } : {}
      );
      const timeBetweenElement = document.getElementById('timeBetween23');
      if (timeBetweenElement) {
        if (data.clockIncomplete) {
          timeBetweenElement.textContent = data.clockIncompleteReason || 'ขาดบรรทัดคำสั่ง show clock คู่กับเวลา (รูปแบบที่ต้องการ: <hostname>#show clock ต่อด้วยบรรทัดเวลา)';
        } else if (timeBetweenResult.error) {
          timeBetweenElement.textContent = timeBetweenResult.error;
        } else {
          timeBetweenElement.textContent = timeBetweenResult.display;
        }
      }
      
      // ตรวจสอบ interface counters ว่าทั้งหมดเป็น -- หรือไม่
      // สำหรับ CLI ใช้ interfaceCountersCheck ที่มีอยู่แล้ว, สำหรับ GUI หาใหม่
      let countersCheck;
      if (selectedMode === 'CLI' && data.interfaceCountersCheck) {
        countersCheck = data.interfaceCountersCheck;
      } else {
        countersCheck = checkInterfaceCountersValues(data.html);
      }
      const interfaceCountersEl = document.getElementById('interfaceCountersStatus');
      if (interfaceCountersEl) {
        if (countersCheck.found && !countersCheck.ok) {
          let msg = countersCheck.message;
          // anomalies ถูกกรองแล้วในฟังก์ชัน checkInterfaceCountersValues (ข้าม header แล้ว)
          if (countersCheck.anomalies && countersCheck.anomalies.length > 0) {
            msg += ' [พบ: ' + countersCheck.anomalies.slice(0, 5).join(', ') + ']';
          }
          const detailBlock = formatCountersProblemLines(countersCheck, 50);
          if (detailBlock) {
            msg += `\n${detailBlock}`;
          }
          interfaceCountersEl.textContent = msg;
          setCmpClass(interfaceCountersEl, 'cmp-warning');
          addMessage('⚠️ Interface counters: พบค่าผิดปกติ (ควรเป็น -- เท่านั้น) - ดูรายละเอียดใน Debug Info', 'warning');
        } else if (countersCheck.found && countersCheck.ok) {
          interfaceCountersEl.textContent = countersCheck.message || INTERFACE_COUNTERS_OK_MESSAGE;
          setCmpClass(interfaceCountersEl, null);
        } else {
          interfaceCountersEl.textContent = countersCheck.message || '-';
          setCmpClass(interfaceCountersEl, null);
        }
      }

      const clearCountersEl = document.getElementById('clearCountersStatus');
      const clearEl = document.getElementById('clearStatus');
      const clearCountersCheck = data.clearCountersCheck || (data.html ? detectClearCounters(data.html) : { found: false, matches: [] });
      const clearCheck = data.clearCheck || (data.html ? detectClearLogAny(data.html) : { found: false, matches: [] });

      const formatFoundLines = (arr, maxLines = 50) => {
        if (!arr || arr.length === 0) return '';
        const shown = arr.slice(0, maxLines);
        let out = shown.join('\n');
        if (arr.length > shown.length) {
          out += `
  ... (${arr.length - shown.length} more)`;
        }
        return out;
      };

      if (clearCountersEl) {
        if (clearCountersCheck.found) {
          const details = formatFoundLines(clearCountersCheck.matches, 50);
          clearCountersEl.textContent = details
            ? `มี clear counters แก้ไขด่วน\nพบ:\n${details}`
            : 'มี clear counters แก้ไขด่วน';
        } else {
          clearCountersEl.textContent = 'ไม่มี clear counters';
        }
        setCmpClass(clearCountersEl, clearCountersCheck.found ? 'cmp-error' : null);
      }

      if (clearEl) {
        if (clearCheck.found) {
          const details = formatFoundLines(clearCheck.matches, 50);
          clearEl.textContent = details
            ? `มี clear แก้ไขด่วน\nพบ:\n${details}`
            : 'มี clear แก้ไขด่วน';
        } else {
          clearEl.textContent = 'ไม่มี clear';
        }
        setCmpClass(clearEl, clearCheck.found ? 'cmp-error' : null);
      }

      // Get software version - prefer extracted version, fallback to PDF
      let versionDisplay = data.softwareVersion || 'Not found';
      
      document.getElementById('webVersion').textContent = versionDisplay;

      // GUI PDF: show last page preview + Leaf prompt detection (Leaf-...#)
      updateLastPagePreviewUI(data.lastPagePreview, selectedMode);
      
      // แสดง Website Results และรีเซ็ตสีให้เป็นสถานะปกติ (ฟ้า) ทุกครั้งที่ success
      const webResultsDiv = document.getElementById('webResults');
      if (webResultsDiv) {
        webResultsDiv.style.display = 'block';
        setResultsState(webResultsDiv, null);
      }
      
      addMessage('✓ Website data extracted successfully', 'success');
      
      // Only save data if extraction was successful
      window.webData = data;
    } catch (error) {
      console.error('Web extraction error:', error);
      resetLastPagePreviewUI();
      const debugInfo = `ERROR: ${error.message}\n\nตรวจสอบ:\n1. URL ถูกต้องหรือไม่\n2. Server ตอบสนองหรือไม่\n3. เป็น HTTPS URL ที่ถูกต้องหรือไม่`;
      document.getElementById('webDebug').value = debugInfo;
      document.getElementById('webResults').style.display = 'block';
      {
        const webResultsDiv = document.getElementById('webResults');
        if (webResultsDiv) setResultsState(webResultsDiv, 'error');
      }
      document.getElementById('webTimestamp').textContent = '❌ Error';
      const ifCountersErr = document.getElementById('interfaceCountersStatus');
      if (ifCountersErr) ifCountersErr.textContent = '-';
      document.getElementById('webVersion').textContent = '❌ Error';
      // Do NOT save webData when error
      window.webData = null;
      addMessage(`Error: ${error.message}`, 'error');
    } finally {
      setActionLoading('extractWebBtn', 'extractWebLoadingBar', false);
    }
  });

  document.getElementById('compareBtn').addEventListener('click', async () => {
    const compareBtn = document.getElementById('compareBtn');
    const compareLoading = document.getElementById('compareLoading');
    const compareInputWarning = document.getElementById('compareInputWarning');
    const compareResultsDiv = document.getElementById('compareResults');
    if (compareResultsDiv) compareResultsDiv.style.display = 'none';
    resetLastPagePreviewUI();
    if (compareInputWarning) {
      compareInputWarning.style.display = 'none';
      compareInputWarning.textContent = '';
    }
    const pdfPathInput = document.getElementById('pdfFile');
    const pdfPath = pdfPathInput.value.trim();
    const urlInput = document.getElementById('websiteUrl').value.trim();
    
    const missing = [];
    if (!pdfPath) missing.push('รายงานการบำรุงรักษาอุปกรณ์เครือข่ายคอมพิวเตอร์ (PDF)');
    if (!urlInput) missing.push('Log Switch GUI / CLI');
    if (missing.length > 0) {
      const msg = `กรุณาใส่ข้อมูลก่อนกด Compare Data\n- ${missing.join('\n- ')}`;
      if (compareInputWarning) {
        compareInputWarning.textContent = msg;
        compareInputWarning.style.display = 'block';
      } else {
        addMessage(msg, 'error');
      }
      if (compareResultsDiv) compareResultsDiv.style.display = 'none';
      if (compareLoading) compareLoading.style.display = 'none';
      setActionLoading('compareBtn', 'compareLoadingBar', false);
      return;
    }

    setActionLoading('compareBtn', 'compareLoadingBar', true);
    if (compareLoading) compareLoading.style.display = 'block';
    if (compareResultsDiv) compareResultsDiv.style.display = 'none';

    try {
      // Always refresh data when comparing
      window.pdfData = null;
      window.webData = null;

      // Extract PDF data if not already extracted
      if (!window.pdfData) {
        addMessage('กำลังดึงข้อมูลจาก PDF...', 'warning');
        
        let file;
        try {
          const response = await fetch(pdfPath);
          if (!response.ok) {
            throw new Error(`Failed to fetch PDF: ${response.statusText}`);
          }
          const arrayBuffer = await response.arrayBuffer();
          
          // Validate PDF structure
          if (arrayBuffer.byteLength < 100) {
            throw new Error('Invalid PDF structure - file too small');
          }
          
          // Check PDF header
          const view = new Uint8Array(arrayBuffer);
          const header = String.fromCharCode(view[0], view[1], view[2], view[3]);
          if (header !== '%PDF') {
            throw new Error('Invalid PDF structure - not a valid PDF file');
          }
          
          const blob = new Blob([arrayBuffer], { type: 'application/pdf' });
          file = new File([blob], 'temp.pdf', { type: 'application/pdf' });
        } catch (fetchError) {
          {
            const pdfResultsEl = document.getElementById('pdfResults');
            if (pdfResultsEl) {
              pdfResultsEl.style.display = 'block';
              setResultsState(pdfResultsEl, 'error');
            }
          }
          const companyOfficerEl = document.getElementById('companyOfficer');
          if (companyOfficerEl) companyOfficerEl.textContent = '❌ Error';
          document.getElementById('rdCode').textContent = '❌ Error';
          document.getElementById('completionDate').textContent = '❌ Error';
          document.getElementById('softwareVersion').textContent = '❌ Error';
          document.getElementById('textPreview').value = `❌ Error: ${fetchError.message}\n\nตรวจสอบ path/URL และว่าเป็น PDF จริงหรือไม่`;
          throw fetchError;
        }
        
        const fullText = await PDFExtractor.extractText(file);
        
        if (!fullText || fullText.length < 5) {
          throw new Error('No text found in PDF');
        }
        
        const parsed = DataParser.extractAllMatches(fullText);
        
        window.pdfData = {
          rdCode: parsed.rdCode,
          companyOfficer: extractCompanyOfficerNameFromPdfText(fullText) || null,
          completionDate: parsed.date,
          softwareVersion: extractCiscoSoftwareVersion(fullText) || parsed.version,
          fullText: fullText,
          allDates: parsed.allDates,
          allVersions: (parsed.allVersions || []).filter(v => looksLikeCiscoVersion(String(v)) && !isLikelyIPv4(String(v))),
          labeledDates: parsed.labeledDates || []
        };
        
        // Display PDF results
        const companyOfficerEl = document.getElementById('companyOfficer');
        if (companyOfficerEl) companyOfficerEl.textContent = window.pdfData.companyOfficer || 'Not found';
        document.getElementById('rdCode').textContent = window.pdfData.rdCode || 'Not found';
        document.getElementById('completionDate').textContent = window.pdfData.completionDate || 'Not found';
        document.getElementById('softwareVersion').textContent = window.pdfData.softwareVersion || 'Not found';
        
        let debugInfo = fullText.substring(0, 3000);
        debugInfo += '\n\n=== ALL DATES FOUND ===\n' +
          (window.pdfData.allDates.length > 0 ? window.pdfData.allDates.join('\n') : 'NONE');
        debugInfo += '\n\n=== LABELED DATES FOUND ===\n' +
          (window.pdfData.labeledDates.length > 0 ? window.pdfData.labeledDates.join('\n') : 'NONE');
        debugInfo += '\n\n=== COMPANY OFFICER ===\n' + (window.pdfData.companyOfficer || 'NONE');
        if (window.pdfData.allVersions.length > 0) {
          debugInfo += '\n\n=== ALL VERSIONS FOUND ===\n' + window.pdfData.allVersions.join('\n');
        }
        document.getElementById('textPreview').value = debugInfo;
        {
          const pdfResultsEl = document.getElementById('pdfResults');
          if (pdfResultsEl) {
            pdfResultsEl.style.display = 'block';
            setResultsState(pdfResultsEl, null);
          }
        }
        
        addMessage('✓ PDF extracted', 'success');
      }
      
      // Extract Website/CLI data if not already extracted
      if (!window.webData) {
        addMessage('Extracting website/CLI data...', 'warning');
        const websiteUrl = toFileUrl(urlInput);
        // ตรวจสอบ mode ที่เลือก
        const modeRadios = document.querySelectorAll('input[name="mode"]');
        const selectedMode = Array.from(modeRadios).find(r => r.checked)?.value || 'GUI';
        const data = selectedMode === 'CLI' ? await extractCLIData(websiteUrl) : await extractWebData(websiteUrl);
        
        // Only save data if extraction was successful
        window.webData = data;
        
        // Display web/CLI results (ดึงจาก html ด้วย flexible regex เพื่อ Last Time และเวลาระหว่าง 2 กับ 3)
        // สำหรับ CLI ใช้ clockDataArray ที่มีอยู่แล้ว, สำหรับ GUI ใช้ extractClockDataFromText
        let clockDataArray = [];
        let fromHtmlCompare = { clockDataArray: [], lastFullTimestamp: null };
        if (selectedMode === 'CLI' && data.clockDataArray) {
          clockDataArray = data.clockDataArray;
        } else {
          fromHtmlCompare = data.html ? extractClockDataFromText(data.html) : { clockDataArray: [], lastFullTimestamp: null };
          if (data.clockDataArray && data.clockDataArray.length > 0) {
            clockDataArray = data.clockDataArray;
          } else {
            clockDataArray = fromHtmlCompare.clockDataArray.length > 0 ? fromHtmlCompare.clockDataArray : (data.clockDataArray || data.clockDatas || []);
          }
        }
        let timeDisplay = 'Not found';
        if (selectedMode === 'CLI' && data && data.missingLastTime3) {
          timeDisplay = 'ไม่เจอเวลาที่ 3 เวลาสุดท้าย';
        } else {
          const lastFull = data.lastFullTimestamp || fromHtmlCompare.lastFullTimestamp;
          if (lastFull) {
            const thaiDate = formatTimestampToThaiDate(lastFull);
            if (thaiDate) {
              timeDisplay = `${lastFull} or ${thaiDate}`;
            } else {
              timeDisplay = lastFull;
            }
          } else if (clockDataArray && clockDataArray.length > 0) {
            timeDisplay = clockDataArray[clockDataArray.length - 1];
          } else if (data.timestamp && data.timestamp.match(/\d{2}:\d{2}:\d{2}\.\d+\s+[\+\-]\d{2}\s+\w+\s+\w+\s+\d+\s+\d{4}/)) {
            const thaiDate = formatTimestampToThaiDate(data.timestamp);
            if (thaiDate) {
              timeDisplay = `${data.timestamp} or ${thaiDate}`;
            } else {
              timeDisplay = data.timestamp;
            }
          } else if (data.timestamp && data.timestamp.includes('2568')) {
            timeDisplay = `${data.timestamp} (from PDF)`;
          } else if (data.clockData) {
            timeDisplay = data.clockData;
          } else if (data.timestamp) {
            timeDisplay = data.timestamp;
          }
        }
        
        document.getElementById('webTimestamp').textContent = timeDisplay;
        
        // คำนวณและแสดงเวลาระหว่าง 2 กับ 3
        const timeBetweenResult = calculateTimeBetween2And3(
          clockDataArray,
          selectedMode === 'CLI' ? { maxDiffMinutes: 30, signedDiff: true } : {}
        );
        const timeBetweenElement = document.getElementById('timeBetween23');
        if (timeBetweenElement) {
          if (data.clockIncomplete) {
            timeBetweenElement.textContent = data.clockIncompleteReason || 'ขาดบรรทัดคำสั่ง show clock คู่กับเวลา (รูปแบบที่ต้องการ: <hostname>#show clock ต่อด้วยบรรทัดเวลา)';
          } else if (timeBetweenResult.error) {
            timeBetweenElement.textContent = timeBetweenResult.error;
          } else {
            timeBetweenElement.textContent = timeBetweenResult.display;
          }
        }

        // ตรวจสอบ interface counters ว่าทั้งหมดเป็น -- หรือไม่
        // สำหรับ CLI ใช้ interfaceCountersCheck ที่มีอยู่แล้ว, สำหรับ GUI หาใหม่
        let countersCheckCompare;
        if (selectedMode === 'CLI' && data.interfaceCountersCheck) {
          countersCheckCompare = data.interfaceCountersCheck;
        } else {
          countersCheckCompare = checkInterfaceCountersValues(data.html);
        }
        const interfaceCountersElCompare = document.getElementById('interfaceCountersStatus');
        if (interfaceCountersElCompare) {
          if (countersCheckCompare.found && !countersCheckCompare.ok) {
            let msg = countersCheckCompare.message;
            // anomalies ถูกกรองแล้วในฟังก์ชัน checkInterfaceCountersValues (ข้าม header แล้ว)
            if (countersCheckCompare.anomalies && countersCheckCompare.anomalies.length > 0) {
              msg += ' [พบ: ' + countersCheckCompare.anomalies.slice(0, 5).join(', ') + ']';
            }
            const detailBlock = formatCountersProblemLines(countersCheckCompare, 50);
            if (detailBlock) {
              msg += `\n${detailBlock}`;
            }
            interfaceCountersElCompare.textContent = msg;
            setCmpClass(interfaceCountersElCompare, 'cmp-warning');
          } else if (countersCheckCompare.found && countersCheckCompare.ok) {
            interfaceCountersElCompare.textContent = countersCheckCompare.message || INTERFACE_COUNTERS_OK_MESSAGE;
            setCmpClass(interfaceCountersElCompare, null);
          } else {
            interfaceCountersElCompare.textContent = countersCheckCompare.message || '-';
            setCmpClass(interfaceCountersElCompare, null);
          }
        }

        const clearCountersElCompare = document.getElementById('clearCountersStatus');
        const clearElCompare = document.getElementById('clearStatus');
        const clearCountersCheckCompare = data.clearCountersCheck || (data.html ? detectClearCounters(data.html) : { found: false, matches: [] });
        const clearCheckCompare = data.clearCheck || (data.html ? detectClearLogAny(data.html) : { found: false, matches: [] });

        const formatFoundLines = (arr, maxLines = 50) => {
          if (!arr || arr.length === 0) return '';
          const shown = arr.slice(0, maxLines);
          let out = shown.join('\n');
          if (arr.length > shown.length) {
            out += `
  ... (${arr.length - shown.length} more)`;
          }
          return out;
        };

        if (clearCountersElCompare) {
          if (clearCountersCheckCompare.found) {
            const details = formatFoundLines(clearCountersCheckCompare.matches, 50);
            clearCountersElCompare.textContent = details
              ? `มี clear counters แก้ไขด่วน\nพบ:\n${details}`
              : 'มี clear counters แก้ไขด่วน';
          } else {
            clearCountersElCompare.textContent = 'ไม่มี clear counters';
          }
          setCmpClass(clearCountersElCompare, clearCountersCheckCompare.found ? 'cmp-error' : null);
        }

        if (clearElCompare) {
          if (clearCheckCompare.found) {
            const details = formatFoundLines(clearCheckCompare.matches, 50);
            clearElCompare.textContent = details
              ? `มี clear แก้ไขด่วน\nพบ:\n${details}`
              : 'มี clear แก้ไขด่วน';
          } else {
            clearElCompare.textContent = 'ไม่มี clear';
          }
          setCmpClass(clearElCompare, clearCheckCompare.found ? 'cmp-error' : null);
        }

        let versionDisplay = data.softwareVersion || 'Not found';
        document.getElementById('webVersion').textContent = versionDisplay;

        // GUI PDF: show last page preview + Leaf prompt detection (Leaf-...#)
        updateLastPagePreviewUI(data.lastPagePreview, selectedMode);
        
        const webResultsDiv = document.getElementById('webResults');
        if (webResultsDiv) {
          webResultsDiv.style.display = 'block';
          setResultsState(webResultsDiv, null);
        }
        
        addMessage('✓ Website extracted', 'success');
      }
      
      // Check if both PDF and Website data are valid before comparison
      if (!window.pdfData || !window.webData) {
        addMessage('❌ Cannot compare: PDF or Website data is missing or invalid', 'error');
        return;
      }
      
      // Now do the comparison
      addMessage('Comparing data...', 'warning');
      const result = compareData(window.pdfData, window.webData);
      
      const compareResultsDiv = document.getElementById('compareResults');

      const statusClass = (s) => {
        if (s.includes('❌')) return 'cmp-error';
        if (s.includes('⚠️')) return 'cmp-warning';
        return 'cmp-ok';
      };
      const escapeHtml = (s) => String(s)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');

      const forceSnInUrl = (url, sn) => {
        try {
          if (!url) return url;
          const u = new URL(url);
          if (sn) u.searchParams.set('sn', sn);
          return u.toString();
        } catch (e) {
          return url;
        }
      };

      const formatBlock = (title, status, message) => {
        const cls = statusClass(status);
        const safeTitle = escapeHtml(title);
        const safeStatus = escapeHtml(status);
        const safeMsg = escapeHtml(message).replace(/\n/g, '<br/>');
        return `${safeTitle}:<br/><span class="${cls}">${safeStatus}</span><br/><span class="${cls}">${safeMsg}</span>`;
      };
      document.getElementById('versionResult').innerHTML =
        formatBlock('1.Version Check', result.versionStatus, result.versionMessage);
      document.getElementById('timeResult').innerHTML =
        formatBlock('2.Time Check(ใบงาน + cfg)', result.timeStatus, result.timeMessage);
      document.getElementById('timeLogResult').innerHTML =
        formatBlock('3.Time Log Check', result.timeLogStatus, result.timeLogMessage);
      document.getElementById('crcResult').innerHTML =
        formatBlock('4.CRC Check', result.crcStatus, result.crcMessage);
      document.getElementById('clearCountersResult').innerHTML =
        formatBlock('5.Detect "Clear counters"', result.clearCountersStatus, result.clearCountersMessage);
      document.getElementById('clearResult').innerHTML =
        formatBlock('6.Detect "Clear log"', result.clearStatus, result.clearMessage);

      // 7) GUI only: Manual check "LOG Picture" (Serial Switch vs รูปภาพ)
      const logPictureItem = document.getElementById('logPictureItem');
      const logPictureResultEl = document.getElementById('logPictureResult');
      const openWebResultsFromCompare = document.getElementById('openWebResultsFromCompare');
      const modeNow = Array.from(document.querySelectorAll('input[name="mode"]')).find(r => r.checked)?.value || 'GUI';

      if (logPictureItem && logPictureResultEl) {
        if (modeNow === 'GUI') {
          let serialSwitch = null;
          try {
            const lp = (window.webData && window.webData.lastPagePreview) ? window.webData.lastPagePreview : null;
            const snippet = (lp && lp.textSnippet) ? lp.textSnippet : '';

            // 1) Prefer "Device name: ..."
            serialSwitch = extractDeviceNameFromText(snippet);

            // 2) Prefer prompt(s) detected on the last page
            if (!serialSwitch && lp) {
              const candidates = [];
              if (Array.isArray(lp.leafPrompts)) candidates.push(...lp.leafPrompts);
              if (Array.isArray(lp.leafPromptsDoc)) candidates.push(...lp.leafPromptsDoc);

              if (candidates.length > 0) {
                const cleaned = candidates.map(stripPromptHash).filter(Boolean);
                const spine = cleaned.find(x => /^Spine-/i.test(x));
                serialSwitch = spine || cleaned[0] || null;
              }
            }

            // 3) Fallback: scan only the last-page snippet (avoid whole document)
            if (!serialSwitch && snippet) {
              const prompts = findLeafPromptMatches(snippet);
              if (prompts && prompts.length > 0) {
                const cleaned = prompts.map(stripPromptHash).filter(Boolean);
                const spine = cleaned.find(x => /^Spine-/i.test(x));
                serialSwitch = spine || cleaned[0] || null;
              }
            }
          } catch (_) {
            // ignore
          }
          if (!serialSwitch) serialSwitch = 'Not found';

          logPictureResultEl.innerHTML =
            `7.Check "LOG Picture" <span class="badge-manual">ต้องเช็คเอง</span><br/>` +
            `<span class="cmp-manual">📋 เช็คว่า "Serial Switch" จะตรงกับ "รูปภาพ" ไหม</span><br/>` +
            `Serial Switch: <span class="cmp-manual">${escapeHtml(serialSwitch)}</span><br/>` +
            `<span class="cmp-manual">👉 ดูรูปจากด้านล่าง แล้วเทียบกับ Serial Switch</span>`;

          logPictureItem.style.display = 'block';
          // Show/Hide LOG Picture preview inside item #7
          const logPicturePreview = document.getElementById('logPicturePreview');
          const logPictureNoPreview = document.getElementById('logPictureNoPreview');
          const logPictureInfo = document.getElementById('logPictureInfo');

          const canShowPreview = !!(lastPagePreviewPdfDoc && lastPagePreviewPageNumber);

          if (logPicturePreview && logPictureNoPreview) {
            if (canShowPreview) {
              logPictureNoPreview.style.display = 'none';
              logPicturePreview.style.display = 'block';

              // Copy info line from Last Page preview if available
              try {
                const infoSrc = document.getElementById('lastPageInfo');
                if (logPictureInfo) {
                  logPictureInfo.textContent = (infoSrc && infoSrc.textContent) ? infoSrc.textContent : 'Last page (GUI)';
                }
              } catch (_) { }

              // Render the preview (uses the same pdfDoc + last page)
              const currentZoom = (document.getElementById('logPictureZoom')?.value) || 100;
              requestAnimationFrame(() => {
                setLogPictureZoom(currentZoom, { immediateRender: true });
              });
            } else {
              logPicturePreview.style.display = 'none';
              logPictureNoPreview.style.display = 'block';
              resetLogPicturePreviewUI();
            }
          }

        } else {
          logPictureItem.style.display = 'none';
          const logPicturePreview = document.getElementById('logPicturePreview');
          const logPictureNoPreview = document.getElementById('logPictureNoPreview');
          if (logPicturePreview) logPicturePreview.style.display = 'none';
          if (logPictureNoPreview) logPictureNoPreview.style.display = 'none';
          resetLogPicturePreviewUI();
        }
      }

      // Link: jump to "Log Switch GUI / CLI Results"
      if (openWebResultsFromCompare) {
        openWebResultsFromCompare.onclick = (e) => {
          e.preventDefault();
          const webResultsDiv = document.getElementById('webResults');
          if (!webResultsDiv) return;
          const details = webResultsDiv.querySelector('details');
          if (details) details.open = true;
          webResultsDiv.style.display = 'block';
          try {
            webResultsDiv.scrollIntoView({ behavior: 'smooth', block: 'start' });
          } catch (_) {
            webResultsDiv.scrollIntoView();
          }
        };
      }

      
      // Add overall status
      const overallEl = compareResultsDiv.querySelector('#overallStatus') || document.createElement('div');
      overallEl.id = 'overallStatus';
      overallEl.textContent = result.overallStatus;
      if (!compareResultsDiv.querySelector('#overallStatus')) {
        compareResultsDiv.insertBefore(overallEl, compareResultsDiv.querySelector('.result-item'));
      }

      // Make status a direct child with cmp-* class (CSS handles theme + tints)
      setCmpClass(overallEl, statusClass(result.overallStatus));

      // Clear legacy inline styling so theme CSS can apply
      compareResultsDiv.style.borderLeftColor = '';
      compareResultsDiv.style.backgroundColor = '';
      const comparisonTitle = compareResultsDiv.querySelector('h3');
      if (comparisonTitle) comparisonTitle.style.color = '';
      
      compareResultsDiv.style.display = 'block';
      
      addMessage('✓ Comparison completed', 'success');
    } catch (error) {
      console.error('Comparison error:', error);
      // Show error styling on PDF results
      {
        const pdfResultsEl = document.getElementById('pdfResults');
        if (pdfResultsEl) {
          pdfResultsEl.style.display = 'block';
          setResultsState(pdfResultsEl, 'error');
        }
      }

      // Also style Comparison section similar to Website Results error
      const compareResultsDiv = document.getElementById('compareResults');
      if (compareResultsDiv) {
        compareResultsDiv.style.display = 'block';
        compareResultsDiv.style.borderLeftColor = '';
        compareResultsDiv.style.backgroundColor = '';

        const overallEl = compareResultsDiv.querySelector('#overallStatus') || document.createElement('div');
        overallEl.id = 'overallStatus';
        overallEl.textContent = '❌ Compare error';
        setCmpClass(overallEl, 'cmp-error');
        if (!compareResultsDiv.querySelector('#overallStatus')) {
          compareResultsDiv.insertBefore(overallEl, compareResultsDiv.querySelector('.result-item'));
        }

        const comparisonTitle = compareResultsDiv.querySelector('h3');
        if (comparisonTitle) comparisonTitle.style.color = '';

        const timeResult = document.getElementById('timeResult');
        const versionResult = document.getElementById('versionResult');
        const timeLogResult = document.getElementById('timeLogResult');
        const crcResult = document.getElementById('crcResult');
        const clearCountersResult = document.getElementById('clearCountersResult');
        const clearResult = document.getElementById('clearResult');
        if (timeResult) timeResult.textContent = '❌ Error';
        if (versionResult) versionResult.textContent = '❌ Error';
        if (timeLogResult) timeLogResult.textContent = '❌ Error';
        if (crcResult) crcResult.textContent = '❌ Error';
        if (clearCountersResult) clearCountersResult.textContent = '❌ Error';
        if (clearResult) clearResult.textContent = '❌ Error';
      }

      addMessage(`❌ Error: ${error.message}`, 'error');
    } finally {
      if (compareLoading) compareLoading.style.display = 'none';
      setActionLoading('compareBtn', 'compareLoadingBar', false);
    }
  });

  function addMessage(msg, type = 'warning') {
    const messagesDiv = document.getElementById('messages');
    const messageEl = document.createElement('div');
    messageEl.className = `message ${type}`;
    messageEl.textContent = msg;
    messagesDiv.appendChild(messageEl);
    
    setTimeout(() => messageEl.remove(), 4000);
  }
  

  /* =========================================================
    PM Debug: Crawl pm_title (all pages) -> 5-step URL chain
    Chain: pm_title -> pm_editcall_approve_device -> rack_detail_TOR
            -> router_product -> view_configuration
  ========================================================= */

  (function setupPmDebugChain(){
    const pmTitleInput = document.getElementById('pmTitleUrl');
    const debugBtn = document.getElementById('debugUrlsBtn');
    const stopBtn  = document.getElementById('stopDebugBtn');
    const progressEl = document.getElementById('debugProgress');
    const summaryEl = document.getElementById('debugSummary');
    const summaryFilterEl = document.getElementById('debugSummaryFilterMain');
    const filterAllEl = document.getElementById('debugMainFilterAll');
    const filterOkEl = document.getElementById('debugMainFilterOK');
    const filterErrEl = document.getElementById('debugMainFilterERR');
    const filterAllTextEl = document.getElementById('debugMainFilterAllText');
    const filterOkTextEl = document.getElementById('debugMainFilterOKText');
    const filterErrTextEl = document.getElementById('debugMainFilterERRText');
    const resultsEl = document.getElementById('debugResults');

    const pmModeGUI = document.getElementById('pmModeGUI');
    const pmModeCLI = document.getElementById('pmModeCLI');

    if (!pmTitleInput || !debugBtn || !stopBtn || !progressEl || !resultsEl) return;

    let abortFlag = false;
    let isRunning = false;

    function setProgress(text){
      progressEl.textContent = text || '';
    }

    function getSelectedDebugStatusFilter(){
      if (filterErrEl && filterErrEl.checked) return 'ERR';
      if (filterOkEl && filterOkEl.checked) return 'OK';
      return 'ALL';
    }

    function setSummaryFilterLabels(total, okCount, errCount){
      if (filterAllTextEl) filterAllTextEl.textContent = `ทั้งหมด (${total})`;
      if (filterOkTextEl) filterOkTextEl.textContent = `ปกติ (${okCount})`;
      if (filterErrTextEl) filterErrTextEl.textContent = `ผิดปกติ (${errCount})`;
    }

    function applySummaryFilter(){
      const filter = getSelectedDebugStatusFilter();
      const cards = Array.from(resultsEl.querySelectorAll('.debug-card'));
      for (const card of cards){
        const statusEl = card.querySelector('.sn-status');
        const isOk = !!statusEl && statusEl.classList.contains('sn-status-ok');
        const isErr = !!statusEl && statusEl.classList.contains('sn-status-err');
        const shouldShow =
          filter === 'ALL' ||
          (filter === 'OK' && isOk) ||
          (filter === 'ERR' && isErr);
        card.style.display = shouldShow ? '' : 'none';
      }
    }

    function resetSummaryFilter(){
      if (filterAllEl) filterAllEl.checked = true;
      setSummaryFilterLabels(0, 0, 0);
      if (summaryFilterEl) summaryFilterEl.style.display = 'none';
      applySummaryFilter();
    }

    function resetSummary(){
      if (!summaryEl) return;
      summaryEl.textContent = '';
      summaryEl.style.display = 'none';
      resetSummaryFilter();
    }

    function updateSummary(){
      if (!summaryEl) return;
      const cards = Array.from(resultsEl.querySelectorAll('.debug-card'));
      const total = cards.length;
      if (!total){
        summaryEl.textContent = '';
        summaryEl.style.display = 'none';
        resetSummaryFilter();
        return;
      }

      let okCount = 0;
      let errCount = 0;
      for (const card of cards){
        const statusEl = card.querySelector('.sn-status');
        if (!statusEl) continue;
        if (statusEl.classList.contains('sn-status-ok')) okCount++;
        else if (statusEl.classList.contains('sn-status-err')) errCount++;
      }

      summaryEl.textContent = `สถานะ : ปกติ ${okCount} อัน | สถานะ : ผิดปกติ ${errCount} อัน | ทั้งหมด : ${total} อัน`;
      summaryEl.style.display = 'block';
      setSummaryFilterLabels(total, okCount, errCount);
      if (summaryFilterEl) summaryFilterEl.style.display = 'grid';
      applySummaryFilter();
    }

    if (filterAllEl && filterOkEl && filterErrEl){
      const onFilterChange = () => applySummaryFilter();
      filterAllEl.addEventListener('change', onFilterChange);
      filterOkEl.addEventListener('change', onFilterChange);
      filterErrEl.addEventListener('change', onFilterChange);
    }

    
    // --- Mode (GUI/CLI) for PM Compare ---
    function getSelectedPmMode(){
      if (pmModeCLI && pmModeCLI.checked) return 'CLI';
      if (pmModeGUI && pmModeGUI.checked) return 'GUI';
      const main = document.querySelector('input[name="mode"]:checked');
      return main ? main.value : 'GUI';
    }
    function applyModeToMain(mode){
      const mainGUI = document.getElementById('modeGUI');
      const mainCLI = document.getElementById('modeCLI');
      if (!mainGUI || !mainCLI) return;
      if (mode === 'CLI') mainCLI.checked = true;
      else mainGUI.checked = true;
    }
    function syncPmModeFromMain(){
      if (!pmModeGUI || !pmModeCLI) return;
      const main = document.querySelector('input[name="mode"]:checked');
      if (!main) return;
      if (main.value === 'CLI') pmModeCLI.checked = true;
      else pmModeGUI.checked = true;
    }
    if (pmModeGUI && pmModeCLI){
      // initial sync
      syncPmModeFromMain();
      // keep main in sync (user sees same mode everywhere)
      pmModeGUI.addEventListener('change', () => applyModeToMain(getSelectedPmMode()));
      pmModeCLI.addEventListener('change', () => applyModeToMain(getSelectedPmMode()));
    }

    // --- Helpers to run Compare silently (per item) ---
    async function fetchPdfArrayBuffer(url){
      const res = await fetch(url, { credentials: 'include', cache: 'no-store' });
      if (!res.ok) throw new Error(`Failed to fetch PDF: ${res.status} ${res.statusText}`);
      const arrayBuffer = await res.arrayBuffer();
      if (!arrayBuffer || arrayBuffer.byteLength < 100) throw new Error('Invalid PDF structure - file too small');
      const bytes = new Uint8Array(arrayBuffer);
      const header = String.fromCharCode(bytes[0], bytes[1], bytes[2], bytes[3]);
      if (header !== '%PDF') throw new Error('Not a valid PDF file');
      return arrayBuffer;
    }

    
async function extractPdfDataFromUrl(pdfUrl){
  const ab = await fetchPdfArrayBuffer(pdfUrl);
  if (abortFlag) throw new Error('aborted');

  const blob = new Blob([ab], { type: 'application/pdf' });
  const file = new File([blob], 'pm_compare.pdf', { type: 'application/pdf' });

  const fullText = await PDFExtractor.extractText(file);
  if (abortFlag) throw new Error('aborted');
  if (!fullText || fullText.length < 5) throw new Error('No text found in PDF');

  // ✅ ให้รูปแบบเหมือน "Extract PDF Data" ปกติ (เพื่อให้ compareData หา completionDate/softwareVersion ได้)
  const parsed = DataParser.extractAllMatches(fullText) || {};
  const pdfData = {
    rdCode: parsed.rdCode || null,
    companyOfficer: extractCompanyOfficerNameFromPdfText(fullText) || null,
    completionDate: parsed.date || null,
    softwareVersion: extractCiscoSoftwareVersion(fullText) || parsed.version || null,
    fullText: fullText,
    allDates: parsed.allDates || [],
    labeledDates: parsed.labeledDates || [],
    allVersions: (parsed.allVersions || []).filter(v => looksLikeCiscoVersion(String(v)) && !isLikelyIPv4(String(v)))
  };

  // short preview for debugging
  pdfData._textPreview = (fullText || '').slice(0, 400);
  return pdfData;
}

    
async function runCompareForUrls(pdfUrl, webUrl, mode){
  const pdfData = await extractPdfDataFromUrl(pdfUrl);
  if (abortFlag) throw new Error('aborted');

  // Note: webUrl can be HTML/PDF. extractWebData รองรับ PDF ด้วย
  const webData = (mode === 'CLI')
    ? await extractCLIData(webUrl)
    : await extractWebData(webUrl);

  if (abortFlag) throw new Error('aborted');
  if (!webData) throw new Error('Website/Log extract failed');

  const result = compareData(pdfData, webData);
  return { result, pdfData, webData };
}

        async function addCompareCard(item, chain, errors){
      // ✅ mapping ตามล่าสุดของคุณ:
      // - PDF: https://manetwork...pdf  -> id="pdfFile"
      // - 5) view_configuration: https://83.118.../view_configuration.php?... -> id="websiteUrl"
      const pdfUrlForCompare = chain?.pdf || item.pdfUrl || null;    // PDF -> id="pdfFile"
      const webUrlForCompare = chain?.step5 || null;                 // view_configuration -> id="websiteUrl"
      const canCompare = !!(pdfUrlForCompare && webUrlForCompare);
      const cardIndex = resultsEl.querySelectorAll('.debug-card').length + 1;

      const escapeHtml = (s) => String(s)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');

      const statusClass = (s) => {
        if (String(s).includes('❌')) return 'cmp-error';
        if (String(s).includes('⚠️')) return 'cmp-warning';
        return 'cmp-ok';
      };

      // ✅ Ensure sn query param in worksheet URL matches card SN
      const forceSnInUrl = (url, sn) => {
        try {
          if (!url) return url;
          const u = new URL(url);
          if (sn) u.searchParams.set('sn', sn);
          return u.toString();
        } catch (e) {
          return url;
        }
      };

      const setHeaderStatus = (overallStatusText) => {
        // Show: "FLM... สถานะ : ปกติ"
        let label = 'กำลังตรวจสอบ...';
        let cls = 'sn-status-pending';
        const t = String(overallStatusText || '');
        if (t.includes('✅')) { label = 'ปกติ'; cls = 'sn-status-ok'; }
        else if (t.includes('⚠️')) { label = 'ผิดปกติ'; cls = 'sn-status-err'; }
        else if (t.includes('❌')) { label = 'ผิดปกติ'; cls = 'sn-status-err'; }

        snEl.innerHTML = `${escapeHtml(item.sn || '(no-sn)')} <span class="sn-status ${cls}">สถานะ : ${escapeHtml(label)}</span>`;
      };

      const card = document.createElement('div');
      card.className = `debug-card ${canCompare ? 'ok' : 'err'}`;

      const head = document.createElement('div');
      head.className = 'debug-head';

      const left = document.createElement('div');

      const snEl = document.createElement('div');
      snEl.className = 'debug-sn';
      snEl.setAttribute('data-debug-index', String(cardIndex));
      snEl.innerHTML = `${escapeHtml(item.sn || '(no-sn)')} <span class="sn-status sn-status-pending">สถานะ : กำลังตรวจสอบ...</span>`;

      const meta = document.createElement('div');
      meta.className = 'debug-meta';
      const bits = [];
      if (item.callId) bits.push(`call_id: ${item.callId}`);
      if (item.idAdd)  bits.push(`id_add: ${item.idAdd}`);
      bits.push(`mode: ${getSelectedPmMode()}`);
            const worksheetUrl = forceSnInUrl(chain?.step2 || item.approveUrl || '', (item.sn || '').trim());
      meta.innerHTML =
        `${escapeHtml(bits.join(' | '))}` +
        `<br/>เจ้าหน้าที่บริษัท: <span class="pm-company-officer debug-missing">กำลังดึงข้อมูล...</span>` +
        `<br/>ใบงาน : ${worksheetUrl ? `<a href="${escapeHtml(worksheetUrl)}" target="_blank" rel="noreferrer">${escapeHtml(worksheetUrl)}</a>` : '<span class="debug-missing">(missing)</span>'}`;

      left.appendChild(snEl);
      left.appendChild(meta);

      const actions = document.createElement('div');
      actions.className = 'debug-actions';

      // ✅ เปลี่ยน "Copy chain" -> "ดูเพิ่มเติม"
      const toggleBtn = document.createElement('button');
      toggleBtn.className = 'debug-mini-btn';
      toggleBtn.textContent = 'ดูเพิ่มเติม';

      actions.appendChild(toggleBtn);
      head.appendChild(left);
      head.appendChild(actions);
      card.appendChild(head);

      // === Details (hidden until click) ===
      const detailsWrap = document.createElement('div');
      detailsWrap.className = 'debug-details';
      detailsWrap.style.display = 'none';

      // --- Comparison Results block (inside details) ---
      const compareBox = document.createElement('div');
      compareBox.className = 'results';
      compareBox.style.marginTop = '10px';
      compareBox.style.display = 'block';

      const h3 = document.createElement('h3');
      h3.textContent = 'Comparison:';
      compareBox.appendChild(h3);

      const overallEl = document.createElement('div');
      overallEl.className = 'pm-overall';
      overallEl.innerHTML = `<h4>⏳ Comparing...</h4>`;
      compareBox.appendChild(overallEl);

      const mkResultItem = () => {
        const wrap = document.createElement('div');
        wrap.className = 'result-item';
        const p = document.createElement('p');
        p.innerHTML = '-';
        wrap.appendChild(p);
        compareBox.appendChild(wrap);
        return { wrap, p };
      };

      const versionItem = mkResultItem();
      const timeItem = mkResultItem();
      const timeLogItem = mkResultItem();
      const crcItem = mkResultItem();
      const clearCountersItem = mkResultItem();
      const clearItem = mkResultItem();

      // #7 manual check + preview (match Comparison Results UI)
      const logItem = mkResultItem();
      logItem.wrap.classList.add('result-item--manual');
      const logPictureP = logItem.p;

      const logPreviewWrap = document.createElement('div');
      logPreviewWrap.className = 'pdf-preview pm-logpic-preview';
      logPreviewWrap.style.display = 'none';

      // Meta: LOG Picture Preview: 817/817
      const logPreviewMeta = document.createElement('div');
      logPreviewMeta.className = 'pdf-preview-meta';

      const logPreviewMetaRow = document.createElement('div');
      logPreviewMetaRow.className = 'pdf-preview-meta-row pdf-preview-meta-row--small';

      const logPreviewMetaLabel = document.createElement('span');
      logPreviewMetaLabel.className = 'pdf-preview-meta-label';
      logPreviewMetaLabel.textContent = 'LOG Picture Preview:';

      const logPreviewInfo = document.createElement('span');
      logPreviewInfo.className = 'pdf-preview-meta-value pm-logpic-info';
      logPreviewInfo.textContent = '-';

      logPreviewMetaRow.appendChild(logPreviewMetaLabel);
      logPreviewMetaRow.appendChild(logPreviewInfo);
      logPreviewMeta.appendChild(logPreviewMetaRow);
      logPreviewWrap.appendChild(logPreviewMeta);

      // Viewport (scrollable) + Image
      const logPreviewViewport = document.createElement('div');
      logPreviewViewport.className = 'pdf-preview-viewport pm-logpic-viewport';

      const logPreviewImg = document.createElement('img');
      logPreviewImg.className = 'pm-logpic-img';
      logPreviewImg.alt = 'LOG Picture Preview';
      logPreviewImg.style.width = '100%';
      logPreviewImg.draggable = false;
      logPreviewViewport.appendChild(logPreviewImg);
      logPreviewWrap.appendChild(logPreviewViewport);

      // Zoom controls (bottom)
      const logPreviewControls = document.createElement('div');
      logPreviewControls.className = 'pdf-preview-controls';

      const logPreviewZoomLeft = document.createElement('span');
      logPreviewZoomLeft.className = 'pdf-preview-zoom-left';
      logPreviewZoomLeft.textContent = 'Zoom';

      const logPreviewZoom = document.createElement('input');
      logPreviewZoom.type = 'range';
      logPreviewZoom.min = String(typeof LAST_PAGE_PREVIEW_MIN_ZOOM !== 'undefined' ? LAST_PAGE_PREVIEW_MIN_ZOOM : 25);
      logPreviewZoom.max = String(typeof LAST_PAGE_PREVIEW_MAX_ZOOM !== 'undefined' ? LAST_PAGE_PREVIEW_MAX_ZOOM : 200);
      logPreviewZoom.step = '5';
      logPreviewZoom.value = '100';
      logPreviewZoom.className = 'pm-logpic-zoom';

      const logPreviewZoomLabel = document.createElement('span');
      logPreviewZoomLabel.className = 'pdf-preview-zoom-label pm-logpic-zoom-label';
      logPreviewZoomLabel.textContent = '100%';

      logPreviewControls.appendChild(logPreviewZoomLeft);
      logPreviewControls.appendChild(logPreviewZoom);
      logPreviewControls.appendChild(logPreviewZoomLabel);
      logPreviewWrap.appendChild(logPreviewControls);

      logItem.wrap.appendChild(logPreviewWrap);

      detailsWrap.appendChild(compareBox);

      // --- Data used (after Comparison) ---
      const dataDetails = document.createElement('details');
      dataDetails.className = 'cmp-data-details';
      const dataSummary = document.createElement('summary');
      dataSummary.textContent = 'ดูข้อมูลที่ใช้เปรียบเทียบ';
      dataDetails.appendChild(dataSummary);

      const dataPre = document.createElement('pre');
      dataPre.className = 'cmp-data-pre';
      dataPre.textContent = 'กำลังดึงข้อมูล...';
      dataDetails.appendChild(dataPre);

      detailsWrap.appendChild(dataDetails);
      // --- Debug URLs block (bottom) ---
      // ซ่อนเป็น default และกด "ดูเพิ่มเติม" ถึงจะแสดง (กันยาว + กันเลขซ้ำ)
      const debugDetails = document.createElement('details');
      debugDetails.className = 'cmp-debug-details';

      const debugSummary = document.createElement('summary');
      debugSummary.textContent = 'Debug URLs (Chain 5 ขั้น)';
      debugDetails.appendChild(debugSummary);

      const debugInner = document.createElement('div');
      debugInner.className = 'cmp-debug-inner';

      // ปุ่มคัดลอก chain (อยู่ในส่วนที่กางออกเท่านั้น)
      const copyBtn = document.createElement('button');
      copyBtn.className = 'debug-mini-btn';
      copyBtn.type = 'button';
      copyBtn.textContent = 'คัดลอก chain';
      copyBtn.addEventListener('click', async () => {
        const lines = [
          `SN: ${item.sn || ''}`,
          `call_id: ${item.callId || ''}`,
          `id_add: ${item.idAdd || ''}`,
          `MODE: ${getSelectedPmMode()}`,
          `1) pm_title: ${chain?.step1 || ''}`,
          `2) pm_editcall_approve_device: ${chain?.step2 || ''}`,
          `3) rack_detail_TOR: ${chain?.step3 || ''}`,
          `4) router_product: ${chain?.step4 || ''}`,
          `5) view_configuration: ${chain?.step5 || ''}`,
          `PDF: ${chain?.pdf || item.pdfUrl || ''}`
        ].join('\\n');
        try{
          await navigator.clipboard.writeText(lines);
          copyBtn.textContent = 'Copied!';
          setTimeout(() => copyBtn.textContent = 'คัดลอก chain', 900);
        }catch(e){
          console.warn('Clipboard error:', e);
          alert('Copy ไม่สำเร็จ (clipboard ถูกบล็อก)');
        }
      });
      debugInner.appendChild(copyBtn);

      const linesWrap = document.createElement('div');
      linesWrap.className = 'debug-chain-lines';

      const mkLine = (label, url) => {
        const row = document.createElement('div');
        row.className = 'debug-line';

        const labelEl = document.createElement('span');
        labelEl.className = 'debug-line-label';
        labelEl.textContent = `${label}: `;
        row.appendChild(labelEl);

        if (url){
          const a = document.createElement('a');
          a.href = url;
          a.textContent = url;
          a.target = '_blank';
          a.rel = 'noreferrer';
          row.appendChild(a);
        }else{
          const em = document.createElement('span');
          em.className = 'debug-missing';
          em.textContent = '(missing)';
          row.appendChild(em);
        }
        return row;
      };

      // แสดงแบบ "บรรทัดเดียว" ต่อรายการ (กันเลขซ้ำ 1. + 1))
      linesWrap.appendChild(mkLine('1) pm_title', chain?.step1));
      linesWrap.appendChild(mkLine('2) pm_editcall_approve_device', chain?.step2));
      linesWrap.appendChild(mkLine('3) rack_detail_TOR', chain?.step3));
      linesWrap.appendChild(mkLine('4) router_product', chain?.step4));
      linesWrap.appendChild(mkLine('5) view_configuration', chain?.step5));
      linesWrap.appendChild(mkLine('PDF', chain?.pdf || item.pdfUrl));

      if (errors && errors.length){
        const warn = document.createElement('div');
        warn.className = 'debug-line debug-warn-line';
        warn.innerHTML = `<span class="cmp-warning">⚠️ debug warnings:</span> ` + errors.map(e => '<span class="debug-missing">' + escapeHtml(String(e)) + '</span>').join(', ');
        linesWrap.appendChild(warn);
      }

      debugInner.appendChild(linesWrap);
      debugDetails.appendChild(debugInner);
      detailsWrap.appendChild(debugDetails);


      card.appendChild(detailsWrap);

      // Toggle behavior
      toggleBtn.addEventListener('click', () => {
        const isOpen = detailsWrap.style.display !== 'none';
        detailsWrap.style.display = isOpen ? 'none' : 'block';
        toggleBtn.textContent = isOpen ? 'ดูเพิ่มเติม' : 'ซ่อนรายละเอียด';

        // Lazy render preview when user opens (GUI only)
        if (!isOpen) {
          if (logPreviewWrap.dataset.readyToRender === '1') {
            // Already requested
            return;
          }
          // If compare is GUI and we have pdfUrl, attempt render
          if (logPreviewWrap.dataset.canRender === '1') {
            logPreviewWrap.dataset.readyToRender = '1';
            ensureLogPreviewRendered();
          }
        }
      });

      // Append card early (so user sees progress)
      resultsEl.appendChild(card);
      updateSummary();

      // If cannot compare, show a friendly message and exit
      if (!canCompare){
        overallEl.innerHTML = `<h4 class="cmp-error">❌ Missing compare URLs</h4>`;
        setHeaderStatus('❌');
        dataPre.textContent = `Missing URLs\n- websiteUrl(view_configuration): ${webUrlForCompare || '(missing)'}\n- pdfFile(PDF): ${pdfUrlForCompare || '(missing)'}`;
        const officerSpan = meta.querySelector('.pm-company-officer');
        if (officerSpan) {
          officerSpan.textContent = '(missing)';
          officerSpan.classList.add('debug-missing');
        }
        updateSummary();
        return;
      }

      const formatBlock = (title, status, message) => {
        const cls = statusClass(status);
        const safeTitle = escapeHtml(title);
        const safeStatus = escapeHtml(status);
        const safeMsg = escapeHtml(message).replace(/\n/g, '<br/>');
        return `${safeTitle}:<br/><span class="${cls}">${safeStatus}</span><br/><span class="${cls}">${safeMsg}</span>`;
      };

      const mode = getSelectedPmMode();
      applyModeToMain(mode);

      // Helper: render last page of PDF (ที่ฝังอยู่ในหน้า view_configuration) for this card (lazy + zoom)
      let _previewPromise = null;
      let _previewPdfDoc = null;
      let _previewPageNumber = null;
      let _previewPdfUrl = null;
      let _previewObjectUrl = null;
      let _previewRenderTimerId = null;
      let _previewRenderSeq = 0;
      let _previewViewportRetryCount = 0;

      const __viewConfigPdfCache = window.__viewConfigPdfCache || (window.__viewConfigPdfCache = new Map());

      function revokeCardPreviewUrl() {
        if (_previewObjectUrl) {
          try { URL.revokeObjectURL(_previewObjectUrl); } catch (_) {}
          _previewObjectUrl = null;
        }
      }

      function getCardPreviewViewportInnerWidth() {
        if (!logPreviewViewport) return null;
        const styles = window.getComputedStyle(logPreviewViewport);
        const padL = parseFloat(styles.paddingLeft) || 0;
        const padR = parseFloat(styles.paddingRight) || 0;
        const w = logPreviewViewport.clientWidth - padL - padR;
        return w > 0 ? w : null;
      }

      function extractEmbeddedPdfUrlFromViewConfigHtml(html, baseUrl) {
        try{
          const doc = new DOMParser().parseFromString(html || '', 'text/html');
          const iframe = doc.querySelector('iframe[src*=".pdf"], iframe[src]');
          const embed = doc.querySelector('embed[src*=".pdf"], embed[src]');
          const obj = doc.querySelector('object[data*=".pdf"], object[data]');
          const a = doc.querySelector('a[href*=".pdf"], a[href]');
          let raw = null;

          if (iframe) raw = iframe.getAttribute('src');
          else if (embed) raw = embed.getAttribute('src');
          else if (obj) raw = obj.getAttribute('data');
          else if (a) raw = a.getAttribute('href');

          if (raw) {
            return new URL(raw, baseUrl).toString();
          }

          // fallback regex (absolute)
          const abs = String(html || '').match(/https?:\/\/[^\s"'<>]+\.pdf[^\s"'<>]*/i);
          if (abs && abs[0]) return abs[0];

          // fallback regex (relative)
          const rel = String(html || '').match(/\/[^\s"'<>]+\.pdf[^\s"'<>]*/i);
          if (rel && rel[0]) return new URL(rel[0], baseUrl).toString();

          // generic fallback: first iframe src even if not ending with .pdf
          const anyIframe = String(html || '').match(/<iframe[^>]*\s+src=['"]([^'"]+)['"][^>]*>/i);
          if (anyIframe && anyIframe[1]) return new URL(anyIframe[1], baseUrl).toString();
        }catch(e){
          // ignore
        }
        return null;
      }

      async function resolveEmbeddedPdfUrlFromViewConfig() {
        if (!webUrlForCompare) return null;
        if (__viewConfigPdfCache.has(webUrlForCompare)) return __viewConfigPdfCache.get(webUrlForCompare);

        // Some installations return the PDF directly from view_configuration.php
        try{
          const res = await fetch(webUrlForCompare, { credentials: 'include' });
          const ct = String(res.headers.get('content-type') || '').toLowerCase();

          if (ct.includes('application/pdf')) {
            __viewConfigPdfCache.set(webUrlForCompare, webUrlForCompare);
            return webUrlForCompare;
          }

          const html = await res.text();
          const pdfUrl = extractEmbeddedPdfUrlFromViewConfigHtml(html, webUrlForCompare);

          __viewConfigPdfCache.set(webUrlForCompare, pdfUrl);
          return pdfUrl;
        }catch(e){
          // fallback to old helper
          const html = await fetchText(webUrlForCompare);
          const pdfUrl = extractEmbeddedPdfUrlFromViewConfigHtml(html, webUrlForCompare);

          __viewConfigPdfCache.set(webUrlForCompare, pdfUrl);
          return pdfUrl;
        }
      }

      async function ensurePreviewPdfLoaded() {
        if (_previewPdfDoc && _previewPageNumber && _previewPdfUrl) return true;

        _previewPdfUrl = await resolveEmbeddedPdfUrlFromViewConfig();
        if (!_previewPdfUrl) return false;

        try { pdfjsLib.GlobalWorkerOptions.workerSrc = chrome.runtime.getURL('pdf.worker.min.js'); } catch(_) {}

        const ab = await fetchPdfArrayBuffer(_previewPdfUrl);
        if (abortFlag) return false;

        _previewPdfDoc = await pdfjsLib.getDocument({ data: ab }).promise;
        _previewPageNumber = _previewPdfDoc.numPages;

        return true;
      }

      async function renderCardLogPreviewImage(zoomPercent, renderSeq) {
        const pdfDoc = _previewPdfDoc;
        const pageNumber = _previewPageNumber;
        const viewportWidth = getCardPreviewViewportInnerWidth();

        if (!pdfDoc || !pageNumber || !logPreviewWrap || logPreviewWrap.style.display === 'none' || !logPreviewImg) return;

        // If the viewport hasn't been laid out yet (width=0), retry a few times.
        if (!viewportWidth) {
          if (renderSeq === _previewRenderSeq && _previewViewportRetryCount < PREVIEW_VIEWPORT_RETRY_LIMIT) {
            _previewViewportRetryCount += 1;
            setTimeout(() => renderCardLogPreviewImage(zoomPercent, renderSeq), PREVIEW_VIEWPORT_RETRY_DELAY_MS);
          }
          return;
        }

        try{
          const page = await pdfDoc.getPage(pageNumber);
          if (renderSeq !== _previewRenderSeq) return;

          const baseViewport = page.getViewport({ scale: 1 });
          const fitScale = viewportWidth / Math.max(1, Number(baseViewport.width) || 1);
          const zoomScale = clampNumber(zoomPercent, LAST_PAGE_PREVIEW_MIN_ZOOM, LAST_PAGE_PREVIEW_MAX_ZOOM) / 100;
          const maxDpr = (typeof LAST_PAGE_PREVIEW_MAX_DPR !== 'undefined') ? LAST_PAGE_PREVIEW_MAX_DPR : 2;
          const dpr = Math.min(Number(window.devicePixelRatio) || 1, maxDpr);

          const desiredScale = fitScale * zoomScale * dpr;
          const renderScale = (typeof computeSafePdfRenderScale === 'function')
            ? computeSafePdfRenderScale(page, desiredScale, LAST_PAGE_PREVIEW_MAX_RENDER_PIXELS)
            : desiredScale;

          const viewport = page.getViewport({ scale: renderScale });

          const canvas = document.createElement('canvas');
          canvas.width = Math.max(1, Math.floor(viewport.width));
          canvas.height = Math.max(1, Math.floor(viewport.height));

          const ctx = canvas.getContext('2d', { alpha: false });
          if (!ctx) throw new Error('Canvas context not available');

          await page.render({ canvasContext: ctx, viewport }).promise;
          if (renderSeq !== _previewRenderSeq) return;

          const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/png'));
          const newUrl = blob ? URL.createObjectURL(blob) : canvas.toDataURL('image/png');

          if (renderSeq !== _previewRenderSeq) {
            if (typeof newUrl === 'string' && newUrl.startsWith('blob:')) {
              try { URL.revokeObjectURL(newUrl); } catch (_) {}
            }
            return;
          }

          const oldUrl = _previewObjectUrl;
          logPreviewImg.src = newUrl;
          _previewObjectUrl = (typeof newUrl === 'string' && newUrl.startsWith('blob:')) ? newUrl : null;
          logPreviewImg.dataset.rendered = '1';

          if (oldUrl && typeof oldUrl === 'string' && oldUrl.startsWith('blob:')) {
            try { URL.revokeObjectURL(oldUrl); } catch (_) {}
          }
        }catch(e){
          console.warn('Card LOG picture preview render failed:', e);
        }
      }

      function scheduleCardLogPreviewRender(zoomPercent, opts = {}) {
        if (!logPreviewWrap || logPreviewWrap.style.display === 'none') return;
        if (!_previewPdfDoc || !_previewPageNumber) return;

        if (_previewRenderTimerId) {
          clearTimeout(_previewRenderTimerId);
          _previewRenderTimerId = null;
        }

        _previewRenderSeq += 1;
        const renderSeq = _previewRenderSeq;
        _previewViewportRetryCount = 0;

        const immediate = !!(opts && opts.immediate);
        const delay = immediate ? 0 : LAST_PAGE_PREVIEW_RENDER_DEBOUNCE_MS;

        _previewRenderTimerId = setTimeout(() => {
          _previewRenderTimerId = null;
          renderCardLogPreviewImage(zoomPercent, renderSeq);
        }, delay);
      }

      function setCardLogPreviewZoom(percent, opts = {}) {
        const clamped = Math.round(clampNumber(percent, LAST_PAGE_PREVIEW_MIN_ZOOM, LAST_PAGE_PREVIEW_MAX_ZOOM));

        if (logPreviewZoom) logPreviewZoom.value = String(clamped);
        if (logPreviewImg) logPreviewImg.style.width = `${clamped}%`;
        if (logPreviewZoomLabel) logPreviewZoomLabel.textContent = `${clamped}%`;

        scheduleCardLogPreviewRender(clamped, { immediate: !!opts.immediateRender });
      }

      function setupCardPreviewInteractions() {
        if (logPreviewZoom && !logPreviewZoom.dataset.bound) {
          logPreviewZoom.addEventListener('input', () => {
            setCardLogPreviewZoom(logPreviewZoom.value);
          });
          logPreviewZoom.dataset.bound = '1';
        }

        if (!logPreviewViewport) return;
        if (logPreviewViewport.dataset.interactionsBound) return;
        logPreviewViewport.dataset.interactionsBound = '1';

        logPreviewImg.addEventListener('dragstart', (e) => e.preventDefault());

        // Wheel zoom
        logPreviewViewport.addEventListener('wheel', (e) => {
          if (!logPreviewZoom) return;

          const currentZoom = Math.round(clampNumber(logPreviewZoom.value, LAST_PAGE_PREVIEW_MIN_ZOOM, LAST_PAGE_PREVIEW_MAX_ZOOM));
          if (!Number.isFinite(currentZoom) || currentZoom <= 0) return;

          const direction = e.deltaY === 0 ? 0 : (e.deltaY > 0 ? -1 : 1); // wheel down -> zoom out
          if (direction === 0) return;

          const step = e.shiftKey ? 25 : 10;
          const nextZoom = Math.round(clampNumber(currentZoom + direction * step, LAST_PAGE_PREVIEW_MIN_ZOOM, LAST_PAGE_PREVIEW_MAX_ZOOM));
          if (nextZoom === currentZoom) {
            if (
              (direction > 0 && currentZoom >= LAST_PAGE_PREVIEW_MAX_ZOOM) ||
              (direction < 0 && currentZoom <= LAST_PAGE_PREVIEW_MIN_ZOOM)
            ) {
              e.preventDefault();
            }
            return;
          }

          const rect = logPreviewViewport.getBoundingClientRect();
          const styles = window.getComputedStyle(logPreviewViewport);
          const padL = parseFloat(styles.paddingLeft) || 0;
          const padT = parseFloat(styles.paddingTop) || 0;

          const pointerX = e.clientX - rect.left - logPreviewViewport.clientLeft;
          const pointerY = e.clientY - rect.top - logPreviewViewport.clientTop;

          const imgX = logPreviewViewport.scrollLeft + pointerX - padL;
          const imgY = logPreviewViewport.scrollTop + pointerY - padT;
          const ratio = nextZoom / currentZoom;

          setCardLogPreviewZoom(nextZoom);

          // keep point-under-cursor stable
          logPreviewViewport.scrollLeft = Math.max(0, (imgX * ratio) - pointerX + padL);
          logPreviewViewport.scrollTop = Math.max(0, (imgY * ratio) - pointerY + padT);

          e.preventDefault();
        }, { passive: false });

        // Drag to pan
        let dragging = false;
        let startX = 0;
        let startY = 0;
        let startScrollLeft = 0;
        let startScrollTop = 0;

        const stopDrag = () => {
          dragging = false;
          logPreviewViewport.classList.remove('is-dragging');
          document.removeEventListener('mousemove', onMove);
          document.removeEventListener('mouseup', stopDrag);
          document.removeEventListener('mouseleave', stopDrag);
        };

        const onMove = (e) => {
          if (!dragging) return;
          const dx = e.clientX - startX;
          const dy = e.clientY - startY;
          logPreviewViewport.scrollLeft = startScrollLeft - dx;
          logPreviewViewport.scrollTop = startScrollTop - dy;
        };

        logPreviewViewport.addEventListener('mousedown', (e) => {
          if (e.button !== 0) return;
          dragging = true;
          logPreviewViewport.classList.add('is-dragging');
          startX = e.clientX;
          startY = e.clientY;
          startScrollLeft = logPreviewViewport.scrollLeft;
          startScrollTop = logPreviewViewport.scrollTop;

          document.addEventListener('mousemove', onMove);
          document.addEventListener('mouseup', stopDrag);
          document.addEventListener('mouseleave', stopDrag);
        });
      }

      async function ensureLogPreviewRendered(){
        if (mode !== 'GUI') return;
        if (!webUrlForCompare) return;

        setupCardPreviewInteractions();

        logPreviewWrap.style.display = 'block';
        revokeCardPreviewUrl();

        if (logPreviewImg) {
          logPreviewImg.removeAttribute('src');
          logPreviewImg.dataset.rendered = '0';
          logPreviewImg.alt = 'Rendering...';
        }

        if (logPreviewInfo) logPreviewInfo.textContent = 'กำลังโหลด...';

        if (_previewPromise) return;

        _previewPromise = (async () => {
          try{
            const ok = await ensurePreviewPdfLoaded();
            if (!ok){
              if (logPreviewInfo) logPreviewInfo.textContent = 'ไม่พบ PDF';
              return;
            }

            if (logPreviewInfo && _previewPdfDoc && _previewPageNumber) {
              logPreviewInfo.textContent = `${_previewPageNumber}/${_previewPdfDoc.numPages}`;
            }

            // Default 100%
            setCardLogPreviewZoom(Number(logPreviewZoom?.value || 100), { immediateRender: true });
          }catch(e){
            console.warn('Card LOG picture preview init failed:', e);
            if (logPreviewInfo) logPreviewInfo.textContent = 'โหลดไม่สำเร็จ';
          }finally{
            _previewPromise = null;
          }
        })();
      }


      try{
        const out = await runCompareForUrls(pdfUrlForCompare, webUrlForCompare, mode);
        const result = out.result;
        const webDataForCard = out.webData;
        const pdfDataForCard = out.pdfData;
        if (abortFlag) return;

        // Update "เจ้าหน้าที่บริษัท" line in card header (from PDF text)
        const officerSpan = meta.querySelector('.pm-company-officer');
        if (officerSpan) {
          const officer = String(pdfDataForCard?.companyOfficer || '').trim();
          if (officer) {
            officerSpan.classList.remove('debug-missing');
            officerSpan.textContent = officer;
          } else {
            officerSpan.classList.add('debug-missing');
            officerSpan.textContent = '(not found)';
          }
        }

        // Update header status and card border color
        setHeaderStatus(result.overallStatus || '');
        card.classList.remove('ok', 'err');
        if (String(result.overallStatus || '').includes('✅')) card.classList.add('ok');
        else if (String(result.overallStatus || '').includes('❌') || String(result.overallStatus || '').includes('⚠️')) card.classList.add('err');
        updateSummary();

        overallEl.innerHTML = `<h4 class="${statusClass(result.overallStatus)}">${escapeHtml(result.overallStatus)}</h4>`;

        versionItem.p.innerHTML = formatBlock('1.Version Check', result.versionStatus, result.versionMessage);
        timeItem.p.innerHTML = formatBlock('2.Time Check(ใบงาน + cfg)', result.timeStatus, result.timeMessage);
        timeLogItem.p.innerHTML = formatBlock('3.Time Log Check', result.timeLogStatus, result.timeLogMessage);
        crcItem.p.innerHTML = formatBlock('4.CRC Check', result.crcStatus, result.crcMessage);
        clearCountersItem.p.innerHTML = formatBlock('5.Detect "Clear counters"', result.clearCountersStatus, result.clearCountersMessage);
        clearItem.p.innerHTML = formatBlock('6.Detect "Clear log"', result.clearStatus, result.clearMessage);

        // 7) GUI only: LOG Picture (with preview in card)
        if (mode === 'GUI') {
          let serialSwitch = null;
          try {
            const lp = (webDataForCard && webDataForCard.lastPagePreview) ? webDataForCard.lastPagePreview : null;
            const snippet = (lp && lp.textSnippet) ? lp.textSnippet : '';
            serialSwitch = extractDeviceNameFromText(snippet);

            if (!serialSwitch && lp) {
              const candidates = [];
              if (Array.isArray(lp.leafPrompts)) candidates.push(...lp.leafPrompts);
              if (Array.isArray(lp.leafPromptsDoc)) candidates.push(...lp.leafPromptsDoc);
              if (candidates.length > 0) {
                const cleaned = candidates.map(stripPromptHash).filter(Boolean);
                const spine = cleaned.find(x => /^Spine-/i.test(x));
                serialSwitch = spine || cleaned[0] || null;
              }
            }

            if (!serialSwitch && snippet) {
              const prompts = findLeafPromptMatches(snippet);
              if (prompts && prompts.length > 0) {
                const cleaned = prompts.map(stripPromptHash).filter(Boolean);
                const spine = cleaned.find(x => /^Spine-/i.test(x));
                serialSwitch = spine || cleaned[0] || null;
              }
            }
          } catch (_) { /* ignore */ }
          if (!serialSwitch) serialSwitch = 'Not found';

          logPictureP.innerHTML =
            `7.Check "LOG Picture" <span class="badge-manual">ต้องเช็คเอง</span><br/>` +
            `<span class="cmp-manual">📋 เช็คว่า "Serial Switch" จะตรงกับ "รูปภาพ" ไหม</span><br/>` +
            `Serial Switch: <span class="cmp-manual">${escapeHtml(serialSwitch)}</span><br/>` +
            `<span class="cmp-manual">👉 ดูรูปจากด้านล่าง แล้วเทียบกับ Serial Switch</span>`;

          // Mark preview as renderable (lazy)
          logPreviewWrap.dataset.canRender = '1';
          logPreviewWrap.style.display = 'block';

          // If user already opened details, render now
          if (detailsWrap.style.display !== 'none') {
            ensureLogPreviewRendered();
          }
        } else {
          logPictureP.innerHTML =
            `7.Check "LOG Picture":<br/>` +
            `<span class="cmp-warning">⚠️ เฉพาะโหมด GUI</span>`;
          logPreviewWrap.style.display = 'none';
          logPreviewWrap.dataset.canRender = '0';
        }

        // Fill "data used" section
        const fmt = (v) => (v === null || v === undefined || v === '') ? '(not found)' : String(v);
        const dataLines = [];
        dataLines.push(`MODE: ${mode}`);
        dataLines.push('');
        dataLines.push(`websiteUrl (view_configuration): ${webUrlForCompare}`);
        dataLines.push(`pdfFile (PDF): ${pdfUrlForCompare}`);
        dataLines.push('');
        dataLines.push('--- PDF Extract ---');
        dataLines.push(`rdCode: ${fmt(pdfDataForCard?.rdCode)}`);
        dataLines.push(`completionDate: ${fmt(pdfDataForCard?.completionDate)}`);
        dataLines.push(`softwareVersion: ${fmt(pdfDataForCard?.softwareVersion)}`);
        dataLines.push('');
        dataLines.push('--- Website/Log Extract ---');
        dataLines.push(`timestamp: ${fmt(webDataForCard?.timestamp)}`);
        dataLines.push(`softwareVersion: ${fmt(webDataForCard?.softwareVersion)}`);
        dataLines.push(`rdCode: ${fmt(webDataForCard?.rdCode)}`);
        dataLines.push(`source: ${fmt(webDataForCard?.source)}`);
        dataLines.push('');
        if (Array.isArray(webDataForCard?.clockDataArray) && webDataForCard.clockDataArray.length){
          dataLines.push(`clockDataArray(count=${webDataForCard.clockDataArray.length}):`);
          dataLines.push(`- ${webDataForCard.clockDataArray.slice(0, 5).join('\n- ')}`);
          if (webDataForCard.clockDataArray.length > 5) dataLines.push('  ...');
        }
        dataPre.textContent = dataLines.join('\n');

      }catch(e){
        console.error('PM Compare error:', e);
        setHeaderStatus('❌');
        overallEl.innerHTML = `<h4 class="cmp-error">❌ Compare error</h4><div class="cmp-error">${escapeHtml(e.message || e)}</div>`;
        const officerSpan = meta.querySelector('.pm-company-officer');
        if (officerSpan) {
          officerSpan.textContent = '(error)';
          officerSpan.classList.add('debug-missing');
        }
        updateSummary();
        versionItem.p.innerHTML = formatBlock('1.Version Check', '❌ error', (e.message || String(e)));
        timeItem.p.innerHTML = '-';
        timeLogItem.p.innerHTML = '-';
        crcItem.p.innerHTML = '-';
        clearCountersItem.p.innerHTML = '-';
        clearItem.p.innerHTML = '-';
        logPictureP.innerHTML = '-';
        dataPre.textContent = `Compare error: ${e && e.message ? e.message : String(e)}`;
      }
    }

async function fetchText(url){
      const res = await fetch(url, { credentials: 'include' });
      if (!res.ok) throw new Error(`HTTP ${res.status} ${res.statusText}`);
      return await res.text();
    }

    function parsePmTitlePage(html, pageUrl){
      const doc = new DOMParser().parseFromString(html, 'text/html');
      const forms = Array.from(doc.querySelectorAll('form[action*="pm_editcall_approve_device.php"]'));
      const items = [];

      for (const form of forms){
        const action = form.getAttribute('action') || '';
        const approveUrl = new URL(action, pageUrl).toString();
        const u = new URL(approveUrl);

        const sn = (u.searchParams.get('sn') || '').trim();
        const callId = (u.searchParams.get('new_id') || '').trim();
        const idAdd = (u.searchParams.get('id_add') || '').trim();

        // Find PDF link within the same row if possible
        let pdfUrl = null;
        const row = form.closest('tr');
        const anchors = row ? Array.from(row.querySelectorAll('a[href*=".pdf"]')) : Array.from(doc.querySelectorAll('a[href*=".pdf"]'));
        // prefer ones that contain SN
        let pdfA = anchors.find(a => (a.getAttribute('href')||'').includes(sn) || (a.textContent||'').trim() === sn);
        if (!pdfA && anchors.length) pdfA = anchors[0];
        if (pdfA){
          const href = pdfA.getAttribute('href') || '';
          try{ pdfUrl = new URL(href, pageUrl).toString(); }catch(e){ /* ignore */ }
        }

        if (sn || callId || approveUrl){
          items.push({ sn, callId, idAdd, approveUrl, pdfUrl });
        }
      }

      return items;
    }

    function findRackUrlFromApprove(html, approveUrl, sn, callId){
      const doc = new DOMParser().parseFromString(html, 'text/html');
      const links = Array.from(doc.querySelectorAll('a[href*="rack_detail_out.php"], a[href*="rack_detail_TOR.php"]'));
      if (!links.length) return null;

      const snNorm = String(sn || '').trim().toUpperCase();
      const callNorm = String(callId || '').trim().toUpperCase();

      const rowLinks = (() => {
        if (!snNorm) return [];
        const rows = Array.from(doc.querySelectorAll('tr'));
        for (const row of rows){
          const rowText = (row.textContent || '').toUpperCase();
          if (!rowText.includes(snNorm)) continue;
          const inRow = Array.from(row.querySelectorAll('a[href*="rack_detail_out.php"], a[href*="rack_detail_TOR.php"]'));
          if (inRow.length) return inRow;
        }
        return [];
      })();

      const candidates = rowLinks.length ? rowLinks : links;

      const byCallId = candidates.find(a => {
        if (!callNorm) return false;
        const rawHref = a.getAttribute('href') || '';
        try{
          const u = new URL(rawHref, approveUrl);
          const q = (u.searchParams.get('id_project_call') || u.searchParams.get('call_id') || u.searchParams.get('new_id') || '').trim().toUpperCase();
          return q && q === callNorm;
        }catch(_){
          return rawHref.includes(callId);
        }
      });

      const bySnParam = candidates.find(a => {
        if (!snNorm) return false;
        const rawHref = a.getAttribute('href') || '';
        try{
          const u = new URL(rawHref, approveUrl);
          const q = (u.searchParams.get('sn') || u.searchParams.get('sn_tor') || u.searchParams.get('rack_sntor') || u.searchParams.get('tor_sn') || '').trim().toUpperCase();
          return q && q === snNorm;
        }catch(_){
          return rawHref.includes(`sn=${sn}`) || rawHref.includes(`sn%3D${sn}`) || rawHref.includes(`sn_tor=${sn}`);
        }
      });

      const pick = byCallId || bySnParam || candidates[0] || links[0];

      try{ return new URL(pick.getAttribute('href') || '', approveUrl).toString(); }
      catch(e){ return null; }
    }

    function findRouterProductUrlFromRack(html, rackUrl, sn){
      const snNorm = String(sn || '').trim().toUpperCase();
      if (!snNorm) return null;

      const toAbsUrl = (raw) => {
        const t = String(raw || '').trim();
        if (!t) return null;
        try{
          // Some legacy pages put raw spaces in query values (e.g. "sn=Smart Power ...")
          return new URL(t.replace(/ /g, '%20'), rackUrl).toString();
        }catch(_){
          return null;
        }
      };

      const parseSnFromUrl = (u) => {
        try{
          const url = new URL(u);
          return (url.searchParams.get('sn') || url.searchParams.get('sn_tor') || url.searchParams.get('tor_sn') || '').trim();
        }catch(_){
          return '';
        }
      };

      const doc = new DOMParser().parseFromString(html || '', 'text/html');
      const rawCandidates = [];

      // 1) Direct href links (if any)
      for (const a of Array.from(doc.querySelectorAll('a[href*="router_product.php"]'))){
        rawCandidates.push(a.getAttribute('href') || '');
      }

      // 2) onclick="window.open('router_product.php?...')"
      for (const el of Array.from(doc.querySelectorAll('[onclick*="router_product.php"]'))){
        const onclick = el.getAttribute('onclick') || '';
        const m = onclick.match(/router_product\.php\?[^'"]+/i);
        if (m && m[0]) rawCandidates.push(m[0]);
      }

      // De-dupe, keep order
      const seen = new Set();
      const candidates = rawCandidates
        .map(toAbsUrl)
        .filter(Boolean)
        .filter(u => {
          if (seen.has(u)) return false;
          seen.add(u);
          return true;
        });

      // Prefer exact SN match
      for (const u of candidates){
        const qSn = parseSnFromUrl(u).trim().toUpperCase();
        if (qSn && qSn === snNorm) return u;
      }

      // Fallback regex across the raw HTML (in case DOM missed it)
      const re = new RegExp(`router_product\\.php\\?[^'"\\s>]*sn=${escapeRegExp(sn)}[^'"\\s>]*`, 'i');
      const m2 = String(html || '').match(re);
      if (m2 && m2[0]) return toAbsUrl(m2[0]);

      return null;
    }

    function findViewConfigUrlFromRouter(html, routerUrl, sn, callId){
      const doc = new DOMParser().parseFromString(html, 'text/html');
      const links = Array.from(doc.querySelectorAll('a[href*="view_configuration.php"]'));
      if (!links.length) return null;

      const snNorm = String(sn || '').trim().toUpperCase();
      const callNorm = String(callId || '').trim().toUpperCase();

      // Prefer SN + call_id match (best)
      const match = links.find(a => {
        const rawHref = a.getAttribute('href') || '';
        try{
          const u = new URL(rawHref, routerUrl);
          const qSn = (u.searchParams.get('sn') || u.searchParams.get('tor_sn') || u.searchParams.get('rack_sn') || '').trim().toUpperCase();
          const qCall = (u.searchParams.get('call_id') || u.searchParams.get('new_id') || '').trim().toUpperCase();
          if (snNorm && qSn && qSn !== snNorm) return false;
          if (callNorm && qCall && qCall !== callNorm) return false;
          // If either constraint exists, require at least one match to avoid grabbing unrelated links
          return !!((snNorm && qSn === snNorm) || (callNorm && qCall === callNorm));
        }catch(e){
          // fallback to substring check
          const okSn = snNorm ? (rawHref.includes(`sn=${sn}`) || rawHref.includes(`sn%3D${sn}`)) : true;
          const okCall = callNorm ? (rawHref.includes(`call_id=${callId}`) || rawHref.includes(`new_id=${callId}`)) : true;
          return okSn && okCall;
        }
      }) || links.find(a => {
        const href = a.getAttribute('href') || '';
        return href.includes(`sn=${sn}`) || href.includes(`sn%3D${sn}`);
      }) || links[0];

      const href = match.getAttribute('href') || '';
      try{ return new URL(href, routerUrl).toString(); }catch(e){ return null; }
    }

    async function buildChainForItem(item, pageUrl){
      const errors = [];
      const chain = {
        step1: pageUrl,
        step2: item.approveUrl || null,
        step3: null,
        step4: null,
        step5: null,
        pdf: item.pdfUrl || null
      };

      if (!item.approveUrl){
        errors.push('missing approveUrl');
        return { chain, errors };
      }

      // 2) -> 3) Approve -> rack_detail_TOR
      try{
        const approveHtml = await fetchText(item.approveUrl);
        if (abortFlag) return { chain, errors };
        chain.step3 = findRackUrlFromApprove(approveHtml, item.approveUrl, item.sn, item.callId);
        if (!chain.step3) errors.push('rack_detail_TOR not found');
      }catch(e){
        errors.push(`approve fetch: ${e.message || e}`);
        return { chain, errors };
      }

      if (!chain.step3) return { chain, errors };

      const snFromRackUrl = (() => {
        try{
          const u = new URL(chain.step3);
          return (u.searchParams.get('sn') || u.searchParams.get('sn_tor') || u.searchParams.get('rack_sntor') || u.searchParams.get('tor_sn') || '').trim() || null;
        }catch(_){
          return null;
        }
      })();

      // 3) -> 4) Rack -> router_product
      try{
        const rackHtml = await fetchText(chain.step3);
        if (abortFlag) return { chain, errors };

        const trySns = [ (item.sn || '').trim(), snFromRackUrl ].filter(Boolean);
        const uniqTrySns = [];
        for (const s of trySns){
          const up = String(s).trim().toUpperCase();
          if (!up) continue;
          if (uniqTrySns.some(x => x.toUpperCase() === up)) continue;
          uniqTrySns.push(String(s).trim());
        }

        let usedSnForRouter = null;
        for (const candSn of uniqTrySns){
          const url = findRouterProductUrlFromRack(rackHtml, chain.step3, candSn);
          if (url){
            chain.step4 = url;
            usedSnForRouter = candSn;
            break;
          }
        }

        if (!chain.step4) errors.push('router_product not found');
        chain._snForRouter = usedSnForRouter; // internal debug (not shown)
      }catch(e){
        errors.push(`rack fetch: ${e.message || e}`);
        return { chain, errors };
      }

      if (!chain.step4) return { chain, errors };

      const snFromRouterUrl = (() => {
        try{
          const u = new URL(chain.step4);
          return (u.searchParams.get('sn') || u.searchParams.get('sn_tor') || u.searchParams.get('tor_sn') || '').trim() || null;
        }catch(_){
          return null;
        }
      })();
      const snForViewConfig = snFromRouterUrl || chain._snForRouter || (item.sn || '').trim() || snFromRackUrl || null;

      // 4) -> 5) Router -> view_configuration
      try{
        const routerHtml = await fetchText(chain.step4);
        if (abortFlag) return { chain, errors };
        chain.step5 = findViewConfigUrlFromRouter(routerHtml, chain.step4, snForViewConfig, item.callId);
        if (!chain.step5) errors.push('view_configuration not found');
      }catch(e){
        errors.push(`router fetch: ${e.message || e}`);
        return { chain, errors };
      }

      return { chain, errors };
    }

    function buildPageUrl(baseUrl, page){
      const u = new URL(baseUrl);
      u.searchParams.set('page', String(page));
      return u.toString();
    }

    debugBtn.addEventListener('click', async () => {
      if (isRunning) return;
      const baseUrl = (pmTitleInput.value || '').trim();
      if (!baseUrl){
        alert('กรุณาวาง PM Title URL (pm_title.php?... )');
        return;
      }

      // reset UI
      resultsEl.innerHTML = '';
      setProgress('');
      resetSummary();
      abortFlag = false;
      isRunning = true;
      debugBtn.disabled = true;
      stopBtn.style.display = 'inline-flex';

      const MAX_PAGES = 200; // safety
      let totalItems = 0;
      let lastSignature = null;

      try{
        for (let page = 1; page <= MAX_PAGES; page++){
          if (abortFlag) break;

          const pageUrl = buildPageUrl(baseUrl, page);
          setProgress(`กำลังดึงหน้า ${page}... (รวมรายการที่พบ: ${totalItems})`);

          let html;
          try{
            html = await fetchText(pageUrl);
          }catch(e){
            // ถ้าหน้า 1 ยังดึงไม่ได้ ให้จบเลย
            if (page === 1) throw e;
            // หน้าถัดไปดึงไม่ได้ ให้หยุด
            break;
          }

          if (abortFlag) break;

          const items = parsePmTitlePage(html, pageUrl);

          // Stop condition: no items
          if (!items.length){
            if (page === 1){
              setProgress('ไม่พบรายการในหน้า 1 (หรือ URL ผิด / ไม่มีสิทธิ์)');
            }
            break;
          }

          // Stop condition: same signature as previous page (prevent infinite loop)
          const signature = items.map(x => `${x.sn}|${x.callId}|${x.idAdd}`).join(',');
          if (lastSignature && signature === lastSignature){
            break;
          }
          lastSignature = signature;

          // Build chain per item (sequential to keep stable)
          for (let i = 0; i < items.length; i++){
            if (abortFlag) break;
            const it = items[i];
            totalItems++;

            setProgress(`หน้า ${page} • รายการ ${i+1}/${items.length} • รวม ${totalItems} รายการ`);

            const { chain, errors } = await buildChainForItem(it, pageUrl);
            if (abortFlag) break;

            await addCompareCard(it, chain, errors);
          }
        }

        if (abortFlag){
          setProgress(`หยุดแล้ว • แสดงผล ${totalItems} รายการ`);
        }else{
          setProgress(`เสร็จแล้ว • แสดงผล ${totalItems} รายการ`);
        }
        updateSummary();
      }catch(e){
        console.error('PM Debug error:', e);
        setProgress(`เกิดข้อผิดพลาด: ${e.message || e}`);
        alert(`Debug ไม่สำเร็จ: ${e.message || e}`);
      }finally{
        stopBtn.style.display = 'none';
        debugBtn.disabled = false;
        isRunning = false;
      }
    });

    stopBtn.addEventListener('click', () => {
      abortFlag = true;
      stopBtn.style.display = 'none';
      setProgress('กำลังหยุด...');
    });

  })(); 
