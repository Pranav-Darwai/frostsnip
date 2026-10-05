import {
  ANNOTATION_COLORS,
  detectPiiFromOcr,
  FROST_UNIFORM_INTENSITY,
  frostAnnotationsFromHits,
  uid,
  type Annotation,
  type AnnotationColor,
  type AnnotationTool,
  type FrostAnnotation,
  type PiiHit,
} from "@snapshort/core";
import { create } from "zustand";

const MAX_HISTORY = 50;

export interface EditorState {
  imageDataUrl: string | null;
  width: number;
  height: number;
  annotations: Annotation[];
  past: Annotation[][];
  future: Annotation[][];
  tool: AnnotationTool;
  color: AnnotationColor;
  strokeWidth: number;
  selectedId: string | null;
  piiHits: PiiHit[];
  scanning: boolean;
  frostedBaseUrl: string | null;
  setImage: (dataUrl: string, width: number, height: number) => void;
  setTool: (tool: AnnotationTool) => void;
  setColor: (color: AnnotationColor) => void;
  setStrokeWidth: (n: number) => void;
  select: (id: string | null) => void;
  pushAnnotation: (a: Annotation) => void;
  updateAnnotation: (id: string, patch: Partial<Annotation>) => void;
  removeSelected: () => void;
  undo: () => void;
  redo: () => void;
  setPiiHits: (hits: PiiHit[]) => void;
  setScanning: (v: boolean) => void;
  applyPiiHit: (hit: PiiHit) => void;
  applyAllPii: () => void;
  setFrostedBaseUrl: (url: string | null) => void;
  clearAnnotations: () => void;
}

function commit(annotations: Annotation[], past: Annotation[][]) {
  const nextPast = [...past, annotations].slice(-MAX_HISTORY);
  return { past: nextPast, future: [] as Annotation[][] };
}

export const useEditorStore = create<EditorState>((set, get) => ({
  imageDataUrl: null,
  width: 0,
  height: 0,
  annotations: [],
  past: [],
  future: [],
  tool: "select",
  color: ANNOTATION_COLORS[4]!,
  strokeWidth: 3,
  selectedId: null,
  piiHits: [],
  scanning: false,
  frostedBaseUrl: null,

  setImage: (dataUrl, width, height) =>
    set({
      imageDataUrl: dataUrl,
      frostedBaseUrl: null,
      width,
      height,
      annotations: [],
      past: [],
      future: [],
      piiHits: [],
      selectedId: null,
    }),

  setTool: (tool) => set({ tool, selectedId: tool === "select" ? get().selectedId : null }),
  setColor: (color) => set({ color }),
  setStrokeWidth: (strokeWidth) => set({ strokeWidth }),
  select: (selectedId) => set({ selectedId }),

  pushAnnotation: (a) => {
    const { annotations, past } = get();
    const next = [...annotations, a];
    set({ annotations: next, ...commit(annotations, past), selectedId: a.id });
  },

  updateAnnotation: (id, patch) => {
    const { annotations, past } = get();
    const next = annotations.map((a) => (a.id === id ? ({ ...a, ...patch } as Annotation) : a));
    set({ annotations: next, ...commit(annotations, past) });
  },

  removeSelected: () => {
    const { selectedId, annotations, past } = get();
    if (!selectedId) return;
    const next = annotations.filter((a) => a.id !== selectedId);
    set({ annotations: next, selectedId: null, ...commit(annotations, past) });
  },

  undo: () => {
    const { past, annotations, future } = get();
    if (past.length === 0) return;
    const prev = past[past.length - 1]!;
    set({
      annotations: prev,
      past: past.slice(0, -1),
      future: [annotations, ...future].slice(0, MAX_HISTORY),
      selectedId: null,
    });
  },

  redo: () => {
    const { future, annotations, past } = get();
    if (future.length === 0) return;
    const next = future[0]!;
    set({
      annotations: next,
      future: future.slice(1),
      past: [...past, annotations].slice(-MAX_HISTORY),
      selectedId: null,
    });
  },

  setPiiHits: (piiHits) => set({ piiHits }),
  setScanning: (scanning) => set({ scanning }),

  applyPiiHit: (hit) => {
    const frosts = frostAnnotationsFromHits([hit], get().color);
    const { annotations, past } = get();
    const next = [...annotations, ...frosts];
    set({
      annotations: next,
      piiHits: get().piiHits.filter((h) => h.id !== hit.id),
      ...commit(annotations, past),
    });
  },

  applyAllPii: () => {
    const { piiHits, annotations, past, color } = get();
    if (piiHits.length === 0) return;
    const frosts = frostAnnotationsFromHits(piiHits, color);
    set({
      annotations: [...annotations, ...frosts],
      piiHits: [],
      ...commit(annotations, past),
    });
  },

  setFrostedBaseUrl: (frostedBaseUrl) => set({ frostedBaseUrl }),
  clearAnnotations: () => {
    const { annotations, past } = get();
    set({ annotations: [], selectedId: null, ...commit(annotations, past) });
  },
}));

export function createFrost(
  x: number,
  y: number,
  width: number,
  height: number,
  color: AnnotationColor,
  intensity = FROST_UNIFORM_INTENSITY,
  piiId?: string,
): FrostAnnotation {
  return {
    id: uid("frost"),
    tool: "frost",
    color,
    strokeWidth: 0,
    x,
    y,
    width,
    height,
    intensity,
    piiId,
  };
}

export { detectPiiFromOcr };
