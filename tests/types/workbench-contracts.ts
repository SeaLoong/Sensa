import type { MouseEvent } from 'react';
import type { RuntimeClient, JsonObject } from '../../src/web/runtime-client.ts';
import type { WorkbenchProps, WorkbenchPlatform } from '../../src/web/workbench-props.ts';
import type { ButtonProps, FieldProps, TabsProps } from '../../src/web/ui.tsx';

declare const client: RuntimeClient;
export const browserWorkbench: WorkbenchProps = { client, platform: { manualAxes: ['L0', 'A2'], inputModes: ['manual', 'script'] } };
export const invalidAxis: WorkbenchPlatform = {
  // @ts-expect-error Unknown axes cannot enter the shared workbench contract.
  manualAxes: ['L3'],
};
export const button: ButtonProps = { onClick(event: MouseEvent<HTMLButtonElement>) { event.currentTarget.disabled = true; }, tone: 'primary' };
export const invalidButton: ButtonProps = {
  // @ts-expect-error Button appearance has an explicit supported union.
  tone: 'invisible',
};
export const textarea: FieldProps = { label: 'Script', multiline: true, rows: 8, onChange(event) { event.currentTarget.value.toUpperCase(); } };
export const invalidField: FieldProps = {
  label: 'Name',
  // @ts-expect-error Native input fields do not accept textarea row counts.
  multiline: false, rows: 8,
};
export const tabs: TabsProps<'manual' | 'script'> = { id: 'inputs', label: 'Input', value: 'manual', options: [{ value: 'manual', label: 'Manual' }], onChange(value) { const mode: 'manual' | 'script' = value; return mode; } };
export const invalidTabs: TabsProps<'manual' | 'script'> = { id: 'inputs', label: 'Input', value: 'manual',
  // @ts-expect-error Every tab value belongs to the same input-mode union.
  options: [{ value: 'other', label: 'Other' }], onChange() {},
};
// JSON snapshots retain the API boundary and cannot carry executable callbacks.
export const invalidSnapshot: JsonObject = {
  // @ts-expect-error A received overview must be JSON, not a function.
  overview: { send() {} }, logs: [],
};
