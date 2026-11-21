import { floorBase } from './building';

export interface View {
  id: string;
  label: string; // HUD label
  pos: [number, number, number];
  tgt: [number, number, number];
  fov: number;
  roll?: number;
  side: -1 | 0 | 1; // where the text panel sits: -1 left (scene shifts right), 1 right
  explode?: number;
  cut?: number; // section plane height (Infinity = none)
  state?: number;
  highlight?: number;
  blueprint?: number;
  dusk?: number;
}

const f5 = floorBase(5);
const f6 = floorBase(6);

/** One camera keyframe per page section, in DOM order. */
export const VIEWS: View[] = [
  { id: 'hero', label: 'Exterior · contrapicado', pos: [56, 13, 50], tgt: [0, 22, 0], fov: 40, roll: -0.03, side: -1 },
  { id: 'vistas', label: 'Isométrica · casi ortográfica', pos: [150, 128, 150], tgt: [2, 20, 0], fov: 13, side: 1 },
  { id: 'navegacion', label: 'Fachada norte · N2–N7', pos: [-6, 22, 38], tgt: [0, 20, 0], fov: 44, side: -1, highlight: 1 },
  { id: 'estados', label: 'Fachada este · estados', pos: [44, 34, -14], tgt: [0, 24, 1], fov: 42, side: -1, state: 1 },
  { id: 'flujo', label: 'Issue · N6 fachada este', pos: [22, f6 + 4, 10], tgt: [9.6, f6 + 1.6, 2], fov: 40, roll: 0.04, side: 1, state: 1 },
  { id: 'recorrido', label: 'Interior · lobby', pos: [7.4, 2.0, 5.6], tgt: [-3, 1.7, 0.6], fov: 64, side: 1 },
  { id: 'niveles', label: 'Corte de sección · N5', pos: [16, f5 + 26, 19], tgt: [0, f5, 0], fov: 40, side: -1, cut: f5 + 2.7 },
  { id: 'formatos', label: 'Plano · IFC', pos: [-46, 30, 40], tgt: [0, 20, 0], fov: 36, side: 1, blueprint: 1 },
  { id: 'pipeline', label: 'Axonometría explotada', pos: [-64, 52, -46], tgt: [0, 36, 0], fov: 42, roll: 0.02, side: -1, explode: 1 },
  { id: 'clay', label: 'Azotea · grúa torre', pos: [24, 52, 22], tgt: [4, 44, -6], fov: 50, roll: -0.05, side: 1 },
  { id: 'obra', label: 'Aérea · obra completa', pos: [74, 86, 66], tgt: [0, 8, -2], fov: 36, side: -1 },
  { id: 'cta', label: 'Exterior · atardecer', pos: [-46, 17, 54], tgt: [2, 24, 0], fov: 38, roll: 0.025, side: 1, dusk: 1 },
];
