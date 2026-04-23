// Quick dev utility to reproduce GUI parsing against a local PDF.
// Usage (PowerShell): `node dev_check_pdf.js "C:\\path\\file.pdf"`
const fs = require('fs');
const path = process.argv[2];
if (!path) {
  console.error('Missing PDF path arg');
  process.exit(2);
}

const pdfjsLib = require('./pdf.min.js');

function extractFunctionSource(code, name) {
  const needle = `function ${name}(`;
  const start = code.indexOf(needle);
  if (start === -1) throw new Error(`Function not found: ${name}`);
  // Find the opening brace of the function body.
  const braceStart = code.indexOf('{', start);
  if (braceStart === -1) throw new Error(`Missing body for: ${name}`);
  let depth = 0;
  for (let i = braceStart; i < code.length; i++) {
    const ch = code[i];
    if (ch === '{') depth++;
    else if (ch === '}') {
      depth--;
      if (depth === 0) {
        return code.slice(start, i + 1);
      }
    }
  }
  throw new Error(`Unclosed braces for: ${name}`);
}

async function extractPdfText(pdfPath, maxChars = 900000) {
  const data = new Uint8Array(fs.readFileSync(pdfPath));
  const pdf = await pdfjsLib.getDocument({ data }).promise;
  let out = '';
  for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
    const page = await pdf.getPage(pageNum);
    const tc = await page.getTextContent();
    out += tc.items.map((it) => it.str).join(' ') + '\n';
    if (out.length >= maxChars) return out.slice(0, maxChars);
  }
  return out;
}

async function main() {
  const pdfText = await extractPdfText(path, 900000);
  const popupCode = fs.readFileSync('./popup.js', 'utf8');
  const src = [
    "const INTERFACE_COUNTERS_OK_MESSAGE = 'ปกติ (ทั้งหมด --)';",
    extractFunctionSource(popupCode, 'normalizeTextForLineScan'),
    extractFunctionSource(popupCode, 'checkInterfaceCountersValues'),
  ].join('\n\n');

  const vm = require('vm');
  const ctx = {};
  vm.runInNewContext(src, ctx);
  const res = ctx.checkInterfaceCountersValues(pdfText);

  console.log('found:', res.found, 'ok:', res.ok);
  console.log('message:', res.message);
  const lines = Array.isArray(res.problemLines) ? res.problemLines : [];
  console.log('problemLines:', lines.length);
  console.log('first20:');
  for (const [i, pl] of lines.slice(0, 20).entries()) {
    if (typeof pl === 'string') {
      console.log(`[${i + 1}]`, pl);
    } else {
      console.log(`[${i + 1}]`, pl.line, '=>', (pl.anomalies || []).join(', '));
    }
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

