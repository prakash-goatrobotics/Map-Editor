
import React from "react"
import { useEffect, useRef, useMemo, useCallback } from "react"
import { useThree } from "@react-three/fiber"
import * as THREE from "three"
import type { ThreeEvent } from "@react-three/fiber"
import { handleMousePoint } from "../utils/helper"

// Assuming MapData is defined elsewhere or can be defined here
interface MapData {
  data: Uint8ClampedArray
  width: number
  height: number
}

interface CroppedImageData extends MapData {
  id: string
  position: [number, number, number]
}

interface MapTexturePlaneProps {
  mapData: CroppedImageData // Only for cropped images
  position?: [number, number, number]
  onPointerDown?: (event: ThreeEvent<PointerEvent>) => void // Pointer down for this mesh
}

// Define MapTexturePlane here since it's used within CroppedImageDragger to render cropped images
const MapTexturePlane = React.memo<MapTexturePlaneProps>(({ mapData, position, onPointerDown }) => {
  const textureRef = useRef<THREE.DataTexture | null>(null)
  const meshRef = useRef<THREE.Mesh>(null)

  // Optimize texture creation with conditional updates
  useEffect(() => {
    if (
      !textureRef.current ||
      textureRef.current.image.width !== mapData.width ||
      textureRef.current.image.height !== mapData.height
    ) {
      // Create new texture if dimensions changed or texture doesn't exist
      const textureData = new THREE.DataTexture(mapData.data, mapData.width, mapData.height, THREE.RGBAFormat)
      textureData.type = THREE.UnsignedByteType
      textureData.format = THREE.RGBAFormat
      textureData.needsUpdate = true

      // Dispose of old texture if it exists
      if (textureRef.current) {
        textureRef.current.dispose()
      }

      textureRef.current = textureData
    } else {
      // Update existing texture data if dimensions are the same
      const imageData = textureRef.current.image.data as Uint8ClampedArray
      imageData.set(mapData.data)
      textureRef.current.needsUpdate = true
    }

    // Cleanup on unmount
    return () => {
      if (textureRef.current) {
        textureRef.current.dispose()
      }
    }
  }, [mapData])

  // Attach the image data to the mesh's userData for easy access in event handlers
  useEffect(() => {
    if (meshRef.current) {
      meshRef.current.userData = mapData // Store the entire image data object
    }
  }, [mapData]) // Depend on mapData to update userData if the image data changes

  return (
    <mesh ref={meshRef} position={position || [0, 0, 0]} onPointerDown={onPointerDown}>
      <planeGeometry args={[mapData.width, mapData.height]} />
      <meshBasicMaterial map={textureRef.current} toneMapped={false} transparent={true} />
    </mesh>
  )
})

interface CroppedImageDraggerProps {
  croppedImages: CroppedImageData[]
  setCroppedImages: React.Dispatch<React.SetStateAction<CroppedImageData[]>>
  isCropMode: boolean
  // Pass dragging state up to parent for OrbitControls
  draggingImageId: string | null
  setDraggingImageId: React.Dispatch<React.SetStateAction<string | null>>
}

const CroppedImageDragger: React.FC<CroppedImageDraggerProps> = ({
  croppedImages,
  setCroppedImages,
  isCropMode,
  draggingImageId,
  setDraggingImageId,
}) => {
  const { camera, gl } = useThree()

  // Use ref for dragging state to avoid re-renders
  const draggingImageIdRef = useRef<string | null>(draggingImageId)
  const dragOffsetRef = useRef<THREE.Vector3>(new THREE.Vector3())

  // Memoize Three.js objects
  const raycaster = useMemo(() => new THREE.Raycaster(new THREE.Vector3()), [])
  // Plane at the initial Z of the clicked object for dragging
  const dragPlane = useMemo(() => new THREE.Plane(), [])
  // Intersection point on the drag plane
  const intersection = useMemo(() => new THREE.Vector3(), [])

  // Keep internal dragging state in sync with parent prop
  useEffect(() => {
    draggingImageIdRef.current = draggingImageId
  }, [draggingImageId])

  // Handle pointer down on a cropped image to initiate drag
  const onImagePointerDown = useCallback(
    (event: ThreeEvent<PointerEvent>) => {
      if (isCropMode) {
        return
      }

      const clickedImage = event.object.userData as CroppedImageData
      const id = clickedImage.id

      if (!id) {
        return
      }

      draggingImageIdRef.current = id
      setDraggingImageId(id)

      event.stopPropagation()
      ;(event.nativeEvent.target as any).setPointerCapture(event.pointerId)

      dragPlane.setFromNormalAndCoplanarPoint(new THREE.Vector3(0, 0, 1), new THREE.Vector3(...clickedImage.position))

      dragOffsetRef.current.copy(event.point).sub(new THREE.Vector3(...clickedImage.position))
    },
    [isCropMode, setDraggingImageId, dragPlane],
  )

  // Handle pointer move while dragging on the canvas (using native DOM event)
  const onCanvasPointerMove = useCallback(
    (event: PointerEvent) => {
      if (draggingImageIdRef.current && isCropMode === false) {
        const pointer = handleMousePoint(event, gl)
        raycaster.setFromCamera(pointer, camera)

        if (raycaster.ray.intersectPlane(dragPlane, intersection)) {
          setCroppedImages((prev) =>
            prev.map((img) => {
              if (img.id === draggingImageIdRef.current) {
                const newPosition = intersection.clone().sub(dragOffsetRef.current)
                return { ...img, position: [newPosition.x, newPosition.y, img.position[2]] }
              }
              return img
            }),
          )
        }
      }
    },
    [gl, camera, raycaster, dragPlane, setCroppedImages, isCropMode],
  )

  // Handle pointer up on the canvas to stop dragging
  const onCanvasPointerUp = useCallback(
    (event: PointerEvent) => {
      if (draggingImageIdRef.current) {
        ;(event.target as any).releasePointerCapture(event.pointerId)
        draggingImageIdRef.current = null
        setDraggingImageId(null)
      }
    },
    [setDraggingImageId],
  )

  // Add global event listeners for dragging
  useEffect(() => {
    const canvas = gl.domElement
    canvas.addEventListener("pointermove", onCanvasPointerMove)
    canvas.addEventListener("pointerup", onCanvasPointerUp)
    return () => {
      canvas.removeEventListener("pointermove", onCanvasPointerMove)
      canvas.removeEventListener("pointerup", onCanvasPointerUp)
    }
  }, [gl, onCanvasPointerMove, onCanvasPointerUp])

  // Memoize the rendered images to prevent unnecessary re-renders
  const renderedImages = useMemo(
    () =>
      croppedImages.map((croppedImage) => (
        <MapTexturePlane
          key={croppedImage.id}
          mapData={croppedImage}
          position={croppedImage.position}
          onPointerDown={onImagePointerDown}
        />
      )),
    [croppedImages, onImagePointerDown],
  )

  return <>{renderedImages}</>
}

export default React.memo(CroppedImageDragger)
