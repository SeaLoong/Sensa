import React from 'react';
import { LOG_LEVEL_COLOR, formatAxisDisplayValue, formatAxisTraceAction, formatAxisTraceMode, formatAxisTraceNote, formatAxisTraceTerm, getTCodeDeviceInfoView } from './diagnostics.js';
import { formatAxisPositionFromNormalized } from './configuration.js';
import { HelpLabel } from './controls.jsx';
import { t, diagnostic } from './i18n.js';
import { Box, Button, Chip, Stack, Typography } from '@mui/material';

function AxisTraceMetric({ label, value }) {
  return (
    <Box className="axis-trace-metric">
      <Typography variant="caption" className="axis-trace-metric__label">
        {label}
      </Typography>
      <Typography variant="body2" className="axis-trace-metric__value">
        {value}
      </Typography>
    </Box>
  );
}

function AxisTraceLogEntry({ log, timeStr }) {
  const trace = log.axisTrace;
  if (!trace) return null;

  const actionMeta = formatAxisTraceAction(trace.action);
  const modeLabel = formatAxisTraceMode(trace.mode);
  const axisModeLabel = modeLabel ? `${modeLabel}${trace.invert ? t(" · 反向") : ''}` : trace.invert ? t("反向") : t("普通");
  const termLabel = formatAxisTraceTerm(trace.term);

  const metrics = [];

  if (Number.isFinite(trace.prevSrc) || Number.isFinite(trace.src)) {
    metrics.push({
      key: 'input',
      label: t("原始输入(0-999)"),
      value: `${formatAxisDisplayValue(trace.prevSrc)} → ${formatAxisDisplayValue(trace.src)}`,
    });
  }

  if (Number.isFinite(trace.prevOut) || Number.isFinite(trace.out)) {
    metrics.push({
      key: 'output',
      label: t("发送目标(0-999)"),
      value: `${formatAxisDisplayValue(trace.prevOut)} → ${formatAxisDisplayValue(trace.out)}`,
    });
  }

  if (Number.isFinite(trace.norm)) {
    metrics.push({ key: 'normalized', label: t("归一化输入(0-1)"), value: formatAxisDisplayValue(trace.norm, 3) });
  }

  if (Number.isFinite(trace.requestedSpeed)) {
    metrics.push({ key: 'requested-speed', label: t("请求速度(逻辑)"), value: formatAxisDisplayValue(trace.requestedSpeed) });
  }

  if (Number.isFinite(trace.speedLimit)) {
    metrics.push({ key: 'speed-limit', label: t("速度上限(逻辑)"), value: formatAxisDisplayValue(trace.speedLimit) });
  }

  if (Number.isFinite(trace.logicalSpeed)) {
    metrics.push({ key: 'logical-speed', label: t("逻辑 S 速度"), value: formatAxisDisplayValue(trace.logicalSpeed) });
  }

  if (Number.isFinite(trace.emittedSpeed)) {
    metrics.push({ key: 'emitted-speed', label: t("最终发出 S"), value: formatAxisDisplayValue(trace.emittedSpeed) });
  }

  if (Number.isFinite(trace.durationMs)) {
    metrics.push({ key: 'duration', label: t("最终 I 时长"), value: `${formatAxisDisplayValue(trace.durationMs)}ms` });
  }

  if (Number.isFinite(trace.remap)) {
    metrics.push({ key: 'remapped', label: t("重映射后(0-1)"), value: formatAxisDisplayValue(trace.remap, 3) });
  }

  if (Number.isFinite(trace.mapped)) {
    metrics.push({ key: 'clamped', label: t("边界裁剪后(0-1)"), value: formatAxisDisplayValue(trace.mapped, 3) });
  }

  if (Number.isFinite(trace.min) && Number.isFinite(trace.max)) {
    metrics.push({ key: 'bounds', label: t("边界限制"), value: `${trace.min}-${trace.max}` });
  }

  if (Number.isFinite(trace.remapMin) && Number.isFinite(trace.remapMax)) {
    metrics.push({ key: 'remap-range', label: t("映射目标区间"), value: `${trace.remapMin}-${trace.remapMax}` });
  }

  if ((trace.mode || '').toLowerCase() === 'locked' && Number.isFinite(trace.lock)) {
    metrics.push({ key: 'lock', label: t("锁定位置"), value: formatAxisPositionFromNormalized(trace.lock) });
  }

  return (
    <Box className={`log-entry log-entry--axis log-entry--axis-${(trace.action || 'unknown').toLowerCase()}`}>
      <Stack direction="row" spacing={1} useFlexGap flexWrap="wrap" alignItems="center" justifyContent="space-between">
        <Stack direction="row" spacing={0.75} useFlexGap flexWrap="wrap" alignItems="center">
          <Chip size="small" color="primary" label={trace.axis || 'AXIS'} />
          <Chip size="small" variant="outlined" color={actionMeta.color} label={actionMeta.label} />
          {termLabel && <Chip size="small" variant="outlined" label={termLabel} />}
          <Chip size="small" variant="outlined" label={axisModeLabel} />
          {log.category && <Chip size="small" variant="outlined" label={log.category} />}
          {trace.note && <Chip size="small" color="warning" variant="outlined" label={formatAxisTraceNote(trace.note)} />}
        </Stack>

        {timeStr ? (
          <Typography variant="caption" color="text.secondary">
            {timeStr}
          </Typography>
        ) : null}
      </Stack>

      {metrics.length > 0 && (
        <Box className="axis-trace-grid">
          {metrics.map(metric => (
            <AxisTraceMetric key={metric.key} label={metric.label} value={metric.value} />
          ))}
        </Box>
      )}
    </Box>
  );
}

