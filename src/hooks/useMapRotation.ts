import { useState, useRef } from 'react';

interface UseMapRotationReturn {
  rotation: number;
  isSelected: boolean;
  mapContainerRef: React.RefObject<HTMLDivElement>;
  handleRotationChange: (value: number) => void;
  handleMapClick: (e: React.MouseEvent) => void;
}

export const useMapRotation = (): UseMapRotationReturn => {
  const [rotation, setRotation] = useState(0);
  const [isSelected, setIsSelected] = useState(false);
  const mapContainerRef = useRef<HTMLDivElement>(null);

  const handleRotationChange = (value: number) => {
    if (isSelected) {
      setRotation(value);
    }
  };

  const handleMapClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    setIsSelected(prev => !prev); // Toggle selection state
  };

  return {
    rotation,
    isSelected,
    mapContainerRef,
    handleRotationChange,
    handleMapClick,
  };
}; 