"use client"

import type React from "react"
import { useRef, useState, useEffect, useImperativeHandle, forwardRef } from "react"
import { useThree, useFrame } from "@react-three/fiber"
import * as THREE from "three"
import type { MutableRefObject } from "react"

const HANDLE_RADIUS = 6 // in world units, adjust as needed
const HANDLE_COLOR = "white"
const BORDER_COLOR = "black"
const BACKGROUND_COLOR = "#cdcdcd" // Match the background color

interface CropToolProps {
  // Target mesh to crop from
  targetMesh?: THREE.Mesh | null
  // Optional dimensions if not using targetMesh
  dimensions?: {
    width: number
    height: number
  }
  // Whether the tool is enabled
  enabled: boolean
  // Optional selection plane color
  selectionColor?: string
  // Optional selection opacity
  selectionOpacity?: number
  // Optional crop rectangle color
  cropRectColor?: string
  // Optional crop rectangle opacity
  cropRectOpacity?: number
  // Current rotation of the map
  currentRotation?: number
}

const CropTool = forwardRef<unknown, CropToolProps>((props, ref) => {
  const {
    targetMesh,
    dimensions,
    enabled,
    selectionColor = "transparent",
    selectionOpacity = 0.15,
    cropRectColor = BACKGROUND_COLOR, // Use the background color by default
    cropRectOpacity = 0.0, // Make it fully transparent since we're using the border
    currentRotation = 0,
  } = props
  const { camera, gl, size, scene } = useThree()
  const [start, setStart] = useState<THREE.Vector2 | null>(null)
  const [end, setEnd] = useState<THREE.Vector2 | null>(null)
  const [dragType, setDragType] = useState<null | "move" | number>(null) // null, 'move', or handle index (0-3)
  const [dragStart, setDragStart] = useState<THREE.Vector2 | null>(null)
  const [rectAtDragStart, setRectAtDragStart] = useState<{ start: THREE.Vector2; end: THREE.Vector2 } | null>(null)
  const selectionPlaneRef = useRef<THREE.Mesh>(null)
  const rectMeshRef = useRef<THREE.Mesh>(null)
  const renderTargetRef = useRef<THREE.WebGLRenderTarget | null>(null)
  const tempSceneRef = useRef<THREE.Scene | null>(null)
  const borderLineRef = useRef<THREE.Line | null>(null)

  // Cleanup function for render target and temporary scene
  const cleanupResources = () => {
    if (renderTargetRef.current) {
      renderTargetRef.current.dispose()
      renderTargetRef.current = null
    }
    if (tempSceneRef.current) {
      tempSceneRef.current.clear()
      tempSceneRef.current = null
    }
  }

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      cleanupResources()
    }
  }, [])

  // Get dimensions from either targetMesh or provided dimensions
  const getDimensions = () => {
    if (targetMesh) {
      const geometry = targetMesh.geometry as THREE.PlaneGeometry
      // Assuming the plane is centered at origin and has args [width, height]
      return {
        width: geometry.parameters.width || 0,
        height: geometry.parameters.height || 0,
      }
    }
    if (!dimensions) {
      console.error("CropTool: Either targetMesh or dimensions must be provided")
      return { width: 0, height: 0 }
    }
    return dimensions
  }

  const { width: mapWidth, height: mapHeight } = getDimensions()

  useEffect(() => {
    if (!enabled) {
      setStart(null)
      setEnd(null)
      setDragType(null)
      setDragStart(null)
      setRectAtDragStart(null)
    } else {
      // Initialize the crop rectangle to cover the entire map when crop mode is enabled
      setStart(new THREE.Vector2(-mapWidth / 2, -mapHeight / 2))
      setEnd(new THREE.Vector2(mapWidth / 2, mapHeight / 2))
    }
  }, [enabled, mapWidth, mapHeight])

  // Helper: get 4 corners
  const getCorners = () => {
    if (!start || !end) return []
    const minX = Math.min(start.x, end.x)
    const maxX = Math.max(start.x, end.x)
    const minY = Math.min(start.y, end.y)
    const maxY = Math.max(start.y, end.y)
    return [
      new THREE.Vector2(minX, minY), // 0: bottom-left
      new THREE.Vector2(maxX, minY), // 1: bottom-right
      new THREE.Vector2(maxX, maxY), // 2: top-right
      new THREE.Vector2(minX, maxY), // 3: top-left
    ]
  }

  // Mouse to world
  const toWorldCoords = (clientX: number, clientY: number): THREE.Vector2 => {
    const rect = gl.domElement.getBoundingClientRect()
    const canvasX = clientX - rect.left
    const canvasY = clientY - rect.top
    const ndcX = (canvasX / rect.width) * 2 - 1
    const ndcY = -(canvasY / rect.height) * 2 + 1
    const vec = new THREE.Vector3(ndcX, ndcY, 0)
    vec.unproject(camera)
    return new THREE.Vector2(vec.x, vec.y)
  }

  // Pointer events
  const onPointerDown = (e: React.PointerEvent) => {
    if (!enabled) return
    e.stopPropagation()
    const point = toWorldCoords(e.clientX, e.clientY)
    const corners = getCorners()
    // Check if on handle
    for (let i = 0; i < corners.length; i++) {
      if (point.distanceTo(corners[i]) < HANDLE_RADIUS) {
        setDragType(i) // handle index
        setDragStart(point.clone())
        setRectAtDragStart({ start: start!.clone(), end: end!.clone() })
        return
      }
    }
    // Check if inside rect (move)
    if (start && end) {
      const minX = Math.min(start.x, end.x),
        maxX = Math.max(start.x, end.x)
      const minY = Math.min(start.y, end.y),
        maxY = Math.max(start.y, end.y)
      if (point.x > minX && point.x < maxX && point.y > minY && point.y < maxY) {
        setDragType("move")
        setDragStart(point.clone())
        setRectAtDragStart({ start: start!.clone(), end: end!.clone() })
        return
      }
    }
  }

  const onPointerMove = (e: React.PointerEvent) => {
    if (!enabled || dragType === null || !dragStart || !rectAtDragStart) return
    e.stopPropagation()
    const point = toWorldCoords(e.clientX, e.clientY)
    const delta = point.clone().sub(dragStart)

    if (dragType === "move") {
      // Move whole rect
      const newStart = rectAtDragStart.start.clone().add(delta)
      const newEnd = rectAtDragStart.end.clone().add(delta)
      setStart(newStart)
      setEnd(newEnd)
    } else if (typeof dragType === "number") {
      // Drag handle (resize)
      const corners = getCornersAtStart(rectAtDragStart)
      const oppositeCornerIndex = (dragType + 2) % 4
      const oppositeCorner = corners[oppositeCornerIndex]

      // Determine which corner is being dragged and update start/end accordingly
      switch (dragType) {
        case 0: // bottom-left
          setStart(new THREE.Vector2(point.x, point.y))
          setEnd(new THREE.Vector2(oppositeCorner.x, oppositeCorner.y))
          break
        case 1: // bottom-right
          setStart(new THREE.Vector2(oppositeCorner.x, point.y))
          setEnd(new THREE.Vector2(point.x, oppositeCorner.y))
          break
        case 2: // top-right
          setStart(new THREE.Vector2(oppositeCorner.x, oppositeCorner.y))
          setEnd(new THREE.Vector2(point.x, point.y))
          break
        case 3: // top-left
          setStart(new THREE.Vector2(point.x, oppositeCorner.y))
          setEnd(new THREE.Vector2(oppositeCorner.x, point.y))
          break
      }
    }
  }

  // Helper: get corners at the start of a drag operation
  const getCornersAtStart = (rect: { start: THREE.Vector2; end: THREE.Vector2 }) => {
    const minX = Math.min(rect.start.x, rect.end.x)
    const maxX = Math.max(rect.start.x, rect.end.x)
    const minY = Math.min(rect.start.y, rect.end.y)
    const maxY = Math.max(rect.start.y, rect.end.y)
    return [
      new THREE.Vector2(minX, minY), // 0: bottom-left
      new THREE.Vector2(maxX, minY), // 1: bottom-right
      new THREE.Vector2(maxX, maxY), // 2: top-right
      new THREE.Vector2(minX, maxY), // 3: top-left
    ]
  }

  const onPointerUp = (e: React.PointerEvent) => {
    if (!enabled) return
    e.stopPropagation()
    setDragType(null)
    setDragStart(null)
    setRectAtDragStart(null)
  }

  useFrame(() => {
    if (rectMeshRef.current && start && end) {
      const width = Math.abs(end.x - start.x)
      const height = Math.abs(end.y - start.y)
      const centerX = (start.x + end.x) / 2
      const centerY = (start.y + end.y) / 2
      rectMeshRef.current.scale.set(width, height, 1)
      rectMeshRef.current.position.set(centerX, centerY, 0.2)
    }
    if (selectionPlaneRef.current) {
      selectionPlaneRef.current.scale.set(mapWidth, mapHeight, 1)
      selectionPlaneRef.current.position.set(0, 0, 0.1)
    }
    if (borderLineRef.current && start && end) {
      const corners = getCorners()
      if (corners.length === 4) {
        const points = [
          new THREE.Vector3(corners[0].x, corners[0].y, 0.3),
          new THREE.Vector3(corners[1].x, corners[1].y, 0.3),
          new THREE.Vector3(corners[2].x, corners[2].y, 0.3),
          new THREE.Vector3(corners[3].x, corners[3].y, 0.3),
          new THREE.Vector3(corners[0].x, corners[0].y, 0.3),
        ]
        const geometry = new THREE.BufferGeometry().setFromPoints(points)
        borderLineRef.current.geometry.dispose()
        borderLineRef.current.geometry = geometry
      }
    }
  })

  // Helper function to rotate a point around the origin
  const rotatePoint = (point: THREE.Vector2, angleInDegrees: number): THREE.Vector2 => {
    const angleInRadians = THREE.MathUtils.degToRad(-angleInDegrees) // Negative because we're counter-rotating
    const cos = Math.cos(angleInRadians)
    const sin = Math.sin(angleInRadians)
    const x = point.x * cos - point.y * sin
    const y = point.x * sin + point.y * cos
    return new THREE.Vector2(x, y)
  }

  // Expose getCropRect to parent
  useImperativeHandle(ref, () => ({
    getCropRect: () => {
      if (!start || !end || !targetMesh) {
        console.warn("CropTool: Cannot crop - start/end points or targetMesh are missing.")
        return null
      }

      const minX = Math.min(start.x, end.x)
      const maxX = Math.max(start.x, end.x)
      const minY = Math.min(start.y, end.y)
      const maxY = Math.max(start.y, end.y)

      const cropWidth = Math.floor(maxX - minX)
      const cropHeight = Math.floor(maxY - minY)

      if (cropWidth <= 0 || cropHeight <= 0) {
        console.warn("CropTool: Cannot crop - invalid crop dimensions.")
        return null
      }

      // Get the original texture from the target mesh
      const material = targetMesh.material as THREE.MeshBasicMaterial
      const originalTexture = material.map as THREE.DataTexture

      if (!originalTexture) {
        console.error("CropTool: Target mesh has no texture.")
        return null
      }

      // Get the original image data
      const originalData = originalTexture.image.data as Uint8ClampedArray
      const originalWidth = originalTexture.image.width
      const originalHeight = originalTexture.image.height

      // Calculate the crop region in texture coordinates, accounting for rotation
      // Convert from world coordinates to texture coordinates
      const worldToTextureX = (x: number, y: number) => {
        // If there's rotation, we need to counter-rotate the point first
        let rotatedPoint = new THREE.Vector2(x, y)
        if (currentRotation !== 0) {
          rotatedPoint = rotatePoint(rotatedPoint, currentRotation)
        }

        // Map from world space [-width/2, width/2] to texture space [0, width]
        return Math.round((rotatedPoint.x + mapWidth / 2) * (originalWidth / mapWidth))
      }

      const worldToTextureY = (x: number, y: number) => {
        // If there's rotation, we need to counter-rotate the point first
        let rotatedPoint = new THREE.Vector2(x, y)
        if (currentRotation !== 0) {
          rotatedPoint = rotatePoint(rotatedPoint, currentRotation)
        }

        // Map from world space [-height/2, height/2] to texture space [0, height]
        return Math.round((rotatedPoint.y + mapHeight / 2) * (originalHeight / mapHeight))
      }

      // If the map is rotated, we need to create a new texture with the correct orientation
      if (currentRotation !== 0) {
        // Create a new render target for the rotated crop
        const renderTarget = new THREE.WebGLRenderTarget(cropWidth, cropHeight)

        // Create a temporary scene
        const tempScene = new THREE.Scene()

        // Create a new mesh with the original texture
        const tempMaterial = new THREE.MeshBasicMaterial({ map: originalTexture })
        const tempMesh = new THREE.Mesh(new THREE.PlaneGeometry(mapWidth, mapHeight), tempMaterial)

        // Rotate the mesh to counter the current rotation
        tempMesh.rotation.z = THREE.MathUtils.degToRad(-currentRotation)

        // Position the mesh so the crop area is centered
        const cropCenter = new THREE.Vector2((minX + maxX) / 2, (minY + maxY) / 2)
        const rotatedCenter = rotatePoint(cropCenter, currentRotation)
        tempMesh.position.set(-rotatedCenter.x, -rotatedCenter.y, 0)

        tempScene.add(tempMesh)

        // Create an orthographic camera for the crop area
        const orthoCamera = new THREE.OrthographicCamera(
          cropWidth / -2,
          cropWidth / 2,
          cropHeight / 2,
          cropHeight / -2,
          0.1,
          10,
        )
        orthoCamera.position.z = 5

        // Render the scene to the render target
        gl.setRenderTarget(renderTarget)
        gl.render(tempScene, orthoCamera)
        gl.setRenderTarget(null)

        // Read the pixels from the render target
        const pixels = new Uint8Array(cropWidth * cropHeight * 4)
        gl.readRenderTargetPixels(renderTarget, 0, 0, cropWidth, cropHeight, pixels)

        // Clean up
        renderTarget.dispose()
        tempMaterial.dispose()

        // Return the cropped and correctly oriented data
        return {
          data: new Uint8ClampedArray(pixels),
          width: cropWidth,
          height: cropHeight,
        }
      }

      // If there's no rotation, use the direct pixel copying approach
      // Calculate texture coordinates for the crop region
      const texMinX = Math.max(0, worldToTextureX(minX, minY))
      const texMaxX = Math.min(originalWidth, worldToTextureX(maxX, maxY))
      const texMinY = Math.max(0, worldToTextureY(minX, minY))
      const texMaxY = Math.min(originalHeight, worldToTextureY(maxX, maxY))

      // Calculate the actual dimensions of the cropped texture
      const texWidth = texMaxX - texMinX
      const texHeight = texMaxY - texMinY

      // Create a new array for the cropped data
      const croppedData = new Uint8ClampedArray(texWidth * texHeight * 4)

      // Copy the pixel data from the original texture to the cropped texture
      for (let y = 0; y < texHeight; y++) {
        for (let x = 0; x < texWidth; x++) {
          const srcIdx = ((texMinY + y) * originalWidth + (texMinX + x)) * 4
          const dstIdx = (y * texWidth + x) * 4

          // Copy all four channels (RGBA)
          croppedData[dstIdx] = originalData[srcIdx]
          croppedData[dstIdx + 1] = originalData[srcIdx + 1]
          croppedData[dstIdx + 2] = originalData[srcIdx + 2]
          croppedData[dstIdx + 3] = originalData[srcIdx + 3]
        }
      }

      // Return the cropped data with its dimensions
      return {
        data: croppedData,
        width: texWidth,
        height: texHeight,
      }
    },
  }))

  // Render
  const corners = getCorners()

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
          <meshBasicMaterial color={selectionColor} opacity={selectionOpacity} transparent />
        </mesh>
      )}

      {/* Crop rectangle - now fully transparent to match background */}
      {enabled && start && end && (
        <mesh ref={rectMeshRef}>
          <planeGeometry args={[1, 1]} />
          <meshBasicMaterial color={cropRectColor} opacity={cropRectOpacity} transparent />
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
      {enabled &&
        corners.map((corner, i) => (
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
  )
})

export default CropTool