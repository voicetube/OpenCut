// 在瀏覽器 Console 中運行這個腳本來查看 caption 數據

// 方法 1: 直接從 window 對象獲取 Zustand store (如果有暴露)
console.log('=== Caption Debug Info ===');

// 方法 2: 查看 IndexedDB 中的數據
function viewIndexedDBData() {
  // 打開 IndexedDB
  const request = indexedDB.open('video-editor-timelines', 1);
  
  request.onsuccess = function(event) {
    const db = event.target.result;
    const transaction = db.transaction(['timelines'], 'readonly');
    const objectStore = transaction.objectStore('timelines');
    const getAllRequest = objectStore.getAll();
    
    getAllRequest.onsuccess = function() {
      const timelines = getAllRequest.result;
      console.log('📊 Timeline Data from IndexedDB:', timelines);
      
      // 找到所有 text elements
      timelines.forEach(timeline => {
        if (timeline.tracks) {
          timeline.tracks.forEach(track => {
            if (track.type === 'text' && track.elements) {
              track.elements.forEach(element => {
                if (element.type === 'text') {
                  console.log('📝 Text Caption Found:', {
                    trackId: track.id,
                    elementId: element.id,
                    content: element.content,
                    startTime: element.startTime,
                    duration: element.duration,
                    fontSize: element.fontSize,
                    color: element.color,
                    backgroundColor: element.backgroundColor,
                    opacity: element.opacity,
                    fontFamily: element.fontFamily,
                    fontWeight: element.fontWeight,
                    fontStyle: element.fontStyle,
                    textDecoration: element.textDecoration,
                    x: element.x,
                    y: element.y,
                    hidden: element.hidden
                  });
                }
              });
            }
          });
        }
      });
    };
  };
  
  request.onerror = function() {
    console.error('❌ Failed to open IndexedDB');
  };
}

// 執行查看函數
viewIndexedDBData();

// 方法 3: 監聽 Zustand store 變化 (需要在 React DevTools 中)
console.log('💡 Tips:');
console.log('1. 打開 React DevTools');
console.log('2. 選擇任何 component');
console.log('3. 在 Console 中運行: $r.props 或查看 React state');
console.log('4. 或使用 Application tab > IndexedDB > video-editor-timelines');