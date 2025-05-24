"use client"

import React, { useEffect, useState, useRef, forwardRef, useCallback, useMemo } from "react"
import { Canvas } from "@react-three/fiber"
import { OrthographicCamera, OrbitControls } from "@react-three/drei"
import * as THREE from "three"
import PGMWorkerManager from "../workers/PGMWorkerManager"
import ImageViewer from "./PGMViewer"
import CropTool from "./CropTool"
import CroppedImageDragger from "./CroppedImageDragger"
import MapRotationControls from "./MapRotationControls"
import { useMapRotation } from "../hooks/useMapRotation"
import {
  Save,
  X,
  Menu,
  ZoomIn,
  ZoomOut,
  RotateCcw,
  Crop,
  Layers,
  Move,
  MousePointer,
  Undo2,
  Download,
  Upload,
  Settings,
  Maximize2,
  Minimize2,
} from "lucide-react"

// Background color constant - used for consistency
const BACKGROUND_COLOR = "#cdcdcd"

// Add constants for canvas dimensions
const CANVAS_WIDTH = 935
const CANVAS_HEIGHT = 550

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
  name?: string
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

// Wrap MapTexturePlane with forwardRef and React.memo for optimization
const MapTexturePlane = React.memo(
  forwardRef<THREE.Mesh, MapTexturePlaneProps>(({ mapData, position, rotation = 0 }, ref) => {
    const meshRef = useRef<THREE.Mesh>(null)

    // Memoize texture creation to prevent unnecessary recalculations
    const texture = useMemo(() => {
      const { width, height, data } = mapData
      const textureData = new THREE.DataTexture(data, width, height, THREE.RGBAFormat)
      textureData.needsUpdate = true
      return textureData
    }, [mapData])

    React.useImperativeHandle(ref, () => meshRef.current as THREE.Mesh, [])

    return (
      <mesh ref={meshRef} position={position || [0, 0, 0]} rotation={[0, 0, THREE.MathUtils.degToRad(rotation)]}>
        <planeGeometry args={[mapData.width, mapData.height]} />
        <meshBasicMaterial map={texture} toneMapped={false} transparent={true} alphaTest={0.01} />
      </mesh>
    )
  }),
)

// Tool types for better organization
type ToolType = "select" | "crop" | "rotate" | "move"

