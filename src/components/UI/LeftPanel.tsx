import React from 'react'
import { Save, X } from 'lucide-react'
import { Slider } from 'antd'
import MapRotationControls from '../MapRotationControls'

interface LeftPanelProps {
  isSelected: boolean
  isCropMode: boolean
  activeTool: string
  rotation: number
  baseCanvasZoom: number
  onSaveCrop: () => void
  onCancelCrop: () => void
  onRotationChange: (rotation: number) => void
  onZoomChange: (zoom: number) => void
}

const LeftPanel: React.FC<LeftPanelProps> = ({
  isSelected,
  isCropMode,
  activeTool,
  rotation,
  baseCanvasZoom,
  onSaveCrop,
  onCancelCrop,
  onRotationChange,
  onZoomChange,
}) => {
  return (
    <div className="w-64 mt-20 ml-3 mb-5 mr-3 rounded-lg bg-white border-r border-gray-200 shadow-lg mt-14 flex flex-col">
      <div className="p-4 border-b border-gray-100">
        {/* Tool Status */}
        {!isSelected && (
          <div className="p-3 bg-yellow-50 border border-yellow-200 rounded-lg mb-4">
            <p className="text-xs text-yellow-800">Click on the map to select it and enable tools</p>
          </div>
        )}

        {/* Crop Tool Section */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            {isCropMode && <span className="text-xs bg-blue-100 text-blue-800 px-2 py-1 rounded-full">Active</span>}
          </div>

          {isCropMode && (
            <div className="flex space-x-2">
              <button
                onClick={onSaveCrop}
                className="flex-1 px-3 py-2 text-sm bg-green-50 text-green-700 border border-green-200 rounded-lg hover:bg-green-100 transition-all"
              >
                <div className="flex items-center justify-center space-x-1">
                  <Save className="w-4 h-4" />
                  <span>Save</span>
                </div>
              </button>
              <button
                onClick={onCancelCrop}
                className="flex-1 px-3 py-2 text-sm bg-gray-100 text-gray-700 border border-gray-200 rounded-lg hover:bg-gray-200 transition-all"
              >
                <div className="flex items-center justify-center space-x-1">
                  <X className="w-4 h-4" />
                  <span>Cancel</span>
                </div>
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Rotation Controls */}
      {activeTool === "rotate" && (
        <div className="space-y-3 p-3">
          <MapRotationControls
            rotation={rotation}
            isSelected={isSelected && !isCropMode}
            onRotationChange={onRotationChange}
          />
          {isCropMode && <p className="text-xs text-gray-500 italic">Rotation is disabled during cropping</p>}
        </div>
      )}

      {/* Canvas Controls */}
      <div className="p-4 mt-auto">
        <h3 className="text-sm font-semibold text-gray-800 mb-3">Canvas - Zoom</h3>
        <div className="space-y-3">
          <div className="flex items-center space-x-2">
            <Slider
              min={30}
              max={100}
              step={10}
              value={Math.round(baseCanvasZoom * 100)}
              onChange={(value) => onZoomChange(value / 100)}
              style={{ flex: 1, margin: '0 10px' }}
              tooltip={{ formatter: (value) => `${value}%` }}
            />
          </div>
        </div>
      </div>
    </div>
  )
}

export default LeftPanel 