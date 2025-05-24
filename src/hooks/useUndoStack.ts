import { useState, useCallback } from 'react'

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

interface UseUndoStackReturn {
  undoStack: MapState[]
  canUndo: boolean
  saveToUndoStack: (currentMapData: MapData, rotation: number) => void
  handleUndo: (onRotationChange: (rotation: number) => void) => MapData | null
}

export const useUndoStack = (): UseUndoStackReturn => {
  const [undoStack, setUndoStack] = useState<MapState[]>([])
  const [canUndo, setCanUndo] = useState(false)

  const saveToUndoStack = useCallback((currentMapData: MapData, rotation: number) => {
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
  }, [])

  const handleUndo = useCallback((onRotationChange: (rotation: number) => void): MapData | null => {
    if (undoStack.length > 0) {
      const previousState = undoStack[undoStack.length - 1]
      setUndoStack((prev) => prev.slice(0, -1))
      setCanUndo(undoStack.length > 1)
      onRotationChange(previousState.rotation)
      
      return {
        data: previousState.data,
        width: previousState.width,
        height: previousState.height,
      }
    }
    return null
  }, [undoStack])

  return {
    undoStack,
    canUndo,
    saveToUndoStack,
    handleUndo,
  }
} 