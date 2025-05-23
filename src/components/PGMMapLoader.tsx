"use client"

import React, { useEffect, useState, useRef, forwardRef, useCallback } from "react"
import { Canvas } from "@react-three/fiber"
import { OrthographicCamera, OrbitControls } from "@react-three/drei"
import * as THREE from "three"
import PGMWorkerManager from "../workers/PGMWorkerManager"
import ImageViewer from "./PGMViewer"
import CropTool from "./CropTool"
import CroppedImageDragger from "./CroppedImageDragger"
import MapRotationControls from "./MapRotationControls"
import { useMapRotation } from "../hooks/useMapRotation"

// Background color constant - used for consistency
const BACKGROUND_COLOR = "#cdcdcd"

interface MapData {
  data: Uint8ClampedArray
  width: number
  height: number
}

// Add interface for map state
interface MapState {
  data: Uint8ClampedArray
  width: number
  height: number
  rotation: number
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
      <meshBasicMaterial
        map={texture}
        toneMapped={false}
        transparent={true} // Enable transparency
        alphaTest={0.01} // Discard pixels with very low alpha
      />
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
  // Add state for undo stack
  const [undoStack, setUndoStack] = useState<MapState[]>([])
  const [canUndo, setCanUndo] = useState(false)

  const cameraRef = useRef<THREE.OrthographicCamera>(null)
  const controlsRef = useRef<any>(null)
  const cropToolRef = useRef<any>(null)
  const mapMeshRef = useRef<any>(null)
  const [isCropToolEnabled, setIsCropToolEnabled] = useState(false)
  const [currentRotation, setCurrentRotation] = useState(0) // Track rotation for cropping

  // Store the initial camera state to prevent unwanted rotations
  const initialCameraState = useRef({
    position: new THREE.Vector3(0, 0, 100),
    rotation: new THREE.Euler(0, 0, 0),
    zoom: 1,
  })

  const { rotation, isSelected, mapContainerRef, handleRotationChange, handleMapClick } = useMapRotation()

  // Update current rotation when rotation changes
  useEffect(() => {
    setCurrentRotation(rotation)
  }, [rotation])

  // Function to reset camera to safe state
  const resetCameraToSafeState = useCallback(() => {
    if (cameraRef.current && controlsRef.current) {
      // Reset camera position and rotation
      cameraRef.current.position.copy(initialCameraState.current.position)
      cameraRef.current.rotation.copy(initialCameraState.current.rotation)
      cameraRef.current.zoom = initialCameraState.current.zoom
      cameraRef.current.updateProjectionMatrix()

      // Reset controls target and update
      controlsRef.current.target.set(0, 0, 0)
      controlsRef.current.object.position.copy(initialCameraState.current.position)
      controlsRef.current.object.rotation.copy(initialCameraState.current.rotation)
      controlsRef.current.update()

      // Force controls to respect the disabled state
      controlsRef.current.enableRotate = !isCropMode && !draggingImageId
      controlsRef.current.enablePan = !isCropMode && !draggingImageId
      controlsRef.current.enableZoom = !isCropMode && !draggingImageId
    }
  }, [isCropMode, draggingImageId])

  // Reset camera when entering crop mode with additional safety measures
  useEffect(() => {
    if (isCropMode) {
      resetCameraToSafeState()

      // Additional safety: disable all controls immediately
      if (controlsRef.current) {
        controlsRef.current.enableRotate = false
        controlsRef.current.enablePan = false
        controlsRef.current.enableZoom = false
        controlsRef.current.autoRotate = false
        controlsRef.current.update()
      }
    } else {
      // When exiting crop mode, re-enable controls but keep camera stable
      if (controlsRef.current) {
        controlsRef.current.enableRotate = false // Keep rotation disabled by default
        controlsRef.current.enablePan = !draggingImageId
        controlsRef.current.enableZoom = !draggingImageId
        controlsRef.current.autoRotate = false
        controlsRef.current.update()
      }
    }
  }, [isCropMode, resetCameraToSafeState, draggingImageId])

