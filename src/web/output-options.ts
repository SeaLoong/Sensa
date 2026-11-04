import { getLocale, t } from './i18n.js';

interface Capability {
  type: string;
  available: boolean;
  reason?: string;
  reasonZh?: string;
  reasonCode?: string;
  source?: string;
}
export interface OutputChoice { value: string; label: string; }
export interface OutputChoiceState { available: boolean; reason: string; }
export interface OutputMenuOption extends OutputChoice { disabled: boolean; group?: string; title?: string; }

function inventory(value: unknown): Map<string, Capability> | null {
  if (!value || typeof value !== 'object' || !('outputs' in value) || !Array.isArray(value.outputs)) return null;
  const result = new Map<string, Capability>();
  for (const row of value.outputs as unknown[]) {
    if (!row || typeof row !== 'object' || !('type' in row) || !('available' in row)
      || typeof row.type !== 'string' || typeof row.available !== 'boolean') return null;
    const item: Capability = { type: row.type, available: row.available };
    const fields = row as Record<string, unknown>;
    for (const key of ['reason', 'reasonZh', 'reasonCode', 'source'] as const) {
      const fieldValue = fields[key];
      if (typeof fieldValue === 'string') item[key] = fieldValue;
    }
    result.set(item.type, item);
  }
  return result;
}

function reason(type: string, capability: Capability | undefined): string {
  switch (capability?.reasonCode) {
    case 'requires-secure-context': return t('需要 HTTPS 或 localhost');
    case 'missing-serial': return t('浏览器不支持串口');
    case 'missing-bluetooth': return t('浏览器不支持蓝牙');
    case 'missing-midi': return t('浏览器不支持 MIDI');
    case 'missing-websocket': return t('当前环境不支持 WebSocket');
    case 'missing-fetch': return t('当前环境不支持 HTTP');
    case 'desktop-only': return t('请使用桌面版');
  }
  if (capability?.source === 'native') return type === 'TCodeSerial' ? t('串口组件不可用') : t('MIDI 组件不可用');
  if (capability?.source === 'bridge') return t('需要配置蓝牙桥');
  return (getLocale() === 'zh-CN' ? capability?.reasonZh : capability?.reason) || t('当前环境不可用');
}

/** Keep the catalog stable within each availability group and resolve selection before rendering. */
export function buildOutputChoices(catalog: readonly OutputChoice[], availableTypes: readonly string[] | null,
  capabilities: unknown, selected: string): {
    options: OutputMenuOption[]; value: string; canAdd: boolean; states: ReadonlyMap<string, OutputChoiceState>;
  } {
  const reported = inventory(capabilities);
  const allowed = availableTypes === null ? null : new Set(availableTypes);
  const states = new Map<string, OutputChoiceState>();
  const available: OutputMenuOption[] = [], unavailable: OutputMenuOption[] = [];
  for (const item of catalog) {
    const state = reported?.get(item.value);
    const enabled = (allowed === null ? reported === null || state?.available === true : allowed.has(item.value))
      && state?.available !== false;
    const explanation = enabled ? '' : reason(item.value, state);
    states.set(item.value, { available: enabled, reason: explanation });
    (enabled ? available : unavailable).push({ value: item.value,
      label: enabled ? item.label : `${item.label} · ${explanation}`, disabled: !enabled,
      ...(!enabled ? { title: explanation } : {}) });
  }
  const value = available.some(item => item.value === selected) ? selected : available[0]?.value ?? '';
  const options = unavailable.length ? [
    ...available.map(item => ({ ...item, group: t('当前可用') })),
    ...unavailable.map(item => ({ ...item, group: t('当前不可用') })),
  ] : available;
  if (!available.length) options.unshift({ value: '', label: t('暂无可用输出类型'), disabled: true });
  return { options, value, canAdd: available.length > 0, states };
}
