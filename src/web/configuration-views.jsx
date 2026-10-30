import React, { useId, useMemo, useState } from 'react';
import {
  AXIS_MODE_SELECT_OPTIONS,
  COMMAND_MODE_OPTIONS,
  RAMP_TYPE_OPTIONS,
  SIGNAL_CURVE_OPTIONS,
  SIGNAL_ROLE_OPTIONS,
  getAxisModeSelectValue,
  getAxisMotionLimitFieldConfig,
  getSignalSimulationDefaultValue,
  normalizeCommandMode,
  parseAxisModeSelectValue,
} from './configuration.js';
import { computeSignalPreviewOutput } from './osc-workspace.js';
import { getDynamicFloatSliderBounds } from './numeric.js';
import { RangeField, SelectField, ValueSliderField } from './controls.jsx';
import { Badge, Button, Field, Notice, Toggle } from './ui.tsx';
import { t, diagnostic } from './i18n.js';
import { mappingPathSuggestions } from './mapping-path-suggestions.js';
import { pointMetricOptions } from './osc-preview.js';

export function MotionAxisEditor({ axisDefinition, value, disabled, onChange }) {
  const mode = value.mode || 'Normal';
  const limit = getAxisMotionLimitFieldConfig(value);
  return (
    <details className="axis-editor" open={axisDefinition.key === 'l0'}>
      <summary>
        <strong>{axisDefinition.axis}</strong>
        <span>{axisDefinition.label}</span>
        <Badge>{AXIS_MODE_SELECT_OPTIONS().find((item) => item.value === getAxisModeSelectValue(value))?.label}</Badge>
      </summary>
      <div className="stack">
        <SelectField
          label={t('轴模式')}
          value={getAxisModeSelectValue(value)}
          options={AXIS_MODE_SELECT_OPTIONS()}
          disabled={disabled}
          onChange={(next) => onChange(parseAxisModeSelectValue(next))}
        />
        {mode === 'Ignored' ? (
          <p className="muted">{t('该轴已忽略，不会参与输出。')}</p>
        ) : mode === 'Locked' ? (
          <ValueSliderField
            label={t('锁定位置')}
            value={Number(value.lockValue || 0)}
            min={0}
            max={1}
            step={0.01}
            onChange={(lockValue) => onChange({ lockValue })}
          />
        ) : (
          <div className="editor-group"><h4>{t('行程与限位')}</h4><p className="caption muted">{t('映射范围决定输入两端对应的设备位置；边界范围限制最终允许到达的位置。')}</p><div className="form-grid">
            <RangeField
              label={t('映射范围')}
              value={[value.remapMin, value.remapMax]}
              sliderMin={0}
              sliderMax={999}
              onChange={([remapMin, remapMax]) => onChange({ remapMin, remapMax })}
            />
            <RangeField
              label={t('边界范围')}
              value={[value.min, value.max]}
              sliderMin={0}
              sliderMax={999}
              onChange={([min, max]) => onChange({ min, max })}
            />
          </div></div>
        )}
        {mode !== 'Ignored' && (
          <div className="editor-group"><h4>{t('动作怎样过渡')}</h4><p className="caption muted">{t('选择按速度或时间移动，再设置过渡曲线和上限。')}</p>
            <div className="form-grid">
              <SelectField
                label={t('斜率方式')}
                value={normalizeCommandMode(value.commandMode)}
                options={COMMAND_MODE_OPTIONS()}
                disabled={disabled}
                onChange={(commandMode) => onChange({ commandMode })}
              />
              <SelectField
                label={t('斜率曲线')}
                value={value.rampType || 'None'}
                options={RAMP_TYPE_OPTIONS()}
                disabled={disabled}
                onChange={(rampType) => onChange({ rampType })}
              />
            </div>
            <ValueSliderField
              label={limit.label}
              title={limit.title}
              value={limit.value}
              min={limit.min}
              max={limit.max}
              step={limit.step}
              valueFormatter={limit.valueFormatter}
              onChange={(next) => onChange({ maxSpeed: limit.toProfileValue(next) })}
            />
          </div>
        )}
      </div>
    </details>
  );
}

