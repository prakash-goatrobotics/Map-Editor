import React, { useRef, useMemo } from 'react'
import * as THREE from 'three'

interface MapData {
  data: Uint8ClampedArray
  width: number
  height: number
}

interface MapTexturePlaneProps {
  mapData: MapData
  position?: [number, number, number]
  rotation?: number
}

const MapTexturePlane = React.memo(
  React.forwardRef<THREE.Mesh, MapTexturePlaneProps>(({ mapData, position, rotation = 0 }, ref) => {
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
  })
)

export default MapTexturePlane 