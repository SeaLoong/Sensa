import type { JsonObject, JsonValue, RuntimeClient } from './runtime-client.ts';
import type { MotionAxis } from '../core/runtime/model.ts';
import type { AppConfig } from '../core/runtime/model.ts';

export type WorkbenchWorkspace = 'control' | 'osc' | 'pipeline' | 'settings';
export type WorkbenchInputMode = 'manual' | 'osc' | 'script' | 'protocol' | 'combined';
/** Hosts supply capabilities; the shared renderer does not guess from their names. */
export interface WorkbenchPlatform {
  name?: string;
  outputTypes?: readonly string[];
  inputModes?: readonly WorkbenchInputMode[];
  manualAxes?: readonly MotionAxis[];
  continuousManual?: boolean;
  supportsListeners?: boolean;
  selectSerialPort?(): Promise<void>;
  connectExplorer?(): Promise<void>;
}
export interface WorkbenchProps {
  client: RuntimeClient;
  platform?: WorkbenchPlatform;
  initialSnapshot?: WorkbenchInitialSnapshot;
}
/** A host can render its already available state without a duplicate initial fetch. */
export interface WorkbenchInitialSnapshot {
  config: AppConfig;
  overview: JsonObject;
  logs: JsonValue[];
  serialPorts: { portName: string; description?: string | null }[];
}

/** Native hosts report the adapters they actually loaded; missing inventories stay unknown. */
export function outputTypesForHost(capabilities: unknown): string[] | null {
  if (!capabilities || typeof capabilities !== 'object' || !('outputs' in capabilities) || !Array.isArray(capabilities.outputs)) return null;
  const types: string[] = [];
  for (const entry of capabilities.outputs as unknown[]) {
    if (!entry || typeof entry !== 'object' || !('type' in entry) || !('available' in entry)
      || typeof entry.type !== 'string' || typeof entry.available !== 'boolean') return null;
    if (entry.available && !types.includes(entry.type)) types.push(entry.type);
  }
  return types;
}
