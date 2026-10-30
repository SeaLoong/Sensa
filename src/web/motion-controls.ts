import { isMotionAxis } from '../core/runtime/model.ts';
import type { MotionAxis } from '../core/runtime/model.ts';

/** Selecting no axes must not silently expand a manual command to every device axis. */
export function requireManualAxes(value: unknown): MotionAxis[] {
  if (!Array.isArray(value) || value.length < 1 || value.length > 12 || !value.every(isMotionAxis)
    || new Set(value).size !== value.length) throw new TypeError('Choose 1–12 distinct motion axes.');
  return [...value];
}
