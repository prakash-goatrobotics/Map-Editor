import React, { useEffect, useState, useRef, useCallback } from "react"
import * as THREE from "three"
import PGMWorkerManager from "../workers/PGMWorkerManager"
import ImageViewer from "./PGMViewer"
import { useMapRotation } from "../hooks/useMapRotation"
import { useUndoStack } from "../hooks/useUndoStack"
import MapToolbar from "./UI/MapToolbar"
import MapView from "./UI/MapView"
import LeftPanel from "./UI/LeftPanel"
//import CroppedImageDragger from "./CroppedImageDragger"

// Constants
const CANVAS_WIDTH = 935
const CANVAS_HEIGHT = 550

interface MapData {
  data: Uint8ClampedArray
  width: number
  height: number
}

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

type ToolType = "select" | "crop" | "rotate" | "move"

const PGMMapLoader: React.FC<PGMMapLoaderProps> = (props) => {
  const [mapData, setMapData] = useState<MapData | null>(null)
  const [isCropMode, setIsCropMode] = useState(false)
  const [croppedImages, setCroppedImages] = useState<CroppedImageData[]>([])
  const [draggingImageId, setDraggingImageId] = useState<string | null>(null)
  const [baseCanvasZoom, setBaseCanvasZoom] = useState(1)
  const [isMouseOnMap, setIsMouseOnMap] = useState(false)
  const [leftPanelOpen, setLeftPanelOpen] = useState(true)
  const [rightPanelOpen, setRightPanelOpen] = useState(true)
  const [activeTool, setActiveTool] = useState<ToolType>("select")
  const [isFullscreen, setIsFullscreen] = useState(false)
  const [isCropToolEnabled, setIsCropToolEnabled] = useState(false)

  const cameraRef = useRef<THREE.OrthographicCamera>(null)
  const controlsRef = useRef<any>(null)
  const cropToolRef = useRef<any>(null)
  const mapMeshRef = useRef<any>(null)

  const { rotation, isSelected, mapContainerRef, handleRotationChange, handleMapClick } = useMapRotation()
  const { canUndo, saveToUndoStack, handleUndo } = useUndoStack()

  // Store the initial camera state
  const initialCameraState = useRef({
    position: new THREE.Vector3(0, 0, 100),
    rotation: new THREE.Euler(0, 0, 0),
    zoom: 1,
  })

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

  // Reset camera when entering crop mode
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
        if (isMouseOnMap && (Math.abs(currentRotation.x) > 0.01 || Math.abs(currentRotation.y) > 0.01)) {
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
  }, [isCropMode, draggingImageId, resetCameraToSafeState, isMouseOnMap])

  // Process data
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

  useEffect(() => {
    processData()
  }, [processData])

  // Handle undo
  const onUndo = useCallback(() => {
    if (mapData) {
      const previousState = handleUndo(handleRotationChange)
      if (previousState) {
        setMapData(previousState)
      }
    }
  }, [mapData, handleUndo, handleRotationChange])

  // Save crop handler
  const handleSaveCrop = useCallback(() => {
    if (cropToolRef.current) {
      const cropResult = cropToolRef.current.getCropRect()
      if (cropResult && mapData) {
        saveToUndoStack(mapData, rotation)

        const currentRotationRad = THREE.MathUtils.degToRad(rotation)
        const rotationMatrix = new THREE.Matrix4().makeRotationZ(-currentRotationRad)
        
        const centerX = cropResult.x + cropResult.width / 2
        const centerY = cropResult.y + cropResult.height / 2
        
        const rotatedCenter = new THREE.Vector3(centerX - mapData.width / 2, centerY - mapData.height / 2, 0)
          .applyMatrix4(rotationMatrix)
          .add(new THREE.Vector3(mapData.width / 2, mapData.height / 2, 0))
        
        const rotatedWidth = Math.abs(cropResult.width * Math.cos(currentRotationRad)) + 
                            Math.abs(cropResult.height * Math.sin(currentRotationRad))
        const rotatedHeight = Math.abs(cropResult.width * Math.sin(currentRotationRad)) + 
                             Math.abs(cropResult.height * Math.cos(currentRotationRad))

        setMapData({
          data: cropResult.data,
          width: cropResult.width,
          height: cropResult.height,
        })

        handleRotationChange(0)
        setIsCropMode(false)
        setIsCropToolEnabled(false)

        setTimeout(() => {
          //resetCameraToSafeState()
          if (controlsRef.current) {
            controlsRef.current.enabled = true
            controlsRef.current.enablePan = true
          }
        }, 50)
      }
    }
  }, [mapData, handleRotationChange, resetCameraToSafeState, saveToUndoStack, rotation])

  // Cancel crop
  const handleCancelCrop = useCallback(() => {
    setIsCropMode(false)
    setIsCropToolEnabled(false)

    setTimeout(() => {
      resetCameraToSafeState()
      if (controlsRef.current) {
        controlsRef.current.enabled = true
        controlsRef.current.enablePan = true
      }
    }, 50)
  }, [resetCameraToSafeState])

  // Enhanced map click handler
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

  // Loading state component
  const loadingComponent = (
    <div className="flex items-center justify-center min-h-screen bg-[#28282B]">
      <div className="w-8 h-8 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
    </div>
  )

  if (!mapData) return loadingComponent

  return (
    <div className="relative w-screen h-screen bg-[#f5f5f5] flex overflow-hidden">
      <MapToolbar
        activeTool={activeTool}
        isSelected={isSelected}
        isCropMode={isCropMode}
        canUndo={canUndo}
        isFullscreen={isFullscreen}
        leftPanelOpen={leftPanelOpen}
        rightPanelOpen={rightPanelOpen}
        onToolChange={handleToolChange}
        onUndo={onUndo}
        onToggleFullscreen={() => {
          setIsFullscreen((prev) => !prev)
          if (!isFullscreen) {
            setLeftPanelOpen(false)
            setRightPanelOpen(false)
          } else {
            setLeftPanelOpen(true)
            setRightPanelOpen(true)
          }
        }}
        onToggleLeftPanel={() => setLeftPanelOpen((prev) => !prev)}
        onToggleRightPanel={() => setRightPanelOpen((prev) => !prev)}
      />

      {leftPanelOpen && !isFullscreen && (
        <LeftPanel
          isSelected={isSelected}
          isCropMode={isCropMode}
          activeTool={activeTool}
          rotation={rotation}
          baseCanvasZoom={baseCanvasZoom}
          onSaveCrop={handleSaveCrop}
          onCancelCrop={handleCancelCrop}
          onRotationChange={handleRotationChange}
          onZoomChange={setBaseCanvasZoom}
        />
      )}

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
          <div className="absolute top-2 left-2 z-20 bg-black/50 text-white text-xs px-2 py-1 rounded">
            {Math.round(baseCanvasZoom * 100)}%
          </div>

          <div ref={mapContainerRef} className="absolute inset-0">
            <MapView
              mapData={mapData}
              isSelected={isSelected}
              isCropMode={isCropMode}
              isCropToolEnabled={isCropToolEnabled}
              rotation={rotation}
              cropToolRef={cropToolRef}
              mapMeshRef={mapMeshRef}
              cameraRef={cameraRef}
              controlsRef={controlsRef}
              croppedImages={croppedImages}
              setCroppedImages={setCroppedImages}
              draggingImageId={draggingImageId}
              setDraggingImageId={setDraggingImageId}
              onMapClick={handleMapClickSafe}
              onMouseEnter={() => setIsMouseOnMap(true)}
              onMouseLeave={() => setIsMouseOnMap(false)}
            />
          </div>
        </div>
      </div>
    </div>
  )
}

export default PGMMapLoader