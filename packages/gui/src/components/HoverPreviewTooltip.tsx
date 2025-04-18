import React from 'react';

interface HoverPreviewTooltipProps {
  isVisible: boolean;
  content: React.ReactNode; // Allow rendering formatted content
  position: { x: number; y: number } | null;
}

// Define a small offset for the tooltip position
const TOOLTIP_OFFSET_X = 30;
const TOOLTIP_OFFSET_Y = 0;

export function HoverPreviewTooltip({
  isVisible,
  content,
  position
}: HoverPreviewTooltipProps) {
  // If not visible or no position, render nothing
  if (!isVisible || !position) {
    return null;
  }

  // Calculate the position with offset
  const style: React.CSSProperties = {
    position: 'fixed', // Use fixed positioning relative to viewport
    top: `${position.y + TOOLTIP_OFFSET_Y}px`,
    left: `${position.x + TOOLTIP_OFFSET_X}px`,
    zIndex: 100, // Ensure it's above other elements like React Flow controls
    pointerEvents: 'none' // Prevent tooltip from interfering with mouse events
  };

  return (
    <div
      className="bg-terminal-bg border border-terminal-border rounded-md shadow-lg p-3 max-w-md"
      style={style}
    >
      {content}
    </div>
  );
}