function TCodeDeviceInfoCard({ deviceInfo, connected, onRefresh, busy = false, className = '' }) {
  const view = getTCodeDeviceInfoView(deviceInfo, connected);

  return (
    <Box className={`dialog-panel tcode-device-info${className ? ` ${className}` : ''}`}>
      <Box className="tcode-device-info__header">
        <Typography variant="subtitle2" component="div" className="tcode-device-info__title">
          <HelpLabel text={t("设备信息")} title={t("串口 TCode 输出连接后会按 D0 / D1 / D2 查询固件版本、TCode 版本与轴描述；若固件未实现某项查询，对应字段会显示“未返回”。")} />
        </Typography>

        <Button size="small" variant="text" className="tcode-device-info__refresh" onClick={onRefresh} disabled={busy || !connected}>{t("刷新设备信息")}</Button>
      </Box>

      <Stack direction="row" spacing={1} useFlexGap flexWrap="wrap" justifyContent="space-between" alignItems="flex-start" className="tcode-device-info__status-row">
        <Typography variant="body2" className={`tcode-device-info__status tcode-device-info__status--${view.statusTone}`}>
          {view.statusText}
        </Typography>

        {view.updatedAtText !== '—' && (
          <Typography variant="caption" className="tcode-device-info__updated">{t("最近刷新：")}{view.updatedAtText}
          </Typography>
        )}
      </Stack>

      <Box className="tcode-device-info__grid">
        <Box className="tcode-device-info__field">
          <Typography variant="caption" color="text.secondary">{t("固件版本（D0）")}</Typography>
          <Typography variant="body2" className="tcode-device-info__value">
            {view.firmwareVersionText}
          </Typography>
        </Box>

        <Box className="tcode-device-info__field">
          <Typography variant="caption" color="text.secondary">{t("TCode 版本（D1）")}</Typography>
          <Typography variant="body2" className="tcode-device-info__value">
            {view.tcodeVersionText}
          </Typography>
        </Box>
      </Box>

      {view.axisDescriptors.length > 0 && (
        <Box className="tcode-device-info__axes">
          <Typography variant="caption" color="text.secondary">{t("轴描述（D2）")}</Typography>

          <Box className="tcode-device-info__axis-list">
            {view.axisDescriptors.map((descriptor, index) => (
              <Typography key={`tcode-axis-${index}`} variant="caption" className="tcode-device-info__axis">
                {descriptor}
              </Typography>
            ))}
          </Box>
        </Box>
      )}
    </Box>
  );
}

function PlainLogEntry({ log, timeStr }) {
  return (
    <Box className={`log-entry log-entry--plain log-entry--level-${log.level || 'info'}`}>
      {(timeStr || log.category) && (
        <Typography variant="caption" className="log-entry__meta">
          {timeStr ? `[${timeStr}] ` : ''}
          {log.category ? `<${log.category}>` : ''}
        </Typography>
      )}
      <Typography variant="body2" className="log-entry__message" sx={{ color: LOG_LEVEL_COLOR[log.level] || '#1f2937' }}>
        {diagnostic(log.message)}
      </Typography>
    </Box>
  );
}

function SignalStatusMetric({ label, value, tone = 'default' }) {
  return (
    <Box className={`signal-row__metric signal-row__metric--${tone}`}>
      <Typography variant="caption" className="signal-row__metric-label">
        {label}
      </Typography>
      <Typography variant="body2" className="signal-row__metric-value">
        {value}
      </Typography>
    </Box>
  );
}

export { AxisTraceLogEntry, PlainLogEntry, SignalStatusMetric, TCodeDeviceInfoCard };
