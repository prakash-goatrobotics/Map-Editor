import React, { useEffect, useRef, useMemo, useState } from 'react';
import { useThree } from '@react-three/fiber';
import * as THREE from 'three';
import type { ThreeEvent } from '@react-three/fiber';

// Assuming MapData is defined elsewhere or can be defined here
// Based on PGMMapLoader.tsx:
interface MapData {
  data: Uint8ClampedArray;
  width: number;
  height: number;
}

interface CroppedImageData extends MapData {
  id: string;
  position: [number, number, number];
}

interface MapTexturePlaneProps {
  mapData: CroppedImageData; // Only for cropped images
  position?: [number, number, number];
  onPointerDown?: (event: ThreeEvent<PointerEvent>) => void; // Pointer down for this mesh
}

// Define MapTexturePlane here since it's used within CroppedImageDragger to render cropped images
const MapTexturePlane: React.FC<MapTexturePlaneProps> = ({ mapData, position, onPointerDown }) => {
  const texture = useMemo(() => {
    const { width, height, data } = mapData;
    const textureData = new THREE.DataTexture(data, width, height, THREE.RGBAFormat);
    textureData.needsUpdate = true;
    return textureData;
  }, [mapData]);

  const meshRef = useRef<THREE.Mesh>(null);

  // Attach the image id and position to the mesh's userData
  useEffect(() => {
    if (meshRef.current) {
      meshRef.current.userData.id = mapData.id;
      meshRef.current.userData.position = mapData.position;
    }
  }, [mapData.id, mapData.position]);


  return (
    <mesh 
      ref={meshRef}
      position={position || [0, 0, 0]}
      onPointerDown={onPointerDown}
    >
      <planeGeometry args={[mapData.width, mapData.height]} />
      <meshBasicMaterial map={texture} toneMapped={false} />
    </mesh>
  );
};

interface CroppedImageDraggerProps {
  croppedImages: CroppedImageData[];
  setCroppedImages: React.Dispatch<React.SetStateAction<CroppedImageData[]>>;
  isCropMode: boolean;
  // Pass dragging state up to parent for OrbitControls
  draggingImageId: string | null; // Accept draggingImageId as prop
  setDraggingImageId: React.Dispatch<React.SetStateAction<string | null>>; 
}

const CroppedImageDragger: React.FC<CroppedImageDraggerProps> = ({
  croppedImages,
  setCroppedImages,
  isCropMode,
  draggingImageId, // Destructure from props
  setDraggingImageId, 
}) => {
  const { camera, gl } = useThree();
  // Internal state for dragging, kept in sync with parent via prop
  const [draggingImageIdInternal, setDraggingImageIdInternal] = useState<string | null>(draggingImageId);
  // Offset from image position to click point (in world coordinates)
  const dragOffsetRef = useRef<THREE.Vector3>(new THREE.Vector3()); 

  const raycaster = useMemo(() => new THREE.Raycaster(), []);
  const pointer = useMemo(() => new THREE.Vector2(), []);
  // Plane at z=0 where dragging happens
  const dragPlane = useMemo(() => new THREE.Plane(new THREE.Vector3(0, 0, 1), 0), []);
  // Intersection point on the drag plane
  const intersection = useMemo(() => new THREE.Vector3(), []); 

  // Keep internal dragging state in sync with parent prop
  useEffect(() => {
    setDraggingImageIdInternal(draggingImageId);
  }, [draggingImageId]);

  // Handle pointer down on a cropped image to initiate drag
  const onImagePointerDown = (event: ThreeEvent<PointerEvent>) => {
    if (isCropMode) return; // Disable dragging in crop mode
    
    const clickedImage = event.object.userData as CroppedImageData; // Get image data from mesh userData
    const id = clickedImage.id;
    if (!id) return;

    setDraggingImageIdInternal(id); 
    setDraggingImageId(id); // Update parent state to disable OrbitControls

    event.stopPropagation(); // Stop event from bubbling up
    (event.nativeEvent.target as any).setPointerCapture(event.pointerId); // Capture pointer using native event

    // Calculate and store the offset from the image's position to the click point (event.point)
    // This offset is in world coordinates.
    dragOffsetRef.current.copy(event.point).sub(new THREE.Vector3(...clickedImage.position));
  };

  // Handle pointer move while dragging on the canvas (using native DOM event)
  const onCanvasPointerMove = (event: PointerEvent) => {
    if (draggingImageIdInternal && isCropMode === false) { 
      // Use clientX/Y from the native DOM event to get screen coordinates for raycasting
      pointer.x = (event.clientX / gl.domElement.clientWidth) * 2 - 1;
      pointer.y = -(event.clientY / gl.domElement.clientHeight) * 2 + 1;
      raycaster.setFromCamera(pointer, camera);

      // Find the intersection point on the drag plane based on the current pointer position
      if (raycaster.ray.intersectPlane(dragPlane, intersection)) {
        setCroppedImages(prev => 
          prev.map(img => {
            if (img.id === draggingImageIdInternal) {
              // Calculate the new image position: current pointer position on plane - stored offset
              const newPosition = intersection.clone().sub(dragOffsetRef.current);
              return { ...img, position: [newPosition.x, newPosition.y, img.position[2]] };
            }
            return img;
          })
        );
      }
    }
  };

  // Handle pointer up on the canvas to stop dragging
  const onCanvasPointerUp = (event: PointerEvent) => {
    if (draggingImageIdInternal) {
       (event.target as any).releasePointerCapture(event.pointerId);
       setDraggingImageIdInternal(null); 
       setDraggingImageId(null); // Update parent state
    }
  };

  // Add global event listeners for dragging
  useEffect(() => {
    const canvas = gl.domElement;
    canvas.addEventListener('pointermove', onCanvasPointerMove);
    canvas.addEventListener('pointerup', onCanvasPointerUp);
    return () => {
      canvas.removeEventListener('pointermove', onCanvasPointerMove);
      canvas.removeEventListener('pointerup', onCanvasPointerUp);
    };
  }, [gl, draggingImageIdInternal, isCropMode, setCroppedImages, setDraggingImageId, dragOffsetRef]); // Added dragOffsetRef to deps

   // Render the cropped images with the pointer down handler attached
  return (
    <>
      {croppedImages.map((croppedImage) => (
        <MapTexturePlane 
          key={croppedImage.id}
          mapData={croppedImage}
          position={croppedImage.position}
          onPointerDown={onImagePointerDown} // Attach handler here
        />
      ))}
    </>
  );
};

export default CroppedImageDragger; 