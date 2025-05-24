"use client"

import React, { useCallback } from "react"
import { Slider, Typography, Input, Space } from "antd"
import { RotateLeftOutlined, RotateRightOutlined } from "@ant-design/icons"

interface MapRotationControlsProps {
  rotation: number
  isSelected: boolean
  onRotationChange: (value: number) => void
  disabled?: boolean
}

const MapRotationControls = React.memo<MapRotationControlsProps>(({ rotation, isSelected, onRotationChange }) => {
  // Optimize event handler with useCallback
  const handleAngleInput = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const value = e.target.value
      // Allow empty input for better UX
      if (value === "") {
        onRotationChange(0)
        return
      }
      const numValue = Number.parseFloat(value)
      if (!isNaN(numValue) && numValue >= -180 && numValue <= 180) {
        onRotationChange(numValue)
      }
    },
    [onRotationChange],
  )

  const handleQuickRotate = useCallback(
    (degrees: number) => {
      onRotationChange(rotation + degrees)
    },
    [rotation, onRotationChange],
  )

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between mb-2">
        <Typography.Text strong className="block text-gray-800 text-sm">
          Rotation
        </Typography.Text>
        <div className="flex items-center gap-1">
          <Input
            type="number"
            value={rotation}
            onChange={handleAngleInput}
            disabled={!isSelected}
            className="w-16 text-xs"
            suffix="°"
            min={-180}
            max={180}
            size="small"
          />
        </div>
      </div>

      {/* Quick rotation buttons */}
      <div className="flex items-center justify-center space-x-2 mb-3">
        <button
          onClick={() => handleQuickRotate(-90)}
          disabled={!isSelected}
          className={`p-1 rounded-lg transition-all ${
            isSelected ? "bg-gray-100 hover:bg-gray-200 text-gray-700" : "bg-gray-50 text-gray-400 cursor-not-allowed"
          }`}
          title="Rotate -90°"
        >
          <RotateLeftOutlined className="text-sm" />
        </button>
        <button
          onClick={() => handleQuickRotate(90)}
          disabled={!isSelected}
          className={`p-1 rounded-lg transition-all ${
            isSelected ? "bg-gray-100 hover:bg-gray-200 text-gray-700" : "bg-gray-50 text-gray-400 cursor-not-allowed"
          }`}
          title="Rotate +90°"
        >
          <RotateRightOutlined className="text-sm" />
        </button>
      </div>

      <Space direction="vertical" className="w-full">
        <div className="flex items-center gap-2">
          <RotateLeftOutlined style={{ color: isSelected ? "#374151" : "#9CA3AF" }} />
          <Slider
            className="flex-1"
            min={-180}
            max={180}
            value={rotation}
            onChange={onRotationChange}
            disabled={!isSelected}
            step={1}
          />
          <RotateRightOutlined style={{ color: isSelected ? "#374151" : "#9CA3AF" }} />
        </div>
      </Space>
    </div>
  )
})

// Add display name for better debugging
MapRotationControls.displayName = "MapRotationControls"

export default MapRotationControls
