/**
 * PDF Text Extractor - Using PDF.js for fast, reliable extraction
 */

class PDFExtractor {
  static pauseTick() {
    return new Promise((resolve) => setTimeout(resolve, 0));
  }

  static readFile(file) {
    if (file instanceof ArrayBuffer) return Promise.resolve(file);
    if (ArrayBuffer.isView(file)) {
      const view = file;
      return Promise.resolve(view.buffer.slice(view.byteOffset, view.byteOffset + view.byteLength));
    }
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (e) => resolve(e.target.result);
      reader.onerror = reject;
      reader.readAsArrayBuffer(file);
    });
  }

  static async extractText(file, options = {}) {
    let loadingTask = null;
    let pdf = null;
    try {
      const maxPages = Number.isFinite(options.maxPages) && options.maxPages > 0
        ? Math.floor(options.maxPages)
        : Number.POSITIVE_INFINITY;
      const maxChars = Number.isFinite(options.maxChars) && options.maxChars > 0
        ? Math.floor(options.maxChars)
        : Number.POSITIVE_INFINITY;
      const yieldEveryPages = Number.isFinite(options.yieldEveryPages) && options.yieldEveryPages > 0
        ? Math.floor(options.yieldEveryPages)
        : 0;

      // Set up PDF.js worker
      pdfjsLib.GlobalWorkerOptions.workerSrc = chrome.runtime.getURL('pdf.worker.min.js');
      
      const arrayBuffer = await this.readFile(file);
      loadingTask = pdfjsLib.getDocument({
        data: arrayBuffer,
        stopAtErrors: true,
        isEvalSupported: false,
        useWorkerFetch: false
      });
      pdf = await loadingTask.promise;
      
      let fullText = '';
      const totalPages = Math.min(pdf.numPages, maxPages);
      
      // Extract text from all pages
      for (let pageNum = 1; pageNum <= totalPages; pageNum++) {
        const page = await pdf.getPage(pageNum);
        try {
          const textContent = await page.getTextContent({
            normalizeWhitespace: true
          });
          const pageText = textContent.items.map(item => item.str).join(' ');
          fullText += pageText + '\n';
        } finally {
          if (typeof page.cleanup === 'function') {
            try { page.cleanup(); } catch (_) {}
          }
        }

        if (fullText.length >= maxChars) {
          fullText = fullText.slice(0, maxChars);
          break;
        }
        if (yieldEveryPages > 0 && pageNum % yieldEveryPages === 0) {
          await this.pauseTick();
        }
      }
      
      return fullText;
    } catch (error) {
      console.error('PDF extraction error:', error);
      throw error;
    } finally {
      if (pdf && typeof pdf.cleanup === 'function') {
        try { pdf.cleanup(); } catch (_) {}
      }
      if (pdf && typeof pdf.destroy === 'function') {
        try { await pdf.destroy(); } catch (_) {}
      }
      if (loadingTask && typeof loadingTask.destroy === 'function') {
        try { loadingTask.destroy(); } catch (_) {}
      }
      await this.pauseTick();
    }
  }
}
