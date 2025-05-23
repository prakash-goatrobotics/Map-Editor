import React from "react"
import type { ReactElement } from "react"
import { useEffect, useRef, useMemo, useState, useCallback } from "react"
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

// Define MapTexturePlane here since it's used within CroppedImageDragger to render cropped images
const MapTexturePlane = React.memo<MapTexturePlaneProps> (({ mapData, position, onPointerDown }) => {
  const textureRef = useRef<THREE.DataTexture | null>(null)
  // Memoize texture creation
  useEffect(() => {
    const { width, height, data } = mapData
    const textureData = new THREE.DataTexture(data, width, height, THREE.RGBAFormat)
    textureData.type = THREE.UnsignedByteType
    textureData.format = THREE.RGBAFormat
    textureData.needsUpdate = true
    textureRef.current = textureData

    //cleanup
    return () => {
      if (textureRef.current){
        textureRef.current.dispose()
      }
    }
  }, [mapData])

  const meshRef = useRef<THREE.Mesh>(null)

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
  // console.log('CroppedImageDragger rendered with:', {
  //   numImages: croppedImages.length,
  //   isCropMode,
  //   draggingImageId
  // });

  const { camera, gl } = useThree()
  //const [draggingImageIdInternal, setDraggingImageIdInternal] = useState<string | null>(draggingImageId)
  const draggingImageIdRef = useRef<string | null>
  (draggingImageId)

  const dragOffsetRef = useRef<THREE.Vector3>(new THREE.Vector3())

  const raycaster = useMemo(() => new THREE.Raycaster(new THREE.Vector3()), [])
  // Plane at the initial Z of the clicked object for dragging
  const dragPlane = useMemo(() => new THREE.Plane(), [])
  // Intersection point on the drag plane
  const intersection = useMemo(() => new THREE.Vector3(), [])

  // Keep internal dragging state in sync with parent prop
  useEffect(() => {
    //setDraggingImageIdInternal(draggingImageId)
    draggingImageIdRef.current = draggingImageId
  }, [draggingImageId])

  // Handle pointer down on a cropped image to initiate drag
  const onImagePointerDown = useCallback(
    (event: ThreeEvent<PointerEvent>) => {
    // console.log('onImagePointerDown triggered');
    if (isCropMode) {
      // console.log('Ignoring pointer down - crop mode active');
      return
    }

    const clickedImage = event.object.userData as CroppedImageData
    const id = clickedImage.id
    // console.log('Clicked image:', { id, position: clickedImage.position });

    if (!id) {
      // console.log('No image ID found');
      return
    }

    draggingImageIdRef.current = id
    setDraggingImageId(id)

    event.stopPropagation()
    ;(event.nativeEvent.target as any).setPointerCapture(event.pointerId)

    dragPlane.setFromNormalAndCoplanarPoint(new THREE.Vector3(0, 0, 1), new THREE.Vector3(...clickedImage.position))

    dragOffsetRef.current.copy(event.point).sub(new THREE.Vector3(...clickedImage.position))
    // console.log('Drag offset set:', dragOffsetRef.current);
  },
  [isCropMode, setDraggingImageId, dragPlane],
)

  // Handle pointer move while dragging on the canvas (using native DOM event)
  const onCanvasPointerMove = useCallback((event: PointerEvent) => {
    if (draggingImageIdRef.current && isCropMode === false) {
      // console.log('Canvas pointer move');

      const pointer = handleMousePoint(event, gl)
            raycaster.setFromCamera(pointer, camera)

      if (raycaster.ray.intersectPlane(dragPlane, intersection)) {
        // console.log('Intersection found:', intersection);
        setCroppedImages((prev) =>
          prev.map((img) => {
            if (img.id === draggingImageIdRef.current) {
              const newPosition = intersection.clone().sub(dragOffsetRef.current)
              // console.log('New position calculated:', newPosition);
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
  const onCanvasPointerUp = useCallback((event: PointerEvent) => {
    if (draggingImageIdRef.current) {
      // console.log('Pointer up - ending drag');
      ;(event.target as any).releasePointerCapture(event.pointerId)
      draggingImageIdRef.current = null
      setDraggingImageId(null)
    }
  }, [setDraggingImageId],
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

  // Render the cropped images with the pointer down handler attached
  return (
    <>
      {croppedImages.map((croppedImage) => (
        // console.log('Rendering cropped image:', croppedImage.id);
          <MapTexturePlane
            key={croppedImage.id}
            mapData={croppedImage}
            position={croppedImage.position}
            onPointerDown={onImagePointerDown}
          />
        
      ))}
    </>
  )
}

export default React.memo(CroppedImageDragger)