export function OscHubTargetRow({ target, runtimeTarget, conflictMessages = [], onChange, onRemove }) {
  return (
    <div className="hub-target stack">
      <div className="form-grid hub-target__fields">
        <Field
          label={t('目标名称')}
          value={target.name || ''}
          onChange={(event) => onChange({ name: event.target.value })}
        />
        <Field
          label={t('目标地址')}
          value={target.host || ''}
          onChange={(event) => onChange({ host: event.target.value })}
        />
        <Field
          label={t('目标端口')}
          type="number"
          min={1}
          max={65535}
          value={target.port ?? ''}
          onChange={(event) => onChange({ port: Number(event.target.value) })}
        />
      </div>
      <div className="actions">
        <Toggle label={t('启用')} checked={target.enabled !== false} onChange={(enabled) => onChange({ enabled })} />
        <span className="muted">{runtimeTarget?.resolvedEndpoint || ''}</span>
        <Badge tone={runtimeTarget?.lastError ? 'error' : runtimeTarget?.lastSentAtUtc ? 'success' : 'default'}>
          {runtimeTarget?.lastError ? t('转发异常') : runtimeTarget?.lastSentAtUtc ? t('转发正常') : t('待收到数据')}
        </Badge>
        <Button tone="danger" onClick={onRemove}>
          {t('移除')}
        </Button>
      </div>
      {conflictMessages.length > 0 && <Notice tone="warning">{conflictMessages.join('；')}</Notice>}
      {runtimeTarget?.lastError && <Notice tone="error">{diagnostic(runtimeTarget.lastError)}</Notice>}
    </div>
  );
}

