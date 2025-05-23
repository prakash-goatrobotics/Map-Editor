"use client"

import type React from "react"

import { useState, useRef, useCallback } from "react"

interface UseMapRotationReturn {
  rotation: number
  setRotation: (value: number) => void
  isSelected: boolean
  mapContainerRef: React.RefObject<HTMLDivElement | null>
  handleRotationChange: (value: number) => void
  handleMapClick: (e: React.MouseEvent) => void
}

export const useMapRotation = (): UseMapRotationReturn => {
  const [rotation, setRotation] = useState(0)
  const [isSelected, setIsSelected] = useState(false)
  const mapContainerRef = useRef<HTMLDivElement | null>(null)

  // Optimize event handlers with useCallback
  const handleRotationChange = useCallback(
    (value: number) => {
      if (isSelected) {
        setRotation(value)
      }
    },
    [isSelected],
  )

  const handleMapClick = useCallback((e: React.MouseEvent) => {
    e.stopPropagation()
    setIsSelected((prev) => !prev) // Toggle selection state
  }, [])

  return {
    rotation,
    setRotation,
    isSelected,
    mapContainerRef,
    handleRotationChange,
    handleMapClick,
  }
}
