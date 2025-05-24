import React from 'react'
import {
  Menu,
  MousePointer,
  Crop,
  RotateCcw,
  Move,
  Undo2,
  Redo2,
  Settings,
  Maximize2,
  Minimize2,
} from "lucide-react"

type ToolType = "select" | "crop" | "rotate" | "move"

interface MapToolbarProps {
  activeTool: ToolType
  isSelected: boolean
  isCropMode: boolean
  canUndo: boolean
  isFullscreen: boolean
  leftPanelOpen: boolean
  rightPanelOpen: boolean
  onToolChange: (tool: ToolType) => void
  onUndo: () => void
  onToggleFullscreen: () => void
  onToggleLeftPanel: () => void
  onToggleRightPanel: () => void
}

const MapToolbar: React.FC<MapToolbarProps> = ({
  activeTool,
  isSelected,
  isCropMode,
  canUndo,
  isFullscreen,
  leftPanelOpen,
  rightPanelOpen,
  onToolChange,
  onUndo,
  onToggleFullscreen,
  onToggleLeftPanel,
  onToggleRightPanel,
}) => {
  return (
    <div className="absolute top-0 left-0 right-0 z-50 bg-white border-b border-gray-200 shadow-sm">
      <div className="flex items-center justify-between px-4 py-2">
        {/* Left section */}
        <div className="flex items-center space-x-4">
          <div className="flex items-center space-x-2">
            <button
              onClick={onToggleLeftPanel}
              className="p-2 rounded-lg hover:bg-gray-100 transition-colors"
            >
              <Menu className="w-5 h-5 text-gray-600" />
            </button>
            <h1 className="text-lg font-semibold text-gray-800">Map Editor</h1>
          </div>
        </div>

        {/* Center section - Tools */}
        <div className="flex items-center space-x-1 bg-gray-100 rounded-lg p-1">
          <button
            onClick={() => onToolChange("select")}
            className={`p-2 rounded-md transition-all ${
              activeTool === "select" ? "bg-white shadow-sm text-blue-600" : "text-gray-600 hover:bg-gray-200"
            }`}
            title="Select Tool"
          >
            <MousePointer className="w-4 h-4" />
          </button>
          <button
            onClick={() => onToolChange("crop")}
            disabled={!isSelected}
            className={`p-2 rounded-md transition-all ${
              activeTool === "crop"
                ? "bg-white shadow-sm text-blue-600"
                : isSelected
                  ? "text-gray-600 hover:bg-gray-200"
                  : "text-gray-400 cursor-not-allowed"
            }`}
            title="Crop Tool"
          >
            <Crop className="w-4 h-4" />
          </button>
          <button
            onClick={() => onToolChange("rotate")}
            disabled={!isSelected || isCropMode}
            className={`p-2 rounded-md transition-all ${
              activeTool === "rotate"
                ? "bg-white shadow-sm text-blue-600"
                : isSelected && !isCropMode
                  ? "text-gray-600 hover:bg-gray-200"
                  : "text-gray-400 cursor-not-allowed"
            }`}
            title="Rotate Tool"
          >
            <RotateCcw className="w-4 h-4" />
          </button>
          <button
            onClick={() => onToolChange("move")}
            className={`p-2 rounded-md transition-all ${
              activeTool === "move" ? "bg-white shadow-sm text-blue-600" : "text-gray-600 hover:bg-gray-200"
            }`}
            title="Move Tool"
          >
            <Move className="w-4 h-4" />
          </button>
        </div>

        {/* Right section */}
        <div className="flex items-center space-x-2">
          <button
            onClick={onUndo}
            disabled={!canUndo}
            className={`p-2 rounded-lg transition-all ${
              canUndo ? "text-gray-600 hover:bg-gray-100" : "text-gray-400 cursor-not-allowed"
            }`}
            title="Undo"
          >
            <Undo2 className="w-4 h-4" />
          </button>
          <button
            onClick={onToggleFullscreen}
            className="p-2 rounded-lg hover:bg-gray-100 transition-colors text-gray-600"
            title={isFullscreen ? "Exit Fullscreen" : "Enter Fullscreen"}
          >
            {isFullscreen ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
          </button>
          <button
            onClick={onToggleRightPanel}
            className="p-2 rounded-lg hover:bg-gray-100 transition-colors text-gray-600"
          >
            <Settings className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  )
}

export default MapToolbar 