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

  return (
    <div className="flex-col space-y-4">
      <div className="flex items-center justify-between mb-2">
        <Typography.Text strong className="block text-gray-800">
          Map Rotation
        </Typography.Text>
        <div className="flex items-center gap-1 whitespace-nowrap">
          <Typography.Text className="text-gray-600">Angle:</Typography.Text>
          <Input
            type="number"
            value={rotation}
            onChange={handleAngleInput}
            disabled={!isSelected}
            className="w-14"
            suffix="°"
            min={-180}
            max={180}
          />
        </div>
      </div>
      <Space direction="vertical" className="w-full">
        <div className="flex items-center gap-2">
          <RotateLeftOutlined style={{ color: "black", fill: "black" }} />
          <Slider
            className="flex-1"
            min={-180}
            max={180}
            value={rotation}
            onChange={onRotationChange} // Direct use of onRotationChange is fine for Slider
            disabled={!isSelected}
            marks={{}}
          />
          <RotateRightOutlined style={{ color: "black", fill: "black" }} />
        </div>
      </Space>
      {/* <Typography.Text type="secondary" className="block text-sm">
        {isSelected ? "Click the map again to deselect" : "Click the map to enable rotation"}
      </Typography.Text> */}
    </div>
  )
})

// Add display name for better debugging
MapRotationControls.displayName = "MapRotationControls"

export default MapRotationControls
