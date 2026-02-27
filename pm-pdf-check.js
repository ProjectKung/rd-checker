(function setupPmPdfChecker() {
  const pmTitleInput = document.getElementById('pdfCheckPmTitleUrl');
  const runBtn = document.getElementById('pdfCheckRunBtn');
  const stopBtn = document.getElementById('pdfCheckStopBtn');
  const progressEl = document.getElementById('pdfCheckProgress');
  const summaryEl = document.getElementById('pdfCheckSummary');
  const resultsEl = document.getElementById('pdfCheckResults');
  const summaryFilterEl = document.getElementById('debugSummaryFilter');
  const filterAllEl = document.getElementById('debugFilterAll');
  const filterOkEl = document.getElementById('debugFilterOK');
  const filterErrEl = document.getElementById('debugFilterERR');
  const filterAllTextEl = document.getElementById('debugFilterAllText');
  const filterOkTextEl = document.getElementById('debugFilterOKText');
  const filterErrTextEl = document.getElementById('debugFilterERRText');
  const pagerEl = document.getElementById('pdfCheckPager');
  const pagerTopEl = document.getElementById('pdfCheckPagerTop');
  const prevBtn = document.getElementById('pdfCheckPrevBtn');
  const nextBtn = document.getElementById('pdfCheckNextBtn');
  const pageInfoEl = document.getElementById('pdfCheckPageInfo');
  const prevBtnTop = document.getElementById('pdfCheckPrevBtnTop');
  const nextBtnTop = document.getElementById('pdfCheckNextBtnTop');
  const pageInfoTopEl = document.getElementById('pdfCheckPageInfoTop');
  if (!pmTitleInput || !runBtn || !stopBtn || !progressEl || !summaryEl || !resultsEl || !pagerEl || !prevBtn || !nextBtn || !pageInfoEl) return;
  if (summaryFilterEl) summaryFilterEl.setAttribute('aria-label', 'กรองผลเช็ค PDF');
  if (prevBtnTop) prevBtnTop.textContent = 'ก่อนหน้า';
  if (nextBtnTop) nextBtnTop.textContent = 'ถัดไป';
  if (pageInfoTopEl) pageInfoTopEl.textContent = 'หน้า 1';

  const MAX_PAGES = 200;
  const RESULT_PAGE_SIZE = 100;
  let requestCounter = 0;
  let abortFlag = false;
  let isRunning = false;
  let currentBaseUrl = '';
  let currentPage = 1;
  let maxKnownPage = null;
  const pageCache = new Map();
  const resultRowsAll = [];
  let currentResultPage = 1;
  let maxResultPage = 1;

  function setProgress(text) { progressEl.textContent = text || ''; }
  function setPagerVisible(visible) {
    pagerEl.style.display = visible ? 'flex' : 'none';
    if (pagerTopEl) pagerTopEl.style.display = visible ? 'flex' : 'none';
  }
  function resetResultArea() {
    resultsEl.innerHTML = '';
    summaryEl.textContent = '';
    summaryEl.style.display = 'none';
  }
  function syncPagerState() {
    const disablePrev = currentResultPage <= 1;
    const disableNext = currentResultPage >= maxResultPage;
    prevBtn.disabled = disablePrev;
    nextBtn.disabled = disableNext;
    if (prevBtnTop) prevBtnTop.disabled = disablePrev;
    if (nextBtnTop) nextBtnTop.disabled = disableNext;
    pageInfoEl.textContent = `หน้า ${currentResultPage} / ${maxResultPage}`;
    if (pageInfoTopEl) pageInfoTopEl.textContent = pageInfoEl.textContent;
  }
  function getSelectedSummaryFilter() {
    if (filterErrEl && filterErrEl.checked) return 'ERR';
    if (filterOkEl && filterOkEl.checked) return 'OK';
    return 'ALL';
  }
  function setSummaryFilterLabels(total, okCount, errCount) {
    if (filterAllTextEl) filterAllTextEl.textContent = `ทั้งหมด (${total})`;
    if (filterOkTextEl) filterOkTextEl.textContent = `ปกติ (${okCount})`;
    if (filterErrTextEl) filterErrTextEl.textContent = `ผิดปกติ (${errCount})`;
  }
  function resetSummaryFilter(resetChecked) {
    if (resetChecked && filterAllEl) filterAllEl.checked = true;
    setSummaryFilterLabels(0, 0, 0);
    if (summaryFilterEl) summaryFilterEl.style.display = 'none';
  }
  function rowMatchesFilter(row, filter) {
    if (filter === 'ALL') return true;
    const isOk = !!(row && row.evaluation && row.evaluation.isNormal);
    if (filter === 'OK') return isOk;
    if (filter === 'ERR') return !isOk;
    return true;
  }
  function getFilteredRows() {
    const filter = getSelectedSummaryFilter();
    if (filter === 'ALL') return resultRowsAll;
    return resultRowsAll.filter((row) => rowMatchesFilter(row, filter));
  }
  function applySummaryFilter() {
    currentResultPage = 1;
    renderResultPage(1, { updateProgress: false });
  }

  function normalizeSerial(v) { return String(v || '').replace(/\s+/g, '').trim().toUpperCase(); }
  function isCableNetworkSerial(v) {
    return /^CABLE_NETWORK_TYPE_[A-Z0-9_]+$/.test(normalizeSerial(v));
  }
  function looksLikeSerial(v) {
    const s = normalizeSerial(v);
    if (!s || s.length < 8 || !/^[A-Z0-9\-_]+$/.test(s) || /^RD\d{2}/.test(s)) return false;
    if (isCableNetworkSerial(s)) return true;
    const hasAlpha = /[A-Z]/.test(s);
    const hasDigit = /\d/.test(s);
    if (hasAlpha && hasDigit) return true;
    if (hasAlpha || !/^[\d-]+$/.test(s)) return false;
    return (s.match(/\d/g) || []).length >= 10;
  }
  function escapeHtml(s) {
    return String(s || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }
  function toAbsUrl(raw, baseUrl) {
    try { return raw ? new URL(String(raw).trim(), baseUrl).toString() : null; } catch (_) { return null; }
  }
  function withCacheBust(url) {
    try {
      const u = new URL(url);
      u.searchParams.set('_ts', `${Date.now()}_${requestCounter++}`);
      return u.toString();
    } catch (_) {
      return url;
    }
  }
  function pushUnique(arr, set, value) {
    const v = normalizeSerial(value);
    if (!looksLikeSerial(v) || set.has(v)) return;
    set.add(v);
    arr.push(v);
  }
  function extractSnTorChangePair(anchor, baseUrl) {
    if (!anchor) return null;
    const toSn = normalizeSerial(anchor.textContent || '');
    if (!looksLikeSerial(toSn)) return null;
    const href = toAbsUrl(anchor.getAttribute('href') || '', baseUrl);
    if (!href) return null;
    try {
      const u = new URL(href);
      const path = String(u.pathname || '').toLowerCase();
      if (!/report_call_sn_tor(_ma)?\.php/.test(path)) return null;
      const fromSn = normalizeSerial(u.searchParams.get('sn_tor') || '');
      if (!looksLikeSerial(fromSn)) return null;
      return { fromSn, toSn };
    } catch (_) {
      return null;
    }
  }
  function extractReportCallChangeFromHtml(html, reportUrl, expectedFromSn) {
    const doc = new DOMParser().parseFromString(html, 'text/html');
    const expected = normalizeSerial(expectedFromSn || '');
    let fromByUrl = '';
    try {
      const u = new URL(reportUrl);
      fromByUrl = normalizeSerial(u.searchParams.get('sn_tor') || '');
    } catch (_) {}
    const rows = Array.from(doc.querySelectorAll('tr'));
    let firstPair = null;
    for (const row of rows) {
      const tds = Array.from(row.querySelectorAll('td'));
      if (tds.length < 7) continue;
      const fromSn = normalizeSerial(tds[5].textContent || '');
      const toSn = normalizeSerial(tds[6].textContent || '');
      if (!looksLikeSerial(fromSn) || !looksLikeSerial(toSn)) continue;
      const pair = { fromSn, toSn };
      if (!firstPair) firstPair = pair;
      if (expected && fromSn === expected) return pair;
      if (fromByUrl && fromSn === fromByUrl) return pair;
    }
    return firstPair;
  }

  function updateSummary() {
    if (!resultRowsAll.length) {
      summaryEl.textContent = '';
      summaryEl.style.display = 'none';
      resetSummaryFilter(false);
      return;
    }
    let ok = 0;
    let err = 0;
    for (const row of resultRowsAll) {
      if (row && row.evaluation && row.evaluation.isNormal) ok++;
      else err++;
    }
    summaryEl.textContent = `สถานะ : ปกติ ${ok} อัน | สถานะ : ผิดปกติ ${err} อัน | ทั้งหมด : ${resultRowsAll.length} อัน`;
    summaryEl.style.display = 'block';
    setSummaryFilterLabels(resultRowsAll.length, ok, err);
    if (summaryFilterEl) summaryFilterEl.style.display = 'grid';
  }

  async function fetchText(url) {
    const reqUrl = withCacheBust(url);
    const res = await fetch(reqUrl, {
      credentials: 'include',
      cache: 'no-store',
      headers: {
        'Cache-Control': 'no-cache, no-store, must-revalidate',
        Pragma: 'no-cache'
      }
    });
    if (!res.ok) throw new Error(`HTTP ${res.status} ${res.statusText}`);
    return await res.text();
  }
  async function fetchPdfArrayBuffer(url) {
    const reqUrl = withCacheBust(url);
    const res = await fetch(reqUrl, {
      credentials: 'include',
      cache: 'no-store',
      headers: {
        'Cache-Control': 'no-cache, no-store, must-revalidate',
        Pragma: 'no-cache'
      }
    });
    if (!res.ok) throw new Error(`โหลด PDF ไม่สำเร็จ: ${res.status} ${res.statusText}`);
    const ab = await res.arrayBuffer();
    if (!ab || ab.byteLength < 100) throw new Error('โครงสร้าง PDF ไม่ถูกต้อง - ไฟล์เล็กเกินไป');
    const b = new Uint8Array(ab);
    if (String.fromCharCode(b[0], b[1], b[2], b[3]) !== '%PDF') throw new Error('ไม่ใช่ไฟล์ PDF ที่ถูกต้อง');
    return ab;
  }

  function extractWorksheetSerialFromPdfText(text, fallbackSn) {
    const src = normalizeTextForLineScan(text || '').toUpperCase();
    const fallback = normalizeSerial(fallbackSn);
    if (fallback && isCableNetworkSerial(fallback)) return fallback;
    const labeled = src.match(/(?:\u0E2B\u0E21\u0E32\u0E22\u0E40\u0E25\u0E02\u0E40\u0E04\u0E23\u0E37\u0E48\u0E2D\u0E07|SERIAL\s*NO\.?|SERIAL\s*NUMBER|S\/N|SN)\s*[:：]?\s*([A-Z0-9\-_]{6,})/i);
    if (labeled && looksLikeSerial(labeled[1])) return normalizeSerial(labeled[1]);
    const toks = src.match(/\b[A-Z0-9_][A-Z0-9\-_]{7,}\b/g) || [];
    for (const t of toks) {
      const v = normalizeSerial(t);
      if (looksLikeSerial(v) && (!fallback || v === fallback)) return v;
    }
    for (const t of toks) {
      const v = normalizeSerial(t);
      if (looksLikeSerial(v)) return v;
    }
    return fallback || null;
  }

  async function extractWorksheetPdfInfo(pdfUrl, fallbackSn) {
    const ab = await fetchPdfArrayBuffer(pdfUrl);
    if (abortFlag) throw new Error('aborted');
    const fullText = await PDFExtractor.extractText(ab, {
      maxPages: 3,
      maxChars: 20000,
      yieldEveryPages: 1
    });
    if (!fullText || fullText.length < 5) throw new Error('ไม่พบข้อความใน PDF');
    const parsed = DataParser.extractAllMatches(fullText) || {};
    return {
      companyOfficer: extractCompanyOfficerNameFromPdfText(fullText) || null,
      rdCode: parsed.rdCode || null,
      machineSerial: extractWorksheetSerialFromPdfText(fullText, fallbackSn)
    };
  }

  function parsePmTitlePageItems(html, pageUrl) {
    const doc = new DOMParser().parseFromString(html, 'text/html');
    const forms = Array.from(doc.querySelectorAll('form[action*="pm_editcall_approve_device.php"]'));
    const items = [];
    for (const form of forms) {
      const approveUrl = toAbsUrl(form.getAttribute('action') || '', pageUrl);
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
      const links = row ? Array.from(row.querySelectorAll('a[href*=".pdf"]')) : Array.from(doc.querySelectorAll('a[href*=".pdf"]'));
      if (links.length) {
        const snNorm = normalizeSerial(sn);
        const picked = links.find((a) => normalizeSerial(a.getAttribute('href') || '').includes(snNorm) || normalizeSerial(a.textContent || '') === snNorm) || links[0];
        pdfUrlFromList = toAbsUrl(picked.getAttribute('href') || '', pageUrl);
      }
      items.push({ sn, callId, idAdd, approveUrl, pdfUrlFromList });
    }
    return items;
  }

  function findWorksheetPdfUrlFromApprove(html, approveUrl, sn) {
    const doc = new DOMParser().parseFromString(html, 'text/html');
    const snNorm = normalizeSerial(sn);
    const rows = Array.from(doc.querySelectorAll('tr'));
    for (const row of rows) {
      if (!normalizeSerial(row.textContent || '').includes(snNorm)) continue;
      const l = row.querySelector('a[href*=".pdf"]');
      if (l) return toAbsUrl(l.getAttribute('href') || '', approveUrl);
    }
    const any = doc.querySelector('a[href*=".pdf"]');
    return any ? toAbsUrl(any.getAttribute('href') || '', approveUrl) : null;
  }

  function findRackDetailUrlFromApprove(html, approveUrl, sn, callId) {
    const doc = new DOMParser().parseFromString(html, 'text/html');
    const selector = 'a[href*="rack_detail_TOR.php"], a[href*="rack_detail_out.php"], a[href*="rack_detail_IP.php"]';
    const links = Array.from(doc.querySelectorAll(selector));
    if (!links.length) return null;
    const snNorm = normalizeSerial(sn);
    const callNorm = normalizeSerial(callId);
    const byCall = links.find((a) => {
      try {
        const u = new URL(a.getAttribute('href') || '', approveUrl);
        const q = normalizeSerial(u.searchParams.get('id_project_call') || u.searchParams.get('call_id') || u.searchParams.get('new_id') || '');
        return callNorm && q === callNorm;
      } catch (_) { return false; }
    });
    const bySn = links.find((a) => {
      try {
        const u = new URL(a.getAttribute('href') || '', approveUrl);
        const q = normalizeSerial(u.searchParams.get('sn') || u.searchParams.get('sn_tor') || u.searchParams.get('rack_sn') || '');
        return snNorm && q === snNorm;
      } catch (_) { return false; }
    });
    return toAbsUrl((byCall || bySn || links[0]).getAttribute('href') || '', approveUrl);
  }

  function findMapOfficeUrlFromApprove(html, approveUrl, sn) {
    const doc = new DOMParser().parseFromString(html, 'text/html');
    const snNorm = normalizeSerial(sn);
    const rows = Array.from(doc.querySelectorAll('tr'));
    for (const row of rows) {
      if (snNorm && !normalizeSerial(row.textContent || '').includes(snNorm)) continue;
      const mapLink = row.querySelector('a[href*="map_office_notedit.php"]');
      if (mapLink) return toAbsUrl(mapLink.getAttribute('href') || '', approveUrl);
    }
    const any = doc.querySelector('a[href*="map_office_notedit.php"]');
    return any ? toAbsUrl(any.getAttribute('href') || '', approveUrl) : null;
  }

  function isMapOfficeResultPage(html) {
    const doc = new DOMParser().parseFromString(html, 'text/html');
    if (doc.querySelector('form[action*="map_office_notedit.php"]')) return true;
    if (doc.querySelector('a[href*="as_build_detail.php"], a[onclick*="as_build_detail.php"]')) return true;
    const src = normalizeTextForLineScan(doc.body ? doc.body.textContent || '' : html || '').toUpperCase();
    return src.includes('MAP_OFFICE_NOTEDIT') || (src.includes('AS BUILT') && src.includes('GROUND'));
  }

  function findApproveSerialInfo(html, approveUrl, expectedSn) {
    const doc = new DOMParser().parseFromString(html, 'text/html');
    const expected = normalizeSerial(expectedSn);
    const baseOut = [];
    const baseSeen = new Set();
    const displayOut = [];
    const displaySeen = new Set();
    const serialChanges = [];
    const serialChangesMatched = [];
    const reportUrls = [];
    const reportUrlsMatched = [];
    function findDeviceRowFromForm(formEl) {
      let row = formEl ? formEl.closest('tr') : null;
      while (row) {
        const tdCount = row.querySelectorAll('td').length;
        const hasSerialCell = !!row.querySelector('td:nth-child(4)');
        const hasSerialChangeLink = !!row.querySelector('a[href*="report_call_sn_tor.php"], a[href*="report_call_sn_tor_ma.php"]');
        if (tdCount >= 8 || hasSerialCell || hasSerialChangeLink) return row;
        row = row.parentElement ? row.parentElement.closest('tr') : null;
      }
      return null;
    }
    const forms = Array.from(doc.querySelectorAll('form[action*="approve_pm_device_2.php"], form[action*="approve_pm_device_2_2.php"]'));
    for (const form of forms) {
      const abs = toAbsUrl(form.getAttribute('action') || '', approveUrl);
      if (abs) {
        try {
          const u = new URL(abs);
          pushUnique(baseOut, baseSeen, u.searchParams.get('sn_tor') || '');
        } catch (_) {}
      }

      const snInput = form.querySelector('input[name="sn"]');
      if (snInput) pushUnique(baseOut, baseSeen, snInput.value || '');

      const row = findDeviceRowFromForm(form);
      if (!row) continue;

      const tds = Array.from(row.querySelectorAll('td'));
      if (tds.length >= 4) pushUnique(displayOut, displaySeen, tds[3].textContent || '');

      const serialAnchor = row.querySelector('td:nth-child(4) a');
      if (serialAnchor) pushUnique(displayOut, displaySeen, serialAnchor.textContent || '');

      const reportLinks = Array.from(row.querySelectorAll('a[href*="report_call_sn_tor.php"], a[href*="report_call_sn_tor_ma.php"]'));
      for (const a of reportLinks) {
        const rowNorm = normalizeSerial(row.textContent || '');
        const reportUrl = toAbsUrl(a.getAttribute('href') || '', approveUrl);
        if (reportUrl) {
          reportUrls.push(reportUrl);
          if (expected && rowNorm.includes(expected)) {
            reportUrlsMatched.push(reportUrl);
          } else {
            try {
              const ru = new URL(reportUrl);
              const snTor = normalizeSerial(ru.searchParams.get('sn_tor') || '');
              if (expected && snTor === expected) reportUrlsMatched.push(reportUrl);
            } catch (_) {}
          }
        }
        const pair = extractSnTorChangePair(a, approveUrl);
        if (!pair) continue;
        serialChanges.push(pair);
        if (expected && (pair.fromSn === expected || pair.toSn === expected || rowNorm.includes(expected))) {
          serialChangesMatched.push(pair);
        }
        pushUnique(baseOut, baseSeen, pair.fromSn);
        pushUnique(displayOut, displaySeen, pair.toSn);
      }

      // Do not infer pm_editcall serial from rack_detail query params (especially rack_sn),
      // because rack_sn is rack location code and can cause false "serial changed" results.
    }

    const pickedChange =
      serialChangesMatched.find((x) => x.fromSn && x.toSn && x.fromSn !== x.toSn) ||
      serialChangesMatched[0] ||
      serialChanges.find((x) => expected && (x.fromSn === expected || x.toSn === expected)) ||
      serialChanges[0] ||
      null;
    if (pickedChange) {
      return {
        baseSerial: pickedChange.fromSn || expected || null,
        displaySerial: pickedChange.toSn || pickedChange.fromSn || expected || null,
        currentSerial: pickedChange.toSn || pickedChange.fromSn || expected || null,
        reportUrl: reportUrlsMatched[0] || reportUrls[0] || null
      };
    }

    const baseSerial = expected || baseOut[0] || displayOut[0] || null;
    const mappedChange = serialChanges.find((x) => x.fromSn === baseSerial && x.toSn !== baseSerial) || null;
    const displaySerial = (mappedChange && mappedChange.toSn) || displayOut.find((x) => !baseSerial || x !== baseSerial) || displayOut[0] || null;
    const currentSerial = displaySerial || baseSerial || null;
    return { baseSerial, displaySerial, currentSerial, reportUrl: reportUrlsMatched[0] || reportUrls[0] || null };
  }

  function analyzeRackPage(html, rackUrl, targetSn) {
    const doc = new DOMParser().parseFromString(html, 'text/html');
    const serialPool = [];
    const seen = new Set();
    const serialChanges = [];
    const bodyText = normalizeTextForLineScan(doc.body ? doc.body.textContent || '' : html || '').toUpperCase();
    const toks = bodyText.match(/\b[A-Z0-9][A-Z0-9\-]{7,}\b/g) || [];
    for (const t of toks) pushUnique(serialPool, seen, t);
    for (const a of Array.from(doc.querySelectorAll('a[href]'))) {
      const href = toAbsUrl(a.getAttribute('href') || '', rackUrl);
      if (!href) continue;
      try {
        const u = new URL(href);
        pushUnique(serialPool, seen, u.searchParams.get('rack_sn') || '');
        pushUnique(serialPool, seen, u.searchParams.get('sn') || '');
        pushUnique(serialPool, seen, u.searchParams.get('sn_tor') || '');
      } catch (_) {}
      pushUnique(serialPool, seen, a.textContent || '');
      const pair = extractSnTorChangePair(a, rackUrl);
      if (pair) {
        serialChanges.push(pair);
        pushUnique(serialPool, seen, pair.fromSn);
        pushUnique(serialPool, seen, pair.toSn);
      }
    }
    const normalizedSource = normalizeSerial(`${bodyText} ${serialPool.join(' ')}`);
    const targetNorm = normalizeSerial(targetSn);
    const containsTarget = !!(
      targetNorm &&
      (
        normalizedSource.includes(targetNorm) ||
        serialChanges.some((x) => x.fromSn === targetNorm || x.toSn === targetNorm)
      )
    );
    const mappedByTarget = targetNorm
      ? (serialChanges.find((x) => x.fromSn === targetNorm) || serialChanges.find((x) => x.toSn === targetNorm) || null)
      : null;
    const pickedPair = mappedByTarget || null;
    const baseSerial = (pickedPair && pickedPair.fromSn) || (containsTarget ? targetNorm : null);
    const currentSerial = (pickedPair && pickedPair.toSn) || (containsTarget ? targetNorm : null);
    return {
      containsTarget,
      matchedSerial: currentSerial,
      baseSerial,
      currentSerial,
      serialPool,
      normalizedSource
    };
  }

  function evaluateItem(item, extracted, pdfInfo, errors) {
    const reasons = [];
    const notes = [];
    const pmSn = normalizeSerial(extracted.pmTitleSn || item.sn || '');
    const approveBaseSn = normalizeSerial(extracted.approveSerial || '');
    const approveDisplaySn = normalizeSerial(extracted.approveDisplaySerial || '');
    const approveCurrentSn = normalizeSerial(extracted.approveCurrentSerial || approveDisplaySn || approveBaseSn || '');
    const approveFromSn = approveBaseSn || pmSn || '';
    const approveToSn = approveCurrentSn || approveFromSn || '';
    const rackBaseSnRaw = normalizeSerial(extracted.rackBaseSerial || '');
    const rackCurrentSnRaw = normalizeSerial(extracted.rackCurrentSerial || extracted.rackMatchedSerial || '');
    const useApproveAsRack = !extracted.rackContainsTargetSn;
    const rackBaseSn = useApproveAsRack ? (approveFromSn || rackBaseSnRaw || '') : (rackBaseSnRaw || approveFromSn || '');
    const rackCurrentSn = useApproveAsRack ? (approveToSn || rackCurrentSnRaw || '') : rackCurrentSnRaw;
    const serialChanged = !!(approveFromSn && approveToSn && approveFromSn !== approveToSn);
    const rackMatchedSerial = rackCurrentSn;
    if (!pmSn) reasons.push('ไม่พบ S/N จาก pm_title');
    if (!approveToSn) reasons.push('ไม่พบ Serial No จาก pm_editcall_approve_device');
    if (!rackMatchedSerial) reasons.push('ไม่พบ S/N ในขั้นตอนที่ 3 (rack/map)');
    if (pmSn && approveFromSn && pmSn !== approveFromSn) reasons.push('S/N หน้า pm_title ไม่ตรงกับเลขเก่าหน้า pm_editcall_approve_device');
    if (pmSn && rackBaseSn && pmSn !== rackBaseSn) reasons.push('S/N หน้า pm_title ไม่ตรงกับเลขเก่าหน้า Rack Diagram');
    if (approveToSn && rackMatchedSerial && approveToSn !== rackMatchedSerial) reasons.push('เลขที่เปลี่ยนของ pm_editcall_approve_device ไม่ตรงกับ Rack Diagram');
    if (Array.isArray(errors)) {
      for (const e of errors) {
        const msg = String(e || '');
        if (msg.startsWith('[PDF]')) notes.push(msg.replace(/^\[PDF\]\s*/, ''));
        else reasons.push(msg);
      }
    }

    const worksheetSerial = normalizeSerial((pdfInfo && pdfInfo.machineSerial) || '');
    const worksheetVsRackMatched = !!(worksheetSerial && rackMatchedSerial && worksheetSerial === rackMatchedSerial);
    if (worksheetSerial && rackMatchedSerial && !worksheetVsRackMatched) reasons.push('หมายเลขเครื่องจากใบงานไม่ตรงกับข้อมูล Rack/Map');
    if (!pdfInfo || !pdfInfo.companyOfficer) notes.push('ไม่พบชื่อเจ้าหน้าที่บริษัทใน PDF ใบงาน');
    if (!pdfInfo || !pdfInfo.rdCode) notes.push('ไม่พบ RD Code ใน PDF ใบงาน');
    if (!worksheetSerial) notes.push('ไม่พบหมายเลขเครื่องใน PDF ใบงาน');

    const approveDisplayText = (serialChanged)
      ? `${approveFromSn} เปลี่ยนเป็น ${approveToSn}`
      : (approveToSn || '-');
    const rackFromSn = rackBaseSn || approveFromSn || pmSn || '';
    const rackDisplayText = (rackFromSn && rackMatchedSerial && rackFromSn !== rackMatchedSerial)
      ? `${rackFromSn} เปลี่ยนเป็น ${rackMatchedSerial}`
      : (rackMatchedSerial || 'ไม่พบเลขเดียวกัน');

    return {
      isNormal: reasons.length === 0,
      reasons,
      notes,
      pmSn,
      approveSn: approveToSn,
      approveDisplayText,
      rackMatchedSerial,
      rackDisplayText,
      rackBaseSn,
      worksheetSerial,
      worksheetVsRackMatched,
      worksheetVsRackDisplay: rackMatchedSerial || '-'
    };
  }

  function renderResultCard(index, row) {
    const { item, chain, evaluation, pdfInfo } = row;
    const card = document.createElement('div');
    card.className = `debug-card ${evaluation.isNormal ? 'ok' : 'err'}`;

    const head = document.createElement('div');
    head.className = 'debug-head';
    const left = document.createElement('div');
    const snEl = document.createElement('div');
    snEl.className = 'debug-sn';
    snEl.setAttribute('data-debug-index', String(index));
    snEl.innerHTML = `${escapeHtml(evaluation.pmSn || item.sn || '(ไม่พบ sn)')} <span class="sn-status ${evaluation.isNormal ? 'sn-status-ok' : 'sn-status-err'}">สถานะ : ${evaluation.isNormal ? 'ปกติ' : 'ผิดปกติ'}</span>`;
    left.appendChild(snEl);
    const meta = document.createElement('div');
    meta.className = 'debug-meta';
    meta.innerHTML = `เจ้าหน้าที่บริษัท: ${escapeHtml((pdfInfo && pdfInfo.companyOfficer) || '(ไม่พบ)')}<br/>ใบงาน : ${chain.step2 ? `<a href="${escapeHtml(chain.step2)}" target="_blank" rel="noreferrer">${escapeHtml(chain.step2)}</a>` : '<span class="debug-missing">(ไม่พบ)</span>'}`;
    left.appendChild(meta);

    const actions = document.createElement('div');
    actions.className = 'debug-actions';
    const toggleBtn = document.createElement('button');
    toggleBtn.className = 'debug-mini-btn';
    toggleBtn.type = 'button';
    toggleBtn.textContent = 'ดูเพิ่มเติม';
    actions.appendChild(toggleBtn);
    head.appendChild(left);
    head.appendChild(actions);
    card.appendChild(head);

    const body = document.createElement('div');
    body.className = 'ip-phone-body';
    body.style.display = 'none';
    const isCableRow = isCableNetworkSerial(evaluation.pmSn || item.sn || '');
    const step3Label = isCableRow ? 'map_office_notedit' : 'Rack Diagram';
    const step3DebugLabel = isCableRow ? 'map_office_notedit' : 'rack_detail_TOR';
    const line1 = document.createElement('div');
    line1.className = 'ip-phone-line';
    line1.innerHTML = `S/N จาก pm_title : <strong>${escapeHtml(evaluation.pmSn || '-')}</strong> | Serial No จาก pm_editcall_approve_device : <strong>${escapeHtml(evaluation.approveDisplayText || evaluation.approveSn || '-')}</strong> | ${escapeHtml(step3Label)} : <strong>${escapeHtml(evaluation.rackDisplayText || (evaluation.rackMatchedSerial || 'ไม่พบ'))}</strong>`;
    body.appendChild(line1);
    const line2 = document.createElement('div');
    line2.className = 'ip-phone-line';
    line2.innerHTML = `RD Code : <strong>${escapeHtml((pdfInfo && pdfInfo.rdCode) || '-')}</strong>`;
    body.appendChild(line2);
    const line3 = document.createElement('div');
    line3.className = 'ip-phone-line';
    line3.innerHTML = `หมายเลขเครื่อง: <strong>${escapeHtml(evaluation.worksheetSerial || '-')}</strong> (จากใบงาน)`;
    body.appendChild(line3);
    const line4 = document.createElement('div');
    line4.className = 'ip-phone-line';
    line4.innerHTML = `หมายเลขเครื่องระหว่างใบงานกับ ${escapeHtml(step3Label)} : (ใบงาน <strong>${escapeHtml(evaluation.worksheetSerial || '-')}</strong>) ${evaluation.worksheetVsRackMatched ? 'เหมือนกับ' : 'ไม่เหมือนกับ'} (${escapeHtml(step3Label)} <strong>${escapeHtml(evaluation.worksheetVsRackDisplay || '-')}</strong>)`;
    body.appendChild(line4);
    if (evaluation.reasons.length) {
      const lineErr = document.createElement('div');
      lineErr.className = 'ip-phone-line cmp-error';
      lineErr.innerHTML = `สาเหตุ: ${escapeHtml(evaluation.reasons.join(' | '))}`;
      body.appendChild(lineErr);
    }
    if (evaluation.notes.length) {
      const lineWarn = document.createElement('div');
      lineWarn.className = 'ip-phone-line cmp-warning';
      lineWarn.innerHTML = `หมายเหตุ: ${escapeHtml(evaluation.notes.join(' | '))}`;
      body.appendChild(lineWarn);
    }
    const debugDetails = document.createElement('details');
    debugDetails.className = 'cmp-debug-details';
    debugDetails.innerHTML = `<summary>Debug (ซ่อนไว้)</summary><div class="cmp-debug-inner"><pre class="cmp-data-pre">1) pm_title: ${escapeHtml(chain.step1 || '')}\n2) pm_editcall_approve_device: ${escapeHtml(chain.step2 || '')}\n3) ${escapeHtml(step3DebugLabel)}: ${escapeHtml(chain.step3 || '')}\nPDF: ${escapeHtml(chain.pdf || '')}\npm_title_sn: ${escapeHtml(evaluation.pmSn || '')}\napprove_serial: ${escapeHtml(evaluation.approveSn || '')}\napprove_display: ${escapeHtml(evaluation.approveDisplayText || '')}\nrack_serial: ${escapeHtml(evaluation.rackMatchedSerial || '')}\nrack_display: ${escapeHtml(evaluation.rackDisplayText || '')}\nworksheet_serial: ${escapeHtml(evaluation.worksheetSerial || '')}</pre></div>`;
    body.appendChild(debugDetails);

    card.appendChild(body);
    toggleBtn.addEventListener('click', () => {
      const open = body.style.display !== 'none';
      body.style.display = open ? 'none' : 'flex';
      toggleBtn.textContent = open ? 'ดูเพิ่มเติม' : 'ซ่อนรายละเอียด';
    });
    resultsEl.appendChild(card);
  }

  function renderResultPage(page, options = {}) {
    const updateProgress = options.updateProgress !== false;
    const filteredRows = getFilteredRows();
    const total = filteredRows.length;
    maxResultPage = Math.max(1, Math.ceil(total / RESULT_PAGE_SIZE));
    setPagerVisible(total > 0 && maxResultPage > 1);
    const safePage = Math.min(Math.max(1, page), maxResultPage);
    currentResultPage = safePage;

    resetResultArea();
    updateSummary();
    if (!total) {
      syncPagerState();
      return;
    }

    const start = (safePage - 1) * RESULT_PAGE_SIZE;
    const end = Math.min(start + RESULT_PAGE_SIZE, total);
    for (let i = start; i < end; i++) {
      renderResultCard(i + 1, filteredRows[i]);
    }

    syncPagerState();
    if (updateProgress) {
      setProgress(`หน้า ${safePage} / ${maxResultPage} แสดงลำดับ ${start + 1}-${end} จากทั้งหมด ${total} รายการ`);
    }
  }

  function navigateResultPage(targetPage) {
    if (!resultRowsAll.length) return;
    if (targetPage < 1 || targetPage > maxResultPage) return;
    renderResultPage(targetPage);
  }

  function refreshLiveResultsView() {
    if (!resultRowsAll.length) return;
    renderResultPage(currentResultPage, { updateProgress: false });
  }

  function buildPageUrl(baseUrl, page) {
    const u = new URL(baseUrl);
    u.searchParams.set('page', String(page));
    return u.toString();
  }

  async function processItem(item, pageUrl) {
    const chain = { step1: pageUrl, step2: item.approveUrl || null, step3: null, pdf: item.pdfUrlFromList || null };
    const errors = [];
    let step3Kind = 'rack';
    let approveHtml = '';
    try { approveHtml = await fetchText(chain.step2); } catch (e) { errors.push(`โหลด pm_editcall ไม่สำเร็จ: ${e.message || e}`); }
    if (abortFlag) throw new Error('aborted');

    const isCableItem = isCableNetworkSerial(item.sn || '');
    const approveInfo = approveHtml ? findApproveSerialInfo(approveHtml, chain.step2, item.sn) : { baseSerial: null, displaySerial: null, currentSerial: null, reportUrl: null };
    const approveBaseNorm = normalizeSerial((approveInfo && approveInfo.baseSerial) || item.sn || '');
    const approveCurrentNorm = normalizeSerial((approveInfo && approveInfo.currentSerial) || '');
    if (
      approveInfo &&
      approveInfo.reportUrl &&
      approveBaseNorm &&
      (!approveCurrentNorm || approveCurrentNorm === approveBaseNorm)
    ) {
      try {
        const reportHtml = await fetchText(approveInfo.reportUrl);
        const reportPair = extractReportCallChangeFromHtml(reportHtml, approveInfo.reportUrl, approveBaseNorm);
        if (reportPair && reportPair.fromSn && reportPair.toSn && reportPair.toSn !== reportPair.fromSn) {
          approveInfo.baseSerial = reportPair.fromSn;
          approveInfo.displaySerial = reportPair.toSn;
          approveInfo.currentSerial = reportPair.toSn;
        }
      } catch (_) {}
    }
    const step3TargetSn = normalizeSerial((approveInfo && approveInfo.currentSerial) || item.sn || '');
    if (approveHtml) {
      chain.pdf = findWorksheetPdfUrlFromApprove(approveHtml, chain.step2, item.sn) || chain.pdf;
      chain.step3 = findRackDetailUrlFromApprove(approveHtml, chain.step2, step3TargetSn || item.sn, item.callId);
      if (!chain.step3 && step3TargetSn && step3TargetSn !== normalizeSerial(item.sn || '')) {
        chain.step3 = findRackDetailUrlFromApprove(approveHtml, chain.step2, item.sn, item.callId);
      }
      if (!chain.step3 && isCableItem) {
        const mapUrl = findMapOfficeUrlFromApprove(approveHtml, chain.step2, step3TargetSn || item.sn);
        if (mapUrl) {
          chain.step3 = mapUrl;
          step3Kind = 'map';
        }
      }
    }
    if (!chain.step3) errors.push('ไม่พบลิงก์ขั้นตอนที่ 3 (rack_detail_TOR / map_office_notedit)');

    let rackSnapshot = { containsTarget: false, matchedSerial: null, baseSerial: null, currentSerial: null, serialPool: [], normalizedSource: '' };
    if (chain.step3) {
      try {
        const step3Html = await fetchText(chain.step3);
        if (step3Kind === 'map' || isMapOfficeResultPage(step3Html)) {
          step3Kind = 'map';
          const oldSnNorm = normalizeSerial((approveInfo && approveInfo.baseSerial) || item.sn || '');
          const snNorm = step3TargetSn || normalizeSerial(item.sn || '');
          rackSnapshot = {
            containsTarget: !!snNorm,
            matchedSerial: snNorm || null,
            baseSerial: oldSnNorm || null,
            currentSerial: snNorm || null,
            serialPool: snNorm ? [snNorm] : [],
            normalizedSource: snNorm || ''
          };
        } else {
          rackSnapshot = analyzeRackPage(step3Html, chain.step3, step3TargetSn || item.sn);
        }
      } catch (e) {
        errors.push(`โหลด ${step3Kind === 'map' ? 'map_office_notedit' : 'rack_detail'} ไม่สำเร็จ: ${e.message || e}`);
      }
    }
    if (abortFlag) throw new Error('aborted');

    let pdfInfo = null;
    if (chain.pdf) {
      try { pdfInfo = await extractWorksheetPdfInfo(chain.pdf, step3TargetSn || item.sn); }
      catch (e) { errors.push(`[PDF] อ่าน PDF ใบงานไม่สำเร็จ: ${e.message || e}`); }
    } else {
      errors.push('[PDF] ไม่พบลิงก์ PDF ใบงาน');
    }

    const extracted = {
      pmTitleSn: item.sn || '',
      approveSerial: approveInfo.baseSerial || '',
      approveDisplaySerial: approveInfo.displaySerial || '',
      approveCurrentSerial: approveInfo.currentSerial || '',
      rackContainsTargetSn: rackSnapshot.containsTarget,
      rackBaseSerial: rackSnapshot.baseSerial || '',
      rackCurrentSerial: rackSnapshot.currentSerial || '',
      rackMatchedSerial: rackSnapshot.matchedSerial,
      rackNormalizedSource: rackSnapshot.normalizedSource
    };
    return { chain, pdfInfo, evaluation: evaluateItem(item, extracted, pdfInfo, errors) };
  }

  function setBusy(busy) {
    isRunning = !!busy;
    runBtn.disabled = !!busy;
    stopBtn.style.display = busy ? 'inline-flex' : 'none';
    syncPagerState();
  }

  async function loadPage(page) {
    if (!currentBaseUrl || page < 1 || page > MAX_PAGES) return false;
    if (pageCache.has(page)) {
      resetResultArea();
      const cached = pageCache.get(page);
      for (let i = 0; i < cached.length; i++) renderResultCard(i + 1, cached[i]);
      currentPage = page;
      setProgress(`หน้า ${page} - แสดง ${cached.length} รายการ`);
      updateSummary();
      syncPagerState();
      return true;
    }

    const pageUrl = buildPageUrl(currentBaseUrl, page);
    setProgress(`กำลังโหลดหน้า ${page}...`);
    let html = '';
    try { html = await fetchText(pageUrl); } catch (e) {
      if (page === 1) throw e;
      maxKnownPage = page - 1;
      setProgress(`ไม่พบหน้า ${page} - หน้าสุดท้ายคือ ${maxKnownPage}`);
      syncPagerState();
      return false;
    }
    if (abortFlag) throw new Error('aborted');

    const rawItems = parsePmTitlePageItems(html, pageUrl);
    if (!rawItems.length) {
      if (page === 1) setProgress('หน้า 1 ไม่พบรายการ (URL ไม่ถูกต้องหรือไม่มีสิทธิ์)');
      else { maxKnownPage = page - 1; setProgress(`หน้าสุดท้ายคือ ${maxKnownPage}`); }
      syncPagerState();
      return false;
    }

    const seen = new Set();
    const items = rawItems.filter((x) => {
      const k = `${x.sn}|${x.callId}|${x.idAdd}|${x.approveUrl}`;
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    });

    resetResultArea();
    const rows = [];
    for (let i = 0; i < items.length; i++) {
      if (abortFlag) throw new Error('aborted');
      setProgress(`หน้า ${page} - รายการ ${i + 1}/${items.length}`);
      try {
        const out = await processItem(items[i], pageUrl);
        const row = { item: items[i], chain: out.chain, pdfInfo: out.pdfInfo, evaluation: out.evaluation };
        rows.push(row);
        renderResultCard(rows.length, row);
      } catch (e) {
        const row = {
          item: items[i],
          chain: { step1: pageUrl, step2: items[i].approveUrl || '', step3: '', pdf: items[i].pdfUrlFromList || '' },
          pdfInfo: null,
          evaluation: { isNormal: false, reasons: [`ข้อผิดพลาด: ${e.message || e}`], notes: [], pmSn: normalizeSerial(items[i].sn || ''), approveSn: '', rackMatchedSerial: '', worksheetSerial: '', worksheetVsRackMatched: false, worksheetVsRackDisplay: '-' }
        };
        rows.push(row);
        renderResultCard(rows.length, row);
      }
      updateSummary();
    }

    // Disable source-page caching to reduce stale data/memory on long runs.
    currentPage = page;
    setProgress(`หน้า ${page} - แสดง ${rows.length} รายการ`);
    syncPagerState();
    return true;
  }

  async function runAllPages() {
    resetResultArea();
    pageCache.clear();
    resultRowsAll.length = 0;
    currentResultPage = 1;
    maxResultPage = 1;
    currentPage = 1;
    maxKnownPage = null;

    const seenGlobal = new Set();
    let totalRows = 0;
    let lastPageWithData = 0;

    for (let page = 1; page <= MAX_PAGES; page++) {
      if (abortFlag) throw new Error('aborted');

      const pageUrl = buildPageUrl(currentBaseUrl, page);
      setProgress(`กำลังโหลดหน้า ${page}...`);

      let html = '';
      try {
        html = await fetchText(pageUrl);
      } catch (e) {
        if (page === 1) throw e;
        break;
      }
      if (abortFlag) throw new Error('aborted');

      const rawItems = parsePmTitlePageItems(html, pageUrl);
      if (!rawItems.length) {
        if (page === 1) setProgress('หน้า 1 ไม่พบรายการ (URL ไม่ถูกต้องหรือไม่มีสิทธิ์)');
        break;
      }

      const items = rawItems.filter((x) => {
        const k = `${x.sn}|${x.callId}|${x.idAdd}|${x.approveUrl}`;
        if (seenGlobal.has(k)) return false;
        seenGlobal.add(k);
        return true;
      });

      if (!items.length) break;

      const rows = [];
      for (let i = 0; i < items.length; i++) {
        if (abortFlag) throw new Error('aborted');
        setProgress(`หน้า ${page} - รายการ ${i + 1}/${items.length} - รวม ${totalRows + 1}`);
        try {
          const out = await processItem(items[i], pageUrl);
          const row = { item: items[i], chain: out.chain, pdfInfo: out.pdfInfo, evaluation: out.evaluation };
          rows.push(row);
          totalRows += 1;
          resultRowsAll.push(row);
          refreshLiveResultsView();
        } catch (e) {
          const row = {
            item: items[i],
            chain: { step1: pageUrl, step2: items[i].approveUrl || '', step3: '', pdf: items[i].pdfUrlFromList || '' },
            pdfInfo: null,
            evaluation: { isNormal: false, reasons: [`ข้อผิดพลาด: ${e.message || e}`], notes: [], pmSn: normalizeSerial(items[i].sn || ''), approveSn: '', rackMatchedSerial: '', worksheetSerial: '', worksheetVsRackMatched: false, worksheetVsRackDisplay: '-' }
          };
          rows.push(row);
          totalRows += 1;
          resultRowsAll.push(row);
          refreshLiveResultsView();
        }
      }

      // Avoid growing in-memory source-page cache during large runs.
      lastPageWithData = page;
    }

    maxKnownPage = lastPageWithData || null;
    currentPage = maxKnownPage || 1;

    if (totalRows > 0) {
      setPagerVisible(maxResultPage > 1);
      const pageToShow = Math.min(Math.max(1, currentResultPage), maxResultPage);
      renderResultPage(pageToShow, { updateProgress: false });
      const start = (pageToShow - 1) * RESULT_PAGE_SIZE + 1;
      const end = Math.min(start + RESULT_PAGE_SIZE - 1, totalRows);
      setProgress(`เสร็จแล้ว - ${lastPageWithData || 1} หน้า - ${totalRows} รายการ | หน้า ${pageToShow} / ${maxResultPage} (ลำดับ ${start}-${end})`);
    } else if (!progressEl.textContent) {
      setProgress('ไม่พบรายการ');
    }
    syncPagerState();
  }

  async function navigateToPage(targetPage) {
    if (!currentBaseUrl || isRunning || targetPage < 1 || (maxKnownPage && targetPage > maxKnownPage)) return;
    abortFlag = false;
    setBusy(true);
    try { await loadPage(targetPage); }
    catch (e) {
      if (String(e && e.message || e) === 'aborted') setProgress('กำลังหยุด...');
      else { console.error('PDF check page navigation error:', e); setProgress(`ข้อผิดพลาด: ${e.message || e}`); alert(`ตรวจสอบ PDF ไม่สำเร็จ: ${e.message || e}`); }
    } finally { setBusy(false); }
  }

  runBtn.addEventListener('click', async () => {
    if (isRunning) return;
    const baseUrl = String(pmTitleInput.value || '').trim();
    if (!baseUrl) { alert('กรุณากรอก URL ของ PM Title (pm_title.php?... )'); return; }
    let parsed;
    try { parsed = new URL(baseUrl); } catch (_) { alert('URL ไม่ถูกต้อง'); return; }
    if (!/pm_title\.php/i.test(parsed.pathname || '')) { alert('URL ต้องเป็น pm_title.php'); return; }

    currentBaseUrl = baseUrl;
    currentPage = 1;
    maxKnownPage = null;
    currentResultPage = 1;
    maxResultPage = 1;
    resultRowsAll.length = 0;
    pageCache.clear();
    setPagerVisible(false);
    resetResultArea();
    resetSummaryFilter(true);
    setProgress('');
    abortFlag = false;
    setBusy(true);
    try {
      await runAllPages();
    } catch (e) {
      if (String(e && e.message || e) === 'aborted') setProgress('กำลังหยุด...');
      else { console.error('PDF check error:', e); setProgress(`ข้อผิดพลาด: ${e.message || e}`); alert(`ตรวจสอบ PDF ไม่สำเร็จ: ${e.message || e}`); }
    } finally { setBusy(false); }
  });

  prevBtn.addEventListener('click', () => { navigateResultPage(currentResultPage - 1); });
  nextBtn.addEventListener('click', () => { navigateResultPage(currentResultPage + 1); });
  if (prevBtnTop) prevBtnTop.addEventListener('click', () => { navigateResultPage(currentResultPage - 1); });
  if (nextBtnTop) nextBtnTop.addEventListener('click', () => { navigateResultPage(currentResultPage + 1); });
  if (filterAllEl && filterOkEl && filterErrEl) {
    const onFilterChange = () => applySummaryFilter();
    filterAllEl.addEventListener('change', onFilterChange);
    filterOkEl.addEventListener('change', onFilterChange);
    filterErrEl.addEventListener('change', onFilterChange);
  }
  stopBtn.addEventListener('click', () => { abortFlag = true; setProgress('กำลังหยุด...'); });

  setPagerVisible(false);
  resetSummaryFilter(true);
  syncPagerState();
})();
