// Background Service Worker
chrome.runtime.onInstalled.addListener(() => {
  console.log('RD Checker extension installed');
});

// เปิดหน้าต่าง popup แยก เมื่อคลิกที่ไอคอนส่วนขยาย
chrome.action.onClicked.addListener(() => {
  chrome.windows.create({
    url: chrome.runtime.getURL('popup.html'),
    type: 'popup',
    width: 520,
    height: 720
  });
});

// Listen for messages from content script (เผื่อใช้ต่อ)
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'extractWebData') {
    // Handle web data extraction
    sendResponse({ status: 'received' });
  }
});