  // Monitor and prevent unwanted camera changes
  useEffect(() => {
    const interval = setInterval(() => {
      if (cameraRef.current && controlsRef.current) {
        // Check if camera has been accidentally rotated
        const currentRotation = cameraRef.current.rotation
        if (Math.abs(currentRotation.x) > 0.01 || Math.abs(currentRotation.y) > 0.01) {
          console.warn("Detected unwanted camera rotation, resetting...")
          resetCameraToSafeState()
        }

        // Ensure controls stay disabled when they should be
        if (isCropMode || draggingImageId) {
          if (controlsRef.current.enableRotate) {
            controlsRef.current.enableRotate = false
            controlsRef.current.update()
          }
        }
      }
    }, 100) // Check every 100ms

    return () => clearInterval(interval)
  }, [isCropMode, draggingImageId, resetCameraToSafeState])

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

  // Save current state to undo stack
  const saveToUndoStack = useCallback((currentMapData: MapData) => {
    if (currentMapData) {
      const newState: MapState = {
        data: new Uint8ClampedArray(currentMapData.data),
        width: currentMapData.width,
        height: currentMapData.height,
        rotation: rotation
      }
      setUndoStack(prev => [...prev, newState])
      setCanUndo(true)
    }
  }, [rotation])

  // Handle undo
  const handleUndo = useCallback(() => {
    if (undoStack.length > 0) {
      const previousState = undoStack[undoStack.length - 1]
      setMapData({
        data: previousState.data,
        width: previousState.width,
        height: previousState.height
      })
      handleRotationChange(previousState.rotation)
      setUndoStack(prev => prev.slice(0, -1))
      setCanUndo(undoStack.length > 1)
    }
  }, [undoStack, handleRotationChange])

  // Save crop handler
  const handleSaveCrop = () => {
    if (cropToolRef.current) {
      const cropResult = cropToolRef.current.getCropRect()
      if (cropResult && mapData) {
        // Save current state before cropping
        saveToUndoStack(mapData)

        // Replace the original map data with the cropped data
        setMapData({
          data: cropResult.data,
          width: cropResult.width,
          height: cropResult.height,
        })

        // Reset rotation after cropping to prevent compounding rotations
        handleRotationChange(0)

        setTempCropData(null)
        setIsCropMode(false)
        setIsCropToolEnabled(false)

        // Reset camera after cropping to prevent tilting
        setTimeout(() => {
          resetCameraToSafeState()
        }, 50)
      }
    }
  }

  // Cancel crop
  const handleCancelCrop = () => {
    setTempCropData(null)
    setIsCropMode(false)
    setIsCropToolEnabled(false)

    // Reset camera after canceling crop to prevent tilting
    setTimeout(() => {
      resetCameraToSafeState()
    }, 50)
  }

  // Enhanced map click handler to prevent rotation issues
  const handleMapClickSafe = useCallback(
    (event: any) => {
      // Prevent any rotation during map selection
      if (controlsRef.current) {
        controlsRef.current.enableRotate = false
        controlsRef.current.update()
      }

      handleMapClick(event)

      // Reset camera to ensure no tilting
      setTimeout(() => {
        resetCameraToSafeState()
      }, 10)
    },
    [handleMapClick, resetCameraToSafeState],
  )

  if (!mapData) return (
    <div className="flex items-center justify-center min-h-screen bg-[#28282B]">
      <div className="w-8 h-8 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
    </div>
  )

