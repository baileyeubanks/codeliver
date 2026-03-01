import { create } from "zustand";
import type { AnnotationType, Annotation, AnnotationData } from "@/lib/types/codeliver";

interface AnnotationStore {
  // Tool state
  activeTool: AnnotationType | null;
  color: string;
  opacity: number;
  strokeWidth: number;

  // Current annotations for the active frame
  annotations: Annotation[];
  drawingAnnotation: Partial<AnnotationData> | null;

  // Undo/redo
  undoStack: Annotation[][];
  redoStack: Annotation[][];

  // Actions
  setActiveTool: (tool: AnnotationType | null) => void;
  setColor: (color: string) => void;
  setOpacity: (opacity: number) => void;
  setStrokeWidth: (width: number) => void;
  setAnnotations: (annotations: Annotation[]) => void;
  addAnnotation: (annotation: Annotation) => void;
  removeAnnotation: (id: string) => void;
  updateAnnotation: (id: string, data: Partial<Annotation>) => void;
  setDrawingAnnotation: (data: Partial<AnnotationData> | null) => void;
  clearAnnotations: () => void;
  undo: () => void;
  redo: () => void;
  canUndo: () => boolean;
  canRedo: () => boolean;
}

const COLORS = [
  "#3b82f6", // blue (default)
  "#ef4444", // red
  "#22c55e", // green
  "#f59e0b", // orange
  "#a855f7", // purple
  "#ec4899", // pink
  "#ffffff", // white
];

export { COLORS as ANNOTATION_COLORS };

export const useAnnotationStore = create<AnnotationStore>((set, get) => ({
  activeTool: null,
  color: COLORS[0],
  opacity: 1,
  strokeWidth: 3,
  annotations: [],
  drawingAnnotation: null,
  undoStack: [],
  redoStack: [],

  setActiveTool: (tool) => set({ activeTool: tool, drawingAnnotation: null }),
  setColor: (color) => set({ color }),
  setOpacity: (opacity) => set({ opacity }),
  setStrokeWidth: (width) => set({ strokeWidth: width }),

  setAnnotations: (annotations) => set({ annotations }),

  addAnnotation: (annotation) => {
    const current = get().annotations;
    set({
      annotations: [...current, annotation],
      undoStack: [...get().undoStack, current],
      redoStack: [],
    });
  },

  removeAnnotation: (id) => {
    const current = get().annotations;
    set({
      annotations: current.filter((a) => a.id !== id),
      undoStack: [...get().undoStack, current],
      redoStack: [],
    });
  },

  updateAnnotation: (id, data) => {
    set({
      annotations: get().annotations.map((a) => (a.id === id ? { ...a, ...data } : a)),
    });
  },

  setDrawingAnnotation: (data) => set({ drawingAnnotation: data }),

  clearAnnotations: () => {
    const current = get().annotations;
    if (current.length === 0) return;
    set({
      annotations: [],
      undoStack: [...get().undoStack, current],
      redoStack: [],
    });
  },

  undo: () => {
    const { undoStack, annotations } = get();
    if (undoStack.length === 0) return;
    const prev = undoStack[undoStack.length - 1];
    set({
      annotations: prev,
      undoStack: undoStack.slice(0, -1),
      redoStack: [...get().redoStack, annotations],
    });
  },

  redo: () => {
    const { redoStack, annotations } = get();
    if (redoStack.length === 0) return;
    const next = redoStack[redoStack.length - 1];
    set({
      annotations: next,
      redoStack: redoStack.slice(0, -1),
      undoStack: [...get().undoStack, annotations],
    });
  },

  canUndo: () => get().undoStack.length > 0,
  canRedo: () => get().redoStack.length > 0,
}));
