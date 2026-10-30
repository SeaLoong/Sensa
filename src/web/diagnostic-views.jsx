import React from 'react';
import {
  formatAxisDisplayValue,
  formatAxisTraceAction,
  formatAxisTraceMode,
  formatAxisTraceNote,
  formatAxisTraceTerm,
  getTCodeDeviceInfoView,
} from './diagnostics.js';
import { Badge, Button } from './ui.tsx';
import { t, diagnostic } from './i18n.js';

export function AxisTraceLogEntry({ log, timeStr }) {
  const trace = log.axisTrace;
  if (!trace) return null;
  const action = formatAxisTraceAction(trace.action);
  const values = [
    ['src', t('输入')],
    ['prevSrc', t('前次输入')],
    ['prevOut', t('前次输出')],
    ['norm', t('归一化')],
    ['remap', t('重映射')],
    ['mapped', t('限位后')],
    ['out', t('输出')],
    ['requestedSpeed', t('请求速度')],
    ['logicalSpeed', t('逻辑速度')],
    ['emittedSpeed', t('发送速度')],
    ['speedLimit', t('速度上限')],
    ['durationMs', t('时长')],
    ['lock', t('锁定位置')],
    ['min', t('下限')],
    ['max', t('上限')],
    ['remapMin', t('映射起点')],
    ['remapMax', t('映射终点')],
  ].filter(([key]) => trace[key] !== undefined && trace[key] !== null);
  return (
    <article className="log-entry">
      <div className="actions">
        <time>{timeStr}</time>
        <Badge>{trace.axis}</Badge>
        <Badge tone={action.color}>{action.label}</Badge>
        <span>{formatAxisTraceTerm(trace.term)}</span>
        <span>
          {formatAxisTraceMode(trace.mode)}
          {trace.invert ? t(' · 反向') : ''}
        </span>
        {trace.note && <span>{formatAxisTraceNote(trace.note)}</span>}
      </div>
      <div className="log-entry__metrics">
        {values.map(([key, label]) => (
          <span key={key}>
            {label}: {formatAxisDisplayValue(trace[key], ['norm', 'remap', 'mapped', 'lock'].includes(key) ? 3 : 0)}
          </span>
        ))}
      </div>
    </article>
  );
}
export function PlainLogEntry({ log, timeStr }) {
  return (
    <article className={`log-entry log-entry--${log.level || 'info'}`}>
      <div className="log-entry__meta">
        <time>{timeStr}</time> {log.category}
      </div>
      <p>{diagnostic(log.message)}</p>
    </article>
  );
}
export function TCodeDeviceInfoCard({ deviceInfo, connected, onRefresh, busy = false }) {
  const view = getTCodeDeviceInfoView(deviceInfo, connected);
  return (
    <details className="device-info">
      <summary>{t('设备信息')}</summary>
      <div className="stack">
        <div className="actions">
          <Badge tone={view.statusTone}>{view.statusText}</Badge>
          <Button onClick={onRefresh} disabled={busy || !connected}>
            {t('刷新设备信息')}
          </Button>
        </div>
        <dl className="metrics">
          <div>
            <dt>{t('固件版本（D0）')}</dt>
            <dd>{view.firmwareVersionText}</dd>
          </div>
          <div>
            <dt>{t('TCode 版本（D1）')}</dt>
            <dd>{view.tcodeVersionText}</dd>
          </div>
        </dl>
        {view.axisDescriptors.length > 0 && <p className="mono">{view.axisDescriptors.join(' · ')}</p>}
      </div>
    </details>
  );
}
