"use client"

import React, { useEffect, useState, useRef, forwardRef } from "react"
import { Canvas } from "@react-three/fiber"
import { OrthographicCamera, OrbitControls } from "@react-three/drei"
import * as THREE from "three"
import PGMWorkerManager from "../workers/PGMWorkerManager"
import ImageViewer from "./PGMViewer"
import CropTool from "./CropTool"
import CroppedImageDragger from "./CroppedImageDragger"
import MapRotationControls from "./MapRotationControls"
import { useMapRotation } from "../hooks/useMapRotation"

interface MapData {
  data: Uint8ClampedArray
  width: number
  height: number
}

interface CroppedImageData extends MapData {
  id: string
  position: [number, number, number]
}

interface PGMMapLoaderProps {
  sourceType: "file" | "ros"
  content: {
    data: string | any
    info?: {
      width: number
      height: number
    }
  }
}

interface MapTexturePlaneProps {
  mapData: MapData | CroppedImageData
  position?: [number, number, number]
  rotation?: number
}

// Wrap MapTexturePlane with forwardRef
const MapTexturePlane = forwardRef<THREE.Mesh, MapTexturePlaneProps>(({ mapData, position, rotation = 0 }, ref) => {
  const meshRef = useRef<THREE.Mesh>(null)
  const texture = React.useMemo(() => {
    const { width, height, data } = mapData
    const textureData = new THREE.DataTexture(data, width, height, THREE.RGBAFormat)
    textureData.needsUpdate = true
    return textureData
  }, [mapData])

  React.useImperativeHandle(ref, () => meshRef.current as THREE.Mesh, [])

  return (
    <mesh ref={meshRef} position={position || [0, 0, 0]} rotation={[0, 0, THREE.MathUtils.degToRad(rotation)]}>
      <planeGeometry args={[mapData.width, mapData.height]} />
      <meshBasicMaterial map={texture} toneMapped={false} />
    </mesh>
  )
})