export function SignalMappingRow({ draft, latestEntry, pathOptions, computedSignals = [], allowComputed = true, onChange, onRemove }) {
  const pathListId = useId();
  const [pathFocused, setPathFocused] = useState(false);
  const pathSuggestions = useMemo(() => mappingPathSuggestions(pathOptions, draft.oscPath, { focused: pathFocused }),
    [pathOptions, draft.oscPath, pathFocused]);
  const simulatedValue = Number.isFinite(Number(draft.simulatedValue))
    ? Number(draft.simulatedValue)
    : getSignalSimulationDefaultValue(draft);
  const [simulationMin, simulationMax] = getDynamicFloatSliderBounds([
    draft.vrchatMin,
    draft.vrchatMax,
    latestEntry?.numericValue,
    simulatedValue,
  ]);
  const preview = draft.simulateEnabled
    ? computeSignalPreviewOutput(draft, simulatedValue)
    : ['OgbDepth', 'OgbTouch', 'SpsSocketDepth'].includes(draft.sourceMode) || (draft.sourceMode === 'SensaPose' && draft.poseMetric === 'Roll')
      ? null
      : computeSignalPreviewOutput(draft, latestEntry?.numericValue);
  return (
    <article className="mapping-row">
      <div className="form-grid mapping-row__source">
        <SelectField
          label={t('输入类型')}
          value={draft.sourceMode || 'Direct'}
          options={[
            { value: 'Direct', label: t('OSC 参数') },
            { value: 'OgbDepth', label: t('SPS1 / SPS2 自动识别') },
            { value: 'OgbTouch', label: t('OGB 触碰与门控') },
            { value: 'SpsSocketDepth', label: t('SPS2 · PenOthersNewRoot / PenOthersNewTip') },
            { value: 'SensaPose', label: t('三点姿态指标') },
            { value: 'SensaPoint', label: t('定位测量') },
            ...(allowComputed ? [{ value: 'Computed', label: t('计算信号') }] : []),
          ]}
          onChange={sourceMode => onChange({ sourceMode, ...(sourceMode === 'Computed' ? { oscPath: computedSignals[0]?.id || '' } : draft.sourceMode === 'Computed' ? { oscPath: '' } : {}) })}
        />
        {draft.sourceMode === 'SensaPoint' && <SelectField label={t('测量指标')} value={draft.pointMetric || 'Z'} options={pointMetricOptions(/^Sensa\/Contact\/[^/]+\//.test(draft.oscPath || '') ? { kind: 'ContactRoot', supportsVelocity: true } : /^Sensa\/Shader\/[^/]+\//.test(draft.oscPath || '') ? { kind: 'ShaderRoot' } : null)} onChange={pointMetric => onChange({ pointMetric })} />}
        {draft.sourceMode === 'SensaPose' && <SelectField label={t('定位指标')} value={draft.poseMetric || 'Depth'} options={[
          { value: 'Depth', label: t('插入比例') }, { value: 'OffsetX', label: t('孔口 X 偏移（局部单位）') }, { value: 'OffsetY', label: t('孔口 Y 偏移（局部单位）') },
          { value: 'Yaw', label: t('偏航（度）') }, { value: 'Pitch', label: t('俯仰（度）') }, { value: 'Roll', label: t('扭转（度）') },
        ]} onChange={poseMetric => onChange({ poseMetric })} />}
      </div>
      <div className="mapping-row__main">
        {draft.sourceMode === 'Computed' ? <SelectField className="mapping-row__path" label={t('计算信号')} value={draft.oscPath} options={[
          { value: '', label: t('选择计算信号') },
          ...computedSignals.map(signal => ({ value: signal.id, label: `${signal.name || signal.id} · ${signal.id}` })),
        ]} onChange={oscPath => onChange({ oscPath })} /> : <Field
          className="mapping-row__path"
          label={t('参数路径')}
          hint={t('输入路径片段查找建议；支持 *、**，多个路径用分号分隔。')}
          value={draft.oscPath}
          list={pathListId}
          onFocus={() => setPathFocused(true)}
          onBlur={() => setPathFocused(false)}
          onChange={(event) => onChange({ oscPath: event.target.value })}
        />}
        <datalist id={pathListId}>
          {pathSuggestions.map((path) => (
            <option key={path} value={path} />
          ))}
        </datalist>
        <SelectField
          className="mapping-row__target"
          label={t('目标轴')}
          value={draft.role}
          options={SIGNAL_ROLE_OPTIONS()}
          onChange={(role) => onChange({ role })}
        />
        <Toggle
          label={t('反向')}
          checked={draft.invertDirection}
          onChange={(invertDirection) => onChange({ invertDirection })}
        />
        <Button tone="danger" aria-label={t('移除映射')} onClick={onRemove}>
          {t('移除')}
        </Button>
      </div>
      <div className="mapping-row__status">
        <span>
          {t('实时输入')} <strong>{latestEntry?.value ?? t('未命中')}</strong>
        </span>
        <span>
          {t('预估位置')} <strong>{preview?.mappedPositionText || '—'}</strong>
        </span>
        {latestEntry?.matchCount > 1 && <Badge>{t('命中 {0} 条参数', [latestEntry.matchCount])}</Badge>}
      </div>
      <details>
        <summary>{t('范围与高级设置')}</summary>
        <div className="stack">
          <div className="form-grid">
            <RangeField
              label={t('输入范围')}
              value={[draft.vrchatMin, draft.vrchatMax]}
              sliderMin={null}
              sliderMax={null}
              inputMin={null}
              inputMax={null}
              step={0.01}
              onChange={([vrchatMin, vrchatMax]) => onChange({ vrchatMin, vrchatMax })}
            />
            <RangeField
              label={t('映射范围')}
              value={[draft.mappedMin, draft.mappedMax]}
              sliderMin={0}
              sliderMax={999}
              onChange={([mappedMin, mappedMax]) => onChange({ mappedMin, mappedMax })}
            />
          </div>
          <div className="form-grid">
            <SelectField
              label={t('映射曲线')}
              value={draft.curve || 'Linear'}
              options={SIGNAL_CURVE_OPTIONS()}
              onChange={(curve) => onChange({ curve })}
            />
          </div>
          <Toggle
            label={t('本地模拟')}
            checked={draft.simulateEnabled}
            onChange={(simulateEnabled) => onChange({ simulateEnabled, simulatedValue })}
          />
          {draft.simulateEnabled && (
            <ValueSliderField
              label={t('模拟参数值')}
              value={simulatedValue}
              min={simulationMin}
              max={simulationMax}
              step={0.01}
              onChange={(next) => onChange({ simulatedValue: next })}
            />
          )}
        </div>
      </details>
    </article>
  );
}
