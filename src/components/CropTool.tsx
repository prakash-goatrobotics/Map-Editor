"use client"

import React from "react"
import { useRef, useState, useEffect, useImperativeHandle, forwardRef, useCallback, useMemo } from "react"
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
  // Current rotation of the map in degrees
  rotation?: number
  // Background color for transparent areas
  backgroundColor?: string
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
    rotation = 0, // Current rotation in degrees
    backgroundColor = "#cdcdcd", // Default background color
  } = props

  const { camera, gl, size, scene } = useThree()

  // State that affects rendering
  const [start, setStart] = useState<THREE.Vector2 | null>(null)
  const [end, setEnd] = useState<THREE.Vector2 | null>(null)

  // Use refs for values that don't need to trigger re-renders
  const dragTypeRef = useRef<null | "move" | number>(null) // null, 'move', or handle index (0-3)
  const dragStartRef = useRef<THREE.Vector2 | null>(null)
  const rectAtDragStartRef = useRef<{ start: THREE.Vector2; end: THREE.Vector2 } | null>(null)

  // Refs for Three.js objects
  const selectionPlaneRef = useRef<THREE.Mesh>(null)
  const rectMeshRef = useRef<THREE.Mesh>(null)
  const renderTargetRef = useRef<THREE.WebGLRenderTarget | null>(null)
  const tempSceneRef = useRef<THREE.Scene | null>(null)
  const borderLineRef = useRef<THREE.Line | null>(null)

  // Track if updates are needed in useFrame
  const needsUpdateRef = useRef(false)

  // Cleanup function for render target and temporary scene
  const cleanupResources = useCallback(() => {
    if (renderTargetRef.current) {
      renderTargetRef.current.dispose()
      renderTargetRef.current = null
    }
    if (tempSceneRef.current) {
      tempSceneRef.current.clear()
      tempSceneRef.current = null
    }
  }, [])

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      cleanupResources()
    }
  }, [cleanupResources])

  // Get dimensions from either targetMesh or provided dimensions - memoized
  const mapDimensions = useMemo(() => {
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
  }, [targetMesh, dimensions])

  const { width: mapWidth, height: mapHeight } = mapDimensions

  // Initialize or reset crop rectangle when enabled changes
  useEffect(() => {
    if (!enabled) {
      setStart(null)
      setEnd(null)
      dragTypeRef.current = null
      dragStartRef.current = null
      rectAtDragStartRef.current = null
    } else {
      // Initialize the crop rectangle to cover the entire map when crop mode is enabled
      setStart(new THREE.Vector2(-mapWidth / 2, -mapHeight / 2))
      setEnd(new THREE.Vector2(mapWidth / 2, mapHeight / 2))
    }
  }, [enabled, mapWidth, mapHeight])

  // Helper: get 4 corners - memoized
  const corners = useMemo(() => {
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
  }, [start, end])

  // Mouse to world - memoized
  const toWorldCoords = useCallback(
    (clientX: number, clientY: number): THREE.Vector2 => {
      const rect = gl.domElement.getBoundingClientRect()
      const canvasX = clientX - rect.left
      const canvasY = clientY - rect.top
      const ndcX = (canvasX / rect.width) * 2 - 1
      const ndcY = -(canvasY / rect.height) * 2 + 1
      const vec = new THREE.Vector3(ndcX, ndcY, 0)
      vec.unproject(camera)
      return new THREE.Vector2(vec.x, vec.y)
    },
    [gl, camera],
  )

  // Helper: get corners at the start of a drag operation - memoized
  const getCornersAtStart = useCallback((rect: { start: THREE.Vector2; end: THREE.Vector2 }) => {
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
  }, [])

  // Pointer events - optimized with useCallback
  const onPointerDown = useCallback(
    (e: React.PointerEvent) => {
      if (!enabled) return
      e.stopPropagation()
      const point = toWorldCoords(e.clientX, e.clientY)

      // Check if on handle
      for (let i = 0; i < corners.length; i++) {
        if (point.distanceTo(corners[i]) < HANDLE_RADIUS) {
          dragTypeRef.current = i // handle index
          dragStartRef.current = point.clone()
          rectAtDragStartRef.current = { start: start!.clone(), end: end!.clone() }
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
          dragTypeRef.current = "move"
          dragStartRef.current = point.clone()
          rectAtDragStartRef.current = { start: start!.clone(), end: end!.clone() }
          return
        }
      }
    },
    [enabled, corners, toWorldCoords, start, end],
  )

  const onPointerMove = useCallback(
    (e: React.PointerEvent) => {
      if (!enabled || dragTypeRef.current === null || !dragStartRef.current || !rectAtDragStartRef.current) return
      e.stopPropagation()
      const point = toWorldCoords(e.clientX, e.clientY)
      const delta = point.clone().sub(dragStartRef.current)

      if (dragTypeRef.current === "move") {
        // Move whole rect
        const newStart = rectAtDragStartRef.current.start.clone().add(delta)
        const newEnd = rectAtDragStartRef.current.end.clone().add(delta)
        setStart(newStart)
        setEnd(newEnd)
        needsUpdateRef.current = true
      } else if (typeof dragTypeRef.current === "number") {
        // Drag handle (resize)
        const corners = getCornersAtStart(rectAtDragStartRef.current)
        const oppositeCornerIndex = (dragTypeRef.current + 2) % 4
        const oppositeCorner = corners[oppositeCornerIndex]

        // Determine which corner is being dragged and update start/end accordingly
        switch (dragTypeRef.current) {
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
        needsUpdateRef.current = true
      }
    },
    [enabled, toWorldCoords, getCornersAtStart],
  )

  const onPointerUp = useCallback(
    (e: React.PointerEvent) => {
      if (!enabled) return
      e.stopPropagation()
      dragTypeRef.current = null
      dragStartRef.current = null
      rectAtDragStartRef.current = null
    },
    [enabled],
  )

  // Optimize useFrame by checking if updates are needed
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

    if (borderLineRef.current && start && end && corners.length === 4) {
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

    // Reset the update flag
    needsUpdateRef.current = false
  })

  // Parse color function - memoized
  const parseColor = useCallback((color: string): [number, number, number] => {
    // Handle hex format
    if (color.startsWith("#")) {
      const hex = color.slice(1)
      if (hex.length === 3) {
        // #RGB format
        const r = Number.parseInt(hex[0] + hex[0], 16)
        const g = Number.parseInt(hex[1] + hex[1], 16)
        const b = Number.parseInt(hex[2] + hex[2], 16)
        return [r, g, b]
      } else if (hex.length === 6) {
        // #RRGGBB format
        const r = Number.parseInt(hex.slice(0, 2), 16)
        const g = Number.parseInt(hex.slice(2, 4), 16)
        const b = Number.parseInt(hex.slice(4, 6), 16)
        return [r, g, b]
      }
    }
    // Default to light gray if parsing fails
    return [205, 205, 205]
  }, [])

  // Expose getCropRect to parent
  useImperativeHandle(
    ref,
    () => ({
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

        // Create a new array for the cropped data
        const croppedData = new Uint8ClampedArray(cropWidth * cropHeight * 4)

        // Convert rotation to radians
        const rotationRad = THREE.MathUtils.degToRad(rotation)
        const cosTheta = Math.cos(rotationRad)
        const sinTheta = Math.sin(rotationRad)

        // Get background color components
        const [bgR, bgG, bgB] = parseColor(backgroundColor)

        // Calculate the center of the original texture in world coordinates
        const textureCenterWorldX = 0 // Assuming the texture is centered at origin
        const textureCenterWorldY = 0

        // Calculate the center of the crop area in world coordinates
        const cropCenterWorldX = (minX + maxX) / 2
        const cropCenterWorldY = (minY + maxY) / 2

        // Scale factors to convert between world and texture coordinates
        const worldToTexScaleX = originalWidth / mapWidth
        const worldToTexScaleY = originalHeight / mapHeight

        // Debug logging for testing
        console.log("=== Crop Debug Info ===")
        console.log("Rotation (degrees):", rotation)
        console.log("Rotation (radians):", rotationRad)
        console.log("Crop area:", { minX, maxX, minY, maxY })
        console.log("Crop dimensions:", { cropWidth, cropHeight })
        console.log("Original texture dimensions:", { originalWidth, originalHeight })
        console.log("Map dimensions:", { mapWidth, mapHeight })
        console.log("Scale factors:", { worldToTexScaleX, worldToTexScaleY })
        console.log("Background color:", { bgR, bgG, bgB })

        // For each pixel in the cropped area
        for (let y = 0; y < cropHeight; y++) {
          for (let x = 0; x < cropWidth; x++) {
            // Calculate position relative to crop center in world coordinates
            const relWorldX = x - cropWidth / 2
            const relWorldY = y - cropHeight / 2

            // Calculate absolute world coordinates for this pixel in the crop
            const worldX = relWorldX + cropCenterWorldX
            const worldY = relWorldY + cropCenterWorldY

            // Calculate position relative to texture center
            const relToTextureWorldX = worldX - textureCenterWorldX
            const relToTextureWorldY = worldY - textureCenterWorldY

            // Apply inverse rotation to find the corresponding point in the original texture
            // This is the key step to handle rotation correctly
            const rotatedWorldX = relToTextureWorldX * cosTheta + relToTextureWorldY * sinTheta
            const rotatedWorldY = -relToTextureWorldX * sinTheta + relToTextureWorldY * cosTheta

            // Convert back to absolute world coordinates
            const originalWorldX = rotatedWorldX + textureCenterWorldX
            const originalWorldY = rotatedWorldY + textureCenterWorldY

            // Convert from world coordinates to texture coordinates
            const texX = Math.round((originalWorldX + mapWidth / 2) * worldToTexScaleX)
            const texY = Math.round((originalWorldY + mapHeight / 2) * worldToTexScaleY)

            // Calculate destination index
            const dstIdx = (y * cropWidth + x) * 4

            // Check if the texture coordinates are within bounds
            if (texX >= 0 && texX < originalWidth && texY >= 0 && texY < originalHeight) {
              // Calculate source index
              const srcIdx = (texY * originalWidth + texX) * 4

              // Copy all four channels (RGBA)
              croppedData[dstIdx] = originalData[srcIdx]
              croppedData[dstIdx + 1] = originalData[srcIdx + 1]
              croppedData[dstIdx + 2] = originalData[srcIdx + 2]
              croppedData[dstIdx + 3] = originalData[srcIdx + 3]
            } else {
              // Out of bounds - set to background color with zero alpha
              croppedData[dstIdx] = bgR
              croppedData[dstIdx + 1] = bgG
              croppedData[dstIdx + 2] = bgB
              croppedData[dstIdx + 3] = 0 // Fully transparent
            }
          }
        }

        // Log completion
        console.log("Crop processing completed successfully")
        console.log("========================")

        // Return the cropped data with its dimensions
        return {
          data: croppedData,
          width: cropWidth,
          height: cropHeight,
        }
      },
    }),
    [start, end, targetMesh, mapWidth, mapHeight, rotation, backgroundColor, parseColor],
  )

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

// Wrap with React.memo to prevent unnecessary re-renders
export default React.memo(CropTool)
