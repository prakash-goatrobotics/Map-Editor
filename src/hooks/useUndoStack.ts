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
  redoStack: MapState[]
  canUndo: boolean
  canRedo: boolean
  saveToUndoStack: (currentMapData: MapData, rotation: number) => void
  handleUndo: (onRotationChange: (rotation: number) => void) => MapData | null
  handleRedo: (onRotationChange: (rotation: number) => void) => MapData | null
}

export const useUndoStack = (): UseUndoStackReturn => {
  const [undoStack, setUndoStack] = useState<MapState[]>([])
  const [redoStack, setRedoStack] = useState<MapState[]>([])
  const [canUndo, setCanUndo] = useState(false)
  const [canRedo, setCanRedo] = useState(false)

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
      // Clear redo stack when a new action is performed
      setRedoStack([])
      setCanRedo(false)
    }
  }, [])

  const handleUndo = useCallback((onRotationChange: (rotation: number) => void): MapData | null => {
    if (undoStack.length > 1) {
      const currentState = undoStack[undoStack.length - 1]
      const previousState = undoStack[undoStack.length - 2]
      
      // Save current state to redo stack
      setRedoStack((prev) => [...prev, currentState])
      setCanRedo(true)
      
      // Remove current state from undo stack
      setUndoStack((prev) => prev.slice(0, -1))
      setCanUndo(undoStack.length > 2)
      
      onRotationChange(previousState.rotation)
      
      return {
        data: previousState.data,
        width: previousState.width,
        height: previousState.height,
      }
    }
    return null
  }, [undoStack])

  const handleRedo = useCallback((onRotationChange: (rotation: number) => void): MapData | null => {
    if (redoStack.length > 0) {
      const nextState = redoStack[redoStack.length - 1]
      
      // Save current state to undo stack
      setUndoStack((prev) => [...prev, nextState])
      setCanUndo(true)
      
      // Remove state from redo stack
      setRedoStack((prev) => prev.slice(0, -1))
      setCanRedo(redoStack.length > 1)
      
      onRotationChange(nextState.rotation)
      
      return {
        data: nextState.data,
        width: nextState.width,
        height: nextState.height,
      }
    }
    return null
  }, [redoStack])

  return {
    undoStack,
    redoStack,
    canUndo,
    canRedo,
    saveToUndoStack,
    handleUndo,
    handleRedo,
  }
} 