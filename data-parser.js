/**
 * Data Parser - Extract structured data from text using regex patterns
 */

class DataParser {
  static normalizeDateText(text) {
    if (!text || typeof text !== 'string') return '';
    return text
      .replace(/[\u200B\u200C\u200D\uFEFF\u00A0]/g, ' ')
      .replace(/\s+/g, ' ')
      .replace(/(\d)\s+(\d)/g, '$1$2')
      .trim();
  }

  static extractFlexibleDates(text) {
    if (!text || typeof text !== 'string') return [];
    let normalizedText = this.normalizeDateText(text);
    normalizedText = normalizedText.replace(/(\d{4})\s*(\d{2}:\d{2}:\d{2})/g, '$1 $2');

    const results = [];
    const seen = new Set();

    // Full datetime with flexible spacing
    const fullRe = /(\d\s*\d)[\s\-\/](\d\s*\d)[\s\-\/](\d{4})\s*(\d\s*\d)\s*:\s*(\d\s*\d)\s*:\s*(\d\s*\d)/g;
    let m;
    while ((m = fullRe.exec(normalizedText)) !== null) {
      const day = String(m[1]).replace(/\s+/g, '').padStart(2, '0');
      const month = String(m[2]).replace(/\s+/g, '').padStart(2, '0');
      const year = m[3];
      const hour = String(m[4]).replace(/\s+/g, '').padStart(2, '0');
      const min = String(m[5]).replace(/\s+/g, '').padStart(2, '0');
      const sec = String(m[6]).replace(/\s+/g, '').padStart(2, '0');
      const value = `${day}-${month}-${year} ${hour}:${min}:${sec}`;
      if (!seen.has(value)) {
        seen.add(value);
        results.push(value);
      }
    }

    // Date then time within next 30 chars (handles OCR spacing)
    const dateOnlyRe = /(\d\s*\d)\s*-\s*(\d\s*\d)\s*-\s*(\d{4})/g;
    while ((m = dateOnlyRe.exec(normalizedText)) !== null) {
      const day = String(m[1]).replace(/\s+/g, '').padStart(2, '0');
      const month = String(m[2]).replace(/\s+/g, '').padStart(2, '0');
      const year = m[3];
      const tail = normalizedText.slice(m.index + m[0].length, m.index + m[0].length + 30);
      const timeMatch = tail.match(/(\d\s*\d)\s*:\s*(\d\s*\d)(?:\s*:\s*(\d\s*\d))?/);
      if (timeMatch) {
        const hour = String(timeMatch[1]).replace(/\s+/g, '').padStart(2, '0');
        const min = String(timeMatch[2]).replace(/\s+/g, '').padStart(2, '0');
        const sec = timeMatch[3] ? String(timeMatch[3]).replace(/\s+/g, '').padStart(2, '0') : '00';
        const value = `${day}-${month}-${year} ${hour}:${min}:${sec}`;
        if (!seen.has(value)) {
          seen.add(value);
          results.push(value);
        }
      }
    }

    return results;
  }

