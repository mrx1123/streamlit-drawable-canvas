import React, { useEffect, useState } from "react"
import {
  ComponentProps,
  Streamlit,
  withStreamlitConnection,
} from "streamlit-component-lib"
import { fabric } from "fabric"
import { isEqual } from "lodash"

import CanvasToolbar from "./components/CanvasToolbar"
import UpdateStreamlit from "./components/UpdateStreamlit"

import { useCanvasState } from "./DrawableCanvasState"
import { tools, FabricTool } from "./lib"

function getStreamlitBaseUrl(): string | null {
  const params = new URLSearchParams(window.location.search)
  const baseUrl = params.get("streamlitUrl")
  if (baseUrl == null) {
    return null
  }

  try {
    return new URL(baseUrl).origin
  } catch {
    return null
  }
}

/**
 * Arguments Streamlit receives from the Python side
 */
export interface PythonArgs {
  fillColor: string
  strokeWidth: number
  strokeColor: string
  backgroundColor: string
  backgroundImageURL: string
  realtimeUpdateStreamlit: boolean
  canvasWidth: number
  canvasHeight: number
  drawingMode: string
  initialDrawing: Object
  displayToolbar: boolean
  displayRadius: number
}

/**
 * Define logic for the canvas area
 */
const DrawableCanvas = ({ args }: ComponentProps) => {
  const {
    canvasWidth,
    canvasHeight,
    backgroundColor,
    backgroundImageURL,
    realtimeUpdateStreamlit,
    drawingMode,
    fillColor,
    strokeWidth,
    strokeColor,
    displayRadius,
    initialDrawing,
    displayToolbar,
  }: PythonArgs = args

  /**
   * State initialization
   */
  const [canvas, setCanvas] = useState(new fabric.Canvas(""))
  canvas.stopContextMenu = true
  canvas.fireRightClick = true

  const [backgroundCanvas, setBackgroundCanvas] = useState(
    new fabric.StaticCanvas("")
  )
  const {
    canvasState: {
      action: { shouldReloadCanvas, forceSendToStreamlit },
      currentState,
      initialState,
    },
    saveState,
    undo,
    redo,
    canUndo,
    canRedo,
    forceStreamlitUpdate,
    resetState,
  } = useCanvasState()

  /**
   * Initialize canvases on component mount
   * NB: Remount component by changing its key instead of defining deps
   */
  useEffect(() => {
    const c = new fabric.Canvas("canvas", {
      enableRetinaScaling: false,
    })
    const imgC = new fabric.StaticCanvas("backgroundimage-canvas", {
      enableRetinaScaling: false,
    })
    setCanvas(c)
    setBackgroundCanvas(imgC)
    Streamlit.setFrameHeight()
  }, [])

  /**
   * Load user drawing into canvas
   * Python-side is in charge of initializing drawing with background color if none provided
   */
  useEffect(() => {
    if (!isEqual(initialState, initialDrawing)) {
      canvas.loadFromJSON(initialDrawing, () => {
        canvas.renderAll()
        resetState(initialDrawing)
      })
    }
  }, [canvas, initialDrawing, initialState, resetState])

  /**
   * Update background image
   */
  useEffect(() => {
    if (backgroundImageURL) {
      var bgImage = new Image();
      bgImage.onload = function() {
        var faImage = new fabric.Image(bgImage, {width: canvasWidth, height: canvasHeight});
        backgroundCanvas.add(faImage);
      };
      const baseUrl = getStreamlitBaseUrl() ?? ""
      bgImage.src = baseUrl + backgroundImageURL
    }
  }, [
    canvas,
    backgroundCanvas,
    canvasHeight,
    canvasWidth,
    backgroundColor,
    backgroundImageURL,
    saveState,
  ])

  /**
   * If state changed from undo/redo/reset, update user-facing canvas
   */
  useEffect(() => {
    if (shouldReloadCanvas) {
      canvas.loadFromJSON(currentState, () => {})
    }
  }, [canvas, shouldReloadCanvas, currentState])

  /**
   * Update canvas with selected tool
   * PS: add initialDrawing in dependency so user drawing update reinits tool
   */
  useEffect(() => {
    // Update canvas events with selected tool
    const selectedTool = new tools[drawingMode](canvas) as FabricTool
    const cleanupToolEvents = selectedTool.configureCanvas({
      fillColor: fillColor,
      strokeWidth: strokeWidth,
      strokeColor: strokeColor,
      displayRadius: displayRadius
    })

    // 鼠标滚轮，zoomtopoint
    canvas.on("mouse:wheel", (e: any) => {
      const delta = e.e.deltaY
      let zoom = canvas.getZoom()
    
      zoom *= 0.999 ** delta
      if (zoom > 10) zoom = 10

      // Ensure the canvas cannot be zoomed out smaller than the size of the canvas
      const minZoom = Math.min(canvasWidth / canvas.getWidth(), canvasHeight / canvas.getHeight()) * 0.5
      if (zoom < minZoom) zoom = minZoom

      let point = canvas.getPointer(e.e);

      canvas.zoomToPoint(new fabric.Point(point.x, point.y), zoom)
      backgroundCanvas.zoomToPoint(new fabric.Point(point.x, point.y), zoom)
      e.e.preventDefault()
      e.e.stopPropagation()
    })

    // right click, button === 3 to drag both canvas and backgroundCanvas
    let isDragging = false
    let lastPosX = 0
    let lastPosY = 0

    canvas.on("mouse:down", (e: any) => {
      if (e.button === 3) {
        isDragging = true
        const pointer = canvas.getPointer(e.e)
        lastPosX = pointer.x
        lastPosY = pointer.y
      }
    })

    canvas.on("mouse:move", (e: any) => {
      if (isDragging) {
        const pointer = canvas.getPointer(e.e)
        const deltaX = pointer.x - lastPosX
        const deltaY = pointer.y - lastPosY

        let point = new fabric.Point(deltaX, deltaY)

        canvas.relativePan(point)
        backgroundCanvas.relativePan(point)

        lastPosX = pointer.x
        lastPosY = pointer.y
      }
    })

    canvas.on("mouse:up", (e: any) => {
      saveState(canvas.toJSON())
      if (e.button === 3) {
        isDragging = false
        forceStreamlitUpdate()
      }
    })

    canvas.on("mouse:dblclick", () => {
      saveState(canvas.toJSON())
    })

    // Cleanup tool + send data to Streamlit events
    return () => {
      cleanupToolEvents()
      canvas.off("mouse:up")
      canvas.off("mouse:dblclick")
      canvas.off("mouse:wheel")
      canvas.off("mouse:down")
      canvas.off("mouse:move")
    }
  }, [
    canvas,
    strokeWidth,
    strokeColor,
    displayRadius,
    fillColor,
    drawingMode,
    initialDrawing,
    saveState,
    forceStreamlitUpdate,
  ])

  /**
   * Render canvas w/ toolbar
   */
  return (
    <div style={{ position: "relative" }}>
      <div
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          zIndex: -10,
          visibility: "hidden",
        }}
      >
        <UpdateStreamlit
          canvasHeight={canvasHeight}
          canvasWidth={canvasWidth}
          shouldSendToStreamlit={
            realtimeUpdateStreamlit || forceSendToStreamlit
          }
          stateToSendToStreamlit={currentState}
        />
      </div>
      <div
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          zIndex: 0,
        }}
      >
        <canvas
          id="backgroundimage-canvas"
          width={canvasWidth}
          height={canvasHeight}
        />
      </div>
      <div
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          zIndex: 10,
        }}
      >
        <canvas
          id="canvas"
          width={canvasWidth}
          height={canvasHeight}
          style={{ border: "lightgrey 1px solid" }}
        />
      </div>
      {displayToolbar && (
        <CanvasToolbar
          topPosition={canvasHeight}
          leftPosition={canvasWidth}
          canUndo={canUndo}
          canRedo={canRedo}
          downloadCallback={forceStreamlitUpdate}
          undoCallback={undo}
          redoCallback={redo}
          resetCallback={() => {
            resetState(initialState)
          }}
        />
      )}
    </div>
  )
}

export default withStreamlitConnection(DrawableCanvas)
