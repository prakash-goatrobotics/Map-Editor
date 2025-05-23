import React, { useEffect, useRef, useMemo, useState, useCallback } from "react"
import { useThree } from "@react-three/fiber"
import * as THREE from "three"
import type { ThreeEvent } from "@react-three/fiber"
import { handleMousePoint } from "../utils/helper"

// Assuming MapData is defined elsewhere or can be defined here
// Based on PGMMapLoader.tsx:
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

// Memoize MapTexturePlane component
const MapTexturePlane = React.memo<MapTexturePlaneProps>(({ mapData, position, onPointerDown }) => {
  const textureRef = useRef<THREE.DataTexture | null>(null)
  const meshRef = useRef<THREE.Mesh>(null)

  // Optimize texture creation
  useEffect(() => {
    if (!textureRef.current || textureRef.current.image.width !== mapData.width || textureRef.current.image.height !== mapData.height) {
      const textureData = new THREE.DataTexture(mapData.data, mapData.width, mapData.height, THREE.RGBAFormat)
      textureData.type = THREE.UnsignedByteType
      textureData.format = THREE.RGBAFormat
      textureData.needsUpdate = true
      textureRef.current = textureData
    } else {
      const imageData = textureRef.current.image.data as Uint8ClampedArray
      imageData.set(mapData.data)
      textureRef.current.needsUpdate = true
    }
  }, [mapData])

  // Attach the image data to the mesh's userData
  useEffect(() => {
    if (meshRef.current) {
      meshRef.current.userData = mapData
    }
  }, [mapData])

  return (
    <mesh ref={meshRef} position={position || [0, 0, 0]} onPointerDown={onPointerDown}>
      <planeGeometry args={[mapData.width, mapData.height]} />
      <meshBasicMaterial map={textureRef.current} toneMapped={false} transparent />
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
  // console.log('CroppedImageDragger rendered with:', {
  //   numImages: croppedImages.length,
  //   isCropMode,
  //   draggingImageId
  // });

  const { camera, gl } = useThree()
  const [draggingImageIdInternal, setDraggingImageIdInternal] = useState<string | null>(draggingImageId)
  const dragOffsetRef = useRef<THREE.Vector3>(new THREE.Vector3())

  // Memoize Three.js objects
  const raycaster = useMemo(() => new THREE.Raycaster(new THREE.Vector3()), [])
  const dragPlane = useMemo(() => new THREE.Plane(), [])
  const intersection = useMemo(() => new THREE.Vector3(), [])

  // Keep internal dragging state in sync with parent prop
  useEffect(() => {
    setDraggingImageIdInternal(draggingImageId)
  }, [draggingImageId])

  // Memoize event handlers
  const onImagePointerDown = useCallback((event: ThreeEvent<PointerEvent>) => {
    if (isCropMode) return

    const clickedImage = event.object.userData as CroppedImageData
    const id = clickedImage.id

    if (!id) return

    setDraggingImageIdInternal(id)
    setDraggingImageId(id)

    event.stopPropagation()
    ;(event.nativeEvent.target as any).setPointerCapture(event.pointerId)

    dragPlane.setFromNormalAndCoplanarPoint(new THREE.Vector3(0, 0, 1), new THREE.Vector3(...clickedImage.position))
    dragOffsetRef.current.copy(event.point).sub(new THREE.Vector3(...clickedImage.position))
  }, [isCropMode, setDraggingImageId])

  const onCanvasPointerMove = useCallback((event: PointerEvent) => {
    if (draggingImageIdInternal && isCropMode === false) {
      const pointer = handleMousePoint(event, gl)
      raycaster.setFromCamera(pointer, camera)

      if (raycaster.ray.intersectPlane(dragPlane, intersection)) {
        setCroppedImages((prev) =>
          prev.map((img) => {
            if (img.id === draggingImageIdInternal) {
              const newPosition = intersection.clone().sub(dragOffsetRef.current)
              return { ...img, position: [newPosition.x, newPosition.y, img.position[2]] }
            }
            return img
          }),
        )
      }
    }
  }, [camera, gl, draggingImageIdInternal, isCropMode, raycaster, setCroppedImages])

  const onCanvasPointerUp = useCallback((event: PointerEvent) => {
    if (draggingImageIdInternal) {
      ;(event.target as any).releasePointerCapture(event.pointerId)
      setDraggingImageIdInternal(null)
      setDraggingImageId(null)
    }
  }, [draggingImageIdInternal, setDraggingImageId])

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

  // Memoize the rendered images
  const renderedImages = useMemo(() => 
    croppedImages.map((croppedImage) => (
      <MapTexturePlane
        key={croppedImage.id}
        mapData={croppedImage}
        position={croppedImage.position}
        onPointerDown={onImagePointerDown}
      />
    )), [croppedImages, onImagePointerDown])

  return <>{renderedImages}</>
}

export default React.memo(CroppedImageDragger)