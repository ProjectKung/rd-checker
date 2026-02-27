// Node/CommonJS shim for PDF.js when requiring `pdf.min.js` in tests/tools.
// The browser extension uses `pdf.worker.min.js` directly via `workerSrc`.
module.exports = require('./pdf.worker.min.js');