// Use React.memo to prevent unnecessary re-renders of the entire component
const PGMMapLoader = React.memo<PGMMapLoaderProps>((props) => {
  const [mapData, setMapData] = useState<MapData | null>(null)
  const [isCropMode, setIsCropMode] = useState(false)
  const [croppedImages, setCroppedImages] = useState<CroppedImageData[]>([])
  const [draggingImageId, setDraggingImageId] = useState<string | null>(null)
  const [undoStack, setUndoStack] = useState<MapState[]>([])
  const [canUndo, setCanUndo] = useState(false)
  const [baseCanvasZoom, setBaseCanvasZoom] = useState(1)
  const [isMouseOnMap, setIsMouseOnMap] = useState(false)
  const [leftPanelOpen, setLeftPanelOpen] = useState(true)
  const [rightPanelOpen, setRightPanelOpen] = useState(true)
  const [activeTool, setActiveTool] = useState<ToolType>("select")
  const [isFullscreen, setIsFullscreen] = useState(false)

  const cameraRef = useRef<THREE.OrthographicCamera>(null)
  const controlsRef = useRef<any>(null)
  const cropToolRef = useRef<any>(null)
  const mapMeshRef = useRef<any>(null)
  const [isCropToolEnabled, setIsCropToolEnabled] = useState(false)
  const [currentRotation, setCurrentRotation] = useState(0)

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
      cameraRef.current.position.copy(initialCameraState.current.position)
      cameraRef.current.rotation.copy(initialCameraState.current.rotation)
      cameraRef.current.zoom = initialCameraState.current.zoom
      cameraRef.current.updateProjectionMatrix()

      controlsRef.current.target.set(0, 0, 0)
      controlsRef.current.object.position.copy(initialCameraState.current.position)
      controlsRef.current.object.rotation.copy(initialCameraState.current.rotation)
      controlsRef.current.update()

      controlsRef.current.enableRotate = !isCropMode && !draggingImageId
      controlsRef.current.enablePan = !isCropMode && !draggingImageId
      controlsRef.current.enableZoom = !isCropMode && !draggingImageId
    }
  }, [isCropMode, draggingImageId])

  // Reset camera when entering crop mode with additional safety measures
  useEffect(() => {
    if (isCropMode) {
      resetCameraToSafeState()

      if (controlsRef.current) {
        controlsRef.current.enableRotate = false
        controlsRef.current.enablePan = false
        controlsRef.current.enableZoom = false
        controlsRef.current.autoRotate = false
        controlsRef.current.update()
      }
    } else {
      if (controlsRef.current) {
        controlsRef.current.enableRotate = false
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
        const currentRotation = cameraRef.current.rotation
        if (Math.abs(currentRotation.x) > 0.01 || Math.abs(currentRotation.y) > 0.01) {
          resetCameraToSafeState()
        }

        if (isCropMode || draggingImageId) {
          if (controlsRef.current.enableRotate) {
            controlsRef.current.enableRotate = false
            controlsRef.current.update()
          }
        }
      }
    }, 100)

    return () => clearInterval(interval)
  }, [isCropMode, draggingImageId, resetCameraToSafeState])

  // Memoize the data processing function to prevent unnecessary recreations
  const processData = useCallback(async () => {
    const manager = PGMWorkerManager.getInstance()

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
  }, [props.sourceType, props.content])

  // Call processData on mount and when dependencies change
  useEffect(() => {
    processData()
  }, [processData])

  // Save current state to undo stack
  const saveToUndoStack = useCallback(
    (currentMapData: MapData) => {
      if (currentMapData) {
        const newState: MapState = {
          data: new Uint8ClampedArray(currentMapData.data),
          width: currentMapData.width,
          height: currentMapData.height,
          rotation: rotation,
        }
        setUndoStack((prev) => [...prev, newState])
        setCanUndo(true)
      }
    },
    [rotation],
  )

  // Handle undo
  const handleUndo = useCallback(() => {
    if (undoStack.length > 0) {
      const previousState = undoStack[undoStack.length - 1]
      setMapData({
        data: previousState.data,
        width: previousState.width,
        height: previousState.height,
      })
      handleRotationChange(previousState.rotation)
      setUndoStack((prev) => prev.slice(0, -1))
      setCanUndo(undoStack.length > 1)
    }
  }, [undoStack, handleRotationChange])

  // Save crop handler
  const handleSaveCrop = useCallback(() => {
    if (cropToolRef.current) {
      const cropResult = cropToolRef.current.getCropRect()
      if (cropResult && mapData) {
        saveToUndoStack(mapData)

        setMapData({
          data: cropResult.data,
          width: cropResult.width,
          height: cropResult.height,
        })

        handleRotationChange(0)
        setIsCropMode(false)
        setIsCropToolEnabled(false)
        setActiveTool("select")

        setTimeout(() => {
          resetCameraToSafeState()
        }, 50)
      }
    }
  }, [mapData, handleRotationChange, resetCameraToSafeState, saveToUndoStack])

  // Cancel crop
  const handleCancelCrop = useCallback(() => {
    setIsCropMode(false)
    setIsCropToolEnabled(false)
    setActiveTool("select")

    setTimeout(() => {
      resetCameraToSafeState()
    }, 50)
  }, [resetCameraToSafeState])

  // Enhanced map click handler to prevent rotation issues
  const handleMapClickSafe = useCallback(
    (event: any) => {
      if (controlsRef.current) {
        controlsRef.current.enableRotate = false
        controlsRef.current.update()
      }

      handleMapClick(event)

      setTimeout(() => {
        resetCameraToSafeState()
      }, 10)
    },
    [handleMapClick, resetCameraToSafeState],
  )

  // Enhanced zoom controls
  const handleZoomIn = useCallback(() => {
    setBaseCanvasZoom((prev) => Math.min(prev * 1.2, 3))
  }, [])

  const handleZoomOut = useCallback(() => {
    setBaseCanvasZoom((prev) => Math.max(prev / 1.2, 0.3))
  }, [])

  const handleZoomReset = useCallback(() => {
    setBaseCanvasZoom(1)
  }, [])

  // Tool handlers
  const handleToolChange = useCallback(
    (tool: ToolType) => {
      setActiveTool(tool)

      if (tool === "crop" && isSelected) {
        setIsCropMode(true)
        setIsCropToolEnabled(true)
      } else {
        setIsCropMode(false)
        setIsCropToolEnabled(false)
      }
    },
    [isSelected],
  )

  // Add handler for base canvas zoom
  const handleBaseCanvasWheel = useCallback(
    (event: React.WheelEvent) => {
      if (!isMouseOnMap) {
        event.preventDefault()
        const zoomFactor = event.deltaY > 0 ? 0.9 : 1.1
        setBaseCanvasZoom((prev) => Math.min(Math.max(prev * zoomFactor, 0.3), 3))
      }
    },
    [isMouseOnMap],
  )

  // Add handler for map mouse events
  const handleMapMouseEnter = useCallback(() => {
    setIsMouseOnMap(true)
  }, [])

  const handleMapMouseLeave = useCallback(() => {
    setIsMouseOnMap(false)
  }, [])

  // Toggle fullscreen
  const toggleFullscreen = useCallback(() => {
    setIsFullscreen((prev) => !prev)
    if (!isFullscreen) {
      setLeftPanelOpen(false)
      setRightPanelOpen(false)
    } else {
      setLeftPanelOpen(true)
      setRightPanelOpen(true)
    }
  }, [isFullscreen])

  // Loading state component
  const loadingComponent = useMemo(
    () => (
      <div className="flex items-center justify-center min-h-screen bg-[#28282B]">
        <div className="w-8 h-8 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
      </div>
    ),
    [],
  )

  if (!mapData) return loadingComponent

  return (
    <div className="relative w-screen h-screen bg-[#f5f5f5] flex overflow-hidden">
      {/* Top Toolbar */}
      <div className="absolute top-0 left-0 right-0 z-50 bg-white border-b border-gray-200 shadow-sm">
        <div className="flex items-center justify-between px-4 py-2">
          {/* Left section */}
          <div className="flex items-center space-x-4">
            <div className="flex items-center space-x-2">
              <button
                onClick={() => setLeftPanelOpen(!leftPanelOpen)}
                className="p-2 rounded-lg hover:bg-gray-100 transition-colors"
              >
                <Menu className="w-5 h-5 text-gray-600" />
              </button>
              <h1 className="text-lg font-semibold text-gray-800">Map Editor</h1>
            </div>
          </div>

          {/* Center section - Tools */}
          <div className="flex items-center space-x-1 bg-gray-100 rounded-lg p-1">
            <button
              onClick={() => handleToolChange("select")}
              className={`p-2 rounded-md transition-all ${
                activeTool === "select" ? "bg-white shadow-sm text-blue-600" : "text-gray-600 hover:bg-gray-200"
              }`}
              title="Select Tool"
            >
              <MousePointer className="w-4 h-4" />
            </button>
            <button
              onClick={() => handleToolChange("crop")}
              disabled={!isSelected}
              className={`p-2 rounded-md transition-all ${
                activeTool === "crop"
                  ? "bg-white shadow-sm text-blue-600"
                  : isSelected
                    ? "text-gray-600 hover:bg-gray-200"
                    : "text-gray-400 cursor-not-allowed"
              }`}
              title="Crop Tool"
            >
              <Crop className="w-4 h-4" />
            </button>
            <button
              onClick={() => handleToolChange("rotate")}
              disabled={!isSelected || isCropMode}
              className={`p-2 rounded-md transition-all ${
                activeTool === "rotate"
                  ? "bg-white shadow-sm text-blue-600"
                  : isSelected && !isCropMode
                    ? "text-gray-600 hover:bg-gray-200"
                    : "text-gray-400 cursor-not-allowed"
              }`}
              title="Rotate Tool"
            >
              <RotateCcw className="w-4 h-4" />
            </button>
            {/* <button
              onClick={() => handleToolChange("move")}
              className={`p-2 rounded-md transition-all ${
                activeTool === "move" ? "bg-white shadow-sm text-blue-600" : "text-gray-600 hover:bg-gray-200"
              }`}
              title="Move Tool"
            >
              <Move className="w-4 h-4" />
            </button> */}
          </div>

          {/* Right section */}
          <div className="flex items-center space-x-2">
            <button
              onClick={handleUndo}
              disabled={!canUndo}
              className={`p-2 rounded-lg transition-all ${
                canUndo ? "text-gray-600 hover:bg-gray-100" : "text-gray-400 cursor-not-allowed"
              }`}
              title="Undo"
            >
              <Undo2 className="w-4 h-4" />
            </button>
            <button
              onClick={toggleFullscreen}
              className="p-2 rounded-lg hover:bg-gray-100 transition-colors text-gray-600"
              title={isFullscreen ? "Exit Fullscreen" : "Enter Fullscreen"}
            >
              {isFullscreen ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
            </button>
            <button
              onClick={() => setRightPanelOpen(!rightPanelOpen)}
              className="p-2 rounded-lg hover:bg-gray-100 transition-colors text-gray-600"
            >
              <Settings className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>

      {/* Left Panel - Tools */}
      {leftPanelOpen && !isFullscreen && (
        <div className="w-64 bg-white border-r border-gray-200 shadow-sm mt-14 flex flex-col">
          <div className="p-4 border-b border-gray-100">
            {/* <h2 className="text-sm font-semibold text-gray-800 mb-3">Tools</h2> */}

            {/* Tool Status */}
            {!isSelected && (
              <div className="p-3 bg-yellow-50 border border-yellow-200 rounded-lg mb-4">
                <p className="text-xs text-yellow-800">Click on the map to select it and enable tools</p>
              </div>
            )}

            {/* Crop Tool Section */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                {/* <span className="text-sm font-medium text-gray-700">Crop Tool</span> */}
                {isCropMode && <span className="text-xs bg-blue-100 text-blue-800 px-2 py-1 rounded-full">Active</span>}
              </div>

              {/*{!isCropMode && (
                <button
                  onClick={() => handleToolChange("crop")}
                  disabled={!isSelected}
                  className={`w-full px-3 py-2 text-sm rounded-lg transition-all ${
                    isSelected
                      ? "bg-blue-50 text-blue-700 border border-blue-200 hover:bg-blue-100"
                      : "bg-gray-100 text-gray-400 cursor-not-allowed"
                  }`}
                >
                  <div className="flex items-center justify-center space-x-2">
                    <Crop className="w-4 h-4" />
                    <span>Start Cropping</span>
                  </div>
                </button>
              )}*/}

              {isCropMode && (
                <div className="flex space-x-2">
                  <button
                    onClick={handleSaveCrop}
                    className="flex-1 px-3 py-2 text-sm bg-green-50 text-green-700 border border-green-200 rounded-lg hover:bg-green-100 transition-all"
                  >
                    <div className="flex items-center justify-center space-x-1">
                      <Save className="w-4 h-4" />
                      <span>Save</span>
                    </div>
                  </button>
                  <button
                    onClick={handleCancelCrop}
                    className="flex-1 px-3 py-2 text-sm bg-gray-100 text-gray-700 border border-gray-200 rounded-lg hover:bg-gray-200 transition-all"
                  >
                    <div className="flex items-center justify-center space-x-1">
                      <X className="w-4 h-4" />
                      <span>Cancel</span>
                    </div>
                  </button>
                </div>
              )}
            </div>
          </div>

          {/* Rotation Controls */}
          {activeTool === "rotate" && (
              <div className="space-y-3 p-3">
                <MapRotationControls
                  rotation={rotation}
                  isSelected={isSelected && !isCropMode}
                  onRotationChange={handleRotationChange}
                />
                {isCropMode && <p className="text-xs text-gray-500 italic">Rotation is disabled during cropping</p>}
              </div>
            )}

          {/* Layers Section */}
          <div className="border-b border-gray-100">
            {/* <div className="flex items-center space-x-2 mb-3">
              <Layers className="w-4 h-4 text-gray-600" />
              <h3 className="text-sm font-semibold text-gray-800">Layers</h3>
            </div> */}

            <div className="space-y-2">
              {/* Main Map Layer */}
              {/* <div
                className={`p-2 rounded-lg border transition-all ${
                  isSelected ? "border-blue-200 bg-blue-50" : "border-gray-200 bg-gray-50"
                }`}
              >
                <div className="flex items-center justify-between">
                  <span className="text-sm text-gray-700">Main Map</span>
                  <div className="flex items-center space-x-1">
                    {isSelected && <div className="w-2 h-2 bg-blue-500 rounded-full"></div>}
                  </div>
                </div>
              </div> */}

              {/* Cropped Images */}
              {croppedImages.map((img, index) => (
                <div key={img.id} className="p-2 rounded-lg border border-gray-200 bg-gray-50">
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-gray-700">Layer {index + 1}</span>
                    <button
                      onClick={() => setCroppedImages((prev) => prev.filter((i) => i.id !== img.id))}
                      className="text-gray-400 hover:text-red-500 transition-colors"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Canvas Controls */}
          <div className="p-4">
            <h3 className="text-sm font-semibold text-gray-800 mb-3">Canvas</h3>
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-sm text-gray-700">Zoom</span>
                <span className="text-sm text-gray-500">{Math.round(baseCanvasZoom * 100)}%</span>
              </div>
              <div className="flex items-center space-x-2">
                <button
                  onClick={handleZoomOut}
                  className="p-1 rounded border border-gray-300 hover:bg-gray-50 transition-colors"
                >
                  <ZoomOut className="w-4 h-4 text-gray-600" />
                </button>
                <button
                  onClick={handleZoomReset}
                  className="flex-1 px-2 py-1 text-xs bg-gray-100 hover:bg-gray-200 rounded transition-colors"
                >
                  Reset
                </button>
                <button
                  onClick={handleZoomIn}
                  className="p-1 rounded border border-gray-300 hover:bg-gray-50 transition-colors"
                >
                  <ZoomIn className="w-4 h-4 text-gray-600" />
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Main Canvas Area */}
      <div className="flex-1 flex items-center justify-center mt-14 bg-[#f5f5f5]">
        <div
          className="relative bg-[#cdcdcd] shadow-xl border border-gray-300 overflow-hidden"
          onWheel={handleBaseCanvasWheel}
          style={{
            width: CANVAS_WIDTH,
            height: CANVAS_HEIGHT,
            transform: `scale(${baseCanvasZoom})`,
            transformOrigin: "center",
            transition: "transform 0.1s ease-out",
          }}
        >
          {/* Canvas Zoom Indicator */}
          <div className="absolute top-2 left-2 z-20 bg-black/50 text-white text-xs px-2 py-1 rounded">
            {Math.round(baseCanvasZoom * 100)}%
          </div>

          {/* Main Map View */}
          <div ref={mapContainerRef} className="absolute inset-0">
            <div
              className={`absolute inset-0 transition-all duration-300 ${
                isSelected ? "ring-2 ring-blue-500 ring-opacity-70" : ""
              } cursor-pointer`}
              onClick={handleMapClickSafe}
              onMouseEnter={handleMapMouseEnter}
              onMouseLeave={handleMapMouseLeave}
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
                  enablePan={!isCropMode && !draggingImageId}
                  enableZoom={!isCropMode && !draggingImageId}
                  enableRotate={false}
                  autoRotate={false}
                  target={new THREE.Vector3(0, 0, 0)}
                  minPolarAngle={Math.PI / 2}
                  maxPolarAngle={Math.PI / 2}
                  minAzimuthAngle={0}
                  maxAzimuthAngle={0}
                  minDistance={50}
                  maxDistance={200}
                />
                {/* Main map */}
                <MapTexturePlane ref={mapMeshRef} mapData={mapData} rotation={rotation} />
                {/* Add border when map is selected */}
                {/* {isSelected && mapData && (
                  <lineSegments>
                    <edgesGeometry args={[new THREE.PlaneGeometry(mapData.width, mapData.height)]} />
                    <lineBasicMaterial color="black" linewidth={2} />
                  </lineSegments>
                )} */}
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
        </div>
      </div>

      {/* Right Panel - Properties */}
      {/* {rightPanelOpen && !isFullscreen && (
        <div className="w-80 bg-white border-l border-gray-200 shadow-sm mt-14 flex flex-col">
          <div className="p-4 border-b border-gray-100">
            


            {/* Export Options */}
            {/*<div className="space-y-3 mt-6">
              <h3 className="text-sm font-medium text-gray-700">Export</h3>
              <div className="space-y-2">
                <button className="w-full px-3 py-2 text-sm bg-blue-50 text-blue-700 border border-blue-200 rounded-lg hover:bg-blue-100 transition-all">
                  <div className="flex items-center justify-center space-x-2">
                    <Download className="w-4 h-4" />
                    <span>Export as PNG</span>
                  </div>
                </button>
                <button className="w-full px-3 py-2 text-sm bg-gray-100 text-gray-700 border border-gray-200 rounded-lg hover:bg-gray-200 transition-all">
                  <div className="flex items-center justify-center space-x-2">
                    <Upload className="w-4 h-4" />
                    <span>Save Project</span>
                  </div>
                </button>
              </div>
            </div>
          </div>
        </div>
      )} */}

      {/* Floating Zoom Controls (when in fullscreen) */}
      {isFullscreen && (
        <div className="absolute bottom-6 right-6 z-40 bg-white rounded-lg shadow-lg border border-gray-200 p-2">
          <div className="flex flex-col space-y-1">
            <button onClick={handleZoomIn} className="p-2 rounded hover:bg-gray-100 transition-colors" title="Zoom In">
              <ZoomIn className="w-4 h-4 text-gray-600" />
            </button>
            <div className="px-2 py-1 text-xs text-gray-500 text-center">{Math.round(baseCanvasZoom * 100)}%</div>
            <button
              onClick={handleZoomOut}
              className="p-2 rounded hover:bg-gray-100 transition-colors"
              title="Zoom Out"
            >
              <ZoomOut className="w-4 h-4 text-gray-600" />
            </button>
          </div>
        </div>
      )}
    </div>
  )
})

export default PGMMapLoader
