import React, { useRef, useState, useEffect, useImperativeHandle, forwardRef } from 'react';
import { useThree, useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import type { MutableRefObject } from 'react';

const HANDLE_RADIUS = 6; // in world units, adjust as needed
const HANDLE_COLOR = 'white';
const BORDER_COLOR = 'black';

// const mouse = new THREE.Vector2(
//     ((event.clientX - rect.left) / rect.width) * 2 - 1,
//     -((event.clientY - rect.top) / rect.height) * 2 + 1
//       );

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

const CropTool = forwardRef<unknown, CropToolProps>((props, ref) => {
  const {
    targetMesh,
    dimensions,
    onCropComplete,
    enabled,
    selectionColor = "orange",
    selectionOpacity = 0.15,
    cropRectColor = BORDER_COLOR,
    cropRectOpacity = 0.3
  } = props;
  const { camera, gl, size, scene } = useThree();
  const [start, setStart] = useState<THREE.Vector2 | null>(null);
  const [end, setEnd] = useState<THREE.Vector2 | null>(null);
  const [dragType, setDragType] = useState<null | 'move' | number>(null); // null, 'move', or handle index (0-3)
  const [dragStart, setDragStart] = useState<THREE.Vector2 | null>(null);
  const [rectAtDragStart, setRectAtDragStart] = useState<{start: THREE.Vector2, end: THREE.Vector2} | null>(null);
  const selectionPlaneRef = useRef<THREE.Mesh>(null);
  const rectMeshRef = useRef<THREE.Mesh>(null);
  const renderTargetRef = useRef<THREE.WebGLRenderTarget | null>(null);
  const tempSceneRef = useRef<THREE.Scene | null>(null);
  const borderLineRef = useRef<THREE.Line | null>(null);

  console.log('CropTool render. Enabled:', enabled, 'Start:', start, 'End:', end);

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
    console.log('CropTool mounted');
    return () => {
      console.log('CropTool unmounting');
      cleanupResources();
    };
  }, []);

  // Get dimensions from either targetMesh or provided dimensions
  const getDimensions = () => {
    if (targetMesh) {
      const geometry = targetMesh.geometry as THREE.PlaneGeometry;
      // Assuming the plane is centered at origin and has args [width, height]
      return {
        width: (geometry.parameters.width || 0),
        height: (geometry.parameters.height || 0)
      };
    }
    if (!dimensions) {
      console.error('CropTool: Either targetMesh or dimensions must be provided');
      return { width: 0, height: 0 };
    }
    return dimensions;
  };

  const { width: mapWidth, height: mapHeight } = getDimensions();
  console.log('Map Dimensions:', mapWidth, mapHeight);

  useEffect(() => {
    console.log('Enabled/Dimensions effect:', enabled, mapWidth, mapHeight);
    if (!enabled) {
      console.log('CropTool disabled. Resetting state.');
      setStart(null);
      setEnd(null);
      setDragType(null);
      setDragStart(null);
      setRectAtDragStart(null);
    } else {
      // Initialize the crop rectangle to cover the entire map when crop mode is enabled
      setStart(new THREE.Vector2(-mapWidth/2, -mapHeight/2));
      setEnd(new THREE.Vector2(mapWidth/2, mapHeight/2));
    }
  }, [enabled, mapWidth, mapHeight]);

  // Helper: get 4 corners
  const getCorners = () => {
    if (!start || !end) return [];
    const minX = Math.min(start.x, end.x);
    const maxX = Math.max(start.x, end.x);
    const minY = Math.min(start.y, end.y);
    const maxY = Math.max(start.y, end.y);
    return [
      new THREE.Vector2(minX, minY), // 0: bottom-left
      new THREE.Vector2(maxX, minY), // 1: bottom-right
      new THREE.Vector2(maxX, maxY), // 2: top-right
      new THREE.Vector2(minX, maxY), // 3: top-left
    ];
  };

  // Mouse to world
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

  // Pointer events
  const onPointerDown = (e: React.PointerEvent) => {
    if (!enabled) return;
    e.stopPropagation();
    const point = toWorldCoords(e.clientX, e.clientY);
    const corners = getCorners();
    // Check if on handle
    for (let i = 0; i < corners.length; i++) {
      if (point.distanceTo(corners[i]) < HANDLE_RADIUS) {
        setDragType(i); // handle index
        setDragStart(point.clone());
        setRectAtDragStart({ start: start!.clone(), end: end!.clone() });
        return;
      }
    }
    // Check if inside rect (move)
    if (start && end) {
      const minX = Math.min(start.x, end.x), maxX = Math.max(start.x, end.x);
      const minY = Math.min(start.y, end.y), maxY = Math.max(start.y, end.y);
      if (point.x > minX && point.x < maxX && point.y > minY && point.y < maxY) {
        setDragType('move');
        setDragStart(point.clone());
        setRectAtDragStart({ start: start!.clone(), end: end!.clone() });
        return;
      }
    }
  };

  const onPointerMove = (e: React.PointerEvent) => {
    if (!enabled || dragType === null || !dragStart || !rectAtDragStart) return;
    e.stopPropagation();
    const point = toWorldCoords(e.clientX, e.clientY);
    const delta = point.clone().sub(dragStart);

    if (dragType === 'move') {
      // Move whole rect
      const newStart = rectAtDragStart.start.clone().add(delta);
      const newEnd = rectAtDragStart.end.clone().add(delta);
      setStart(newStart);
      setEnd(newEnd);
    } else if (typeof dragType === 'number') {
      // Drag handle (resize)
      const draggedCornerIndex = dragType;
      const fixedCornerIndex = (draggedCornerIndex + 2) % 4; // Opposite corner is fixed

      // Get the initial corners at the start of the drag
      const initialCorners = getCornersAtStart(rectAtDragStart);
      const fixedCorner = initialCorners[fixedCornerIndex];

      // Create copies of the start and end points from the start of the drag
      let newStart = rectAtDragStart.start.clone();
      let newEnd = rectAtDragStart.end.clone();

      // Update the appropriate coordinate of the appropriate point (start or end)
      // based on which corner is being dragged.
      switch (draggedCornerIndex) {
          case 0: // bottom-left
              newStart.x = point.x; // dragged X updates start.x
              newStart.y = point.y; // dragged Y updates start.y
              break;
          case 1: // bottom-right
              newEnd.x = point.x; // dragged X updates end.x
              newStart.y = point.y; // dragged Y updates start.y
              break;
          case 2: // top-right
              newEnd.x = point.x; // dragged X updates end.x
              newEnd.y = point.y; // dragged Y updates end.y
              break;
          case 3: // top-left
              newStart.x = point.x; // dragged X updates start.x
              newEnd.y = point.y; // dragged Y updates end.y
              break;
      }

      // Ensure start is always bottom-left and end is always top-right after the update
      const finalStart = new THREE.Vector2(
          Math.min(newStart.x, newEnd.x),
          Math.min(newStart.y, newEnd.y)
      );
      const finalEnd = new THREE.Vector2(
          Math.max(newStart.x, newEnd.x),
          Math.max(newStart.y, newEnd.y)
      );


      setStart(finalStart);
      setEnd(finalEnd);
    }
  };

  // Helper: get corners at the start of a drag operation
  const getCornersAtStart = (rect: {start: THREE.Vector2, end: THREE.Vector2}) => {
    const minX = Math.min(rect.start.x, rect.end.x);
    const maxX = Math.max(rect.start.x, rect.end.x);
    const minY = Math.min(rect.start.y, rect.end.y);
    const maxY = Math.max(rect.start.y, rect.end.y);
    return [
      new THREE.Vector2(minX, minY), // 0: bottom-left
      new THREE.Vector2(maxX, minY), // 1: bottom-right
      new THREE.Vector2(maxX, maxY), // 2: top-right
      new THREE.Vector2(minX, maxY), // 3: top-left
    ];
  };

  const onPointerUp = (e: React.PointerEvent) => {
    console.log('onPointerUp');
    if (!enabled) return;
    e.stopPropagation();
    setDragType(null);
    setDragStart(null);
    setRectAtDragStart(null);
  };

  useFrame(() => {
    if (rectMeshRef.current && start && end) {
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
    if (borderLineRef.current && start && end) {
      const corners = getCorners();
      if (corners.length === 4) {
        const points = [
          new THREE.Vector3(corners[0].x, corners[0].y, 0.3),
          new THREE.Vector3(corners[1].x, corners[1].y, 0.3),
          new THREE.Vector3(corners[2].x, corners[2].y, 0.3),
          new THREE.Vector3(corners[3].x, corners[3].y, 0.3),
          new THREE.Vector3(corners[0].x, corners[0].y, 0.3),
        ];
        // Avoid creating new geometry every frame if points are the same
        // This check is basic, can be improved for performance if needed
        const currentPoints = (borderLineRef.current.geometry as THREE.BufferGeometry).attributes.position?.array;
        let pointsChanged = false;
        if (!currentPoints || currentPoints.length !== points.length * 3) {
            pointsChanged = true;
        } else {
            for(let i = 0; i < points.length; i++) {
                if (currentPoints[i*3] !== points[i].x || currentPoints[i*3+1] !== points[i].y || currentPoints[i*3+2] !== points[i].z) {
                    pointsChanged = true;
                    break;
                }
            }
        }

        if (pointsChanged) {
            const geometry = new THREE.BufferGeometry().setFromPoints(points);
             if(borderLineRef.current.geometry) {
                borderLineRef.current.geometry.dispose();
             }
            borderLineRef.current.geometry = geometry;
        }
      }
    }
  });

  // Expose getCropRect to parent
  useImperativeHandle(ref, () => ({
    getCropRect: () => {
      console.log('getCropRect called');
      if (!start || !end || !targetMesh) {
        console.warn("CropTool: Cannot crop - start/end points or targetMesh are missing.");
        return;
      }

      const minX = Math.min(start.x, end.x);
      const maxX = Math.max(start.x, end.x);
      const minY = Math.min(start.y, end.y);
      const maxY = Math.max(start.y, end.y);

      // Convert world coordinates of the crop rectangle corners to screen coordinates
      const tempV3 = new THREE.Vector3();
      const screenCorners = [
          new THREE.Vector2(), // bottom-left
          new THREE.Vector2(), // top-right
      ];

      tempV3.set(minX, minY, 0);
      tempV3.project(camera);
      screenCorners[0].set(
          (tempV3.x * 0.5 + 0.5) * gl.domElement.clientWidth,
          (tempV3.y * -0.5 + 0.5) * gl.domElement.clientHeight
      );

      tempV3.set(maxX, maxY, 0);
      tempV3.project(camera);
      screenCorners[1].set(
          (tempV3.x * 0.5 + 0.5) * gl.domElement.clientWidth,
          (tempV3.y * -0.5 + 0.5) * gl.domElement.clientHeight
      );

      // Calculate the pixel coordinates and dimensions of the crop area on the canvas
      const pixelMinX = Math.floor(Math.min(screenCorners[0].x, screenCorners[1].x));
      const pixelMaxX = Math.ceil(Math.max(screenCorners[0].x, screenCorners[1].x));
      const pixelMinY = Math.floor(Math.min(screenCorners[0].y, screenCorners[1].y));
      const pixelMaxY = Math.ceil(Math.max(screenCorners[0].y, screenCorners[1].y));

      const cropWidth_pixels = pixelMaxX - pixelMinX;
      const cropHeight_pixels = pixelMaxY - pixelMinY;

      console.log('Crop Dimensions (pixels):', cropWidth_pixels, cropHeight_pixels);
      console.log('Crop Area (pixels):', pixelMinX, pixelMinY, cropWidth_pixels, cropHeight_pixels);


      if (cropWidth_pixels <= 0 || cropHeight_pixels <= 0) {
        console.warn("CropTool: Cannot crop - invalid pixel dimensions.");
        return;
      }

      // Cleanup any existing resources
      cleanupResources();

      // Create new render target with the exact pixel dimensions of the crop area
      renderTargetRef.current = new THREE.WebGLRenderTarget(cropWidth_pixels, cropHeight_pixels);

      // Create a new temporary scene
      tempSceneRef.current = new THREE.Scene();

      // Add the target mesh to the temporary scene
      const cropMesh = new THREE.Mesh(targetMesh.geometry, targetMesh.material);
      // Position the mesh in the temporary scene.
      // We don't need complex positioning here if using scissor test and adjusting camera/projection.
      // Just placing it at the origin is fine for now, as the camera will be adjusted.
      cropMesh.position.set(0, 0, 0); // Position at the origin in the temporary scene

      tempSceneRef.current.add(cropMesh);

      // Create and configure an orthographic camera for rendering the temporary scene
      // The camera's view frustum should match the original scene's view for the cropped area.
      // We need to calculate the world coordinates visible within the pixel crop rectangle.

      const v3_bottom_left = new THREE.Vector3((pixelMinX / gl.domElement.clientWidth) * 2 - 1, -(pixelMaxY / gl.domElement.clientHeight) * 2 + 1, 0);
      const v3_top_right = new THREE.Vector3((pixelMaxX / gl.domElement.clientWidth) * 2 - 1, -(pixelMinY / gl.domElement.clientHeight) * 2 + 1, 0);

      v3_bottom_left.unproject(camera);
      v3_top_right.unproject(camera);

      const orthoCam = new THREE.OrthographicCamera(
        v3_bottom_left.x, // left
        v3_top_right.x,   // right
        v3_top_right.y,   // top
        v3_bottom_left.y, // bottom
        camera.near,      // near (use original camera's near/far for consistency)
        camera.far        // far
      );

      // Position the temporary camera at the same position as the original camera,
      // looking in the same direction. The orthographic projection will handle isolating the view.
      orthoCam.position.copy(camera.position);
      orthoCam.quaternion.copy(camera.quaternion); // Copy rotation to look in the same direction


      if (!renderTargetRef.current || !tempSceneRef.current) {
        console.error('CropTool: Failed to create render resources for cropping.');
        return;
      }

      // Save current renderer state
      const originalRenderTarget = gl.getRenderTarget();
      const originalScissorTest = gl.getScissorTest();
      const originalScissor = new THREE.Vector4();
      gl.getScissor(originalScissor);
      const originalViewport = new THREE.Vector4();
      gl.getViewport(originalViewport);


      // Set render target and scissor test for cropping
      gl.setRenderTarget(renderTargetRef.current);

      // Ensure the viewport and scissor match the render target dimensions
      gl.setViewport(0, 0, cropWidth_pixels, cropHeight_pixels);
      gl.setScissor(0, 0, cropWidth_pixels, cropHeight_pixels);
      gl.setScissorTest(true);

      // Clear the render target
      gl.setClearColor(0x000000, 0); // Clear with black and full transparency
      gl.clear(true, true, false); // Clear color and depth buffers


      // Render the temporary scene with the orthographic camera
      gl.render(tempSceneRef.current, orthoCam);

      // Read pixels from the render target
      const pixels = new Uint8Array(cropWidth_pixels * cropHeight_pixels * 4);
      gl.readRenderTargetPixels(renderTargetRef.current, 0, 0, cropWidth_pixels, cropHeight_pixels, pixels);

      const clampedPixels = new Uint8ClampedArray(pixels);
      console.log('Crop complete. Calling onCropComplete.');
      onCropComplete(clampedPixels, cropWidth_pixels, cropHeight_pixels);

      // Restore original renderer state
      gl.setRenderTarget(originalRenderTarget);
      gl.setScissorTest(originalScissorTest);
      gl.setScissor(originalScissor.x, originalScissor.y, originalScissor.z, originalScissor.w);
      gl.setViewport(originalViewport.x, originalViewport.y, originalViewport.z, originalViewport.w);


      // Cleanup after crop is complete
      // cleanupResources(); // Keep resources until mode changes, might improve performance slightly
    }
  }));

  // Render
  const corners = getCorners();
  const minX = start ? Math.min(start.x, end?.x || start.x) : 0;
  const maxX = start ? Math.max(start.x, end?.x || start.x) : 0;
  const minY = start ? Math.min(start.y, end?.y || start.y) : 0;
  const maxY = start ? Math.max(start.y, end?.y || start.y) : 0;

  return (
    <>
      {/* Transparent plane for capturing pointer events */}
      {enabled && (
        <mesh
          ref={selectionPlaneRef}
          visible={true}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
        >
          <planeGeometry args={[mapWidth, mapHeight]} />
          <meshBasicMaterial color={selectionColor} opacity={0} transparent /> {/* Make fully transparent */}
        </mesh>
      )}

      {/* Border-only rectangle using Line */}
      {enabled && start && end && (
        <line ref={borderLineRef as MutableRefObject<any>}>
          <bufferGeometry />
          <lineBasicMaterial color={BORDER_COLOR} linewidth={2} />
        </line>
      )}

      {/* Corner handles */}
      {enabled && corners.map((corner, i) => (
        <mesh
          key={i}
          position={[corner.x, corner.y, 0.4]}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
        >
          <sphereGeometry args={[HANDLE_RADIUS, 16, 16]} /> {/* Use sphere for easier interaction */}
          <meshBasicMaterial color={HANDLE_COLOR} />
        </mesh>
      ))}
    </>
  );
});

export default CropTool;