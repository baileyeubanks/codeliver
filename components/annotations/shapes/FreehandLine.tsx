"use client";

import { Line } from "react-konva";

interface FreehandLineProps {
  points: number[];
  color: string;
  opacity: number;
  strokeWidth: number;
}

export default function FreehandLine({
  points,
  color,
  opacity,
  strokeWidth,
}: FreehandLineProps) {
  return (
    <Line
      points={points}
      stroke={color}
      strokeWidth={strokeWidth}
      opacity={opacity}
      tension={0.5}
      lineCap="round"
      lineJoin="round"
    />
  );
}
