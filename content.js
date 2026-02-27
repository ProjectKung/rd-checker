// Content script for website configuration page
// Extracts data from the PHP configuration page

function extractPageData() {
  const pageText = document.body.innerText;
  const pageHtml = document.body.innerHTML;
  const fullText = pageText + '\n\n=== HTML ===\n' + pageHtml;
  
  console.log('Content script - Page text length:', pageText.length);
  console.log('Content script - Page HTML length:', pageHtml.length);
  console.log('Content script - First 500 chars:', pageText.substring(0, 500));
  
  // Extract timestamps - look for HH:MM:SS format
  const timestamps = fullText.match(/(\d{2}):(\d{2}):(\d{2})/g) || [];
  console.log('Timestamps found:', timestamps);
  
  // Extract clock data with timezone
  const clockData = fullText.match(/(\d{2}):(\d{2}):(\d{2})\.\d+\s+[\+\-]\d{2}/g) || [];
  console.log('Clock data found:', clockData);
  
  // Extract configuration info - software version, model, serial
  const configMatch = fullText.match(/(show clock|Leaf-DC|switch model|FLM\d+|Software Version|16\.0\([0-9a-z]+\))/gi) || [];
  console.log('Config matches found:', configMatch);
  
  return {
    timestamp: timestamps[timestamps.length - 1] || null,
    clockData: clockData[clockData.length - 1] || null,
    configInfo: configMatch.join(', '),
    pageLength: pageText.length,
    timestamps: timestamps,
    clockDatas: clockData,
    html: fullText.substring(0, 5000),
    success: true
  };
}

// Listen for messages from popup
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  console.log('Content script received message:', request);
  
  if (request.action === 'extractData') {
    const data = extractPageData();
    console.log('Content script sending response:', data);
    sendResponse(data);
    
    // Also send message to popup if it's listening
    chrome.runtime.sendMessage({
      action: 'pageDataReady',
      data: data
    }).catch(() => {
      console.log('Popup not listening to pageDataReady');
    });
  }
});

console.log('Content script loaded');