  static extractLabeledDates(text) {
  if (!text || typeof text !== 'string') return [];

  // Gentle normalization: keep spaces (for tail search) but remove zero-width/nbsp.
  const normalizedText = text
    .replace(/[​‌‍﻿ ]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  const labels = [
    'วันที่ดำเนินเสร็จ(ว/ด/ป)',
    'วันที่ดาเนินเสร็จ(ว/ด/ป)',
    'วันที่ดำเนินเสร็จ',
    'วันที่ดาเนินเสร็จ',
    'วันที่เข้าดำเนินการ(ว/ด/ป)',
    'วันที่เข้าดาเนินการ(ว/ด/ป)',
    'วันที่เข้าดำเนินการ',
    'วันที่เข้าดาเนินการ',
    'วันที่รับแจ้งจาก',
    'วันเวลาที่พร้อมให้ดำเนินการ',
    'วันเวลาที่พร้อมให้ดาเนินการ',
    'วันที่ต้องเสร็จตามสัญญา',
    'วันที่เจ้าหน้าที่กรมสรรพากรตรวจสอบ',
    'วันที่เจ้าหน้าที่บริษัทตรวจสอบ',
  ];

  // OCR / PDF extraction can drop Thai vowels/tones or insert spaces between letters.
  // For robust matching, compare a Thai "skeleton": keep only Thai consonants (?-?) and digits.
  const toSkeleton = (s) => s
    .normalize('NFKD')
    .replace(/[​‌‍﻿ ]/g, '')
    .replace(/\s+/g, '')
    .replace(/[^ก-ฮ0-9]/g, '');

  let skeleton = '';
  const indexMap = [];
  for (let i = 0; i < normalizedText.length; i++) {
    const ch = normalizedText[i];
    if (/\s/.test(ch)) continue;
    if (/[ก-ฮ0-9]/.test(ch)) {
      skeleton += ch;
      indexMap.push(i);
    }
  }

  const results = [];
  const seen = new Set();

  // Date/time with very flexible spacing (e.g. "1 0 - 1 2 - 2 5 6 8  1 1 :23:00")
  const dateRe = /(\d\s*\d)\s*[-/]\s*(\d\s*\d)\s*[-/]\s*(\d\s*\d\s*\d\s*\d)\s*(\d\s*\d)\s*:\s*(\d\s*\d)\s*:\s*(\d\s*\d)/;
  const normalizeNum = (s) => String(s).replace(/\s+/g, '');

  for (const label of labels) {
    const key = toSkeleton(label);
    if (!key) continue;

    let from = 0;
    while (true) {
      const idx = skeleton.indexOf(key, from);
      if (idx === -1) break;

      const originalIdx = idx < indexMap.length ? indexMap[idx] : -1;
      if (originalIdx >= 0) {
        const tail = normalizedText.slice(originalIdx, originalIdx + 300);
        const m = tail.match(dateRe);
        if (m) {
          const day = normalizeNum(m[1]).padStart(2, '0');
          const month = normalizeNum(m[2]).padStart(2, '0');
          const year = normalizeNum(m[3]);
          const hour = normalizeNum(m[4]).padStart(2, '0');
          const min = normalizeNum(m[5]).padStart(2, '0');
          const sec = normalizeNum(m[6]).padStart(2, '0');
          const date = `${day}-${month}-${year} ${hour}:${min}:${sec}`;

          const item = `${label}: ${date}`;
          if (!seen.has(item)) {
            seen.add(item);
            results.push(item);
          }
        }
      }

      from = idx + key.length;
    }
  }

  return results;
}

static normalizeDate(dateStr) {
    if (!dateStr) return null;

    const cleaned = dateStr
      .replace(/(\d)\s+(\d)/g, '$1$2')
      .replace(/\s*:\s*/g, ':')
      .replace(/\s*-\s*/g, '-')
      .replace(/\s*\/\s*/g, '/');

    // Match pattern: XX-XX-XXXX XX:XX:XX
    const match = cleaned.match(/(\d{2})[\s\-\/](\d{2})[\s\-\/](\d{4})\s+(\d{2}):(\d{2}):(\d{2})/);
    if (!match) return null;
    
    let [, first, second, year, hour, minute, second_] = match;
    
    // Detect if it's MM/DD/YYYY (when first > 12 or second <= 12, then it's DD-MM)
    // Otherwise if first <= 12 and second <= 12, assume DD-MM-YYYY (PDF Thai format)
    let day = first;
    let month = second;
    
    // If using slashes and first number is small, might be MM/DD/YYYY
    if (cleaned.includes('/')) {
      const d = parseInt(first);
      const m = parseInt(second);
      // If first > 12, it must be day, so swap
      if (d > 12 && m <= 12) {
        // Already DD-MM format
      } else if (m > 12 && d <= 12) {
        // It's MM/DD, so swap
        [day, month] = [second, first];
      } else if (d <= 12 && m <= 12) {
        // Ambiguous - default to DD-MM format (Thai standard)
        day = first;
        month = second;
      }
    }
    
    return `${day}-${month}-${year} ${hour}:${minute}:${second_}`;
  }

  /**
   * Extract all matches for RD Code, Date, and Version from text
   * Returns an object with extracted data
   */
  static extractAllMatches(text) {
    if (!text) {
      return {
        rdCode: null,
        date: null,
        version: null,
        allDates: [],
        allVersions: [],
        allRDCodes: []
      };
    }

    // RD Code: allow spaces/dash variants between parts
    const rdCodeRegex = /R\s*D\s*\d{2}[\s\-–—]*[A-Z0-9](?:[\s\-–—]*[A-Z0-9]){6,}/gi;
    const rdMatches = text.match(rdCodeRegex) || [];
    // Clean up the matches - remove extra spaces and consolidate dashes
    const normalizeRD = (r) => {
      let cleaned = r.replace(/\s+/g, '').replace(/[–—]/g, '-').replace(/\-+/g, '-');
      cleaned = cleaned.replace(/^(RD\d{2})(?!-)/i, '$1-');
      return cleaned;
    };
    const allRDCodes = rdMatches
      .map(normalizeRD)
      .filter(r => r.length >= 8); // Only keep valid ones

    let normalizedText = this.normalizeDateText(text);
    // Insert a space between date and time if OCR removed it (e.g., 2568 09:00:00 or 256809:00:00)
    normalizedText = normalizedText.replace(/(\d{4})\s*(\d{2}:\d{2}:\d{2})/g, '$1 $2');
    // Date: flexible format that accepts both DD-MM-YYYY and MM/DD/YYYY (with optional spaces)
    const dateRegex = /\d\s*\d[\s\-\/]\d\s*\d[\s\-\/]\d{4}\s*\d\s*\d\s*:\s*\d\s*\d\s*:\s*\d\s*\d/g;
    const rawDateMatches = normalizedText.match(dateRegex) || [];
    
    // Normalize all dates to DD-MM-YYYY format
    const allDates = [
      ...rawDateMatches.map(d => this.normalizeDate(d.trim())).filter(d => d !== null),
      ...this.extractFlexibleDates(normalizedText)
    ];
    const labeledDates = this.extractLabeledDates(normalizedText);

    // Version: X.X(XX) or X.XX.XX format (e.g., 16.0(9d) or 17.03.04)
    const versionRegexClassic = /\d+\s*\.\s*\d+\s*\(\s*[a-zA-Z0-9\s]+\s*\)\s*[A-Za-z0-9]*/g;
    const versionRegexDot = /\d+(?:\s*\.\s*\d+){1,3}/g;
    const versionMatchesClassic = text.match(versionRegexClassic) || [];
    const versionMatchesDot = text.match(versionRegexDot) || [];
    const cleanVersion = (v) => v.replace(/\s/g, '').replace(/show$/i, '');
    const allVersions = [
      ...versionMatchesClassic.map(v => cleanVersion(v)),
      ...versionMatchesDot.map(v => cleanVersion(v))
    ];
    let versionFromContext = null;
    if (allVersions.length === 0) {
      const contextRegex = /(?:kickstart|system)\s*:\s*version\s+(\d+\s*\.\s*\d+\s*\(\s*[a-zA-Z0-9\s]+\s*\)|\d+(?:\s*\.\s*\d+){1,3})/i;
      const contextMatch = text.match(contextRegex);
      if (contextMatch) {
        versionFromContext = cleanVersion(contextMatch[1]);
      }
      if (!versionFromContext) {
        const simpleVersion = text.match(/version\s+(\d+\s*\.\s*\d+\s*\(\s*[a-zA-Z0-9\s]+\s*\)|\d+(?:\s*\.\s*\d+){1,3})/i);
        if (simpleVersion) versionFromContext = cleanVersion(simpleVersion[1]);
      }
    }

    const resolvedVersions = allVersions.length > 0 ? allVersions : (versionFromContext ? [versionFromContext] : []);
    const preferredVersion = resolvedVersions.length > 0
      ? (resolvedVersions.find(v => v.startsWith('16.')) || resolvedVersions[0]) // เลือก 16.x ก่อน (NX-OS main)
      : versionFromContext;

    return {
      rdCode: allRDCodes.length > 0 ? allRDCodes[0] : null,
      date: this.parseDate(text),  // Use parseDate() instead of first date
      version: preferredVersion || versionFromContext || (allVersions.length > 0 ? allVersions[0] : null),
      allRDCodes: allRDCodes,
      allDates: allDates,
      labeledDates: labeledDates,
      allVersions: allVersions.length > 0 ? allVersions : (versionFromContext ? [versionFromContext] : [])
    };
  }

  static parseRDCode(text) {
    const match = text.match(/R\s*D\s*\d{2}[\s\-–—]*[A-Z0-9](?:[\s\-–—]*[A-Z0-9]){6,}/i);
    if (!match) return null;
    let cleaned = match[0].replace(/\s+/g, '').replace(/[–—]/g, '-').replace(/\-+/g, '-');
    cleaned = cleaned.replace(/^(RD\d{2})(?!-)/i, '$1-');
    return cleaned;
  }

  static parseDate(text) {
    if (!text || typeof text !== 'string') return null;
    const normalizedText = this.normalizeDateText(text);

    const labeled = this.extractLabeledDates(normalizedText);
    const completionFromLabel = labeled.find((s) => /(?:\u0E14[\u0E33\u0E32]\u0E40\u0E19\u0E34\u0E19\u0E40\u0E2A\u0E23\u0E47?\u0E08)/.test(s));
    if (completionFromLabel) {
      const idx = completionFromLabel.indexOf(':');
      if (idx !== -1) {
        const datePart = completionFromLabel.slice(idx + 1).trim();
        if (datePart) return datePart;
      }
    }

    const buildDate = (m) => {
      const day = String(m[1]).replace(/\s+/g, '').padStart(2, '0');
      const month = String(m[2]).replace(/\s+/g, '').padStart(2, '0');
      const year = m[3];
      const hour = String(m[4]).replace(/\s+/g, '').padStart(2, '0');
      const min = String(m[5]).replace(/\s+/g, '').padStart(2, '0');
      const sec = String(m[6]).replace(/\s+/g, '').padStart(2, '0');
      return `${day}-${month}-${year} ${hour}:${min}:${sec}`;
    };

    // Priority 0: Directly match "วันที่ดำเนินเสร็จ(ว/ด/ป)" (OCR-safe, missing vowels allowed)
    const completionDirectRe = new RegExp(
      '\\u0E27\\s*\\u0E31\\s*\\u0E19\\s*\\u0E17\\s*\\u0E35\\s*\\u0E48' + // วันที่
      '\\s*\\u0E14\\s*[\\u0E33\\u0E32]\\s*\\u0E40\\s*\\u0E19\\s*\\u0E34\\s*\\u0E19\\s*\\u0E40\\s*\\u0E2A\\s*\\u0E23\\s*\\u0E47\\s*\\u0E08' + // ดำเนินเสร็จ (ดาเนินเสร็จ)
      '[^\\d]{0,60}' +
      '(\\d\\s*\\d)[\\s\\-\\/](\\d\\s*\\d)[\\s\\-\\/](\\d{4})\\s*(\\d\\s*\\d)\\s*:\\s*(\\d\\s*\\d)\\s*:\\s*(\\d\\s*\\d)'
    , 'i');
    const directMatch = normalizedText.match(completionDirectRe);
    if (directMatch) return buildDate(directMatch);

    // Try to match "วันที่ดำเนินเสร็จ" (OCR-safe: drop vowels/tones) and pick the nearest date after it
    const labelNoVowel = /ว\s*น\s*ท\s*ด\s*า\s*เ\s*น\s*น\s*เ\s*ส\s*ร\s*จ/i;
    const labelLoose = /ว\s*น\s*ท\s*[^0-9]{0,12}ด\s*า\s*เ\s*น\s*น\s*เ\s*ส\s*ร\s*จ/i;
    const m1 = normalizedText.match(labelNoVowel) || normalizedText.match(labelLoose);
    if (m1) {
      const idx = m1.index || 0;
      const afterCompletion = normalizedText.substring(idx);
      const dateMatches = [...afterCompletion.matchAll(/(\d\s*\d)[\s\-\/](\d\s*\d)[\s\-\/](\d{4})\s*(\d\s*\d)\s*:\s*(\d\s*\d)\s*:\s*(\d\s*\d)/g)];
      if (dateMatches.length > 0) {
        const mDate = dateMatches[0];
        const day = String(mDate[1]).replace(/\s+/g, '').padStart(2, '0');
        const month = String(mDate[2]).replace(/\s+/g, '').padStart(2, '0');
        const year = mDate[3];
        const hour = String(mDate[4]).replace(/\s+/g, '').padStart(2, '0');
        const min = String(mDate[5]).replace(/\s+/g, '').padStart(2, '0');
        const sec = String(mDate[6]).replace(/\s+/g, '').padStart(2, '0');
        return `${day}-${month}-${year} ${hour}:${min}:${sec}`;
      }
    }
    
    // Priority 1: Look for "show clock" pattern with full timestamp
    // Format: 16:46:11.927684 +07 Mon Nov 24 2025
    const showClockPattern = /show\s+clock\s+(\d{2}):(\d{2}):(\d{2})\.(\d+)\s+([\+\-]\d{2})\s+(\w+)\s+(\w+)\s+(\d{1,2})\s+(\d{4})/i;
    const clockMatch = normalizedText.match(showClockPattern);
    
    if (clockMatch) {
      // Return the full clock timestamp format
      const hour = clockMatch[1];
      const min = clockMatch[2];
      const sec = clockMatch[3];
      const fraction = clockMatch[4];
      const timezone = clockMatch[5];
      const dayName = clockMatch[6];
      const month = clockMatch[7];
      const date = String(clockMatch[8]).padStart(2, '0');
      const year = clockMatch[9];
      return `${hour}:${min}:${sec}.${fraction} ${timezone} ${dayName} ${month} ${date} ${year}`;
    }
    
    // Priority 2: Find all dates first (DD-MM-YYYY format)
    const allDatesRegex = /(\d\s*\d)[\s\-\/](\d\s*\d)[\s\-\/](\d{4})\s*(\d\s*\d)\s*:\s*(\d\s*\d)\s*:\s*(\d\s*\d)/g;
    const allMatches = [...normalizedText.matchAll(allDatesRegex)];
    
    if (allMatches.length === 0) {
      const flex = this.extractFlexibleDates(normalizedText);
      return flex.length > 0 ? flex[0] : null;
    }
    
    // Priority 3: Look for the pattern: "วันที่ดำเนินเสร็จ" and find the date after it
    const completionLabelRe = /\u0E27\s*\u0E31\s*\u0E19\s*\u0E17\s*\u0E35\s*\u0E48\s*\u0E14\s*[\u0E33\u0E32]\s*\u0E40\s*\u0E19\s*\u0E34\s*\u0E19\s*\u0E40\s*\u0E2A\s*\u0E23\s*\u0E47\s*\u0E08/i;
    const completionMatch = normalizedText.match(completionLabelRe);
    if (completionMatch) {
      const completionIndex = completionMatch.index || 0;
      const afterCompletion = normalizedText.substring(completionIndex);
      // removed strictAfter (invalid regex)
      const completionDateMatch = afterCompletion.match(/(\d\s*\d)[\s\-\/](\d\s*\d)[\s\-\/](\d{4})\s*(\d\s*\d)\s*:\s*(\d\s*\d)\s*:\s*(\d\s*\d)/);
      
      if (completionDateMatch) {
        const day = String(completionDateMatch[1]).replace(/\s+/g, '').padStart(2, '0');
        const month = String(completionDateMatch[2]).replace(/\s+/g, '').padStart(2, '0');
        const year = completionDateMatch[3];
        const hour = String(completionDateMatch[4]).replace(/\s+/g, '').padStart(2, '0');
        const min = String(completionDateMatch[5]).replace(/\s+/g, '').padStart(2, '0');
        const sec = String(completionDateMatch[6]).replace(/\s+/g, '').padStart(2, '0');
        return `${day}-${month}-${year} ${hour}:${min}:${sec}`;
      }
      // Fallback: use the first flexible date found after the label
      const flexAfter = this.extractFlexibleDates(afterCompletion);
      if (flexAfter.length > 0) return flexAfter[0];
    }
    
    // Fallback: use the 4th date (usually "วันที่ดำเนินเสร็จ")
    if (allMatches.length >= 4) {
      const match = allMatches[3]; // Index 3 = 4th date
      const day = String(match[1]).replace(/\s+/g, '').padStart(2, '0');
      const month = String(match[2]).replace(/\s+/g, '').padStart(2, '0');
      const year = match[3];
      const hour = String(match[4]).replace(/\s+/g, '').padStart(2, '0');
      const min = String(match[5]).replace(/\s+/g, '').padStart(2, '0');
      const sec = String(match[6]).replace(/\s+/g, '').padStart(2, '0');
      return `${day}-${month}-${year} ${hour}:${min}:${sec}`;
    }
    
    // Final fallback: use first date
    if (allMatches.length > 0) {
      const match = allMatches[0];
      return this.normalizeDate(match[0]);
    }
    
    return null;
  }

  static parseVersion(text) {
    const flexible = /\d+\s*\.\s*\d+\s*\(\s*[a-zA-Z0-9\s]+\s*\)/;
    const match = text.match(flexible);
    if (match) return match[0].replace(/\s/g, '');
    const fromContext = text.match(/(?:kickstart|system)\s*:\s*version\s+(\d+\s*\.\s*\d+\s*\(\s*[a-zA-Z0-9\s]+\s*\))/i);
    if (fromContext) return fromContext[1].replace(/\s/g, '');
    const simple = text.match(/version\s+(\d+\s*\.\s*\d+\s*\(\s*[a-zA-Z0-9\s]+\s*\))/i);
    return simple ? simple[1].replace(/\s/g, '') : null;
  }
}