  return (
    <div className="relative w-screen h-screen">
      {/* Main Map View */}
      <div ref={mapContainerRef} className="absolute inset-0 bg-[#28282B]">
        <div
          className={`absolute inset-0 transition-all duration-300 ${
            isSelected ? "ring-4 ring-blue-500 ring-opacity-70" : ""
          } cursor-pointer`}
          onClick={handleMapClickSafe}
        >
          <Canvas orthographic camera={{ zoom: 1, position: [0, 0, 100] }}>
            <ambientLight />
            <OrthographicCamera ref={cameraRef} makeDefault position={[0, 0, 100]} zoom={1} />
            <OrbitControls
              ref={controlsRef}
              enablePan={!isCropMode && !draggingImageId}
              enableZoom={!isCropMode && !draggingImageId}
              enableRotate={false}
              autoRotate={false}
              target={new THREE.Vector3(0, 0, 0)}
              minPolarAngle={Math.PI / 2}
              maxPolarAngle={Math.PI / 2}
              minAzimuthAngle={0}
              maxAzimuthAngle={0}
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
                cropRectColor={BACKGROUND_COLOR}
                cropRectOpacity={0.0}
                rotation={currentRotation}
                backgroundColor={BACKGROUND_COLOR}
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
      <div className="absolute right-0 top-0 w-80 h-full bg-white/80 shadow-lg backdrop-blur-md transition-all duration-300">
        <div className="p-4 border-b border-gray-200 flex justify-between items-center">
          <h2 className="text-xl font-semibold text-gray-800">Map Editor</h2>
          <button
            className={`px-3 py-1.5 text-sm rounded transition-all duration-200 ${
              canUndo
                ? "text-gray-700 bg-gray-200 hover:bg-gray-300 shadow-md hover:shadow-lg transform hover:-translate-y-0.5"
                : "text-gray-400 bg-gray-100 cursor-not-allowed opacity-50"
            }`}
            onClick={handleUndo}
            disabled={!canUndo}
          >
            <div className="flex items-center space-x-1">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h10a8 8 0 018 8v2M3 10l6 6m-6-6l6-6" />
              </svg>
              <span>Undo</span>
            </div>
          </button>
        </div>
        <div className="p-4 space-y-6">
          {/* Map Selection Status */}
          {!isSelected && (
            <div className="p-3 bg-yellow-50 border border-yellow-200 rounded-md animate-pulse">
              <p className="text-sm text-yellow-800">Click on the map to select it and enable tools</p>
            </div>
          )}

          {/* Crop Tool */}
          <div className="space-y-2">
            {!isCropMode && (
              <button
                className={`w-full px-4 py-2 text-sm rounded transition-all duration-200 ${
                  isSelected
                    ? "text-gray-700 bg-gray-200 hover:bg-gray-300 shadow-md hover:shadow-lg transform hover:-translate-y-0.5"
                    : "text-gray-400 bg-gray-100 cursor-not-allowed opacity-50"
                }`}
                onClick={() => {
                  if (isSelected) {
                    setIsCropMode(true)
                    setIsCropToolEnabled(true)
                  }
                }}
                disabled={!isSelected}
              >
                <div className="flex items-center justify-center space-x-2">
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
                  </svg>
                  <span>Crop Map</span>
                </div>
              </button>
            )}
            {isCropMode && (
              <div className="flex space-x-2">
                <button
                  className="flex-1 px-4 py-2 text-sm text-gray-700 bg-gray-200 rounded hover:bg-gray-300 transition-all duration-200 shadow-md hover:shadow-lg transform hover:-translate-y-0.5"
                  onClick={handleSaveCrop}
                >
                  <div className="flex items-center justify-center space-x-2">
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                    <span>Save Crop</span>
                  </div>
                </button>
                <button
                  className="flex-1 px-4 py-2 text-sm text-gray-700 bg-gray-100 rounded hover:bg-gray-200 transition-all duration-200 shadow-md hover:shadow-lg transform hover:-translate-y-0.5"
                  onClick={handleCancelCrop}
                >
                  <div className="flex items-center justify-center space-x-2">
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                    <span>Cancel</span>
                  </div>
                </button>
              </div>
            )}
          </div>

          {/* Rotation Controls */}
          <div className="space-y-2">
            <MapRotationControls
              rotation={rotation}
              isSelected={isSelected && !isCropMode}
              onRotationChange={handleRotationChange}
            />
            {isCropMode && (
              <p className="text-xs text-gray-500 italic animate-pulse">Rotation is disabled during cropping</p>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

export default PGMMapLoader