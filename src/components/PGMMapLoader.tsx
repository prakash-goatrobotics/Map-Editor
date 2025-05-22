import React, { useEffect, useState, useMemo, useRef } from 'react';
import { Canvas } from '@react-three/fiber';
import { OrthographicCamera, OrbitControls } from '@react-three/drei';
import * as THREE from 'three';
import PGMWorkerManager from '../workers/PGMWorkerManager';
import ImageViewer from './PGMViewer';
import CropTool from './CropTool';
import CroppedImageDragger from './CroppedImageDragger';

interface MapData {
  data: Uint8ClampedArray;
  width: number;
  height: number;
}

interface CroppedImageData extends MapData {
  id: string;
  position: [number, number, number];
}

interface PGMMapLoaderProps {
  sourceType: 'file' | 'ros';
  content: {
    data: string | any;
    info?: {
      width: number;
      height: number;
    };
  };
}

interface MapTexturePlaneProps {
  mapData: MapData | CroppedImageData; 
  position?: [number, number, number];
  // onPointerDown is now handled by CroppedImageDragger for cropped images
  // onPointerDown?: (event: ThreeEvent<PointerEvent>) => void; 
}

const MapTexturePlane: React.FC<MapTexturePlaneProps> = ({ mapData, position }) => {
  const texture = useMemo(() => {
    const { width, height, data } = mapData;
    // Use RedFormat for grayscale compatibility
    const textureData = new THREE.DataTexture(data, width, height, THREE.RGBAFormat);
    textureData.needsUpdate = true;
    return textureData;
  }, [mapData]);

  return (
    <mesh 
      position={position || [0, 0, 0]}
      // onPointerDown={onPointerDown}
    >
      <planeGeometry args={[mapData.width, mapData.height]} />
      <meshBasicMaterial map={texture} toneMapped={false} />
    </mesh>
  );
};