const PGMMapLoader: React.FC<PGMMapLoaderProps> = (props) => {
  const [mapData, setMapData] = useState<MapData | null>(null)
  const [isCropMode, setIsCropMode] = useState(false)
  const [croppedImages, setCroppedImages] = useState<CroppedImageData[]>([])
  const [draggingImageId, setDraggingImageId] = useState<string | null>(null)
  const [tempCropData, setTempCropData] = useState<{ data: Uint8ClampedArray; width: number; height: number } | null>(
    null,
  )

  const cameraRef = useRef<THREE.OrthographicCamera>(null)
  const controlsRef = useRef<any>(null)
  const cropToolRef = useRef<any>(null)
  const mapMeshRef = useRef<any>(null)
  const [isCropToolEnabled, setIsCropToolEnabled] = useState(false)

  // Get rotation state and handlers from the hook
  const { rotation, setRotation, isSelected, mapContainerRef, handleRotationChange, handleMapClick } = useMapRotation()

  // Reset camera when entering crop mode
  useEffect(() => {
    if (isCropMode && cameraRef.current && controlsRef.current) {
      cameraRef.current.position.set(0, 0, 100)
      cameraRef.current.zoom = 1
      cameraRef.current.updateProjectionMatrix()
      controlsRef.current.target.set(0, 0, 0)
      controlsRef.current.update()
    }
  }, [isCropMode])

  useEffect(() => {
    const manager = PGMWorkerManager.getInstance()

    const processData = async () => {
      if (props.sourceType === "file") {
        try {
          const response = await fetch(props.content.data)
          if (!response.ok) throw new Error("Failed to fetch file.")
          const arrayBuffer = await response.arrayBuffer()
          const imageViewer = new ImageViewer(arrayBuffer)
          const message = {
            mapData: {
              info: {
                width: imageViewer.width,
                height: imageViewer.height,
              },
              data: imageViewer.data,
            },
            sourceType: "pgmFile",
          }
          const data = await manager.process(message)
          setMapData({
            data: data.data,
            width: data.width,
            height: data.height,
          })
        } catch (err) {
          console.error("[PGMMapLoader] Error processing file:", err)
        }
      } else if (props.sourceType === "ros") {
        try {
          const occupancyGrid = props.content
          if (!occupancyGrid.info) throw new Error("Missing map info")
          const width = occupancyGrid.info.width
          const height = occupancyGrid.info.height
          const occupancyData = new Int8Array(occupancyGrid.data)
          const message = {
            mapData: {
              info: { width, height },
              data: occupancyData,
            },
            sourceType: "rosMap",
          }
          const data = await manager.process(message)
          setMapData({
            data: data.data,
            width: data.width,
            height: data.height,
          })
        } catch (err) {
          console.error("[PGMMapLoader] Error processing ROS map:", err)
        }
      }
    }

    processData()
  }, [props.sourceType, props.content])

  // New: Save crop handler
  const handleSaveCrop = () => {
    if (cropToolRef.current) {
      const cropResult = cropToolRef.current.getCropRect()
      if (cropResult && mapData) {
        // Reset rotation to 0 when saving a crop to prevent tilting
        setRotation(0)

        // Replace the original map data with the cropped data
        setMapData({
          data: cropResult.data,
          width: cropResult.width,
          height: cropResult.height,
        })

        setTempCropData(null)
        setIsCropMode(false)
        setIsCropToolEnabled(false)
      }
    }
  }

  // Cancel crop
  const handleCancelCrop = () => {
    setTempCropData(null)
    setIsCropMode(false)
    setIsCropToolEnabled(false)
  }

  if (!mapData) return <div className="flex items-center justify-center min-h-screen">Loading...</div>

  return (
    <div className="relative w-screen h-screen">
      {/* Main Map View */}
      <div ref={mapContainerRef} className="absolute inset-0 bg-[#28282B]">
        <div
          className={`absolute inset-0 ${isSelected ? "ring-4 ring-blue-500 ring-opacity-70" : ""} cursor-pointer`}
          onClick={handleMapClick}
        >
          <Canvas orthographic camera={{ zoom: 1, position: [0, 0, 100] }}>
            <ambientLight />
            <OrthographicCamera ref={cameraRef} makeDefault position={[0, 0, 100]} zoom={1} />
            <OrbitControls
              ref={controlsRef}
              enablePan={!isCropMode && !draggingImageId}
              enableZoom={!isCropMode && !draggingImageId}
              enableRotate={!isCropMode && !draggingImageId}
              autoRotate={false}
              target={new THREE.Vector3(0, 0, 0)}
            />
            {/* Main map */}
            <MapTexturePlane ref={mapMeshRef} mapData={mapData} rotation={rotation} />
            {/* Crop tool overlay */}
            {isCropMode && mapData && (
              <CropTool
                ref={cropToolRef}
                targetMesh={mapMeshRef.current}
                dimensions={{
                  width: mapData.width,
                  height: mapData.height,
                }}
                enabled={isCropToolEnabled}
                selectionColor="transparent"
                cropRectColor="#cdcdcd" // Exact match with background color
                cropRectOpacity={0.0} // Make it fully transparent
                currentRotation={rotation} // Pass current rotation to crop tool
              />
            )}
            {/* Cropped images and dragger */}
            <CroppedImageDragger
              croppedImages={croppedImages}
              setCroppedImages={setCroppedImages}
              isCropMode={isCropMode}
              draggingImageId={draggingImageId}
              setDraggingImageId={setDraggingImageId}
            />
          </Canvas>
        </div>
      </div>

      {/* Right Panel with Toolbar */}
      <div className="absolute right-0 top-0 w-80 h-full bg-white/60 shadow-lg backdrop-blur-md">
        <div className="p-4 border-b border-gray-300">
          <h2 className="text-xl font-semibold text-gray-800">Tools</h2>
        </div>
        <div className="p-4 space-y-6">
          {/* Map Selection Status */}
          {!isSelected && (
            <div className="p-3 bg-yellow-50 border border-yellow-200 rounded-md">
              <p className="text-sm text-yellow-800">Click on the map to select it and enable tools</p>
            </div>
          )}

          {/* Crop Tool */}
          <div className="space-y-2">
            {!isCropMode && (
              <button
                className={`w-full px-4 py-2 text-sm rounded transition-colors border ${
                  isSelected
                    ? "text-gray-800 bg-gray-100 hover:bg-gray-300 border-gray-300 cursor-pointer"
                    : "text-gray-400 bg-gray-50 border-gray-200 cursor-not-allowed opacity-50"
                }`}
                onClick={() => {
                  if (isSelected) {
                    setIsCropMode(true)
                    setIsCropToolEnabled(true)
                  }
                }}
                disabled={!isSelected}
              >
                Crop Map
              </button>
            )}
            {isCropMode && (
              <>
                <button
                  className="w-full px-4 py-2 text-sm text-white bg-blue-600 rounded hover:bg-blue-700 transition-colors border border-blue-700"
                  onClick={handleSaveCrop}
                >
                  Save Crop
                </button>
                <button
                  className="w-full px-4 py-2 text-sm text-gray-800 bg-gray-100 rounded hover:bg-gray-300 transition-colors border border-gray-300"
                  onClick={handleCancelCrop}
                >
                  Cancel
                </button>
              </>
            )}
          </div>

          {/* Rotation Controls */}
          <div className="space-y-2">
            <MapRotationControls
              rotation={rotation}
              isSelected={isSelected && !isCropMode} // Disabled when not selected OR when cropping
              onRotationChange={handleRotationChange}
            />
            {isCropMode && <p className="text-xs text-gray-500 italic">Rotation is disabled during cropping</p>}
          </div>

          {/* Current Rotation Display */}
          <div className="p-2 bg-gray-50 rounded border border-gray-200">
            <p className="text-xs text-gray-600">Current rotation: {rotation}°</p>
          </div>
        </div>
      </div>
    </div>
  )
}

export default PGMMapLoader
