"use client";

import { useRef, useCallback, useState } from "react";
import { Stage, Layer, Circle, Rect, Line, Arrow, Text, Group } from "react-konva";
import type { KonvaEventObject } from "konva/lib/Node";
import { useAnnotationStore } from "@/lib/stores/annotationStore";
import type { AnnotationData, Annotation } from "@/lib/types/codeliver";

interface AnnotationCanvasProps {
  width: number;
  height: number;
  frameNumber: number;
  onAnnotationComplete?: (annotation: AnnotationData) => void;
}

export default function AnnotationCanvas({
  width,
  height,
  frameNumber,
  onAnnotationComplete,
}: AnnotationCanvasProps) {
  const { activeTool, color, opacity, strokeWidth, annotations, drawingAnnotation, setDrawingAnnotation } =
    useAnnotationStore();

  const isDrawing = useRef(false);
  const [drawPoints, setDrawPoints] = useState<number[]>([]);
  const [drawStart, setDrawStart] = useState<{ x: number; y: number } | null>(null);
  const [drawEnd, setDrawEnd] = useState<{ x: number; y: number } | null>(null);

  const frameAnnotations = annotations.filter((a) => a.frame_number === frameNumber);
  const pinCount = frameAnnotations.filter((a) => a.data.kind === "pin").length;

  const getRelativePos = useCallback(
    (e: KonvaEventObject<MouseEvent>) => {
      const stage = e.target.getStage();
      if (!stage) return { x: 0, y: 0 };
      const pos = stage.getPointerPosition();
      if (!pos) return { x: 0, y: 0 };
      return { x: pos.x, y: pos.y };
    },
    [],
  );

  const handleMouseDown = useCallback(
    (e: KonvaEventObject<MouseEvent>) => {
      if (!activeTool) return;
      const pos = getRelativePos(e);

      if (activeTool === "pin") {
        const data: AnnotationData = {
          kind: "pin",
          x: pos.x,
          y: pos.y,
          label: String(pinCount + 1),
        };
        onAnnotationComplete?.(data);
        return;
      }

      if (activeTool === "text") {
        const text = window.prompt("Enter annotation text:");
        if (text) {
          const data: AnnotationData = { kind: "text", x: pos.x, y: pos.y, text };
          onAnnotationComplete?.(data);
        }
        return;
      }

      isDrawing.current = true;
      setDrawStart(pos);
      setDrawEnd(pos);

      if (activeTool === "freehand") {
        setDrawPoints([pos.x, pos.y]);
      }
    },
    [activeTool, getRelativePos, onAnnotationComplete, pinCount],
  );

  const handleMouseMove = useCallback(
    (e: KonvaEventObject<MouseEvent>) => {
      if (!isDrawing.current || !activeTool) return;
      const pos = getRelativePos(e);
      setDrawEnd(pos);

      if (activeTool === "freehand") {
        setDrawPoints((prev) => [...prev, pos.x, pos.y]);
      }
    },
    [activeTool, getRelativePos],
  );

  const handleMouseUp = useCallback(() => {
    if (!isDrawing.current || !activeTool || !drawStart || !drawEnd) return;
    isDrawing.current = false;

    let data: AnnotationData | null = null;

    switch (activeTool) {
      case "rectangle": {
        const x = Math.min(drawStart.x, drawEnd.x);
        const y = Math.min(drawStart.y, drawEnd.y);
        const w = Math.abs(drawEnd.x - drawStart.x);
        const h = Math.abs(drawEnd.y - drawStart.y);
        if (w > 2 && h > 2) {
          data = { kind: "rectangle", x, y, width: w, height: h };
        }
        break;
      }
      case "arrow": {
        const dx = drawEnd.x - drawStart.x;
        const dy = drawEnd.y - drawStart.y;
        if (Math.sqrt(dx * dx + dy * dy) > 5) {
          data = {
            kind: "arrow",
            points: [drawStart.x, drawStart.y, drawEnd.x, drawEnd.y],
          };
        }
        break;
      }
      case "freehand": {
        if (drawPoints.length >= 4) {
          data = { kind: "freehand", points: drawPoints };
        }
        break;
      }
    }

    if (data) {
      onAnnotationComplete?.(data);
    }

    setDrawStart(null);
    setDrawEnd(null);
    setDrawPoints([]);
    setDrawingAnnotation(null);
  }, [activeTool, drawStart, drawEnd, drawPoints, onAnnotationComplete, setDrawingAnnotation]);

  const renderAnnotation = (annotation: Annotation, idx: number) => {
    const { data } = annotation;
    switch (data.kind) {
      case "pin":
        return (
          <Group key={annotation.id} x={data.x} y={data.y}>
            <Circle radius={12} fill={color} opacity={opacity} />
            <Text
              text={data.label ?? String(idx + 1)}
              fontSize={11}
              fontStyle="bold"
              fill="#ffffff"
              align="center"
              verticalAlign="middle"
              width={24}
              height={24}
              offsetX={12}
              offsetY={12}
            />
          </Group>
        );
      case "rectangle":
        return (
          <Rect
            key={annotation.id}
            x={data.x}
            y={data.y}
            width={data.width}
            height={data.height}
            stroke={color}
            strokeWidth={strokeWidth}
            opacity={opacity}
            fill={color}
            fillEnabled
            fillPatternImage={undefined}
          />
        );
      case "freehand":
        return (
          <Line
            key={annotation.id}
            points={data.points}
            stroke={color}
            strokeWidth={strokeWidth}
            opacity={opacity}
            tension={0.5}
            lineCap="round"
            lineJoin="round"
          />
        );
      case "arrow":
        return (
          <Arrow
            key={annotation.id}
            points={data.points}
            stroke={color}
            strokeWidth={strokeWidth}
            opacity={opacity}
            fill={color}
            pointerLength={10}
            pointerWidth={8}
          />
        );
      case "text":
        return (
          <Text
            key={annotation.id}
            x={data.x}
            y={data.y}
            text={data.text}
            fontSize={16}
            fill={color}
            opacity={opacity}
          />
        );
      default:
        return null;
    }
  };

  // Render in-progress drawing preview
  const renderDrawingPreview = () => {
    if (!isDrawing.current || !drawStart || !drawEnd) return null;

    switch (activeTool) {
      case "rectangle": {
        const x = Math.min(drawStart.x, drawEnd.x);
        const y = Math.min(drawStart.y, drawEnd.y);
        return (
          <Rect
            x={x}
            y={y}
            width={Math.abs(drawEnd.x - drawStart.x)}
            height={Math.abs(drawEnd.y - drawStart.y)}
            stroke={color}
            strokeWidth={strokeWidth}
            opacity={opacity * 0.6}
            dash={[6, 3]}
          />
        );
      }
      case "arrow":
        return (
          <Arrow
            points={[drawStart.x, drawStart.y, drawEnd.x, drawEnd.y]}
            stroke={color}
            strokeWidth={strokeWidth}
            opacity={opacity * 0.6}
            fill={color}
            pointerLength={10}
            pointerWidth={8}
          />
        );
      case "freehand":
        return drawPoints.length >= 4 ? (
          <Line
            points={drawPoints}
            stroke={color}
            strokeWidth={strokeWidth}
            opacity={opacity * 0.6}
            tension={0.5}
            lineCap="round"
            lineJoin="round"
          />
        ) : null;
      default:
        return null;
    }
  };

  return (
    <Stage
      width={width}
      height={height}
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      style={{ cursor: activeTool ? "crosshair" : "default" }}
    >
      <Layer>
        {frameAnnotations.map(renderAnnotation)}
        {renderDrawingPreview()}
      </Layer>
    </Stage>
  );
}