const PGMMapLoader: React.FC<PGMMapLoaderProps> = (props) => {
  const [mapData, setMapData] = useState<MapData | null>(null);
  const [isCropMode, setIsCropMode] = useState(false);
  const [croppedImages, setCroppedImages] = useState<CroppedImageData[]>([]);
  
  // Dragging state managed here and passed to CroppedImageDragger
  const [draggingImageId, setDraggingImageId] = useState<string | null>(null);
  const cameraRef = useRef<THREE.OrthographicCamera>(null);
  const controlsRef = useRef<any>(null);

  // Reset camera when entering crop mode
  useEffect(() => {
    if (isCropMode && cameraRef.current && controlsRef.current) {
      // Reset camera position and zoom
      cameraRef.current.position.set(0, 0, 100);
      cameraRef.current.zoom = 1;
      cameraRef.current.updateProjectionMatrix();
      
      // Reset controls target
      controlsRef.current.target.set(0, 0, 0);
      controlsRef.current.update();
    }
  }, [isCropMode]);

  useEffect(() => {
    const manager = PGMWorkerManager.getInstance();

    const processData = async () => {
      if (props.sourceType === "file") {
        try {
          const response = await fetch(props.content.data);
          if (!response.ok) throw new Error("Failed to fetch file.");
          const arrayBuffer = await response.arrayBuffer();
          const imageViewer = new ImageViewer(arrayBuffer);
          const message = {
            mapData: {
              info: {
                width: imageViewer.width,
                height: imageViewer.height,
              },
              data: imageViewer.data,
            },
            sourceType: "pgmFile",
          };
          const data = await manager.process(message);
          setMapData({
            data: data.data,
            width: data.width,
            height: data.height,
          });
        } catch (err) {
          console.error("[PGMMapLoader] Error processing file:", err);
        }
      } else if (props.sourceType === "ros") {
        try {
          const occupancyGrid = props.content;
          if (!occupancyGrid.info) throw new Error("Missing map info");
          const width = occupancyGrid.info.width;
          const height = occupancyGrid.info.height;
          const occupancyData = new Int8Array(occupancyGrid.data);
          const message = {
            mapData: {
              info: { width, height },
              data: occupancyData,
            },
            sourceType: "rosMap",
          };
          const data = await manager.process(message);
          setMapData({
            data: data.data,
            width: data.width,
            height: data.height,
          });
        } catch (err) {
          console.error("[PGMMapLoader] Error processing ROS map:", err);
        }
      }
    };

    processData();
  }, [props.sourceType, props.content]);

  // Handle crop completion
  const handleCropComplete = (data: Uint8ClampedArray, width: number, height: number) => {
    setCroppedImages(prev => [
      ...prev,
      {
        id: THREE.MathUtils.generateUUID(), // Assign a unique ID
        data, 
        width, 
        height,
        position: [0, -(prev.length + 1) * (height / 2 + 10), 0.3 + prev.length * 0.1], // Stack below main map
      }
    ]);
    setIsCropMode(false);
  };

  if (!mapData) return <div className="flex items-center justify-center min-h-screen">Loading...</div>;

  return (
    <div className="relative w-screen h-screen">
      {/* Main Map View */}
      <div className="absolute inset-0 bg-[#cdcdcd]">
        <Canvas orthographic camera={{ zoom: 1, position: [0, 0, 100]}}>
          <ambientLight />
          <OrthographicCamera 
            ref={cameraRef}
            makeDefault 
            position={[0, 0, 100]} 
            zoom={1} 
          />
          {/* Orbit controls enabled only when NOT in crop mode or dragging */}
          <OrbitControls 
            ref={controlsRef}
            enablePan={!isCropMode && !draggingImageId}
            enableZoom={!isCropMode && !draggingImageId}
            enableRotate={false}
            autoRotate={false}
            target={new THREE.Vector3(0, 0, 0)} 
          />
          {/* Main map */}
          <MapTexturePlane mapData={mapData} />
          {/* Crop tool overlay */}
          {isCropMode && mapData && (
            <CropTool
              dimensions={{
                width: mapData.width,
                height: mapData.height
              }}
              onCropComplete={handleCropComplete}
              enabled={isCropMode}
              selectionColor="rgba(157, 149, 173, 0.74)"
              cropRectColor="rgba(0, 0, 255, 0.3)"
            />
          )}
          {/* Cropped images and dragger */}
          {/* CroppedImageDragger renders the MapTexturePlane components for cropped images */}
          <CroppedImageDragger 
            croppedImages={croppedImages}
            setCroppedImages={setCroppedImages}
            isCropMode={isCropMode}
            draggingImageId={draggingImageId} // Pass dragging state down
            setDraggingImageId={setDraggingImageId} // Pass setter down
          />
        </Canvas>
      </div>

      {/* Right Panel with Toolbar */}
      <div className="absolute right-0 top-0 w-80 h-full bg-white/60 shadow-lg backdrop-blur-md">
        <div className="p-4 border-b border-gray-300">
          <h2 className="text-xl font-semibold text-gray-800">Tools</h2>
        </div>
        <div className="p-4 space-y-4">
          {/* Toolbar Items */}
          <div className="space-y-2">
            <button 
              className={`w-full px-4 py-2 text-sm text-gray-800 bg-gray-100 rounded hover:bg-gray-300 transition-colors border border-gray-300 ${isCropMode ? 'bg-blue-500 text-white' : ''}`}
              onClick={() => setIsCropMode(!isCropMode)}>
              
              {isCropMode ? 'Cancel Crop' : 'Crop Map'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default PGMMapLoader;




//code given before
// import React, { useEffect, useState } from 'react';
// import PGMWorkerManager from '../workers/PGMWorkerManager';
// import ImageViewer from './PGMViewer';
// import { Canvas } from '@react-three/fiber';
// import { OrthographicCamera } from '@react-three/drei';
// import { Texture, DataTexture } from 'three';
// import * as three from "three"

// interface MapData {
//   data: Uint8ClampedArray;
//   width: number;
//   height: number;
// }

// interface PGMMapLoaderProps {
//   sourceType: 'file' | 'ros';
//   content: {
//     data: string | any; // string for file URL, any for ROS data
//     info?: {
//       width: number;
//       height: number;
//     };
//   };
// }

// const PGMMapLoader: React.FC<PGMMapLoaderProps> = (props) => {
//   const [mapData, setMapData] = useState<MapData | null>(null);

//   useEffect(() => {
//     const manager = PGMWorkerManager.getInstance();

//     const processData = async () => {
//       if (props.sourceType === "file") {
//         try {
//           const response = await fetch(props.content.data);
//           if (!response.ok) throw new Error("Failed to fetch file.");
//           const arrayBuffer = await response.arrayBuffer();
//           const imageViewer = new ImageViewer(arrayBuffer);
//           const message = {
//             mapData: {
//               info: {
//                 width: imageViewer.width,
//                 height: imageViewer.height,
//               },
//               data: imageViewer.data,
//             },
//             sourceType: "pgmFile",
//           };
//           const data = await manager.process(message);
//           setMapData({
//             data: data.data,
//             width: data.width,
//             height: data.height,
//           });
//         } catch (err) {
//           console.error("[PGMMapLoader] Error processing file:", err);
//         }
//       } else if (props.sourceType === "ros") {
//         try {
//           const occupancyGrid = props.content;
//           if (!occupancyGrid.info) throw new Error("Missing map info");
//           const width = occupancyGrid.info.width;
//           const height = occupancyGrid.info.height;
//           const occupancyData = new Int8Array(occupancyGrid.data);
//           const message = {
//             mapData: {
//               info: { width, height },
//               data: occupancyData,
//             },
//             sourceType: "rosMap",
//           };
//           const data = await manager.process(message);
//           setMapData({
//             data: data.data,
//             width: data.width,
//             height: data.height,
//           });
//         } catch (err) {
//           console.error("[PGMMapLoader] Error processing ROS map:", err);
//         }
//       }
//     };

//     processData();
//   }, [props.sourceType, props.content]);

//   if (!mapData) {
//     return <div>Loading...</div>;
//   }

//   const texture = new DataTexture(
//     new Uint8Array(mapData.data),
//     mapData.width,
//     mapData.height,
//     1024 as any // LuminanceFormat
//   );
//   texture.needsUpdate = true;

//   return (
//     <div style={{ width: '100%', height: '100%' }}>
//       <Canvas>
//         <OrthographicCamera makeDefault position={[0, 0, 10]} zoom={1} />
//         <mesh>
//           <planeGeometry args={[mapData.width, mapData.height]} />
//           <meshBasicMaterial map={texture} />
//         </mesh>
//       </Canvas>
//     </div>
//   );
// };

// export default PGMMapLoader;