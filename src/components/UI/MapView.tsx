import React, { useRef } from 'react'
import { Canvas } from '@react-three/fiber'
import { OrthographicCamera, OrbitControls } from '@react-three/drei'
import * as THREE from 'three'
import MapTexturePlane from './MapTexturePlane'
import CropTool from '../CropTool'
import CroppedImageDragger from '../CroppedImageDragger'

// Constants
const CANVAS_WIDTH = 935
const CANVAS_HEIGHT = 550
const BACKGROUND_COLOR = "#cdcdcd"

interface MapData {
  data: Uint8ClampedArray
  width: number
  height: number
}

interface CroppedImageData extends MapData {
  id: string
  position: [number, number, number]
  name?: string
}

interface MapViewProps {
  mapData: MapData
  isSelected: boolean
  isCropMode: boolean
  isCropToolEnabled: boolean
  rotation: number
  cropToolRef: React.RefObject<any>
  mapMeshRef: React.RefObject<THREE.Mesh>
  cameraRef: React.RefObject<THREE.OrthographicCamera | null>
  controlsRef: React.RefObject<any>
  croppedImages: CroppedImageData[]
  setCroppedImages: React.Dispatch<React.SetStateAction<CroppedImageData[]>>
  draggingImageId: string | null
  setDraggingImageId: React.Dispatch<React.SetStateAction<string | null>>
  onMapClick: (event: any) => void
  onMouseEnter: () => void
  onMouseLeave: () => void
}

const MapView: React.FC<MapViewProps> = ({
  mapData,
  isSelected,
  isCropMode,
  isCropToolEnabled,
  rotation,
  cropToolRef,
  mapMeshRef,
  cameraRef,
  controlsRef,
  croppedImages,
  setCroppedImages,
  draggingImageId,
  setDraggingImageId,
  onMapClick,
  onMouseEnter,
  onMouseLeave,
}) => {
  return (
    <div
      className={`absolute inset-0 transition-all duration-300 ${
        isSelected ? "ring-2 ring-blue-500 ring-opacity-70" : ""
      } cursor-pointer`}
      onClick={onMapClick}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
    >
      <Canvas orthographic camera={{ zoom: 1, position: [0, 0, 100] }}>
        <color attach="background" args={["white/20"]} />
        <ambientLight />
        <OrthographicCamera
          ref={cameraRef}
          makeDefault
          position={[0, 0, 100]}
          zoom={1}
          left={-CANVAS_WIDTH / 2}
          right={CANVAS_WIDTH / 2}
          top={CANVAS_HEIGHT / 2}
          bottom={-CANVAS_HEIGHT / 2}
        />
        <OrbitControls
          ref={controlsRef}
          enablePan={!isCropMode}
          enableZoom={!isCropMode}
          enableRotate={false}
          autoRotate={false}
          //target={new THREE.Vector3(0, 0, 0)}
          minPolarAngle={Math.PI / 2}
          maxPolarAngle={Math.PI / 2}
          minAzimuthAngle={0}
          maxAzimuthAngle={0}
          minDistance={50}
          maxDistance={200}
        />
        <MapTexturePlane ref={mapMeshRef} mapData={mapData} rotation={rotation} />
        {isCropMode && (
          <CropTool
            ref={cropToolRef}
            targetMesh={mapMeshRef.current}
            dimensions={{
              width: mapData.width,
              height: mapData.height,
            }}
            enabled={isCropToolEnabled}
            rotation={rotation}
            selectionColor="transparent"
            cropRectColor={BACKGROUND_COLOR}
            cropRectOpacity={0.0}
            backgroundColor={BACKGROUND_COLOR}
          />
        )}
        <CroppedImageDragger
          croppedImages={croppedImages}
          setCroppedImages={setCroppedImages}
          isCropMode={isCropMode}
          draggingImageId={draggingImageId}
          setDraggingImageId={setDraggingImageId}
        />
      </Canvas>
    </div>
  )
}

export default MapView 