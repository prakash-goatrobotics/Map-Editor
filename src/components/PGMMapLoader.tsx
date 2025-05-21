import React, { memo, useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import type { CustomOccupancyGrid } from "../types/map";
import type { ThreeElements } from "@react-three/fiber";
type MeshProps = ThreeElements["mesh"];

// const occupancyGrid: CustomOccupancyGrid = {
//     data: getCdnImageHost(map.ros_image_url, true),
//     info: {
//       height: map.metadata.height,
//       width: map.metadata.width,
//       resolution: map.yaml_data.resolution,
//       origin: {
//         position: { x: 0, y: 0, z: 0 },
//         orientation: {
//           x: 0,
//           y: 0,
//           z: 0,
//           w: 0,
//         },
//       },
//     },
//   };

export type MapDataLoaderProps = {
  sourceType: "file";
  content: CustomOccupancyGrid;
  onMapLoaded?: (width: number, height: number) => void;
  onMapTextureLoaded?: (params: {
    texture: THREE.DataTexture;
    mapData: { width: number; height: number; data: Uint8ClampedArray };
  }) => void;
};

type CombinedProps = MapDataLoaderProps & MeshProps;

const PGMMapLoader: React.FC<CombinedProps> = memo(
  (props) => {
    const [mapData, setMapData] = useState<{
      data: Uint8ClampedArray;
      width: number;
      height: number;
    } | null>(null);
    const [texture, setTexture] = useState<THREE.DataTexture | null>(null);
    const isEditableMap =
      props.sourceType === "file" && props.onMapTextureLoaded;

    // Process the map data.
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
        }
      };

      processData();
    }, [props.sourceType, props.content]);

    // Only call onMapLoaded when dimensions change.
    const dimensionsRef = useRef<{ width: number; height: number } | null>(
      null
    );
    useEffect(() => {
      if (mapData) {
        if (
          !dimensionsRef.current ||
          dimensionsRef.current.width !== mapData.width ||
          dimensionsRef.current.height !== mapData.height
        ) {
          dimensionsRef.current = {
            width: mapData.width,
            height: mapData.height,
          };
          if (props.onMapLoaded) {
            props.onMapLoaded(mapData.width, mapData.height);
          }
        }
      }
    }, [mapData, props]);

    // Update the texture whenever mapData changes.
    useEffect(() => {
      if (!mapData) {
        setTexture(null);
        return;
      }
      const tex = new THREE.DataTexture(
        mapData.data,
        mapData.width,
        mapData.height,
        THREE.RGBAFormat
      );
      tex.wrapS = THREE.ClampToEdgeWrapping;
      tex.wrapT = THREE.ClampToEdgeWrapping;
      tex.needsUpdate = true;
      setTexture(tex);

      if (props.sourceType === "file" && props.onMapTextureLoaded) {
        props.onMapTextureLoaded({
          texture: tex,
          mapData,
        });
      }
    }, [mapData]);

    // Compute geometry.
    const geometry = useMemo(() => {
      if (!mapData) {
        // While waiting for mapData, return a simple box geometry.
        return;
      }
      // Use the same info from content regardless of source type.
      const resolution = isEditableMap ? 1 : props.content.info.resolution;
      const planeWidth = mapData.width * resolution;
      const planeHeight = mapData.height * resolution;
      const geo = new THREE.PlaneGeometry(planeWidth, planeHeight);
      geo.translate(planeWidth / 2, -planeHeight / 2, 0);
      return geo;
    }, [mapData, props]);

    // Render the mesh. If mapData is not loaded yet, it will render the placeholder geometry.
    return (
      <mesh
        {...props}
        geometry={geometry}
        rotation={} // TODO
        name="PGMMap"
        receiveShadow={true}
      >
        <meshBasicMaterial
          map={texture}
          side={THREE.DoubleSide}
          toneMapped={false}
        />
      </mesh>
    );
  },
  (prevProps, nextProps) => {
    return (
      prevProps.sourceType === nextProps.sourceType &&
      prevProps.content.info.width === nextProps.content.info.width &&
      prevProps.content.info.height === nextProps.content.info.height
    );
  }
);

export default PGMMapLoader;
