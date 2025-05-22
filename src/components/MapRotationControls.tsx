import React from 'react';
import { Slider, Typography } from 'antd';
import { RotateLeftOutlined, RotateRightOutlined } from '@ant-design/icons';

interface MapRotationControlsProps {
  rotation: number;
  isSelected: boolean;
  onRotationChange: (value: number) => void;
}

const MapRotationControls: React.FC<MapRotationControlsProps> = ({
  rotation,
  isSelected,
  onRotationChange,
}) => {
  return (
    <div className="space-y-4">
      <Typography.Text strong className="block text-gray-800">
        Map Rotation {isSelected ? '(Selected)' : '(Not Selected)'}
      </Typography.Text>
      <div className="flex items-center gap-2">
        <RotateLeftOutlined className="text-gray-600" />
        <Slider
          className="flex-1"
          min={-180}
          max={180}
          value={rotation}
          onChange={onRotationChange}
          disabled={!isSelected}
          marks={{
            '-180': '-180°',
            '-90': '-90°',
            0: '0°',
            90: '90°',
            180: '180°'
          }}
        />
        <RotateRightOutlined className="text-gray-600" />
      </div>
      <Typography.Text type="secondary" className="block text-sm">
        {isSelected ? 'Click anywhere outside the map to deselect' : 'Click the map to enable rotation'}
      </Typography.Text>
    </div>
  );
};

export default MapRotationControls; 