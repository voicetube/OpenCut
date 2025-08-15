"use client";

import { useTimelineStore } from "@/stores/timeline-store";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";

export function CaptionDebug() {
  const { tracks, selectedElements } = useTimelineStore();
  const [showDebug, setShowDebug] = useState(false);

  if (!showDebug) {
    return (
      <Button 
        onClick={() => setShowDebug(true)}
        className="fixed bottom-6 right-6 z-50 bg-red-500 hover:bg-red-600 text-white"
        size="sm"
      >
        📊 Debug Captions
      </Button>
    );
  }

  // 獲取所有 text elements
  const textElements = tracks.flatMap(track => 
    track.elements
      .filter(element => element.type === 'text')
      .map(element => ({
        trackId: track.id,
        trackName: `${track.type} Track`,
        element
      }))
  );

  // 獲取當前選中的 text element
  const selectedTextElements = selectedElements
    .map(({ trackId, elementId }) => {
      const track = tracks.find(t => t.id === trackId);
      const element = track?.elements.find(e => e.id === elementId);
      if (element?.type === 'text') {
        return { trackId, element };
      }
      return null;
    })
    .filter(Boolean);

  return (
    <Card className="fixed top-16 right-6 z-50 p-4 max-w-md max-h-96 overflow-auto bg-gray-900 text-gray-200 shadow-lg border border-gray-700">
      <div className="flex justify-between items-center mb-4">
        <h3 className="font-bold">📊 Caption Debug Info</h3>
        <Button 
          onClick={() => setShowDebug(false)}
          variant="outline"
          size="sm"
        >
          ✕
        </Button>
      </div>

      <div className="space-y-4 text-xs">
        <div>
          <h4 className="font-semibold text-green-400">🎯 Selected Captions ({selectedTextElements.length})</h4>
          {selectedTextElements.map(({ trackId, element }, idx) => (
            <div key={idx} className="bg-green-900/30 border border-green-700 p-2 rounded mt-1">
              <div className="text-gray-300"><strong className="text-gray-200">Track:</strong> {trackId}</div>
              <div className="text-gray-300"><strong className="text-gray-200">Text:</strong> "{element.content}"</div>
              <div className="text-gray-300"><strong className="text-gray-200">Time:</strong> {element.startTime}s - {element.startTime + element.duration}s</div>
              <div className="text-gray-300"><strong className="text-gray-200">Font:</strong> {element.fontFamily}, {element.fontSize}px</div>
              <div className="text-gray-300"><strong className="text-gray-200">Color:</strong> {element.color}</div>
              <div className="text-gray-300"><strong className="text-gray-200">Background:</strong> {element.backgroundColor}</div>
              <div className="text-gray-300"><strong className="text-gray-200">Opacity:</strong> {Math.round(element.opacity * 100)}%</div>
              <div className="text-gray-300"><strong className="text-gray-200">Style:</strong> {element.fontWeight} {element.fontStyle} {element.textDecoration}</div>
              <div className="text-gray-300"><strong className="text-gray-200">Position:</strong> x:{element.x}, y:{element.y}</div>
              <div className="text-gray-300"><strong className="text-gray-200">Hidden:</strong> {element.hidden ? 'Yes' : 'No'}</div>
            </div>
          ))}
          {selectedTextElements.length === 0 && (
            <div className="text-gray-500 mt-1">No text elements selected</div>
          )}
        </div>

        <div>
          <h4 className="font-semibold text-blue-400">📝 All Captions ({textElements.length})</h4>
          {textElements.map(({ trackId, element }, idx) => (
            <div key={idx} className="bg-blue-900/30 border border-blue-700 p-2 rounded mt-1">
              <div className="text-gray-300"><strong className="text-gray-200">ID:</strong> {element.id}</div>
              <div className="text-gray-300"><strong className="text-gray-200">Track:</strong> {trackId}</div>
              <div className="text-gray-300"><strong className="text-gray-200">Text:</strong> "{element.content}"</div>
              <div className="text-gray-300"><strong className="text-gray-200">Time:</strong> {element.startTime}s ({element.duration}s)</div>
              <div className="text-gray-300"><strong className="text-gray-200">Font:</strong> {element.fontSize}px {element.fontFamily}</div>
              <div className="text-gray-300"><strong className="text-gray-200">Color:</strong> {element.color}</div>
            </div>
          ))}
          {textElements.length === 0 && (
            <div className="text-gray-500 mt-1">No captions found</div>
          )}
        </div>

        <div>
          <h4 className="font-semibold text-purple-400">💾 Export JSON</h4>
          <Button 
            onClick={() => {
              const data = {
                allCaptions: textElements,
                selectedCaptions: selectedTextElements,
                timestamp: new Date().toISOString()
              };
              console.log('📋 Caption Data:', data);
              navigator.clipboard.writeText(JSON.stringify(data, null, 2));
              alert('Caption data copied to clipboard and logged to console!');
            }}
            size="sm"
            className="w-full mt-1 bg-purple-600 hover:bg-purple-700 text-white"
          >
            📋 Copy to Clipboard
          </Button>
        </div>
      </div>
    </Card>
  );
}