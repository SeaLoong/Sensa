import React, { useId, useMemo, useState } from 'react';
import { Field } from './ui.jsx';
import { SelectField } from './controls.jsx';
import { t } from './i18n.js';
import { computedInputOptions } from './computed-signals.js';
import { mappingPathSuggestions } from './mapping-path-suggestions.js';
import { pointMetricOptions } from './osc-preview.js';
import { MANUAL_SIGNAL_AXES } from './signal-outputs.js';

export default function SignalSourceFields({ source, signals = [], pathOptions = [], pointOptions = [], onChange }) {
  const listId = useId();
  const [focused, setFocused] = useState(false);
  const direct = source.sourceMode === 'Direct';
  const suggestions = useMemo(() => direct ? mappingPathSuggestions(pathOptions, source.oscPath, { focused }) : [], [direct, pathOptions, source.oscPath, focused]);
  const defaults = { Manual: 'L0', Script: 'L0', Computed: signals[0]?.id || '', Constant: '' };
  return <>
    <SelectField data-testid="signal-source-mode" label={t('输入类型')} value={source.sourceMode} options={computedInputOptions()}
      onChange={sourceMode => onChange({ sourceMode, oscPath: defaults[sourceMode] || '' })} />
    {source.sourceMode === 'Constant' ? <Field label={t('固定数值')} type="number" step="any" value={source.value}
      onChange={event => onChange({ value: event.target.value === '' ? '' : Number(event.target.value) })} />
      : source.sourceMode === 'Computed' ? <SelectField label={t('计算信号')} value={source.oscPath}
        options={[{ value: '', label: t('选择计算信号') }, ...signals.map(signal => ({ value: signal.id, label: `${signal.name || signal.id} · ${signal.id}` }))]}
        onChange={oscPath => onChange({ oscPath })} />
        : source.sourceMode === 'Manual' ? <SelectField label={t('手动信号')} value={source.oscPath}
          options={MANUAL_SIGNAL_AXES.map(value => ({ value, label: `${value} · 0–1` }))} onChange={oscPath => onChange({ oscPath })} />
          : source.sourceMode === 'Script' ? <SelectField label={t('脚本信号')} value={source.oscPath} options={[
            { value: 'L0', label: t('脚本位置（0–1）') }, { value: 'Progress', label: t('播放进度（0–1）') }, { value: 'Time', label: t('播放时间（秒）') },
          ]} onChange={oscPath => onChange({ oscPath })} />
            : <>
              {source.sourceMode === 'SensaPoint' && pointOptions.length > 0 && <SelectField label={t('已识别的测量对象')}
                value={pointOptions.some(point => point.value === source.oscPath) ? source.oscPath : ''}
                options={[{ value: '', label: t('填写路径或选择测量对象') }, ...pointOptions]}
                onChange={oscPath => { if (oscPath) onChange({ oscPath }); }} />}
              <Field label={t(source.sourceMode === 'DeviceFeedback' ? '设备反馈路径' : source.sourceMode === 'RecordingReplay' ? '录制信号路径' : '参数路径')}
                value={source.oscPath} list={direct ? listId : undefined}
                placeholder={source.sourceMode === 'DeviceFeedback' ? 'output-id/connected' : source.sourceMode === 'RecordingReplay' ? 'recording-id/Signal1'
                  : source.sourceMode === 'SensaPoint' ? 'Sensa/SPS/Root/**' : 'OSC/Parameter'}
                onFocus={() => setFocused(true)} onBlur={() => setFocused(false)} onChange={event => onChange({ oscPath: event.target.value })} />
              {direct && <datalist id={listId}>{suggestions.map(path => <option key={path} value={path} />)}</datalist>}
            </>}
    {source.sourceMode === 'SensaPoint' && <SelectField label={t('测量指标')} value={source.pointMetric}
      options={pointMetricOptions(/^Sensa\/Contact\/[^/]+\//.test(source.oscPath || '') ? { kind: 'ContactRoot', supportsVelocity: true } : null)}
      onChange={pointMetric => onChange({ pointMetric })} />}
    {source.sourceMode === 'SensaPose' && <SelectField label={t('定位指标')} value={source.poseMetric} options={[
      { value: 'Depth', label: t('插入比例') }, { value: 'OffsetX', label: t('孔口 X 偏移（局部单位）') }, { value: 'OffsetY', label: t('孔口 Y 偏移（局部单位）') },
      { value: 'Yaw', label: t('偏航（度）') }, { value: 'Pitch', label: t('俯仰（度）') }, { value: 'Roll', label: t('扭转（度）') },
    ]} onChange={poseMetric => onChange({ poseMetric })} />}
  </>;
}
