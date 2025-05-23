import React from 'react';
import { Slider, Typography, Input, Space } from 'antd';
import { RotateLeftOutlined, RotateRightOutlined } from '@ant-design/icons';

interface MapRotationControlsProps {
  rotation: number;
  isSelected: boolean;
  onRotationChange: (value: number) => void;
  disabled?: boolean;
}

const MapRotationControls: React.FC<MapRotationControlsProps> = ({
  rotation,
  isSelected,
  onRotationChange,
}) => {
  const handleAngleInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    // Allow empty input for better UX
    if (value === '') {
      onRotationChange(0);
      return;
    }
    const numValue = parseFloat(value);
    if (!isNaN(numValue) && numValue >= -180 && numValue <= 180) {
      onRotationChange(numValue);
    }
  };

  return (
    <div className="space-y-4">
      <Typography.Text strong className="block text-gray-800">
        Map Rotation {isSelected ? '(Selected)' : '(Not Selected)'}
      </Typography.Text>
      
      <Space direction="vertical" className="w-full">
        <div className="flex items-center gap-2">
          <RotateLeftOutlined style={{ color: 'black', fill: 'black' }} />
          <Slider
            className="flex-1"
            min={-180}
            max={180}
            value={rotation}
            onChange={onRotationChange}
            disabled={!isSelected}
            marks={{}}
          />
          <RotateRightOutlined style={{ color: 'black', fill: 'black' }} />
        </div>

        <div className="flex items-center gap-1 w-30">
          <Typography.Text className="text-gray-600 w-20">Angle:</Typography.Text>
          <Input
            type="number"
            value={rotation}
            onChange={handleAngleInput}
            disabled={!isSelected}
            className="w-20"
            suffix="°"
            min={-180}
            max={180}
          />
        </div>
      </Space>

      <Typography.Text type="secondary" className="block text-sm">
        {isSelected ? 'Click the map again to deselect' : 'Click the map to enable rotation'}
      </Typography.Text>
    </div>
  );
};

export default MapRotationControls; 