import React, { useRef, useState, useEffect } from 'react';
import { useThree, useFrame } from '@react-three/fiber';
import * as THREE from 'three';

// const mouse = new THREE.Vector2(
//     ((event.clientX - rect.left) / rect.width) * 2 - 1,
//     -((event.clientY - rect.top) / rect.height) * 2 + 1
//       );

interface CropToolProps {
  mapWidth: number;
  mapHeight: number;
  onCropComplete: (data: Uint8ClampedArray, width: number, height: number) => void;
  enabled: boolean;
}

const CropTool: React.FC<CropToolProps> = ({ mapWidth, mapHeight, onCropComplete, enabled }) => {
  const { camera, gl, size, scene } = useThree();
  const [start, setStart] = useState<THREE.Vector2 | null>(null);
  const [end, setEnd] = useState<THREE.Vector2 | null>(null);
  const [isSelecting, setIsSelecting] = useState(false);
  const selectionPlaneRef = useRef<THREE.Mesh>(null);
  const rectMeshRef = useRef<THREE.Mesh>(null);

  useEffect(() => {
    if (!enabled) {
      setStart(null);
      setEnd(null);
      setIsSelecting(false);
    }
  }, [enabled]);

  const toWorldCoords = (clientX: number, clientY: number): THREE.Vector2 => {
    const ndcX = (clientX / size.width) * 2 - 1;
    const ndcY = -(clientY / size.height) * 2 + 1;
    const vec = new THREE.Vector3(ndcX, ndcY, 0);
    vec.unproject(camera);
    return new THREE.Vector2(vec.x, vec.y);
  };

  const onPointerDown = (e: React.PointerEvent) => {
    if (!enabled) return;
    e.stopPropagation();
    const point = toWorldCoords(e.clientX, e.clientY);
    setStart(point);
    setEnd(point);
    setIsSelecting(true);
  };

  const onPointerMove = (e: React.PointerEvent) => {
    if (!enabled || !isSelecting || !start) return;
    e.stopPropagation();
    const point = toWorldCoords(e.clientX, e.clientY);
    setEnd(point);
  };

  const onPointerUp = (e: React.PointerEvent) => {
    if (!enabled || !isSelecting || !start || !end) return;
    e.stopPropagation();
    setIsSelecting(false);

    const minX = Math.max(Math.min(start.x, end.x), -mapWidth / 2);
    const maxX = Math.min(Math.max(start.x, end.x), mapWidth / 2);
    const minY = Math.max(Math.min(start.y, end.y), -mapHeight / 2);
    const maxY = Math.min(Math.max(start.y, end.y), mapHeight / 2);

    const cropWidth = Math.floor(maxX - minX);
    const cropHeight = Math.floor(maxY - minY);

    if (cropWidth <= 0 || cropHeight <= 0) {
      setStart(null);
      setEnd(null);
      return;
    }

    const renderTarget = new THREE.WebGLRenderTarget(cropWidth, cropHeight);
    const orthoCam = new THREE.OrthographicCamera(minX, maxX, maxY, minY, 0.1, 10);
    orthoCam.position.z = 1;

    gl.setRenderTarget(renderTarget);
    gl.render(scene, orthoCam);
    const pixels = new Uint8Array(cropWidth * cropHeight * 4);
    gl.readRenderTargetPixels(renderTarget, 0, 0, cropWidth, cropHeight, pixels);
    gl.setRenderTarget(null);

    const clampedPixels = new Uint8ClampedArray(pixels);

    onCropComplete(clampedPixels, cropWidth, cropHeight);
    setStart(null);
    setEnd(null);
  };

  useFrame(() => {
    if (rectMeshRef.current && start && end && isSelecting) {
      const width = Math.abs(end.x - start.x);
      const height = Math.abs(end.y - start.y);
      const centerX = (start.x + end.x) / 2;
      const centerY = (start.y + end.y) / 2;
      rectMeshRef.current.scale.set(width, height, 1);
      rectMeshRef.current.position.set(centerX, centerY, 0.2);
    }
    if (selectionPlaneRef.current) {
      selectionPlaneRef.current.scale.set(mapWidth, mapHeight, 1);
      selectionPlaneRef.current.position.set(0, 0, 0.1);
    }
  });

  return (
    <>
      <mesh
        ref={selectionPlaneRef}
        visible={true}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
      >
        <planeGeometry args={[1, 1]} />
        <meshBasicMaterial color="orange" opacity={0.15} transparent />
      </mesh>

      {isSelecting && start && end && (
        <mesh ref={rectMeshRef}>
          <planeGeometry args={[1, 1]} />
          <meshBasicMaterial 
            color="blue" 
            opacity={0.3} 
            transparent 
            side={THREE.DoubleSide}
            depthTest={false}
          />
        </mesh>
      )}
    </>
  );
};

export default CropTool;
