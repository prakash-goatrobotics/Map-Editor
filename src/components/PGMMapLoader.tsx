import React, { useEffect, useState, useMemo, useRef } from 'react';
import { Canvas } from '@react-three/fiber';
import { OrthographicCamera, OrbitControls } from '@react-three/drei';
import * as THREE from 'three';
import { Slider, Space, Typography } from 'antd';
import { RotateLeftOutlined, RotateRightOutlined } from '@ant-design/icons';
import PGMWorkerManager from '../workers/PGMWorkerManager';
import ImageViewer from './PGMViewer';
import MapRotationControls from './MapRotationControls';
import { useMapRotation } from '../hooks/useMapRotation';


interface MapData {
  data: Uint8ClampedArray;
  width: number;
  height: number;
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

const MapTexturePlane: React.FC<{ mapData: MapData; rotation: number }> = ({ mapData, rotation }) => {
  const texture = useMemo(() => {
    const { width, height, data } = mapData;
    const textureData = new THREE.DataTexture(data, width, height, THREE.RGBAFormat);
    textureData.needsUpdate = true;
    return textureData;
  }, [mapData]);

  return (
    <mesh rotation={[0, 0, THREE.MathUtils.degToRad(rotation)]}>
      <planeGeometry args={[mapData.width, mapData.height]} />
      <meshBasicMaterial map={texture} toneMapped={false} />
    </mesh>
  );
};

const PGMMapLoader: React.FC<PGMMapLoaderProps> = (props) => {
  const [mapData, setMapData] = useState<MapData | null>(null);
  const controlsRef = useRef<any>(null);
  const {
    rotation,
    isSelected,
    mapContainerRef,
    handleRotationChange,
    handleMapClick,
  } = useMapRotation();

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

  if (!mapData) return <div className="flex items-center justify-center min-h-screen">Loading...</div>;

  return (
    <div className="flex h-screen">
      {/* Main Map View */}
      <div 
        ref={mapContainerRef}
        className="w-3/4 h-full p-4 bg-[#cdcdcd] relative"
      >
        <div 
          className={`absolute inset-0 ${isSelected ? 'ring-2 ring-blue-500' : ''}`}
          onClick={handleMapClick}
        >
          <Canvas orthographic camera={{ zoom: 1, position: [0, 0, 100]}}>
            <ambientLight />
            <OrthographicCamera makeDefault position={[0, 0, 100]} zoom={1} />
            <OrbitControls 
              ref={controlsRef}
              enablePan={true} 
              enableZoom={true} 
              enableRotate={!isSelected} 
            />
            <MapTexturePlane mapData={mapData} rotation={rotation} />
          </Canvas>
        </div>
      </div>

      {/* Right Panel with Toolbar */}
      <div className="w-1/4 h-full bg-gray-200 border-l border-gray-300">
        <div className="p-4 border-b border-gray-300">
          <h2 className="text-xl font-semibold text-gray-800">Tools</h2>
        </div>
        <div className="p-4 space-y-6">
          <MapRotationControls
            rotation={rotation}
            isSelected={isSelected}
            onRotationChange={handleRotationChange}
          />
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

