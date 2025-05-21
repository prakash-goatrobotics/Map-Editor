import React, { useEffect, useState, useMemo } from 'react';
import { Canvas } from '@react-three/fiber';
import { OrthographicCamera, OrbitControls } from '@react-three/drei';
import * as THREE from 'three';
import PGMWorkerManager from '../workers/PGMWorkerManager';
import ImageViewer from './PGMViewer';


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

const MapTexturePlane: React.FC<{ mapData: MapData }> = ({ mapData }) => {
  const texture = useMemo(() => {
    const { width, height, data } = mapData;
    const textureData = new THREE.DataTexture(data, width, height, THREE.RGBAFormat);
    textureData.needsUpdate = true;
    return textureData;
  }, [mapData]);

  return (
    <mesh>
      <planeGeometry args={[mapData.width, mapData.height]} />
      <meshBasicMaterial map={texture} toneMapped={false} />
    </mesh>
  );
};

const PGMMapLoader: React.FC<PGMMapLoaderProps> = (props) => {
  const [mapData, setMapData] = useState<MapData | null>(null);

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
      <div className="w-3/4 h-full p-4 bg-[#cdcdcd]">
        <Canvas orthographic camera={{ zoom: 1, position: [0, 0, 100]}}>
          <ambientLight />
          <OrthographicCamera makeDefault position={[0, 0, 100]} zoom={1} />
          <OrbitControls enablePan={true} enableZoom={true} enableRotate={true} />
          <MapTexturePlane mapData={mapData} />
        </Canvas>
      </div>

      {/* Right Panel with Toolbar */}
      <div className="w-1/4 h-full bg-gray-200 border-l border-gray-300">
        <div className="p-4 border-b border-gray-300">
          <h2 className="text-xl font-semibold text-gray-800">Tools</h2>
        </div>
        <div className="p-4 space-y-4">
          {/* Toolbar Items */}
          {/*<div className="space-y-2">
            <button className="w-full px-4 py-2 text-sm text-gray-800 bg-gray-100 rounded hover:bg-gray-300 transition-colors border border-gray-300">
              Draw Wall
            </button>
            <button className="w-full px-4 py-2 text-sm text-gray-800 bg-gray-100 rounded hover:bg-gray-300 transition-colors border border-gray-300">
              Erase
            </button>
            <button className="w-full px-4 py-2 text-sm text-gray-800 bg-gray-100 rounded hover:bg-gray-300 transition-colors border border-gray-300">
              Save Map
            </button>
            <button className="w-full px-4 py-2 text-sm text-gray-800 bg-gray-100 rounded hover:bg-gray-300 transition-colors border border-gray-300">
              Load Map
            </button>
          </div>*/}
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



