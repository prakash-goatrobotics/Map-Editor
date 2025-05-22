import { useState, useRef, useEffect } from 'react';

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
    setIsSelected(true);
  };

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (mapContainerRef.current && !mapContainerRef.current.contains(event.target as Node)) {
        setIsSelected(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, []);

  return {
    rotation,
    isSelected,
    mapContainerRef,
    handleRotationChange,
    handleMapClick,
  };
}; 