import React, { useRef, useState, useEffect } from 'react';
import { useThree, useFrame } from '@react-three/fiber';
import * as THREE from 'three';

// const mouse = new THREE.Vector2(
//     ((event.clientX - rect.left) / rect.width) * 2 - 1,
//     -((event.clientY - rect.top) / rect.height) * 2 + 1
//       );

interface CropToolProps {
  // Target mesh to crop from
  targetMesh?: THREE.Mesh | null;
  // Optional dimensions if not using targetMesh
  dimensions?: {
    width: number;
    height: number;
  };
  // Callback when crop is complete
  onCropComplete: (data: Uint8ClampedArray, width: number, height: number) => void;
  // Whether the tool is enabled
  enabled: boolean;
  // Optional selection plane color
  selectionColor?: string;
  // Optional selection opacity
  selectionOpacity?: number;
  // Optional crop rectangle color
  cropRectColor?: string;
  // Optional crop rectangle opacity
  cropRectOpacity?: number;
}

const CropTool: React.FC<CropToolProps> = ({ 
  targetMesh,
  dimensions,
  onCropComplete, 
  enabled,
  selectionColor = "orange",
  selectionOpacity = 0.15,
  cropRectColor = "blue",
  cropRectOpacity = 0.3
}) => {
  const { camera, gl, size, scene } = useThree();
  const [start, setStart] = useState<THREE.Vector2 | null>(null);
  const [end, setEnd] = useState<THREE.Vector2 | null>(null);
  const [isSelecting, setIsSelecting] = useState(false);
  const selectionPlaneRef = useRef<THREE.Mesh>(null);
  const rectMeshRef = useRef<THREE.Mesh>(null);
  const renderTargetRef = useRef<THREE.WebGLRenderTarget | null>(null);
  const tempSceneRef = useRef<THREE.Scene | null>(null);

  // Cleanup function for render target and temporary scene
  const cleanupResources = () => {
    if (renderTargetRef.current) {
      renderTargetRef.current.dispose();
      renderTargetRef.current = null;
    }
    if (tempSceneRef.current) {
      tempSceneRef.current.clear();
      tempSceneRef.current = null;
    }
  };

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      cleanupResources();
    };
  }, []);

  // Get dimensions from either targetMesh or provided dimensions
  const getDimensions = () => {
    if (targetMesh) {
      const geometry = targetMesh.geometry as THREE.PlaneGeometry;
      return {
        width: geometry.parameters.width,
        height: geometry.parameters.height
      };
    }
    if (!dimensions) {
      console.error('CropTool: Either targetMesh or dimensions must be provided');
      return { width: 0, height: 0 };
    }
    return dimensions;
  };

  const { width: mapWidth, height: mapHeight } = getDimensions();

  useEffect(() => {
    if (!enabled) {
      setStart(null);
      setEnd(null);
      setIsSelecting(false);
      cleanupResources();
    }
  }, [enabled]);

  const toWorldCoords = (clientX: number, clientY: number): THREE.Vector2 => {
    const rect = gl.domElement.getBoundingClientRect();
    const canvasX = clientX - rect.left;
    const canvasY = clientY - rect.top;
    const ndcX = (canvasX / rect.width) * 2 - 1;
    const ndcY = -(canvasY / rect.height) * 2 + 1;
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

    // Cleanup any existing resources
    cleanupResources();

    // Create new render target
    renderTargetRef.current = new THREE.WebGLRenderTarget(cropWidth, cropHeight);
    const orthoCam = new THREE.OrthographicCamera(minX, maxX, maxY, minY, 0.1, 10);
    orthoCam.position.z = 1;

    // Create new temporary scene
    tempSceneRef.current = new THREE.Scene();
    
    // If we have a targetMesh, add it to the temp scene
    if (targetMesh) {
      tempSceneRef.current.add(targetMesh.clone());
    } else {
      // If no targetMesh, we need to render the main scene
      scene.children.forEach(child => {
        if (child !== selectionPlaneRef.current && child !== rectMeshRef.current) {
          tempSceneRef.current?.add(child.clone());
        }
      });
    }

    if (!renderTargetRef.current || !tempSceneRef.current) {
      console.error('Failed to create render resources');
      return;
    }

    gl.setRenderTarget(renderTargetRef.current);
    gl.render(tempSceneRef.current, orthoCam);
    const pixels = new Uint8Array(cropWidth * cropHeight * 4);
    gl.readRenderTargetPixels(renderTargetRef.current, 0, 0, cropWidth, cropHeight, pixels);
    gl.setRenderTarget(null);

    const clampedPixels = new Uint8ClampedArray(pixels);
    onCropComplete(clampedPixels, cropWidth, cropHeight);
    
    // Cleanup after crop is complete
    cleanupResources();
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
        <meshBasicMaterial color={selectionColor} opacity={selectionOpacity} transparent />
      </mesh>

      {isSelecting && start && end && (
        <mesh ref={rectMeshRef}>
          <planeGeometry args={[1, 1]} />
          <meshBasicMaterial 
            color={cropRectColor}
            opacity={cropRectOpacity}
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
