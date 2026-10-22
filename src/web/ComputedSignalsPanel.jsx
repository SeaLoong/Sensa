import React, { useId, useMemo, useState } from 'react';
import { Badge, Button, Field } from './ui.jsx';
import { SelectField } from './controls.jsx';
import { t, diagnostic, getLocale } from './i18n.js';
import { mappingPathSuggestions } from './mapping-path-suggestions.js';
import { pointMetricOptions, pointTrackingLabel } from './osc-preview.js';
import { COMPUTED_INPUT_LIMIT, COMPUTED_SIGNAL_LIMIT, computedInputOptions, computedOperationOptions, makeComputedInput, newComputedDraft } from './computed-signals.js';

function ComputedInputRow({ input, index, operation, signals, pathOptions, pointOptions, onChange, onRemove }) {
  const listId = useId();
  const [focused, setFocused] = useState(false);
  const suggestions = useMemo(() => mappingPathSuggestions(pathOptions, input.oscPath, { focused }), [pathOptions, input.oscPath, focused]);
  const constant = input.sourceMode === 'Constant', computed = input.sourceMode === 'Computed';
  return (
    <div className="computed-input stack" data-testid="computed-input-row">
      <div className="actions"><strong>{t('输入 {0}', [index + 1])}</strong><Button tone="danger" aria-label={t('移除输入 {0}', [index + 1])} onClick={onRemove}>{t('移除')}</Button></div>
      <div className="form-grid">
        <SelectField label={t('输入类型')} value={input.sourceMode} options={computedInputOptions()} onChange={sourceMode => onChange({ sourceMode, oscPath: sourceMode === 'Computed' ? signals[0]?.id || '' : '' })} />
        {input.sourceMode === 'SensaPoint' && pointOptions.length > 0 && <SelectField label={t('已识别的测量对象')} value={pointOptions.some(point => point.value === input.oscPath) ? input.oscPath : ''}
          options={[{ value: '', label: t('填写路径或选择测量对象') }, ...pointOptions]} onChange={oscPath => { if (oscPath) onChange({ oscPath }); }} />}
        {constant ? <Field label={t('固定数值')} type="number" step="any" value={input.value} onChange={event => onChange({ value: event.target.value === '' ? '' : Number(event.target.value) })} />
          : computed ? <SelectField label={t('计算信号')} value={input.oscPath} options={[{ value: '', label: t('选择计算信号') }, ...signals.map(signal => ({ value: signal.id, label: `${signal.name || signal.id} · ${signal.id}` }))]} onChange={oscPath => onChange({ oscPath })} />
            : <><Field label={t('参数路径')} value={input.oscPath} list={listId} placeholder={input.sourceMode === 'SensaPoint' ? 'Sensa/SPS/Root/**' : 'OSC/Parameter'}
              hint={t('OSC 参数选择一条明确路径；定位指标使用一个测量对象的整组路径。')}
              onFocus={() => setFocused(true)} onBlur={() => setFocused(false)} onChange={event => onChange({ oscPath: event.target.value })} />
              <datalist id={listId}>{suggestions.map(path => <option key={path} value={path} />)}</datalist></>}
        {input.sourceMode === 'SensaPoint' && <SelectField label={t('测量指标')} value={input.pointMetric} options={pointMetricOptions(/^Sensa\/Contact\/[^/]+\//.test(input.oscPath || '') ? { kind: 'ContactRoot', supportsVelocity: true } : null)} onChange={pointMetric => onChange({ pointMetric })} />}
        {input.sourceMode === 'SensaPose' && <SelectField label={t('定位指标')} value={input.poseMetric} options={[
          { value: 'Depth', label: t('插入比例') }, { value: 'OffsetX', label: t('孔口 X 偏移（m）') }, { value: 'OffsetY', label: t('孔口 Y 偏移（m）') },
          { value: 'Yaw', label: t('偏航（度）') }, { value: 'Pitch', label: t('俯仰（度）') }, { value: 'Roll', label: t('扭转（度）') },
        ]} onChange={poseMetric => onChange({ poseMetric })} />}
        {operation === 'WeightedAverage' && <Field label={t('权重')} type="number" min="0" step="any" value={input.weight} onChange={event => onChange({ weight: event.target.value === '' ? '' : Number(event.target.value) })} />}
      </div>
      {input.sourceMode === 'SensaPoint' && <p className="caption muted">{t('填写测量对象的整组路径，例如 Sensa/SPS/Root/**；计算使用解算后的坐标或速度。')}</p>}
    </div>
  );
}

function ComputedSignalCard({ draft, signals, runtime, graphDirty, selected, pathOptions, pointOptions, onSelect, onChange, onRemove, onMap }) {
  const valid = runtime?.valid && Number.isFinite(runtime.value);
  const [open, setOpen] = useState(selected);
  const others = useMemo(() => signals.filter(signal => signal.id !== draft.id), [signals, draft.id]);
  const reason = graphDirty || !runtime ? t('保存后查看结果') : diagnostic(runtime.reason) || t('等待完整输入');
  const value = valid && !graphDirty ? Number(runtime.value.toFixed(6)).toString() : '—';
  return (
    <details className="computed-signal" data-testid="computed-signal-card" open={open} onToggle={event => { setOpen(event.currentTarget.open); if (event.currentTarget.open) onSelect(draft.id); }}>
      <summary><strong>{draft.name || draft.id}</strong><code>{draft.id}</code><Badge tone={valid && !graphDirty ? 'success' : 'default'}>{computedOperationOptions().find(option => option.value === draft.operation)?.label || draft.operation}</Badge><output data-testid="computed-signal-value">{value}</output></summary>
      {open && <div className="stack computed-signal__body">
        <div className="form-grid computed-signal__settings">
          <Field label={t('信号名称')} value={draft.name || ''} maxLength={80} onChange={event => onChange({ name: event.target.value })} />
          <SelectField label={t('运算方式')} value={draft.operation} options={computedOperationOptions()} onChange={operation => onChange({ operation })} />
          <Field label={t('输入有效期（ms）')} type="number" min={0} max={60000} step={100} value={draft.maxAgeMs ?? 0} onChange={event => onChange({ maxAgeMs: event.target.value === '' ? '' : Number(event.target.value) })} />
        </div>
        {draft.operation === 'WeightedAverage' && <p className="caption muted">{t('权重表示各输入所占的比例。例如 0.2 的权重为 1、0.8 的权重为 3，结果为 0.65。')}</p>}
        {['Difference', 'Ratio'].includes(draft.operation) && <p className="caption muted">{t('按输入顺序计算，使用两项输入。')}</p>}
        {draft.operation === 'Magnitude' && <p className="caption muted">{t('把各项作为向量分量，例如用 X、Y、Z 计算到原点的距离。')}</p>}
        <p className="caption muted">{t('0 使用 OSC 接收设置；填写毫秒数可限制每项输入的有效期。定位采样继续检查对应定位方式的有效状态。')}</p>
        <div className="computed-inputs">{draft.inputs.map((input, index) => <ComputedInputRow key={index} input={input} index={index} operation={draft.operation} signals={others} pathOptions={pathOptions} pointOptions={pointOptions}
          onChange={patch => onChange({ inputs: draft.inputs.map((existing, inputIndex) => inputIndex === index ? { ...existing, ...patch } : existing) })}
          onRemove={() => onChange({ inputs: draft.inputs.filter((_, inputIndex) => inputIndex !== index) })} />)}</div>
        <div className="actions">
          <Button disabled={draft.inputs.length >= COMPUTED_INPUT_LIMIT} onClick={() => onChange({ inputs: [...draft.inputs, makeComputedInput()] })}>{t('新增输入')}</Button>
          <Button onClick={onMap}>{t('用于轴映射')}</Button>
          <Button tone="danger" onClick={onRemove}>{t('移除计算信号')}</Button>
        </div>
        <p className="caption muted" data-testid="computed-signal-status">{valid && !graphDirty ? t('已保存计算的实时结果：{0}', [value]) : reason}</p>
      </div>}
    </details>
  );
}

export default function ComputedSignalsPanel({ drafts = [], runtimeSignals = [], observations = [], selectedSourceKey = '', graphDirty = false, pathOptions = [], onChange, onMap }) {
  const locale = getLocale();
  const [selected, setSelected] = useState('');
  const runtimeById = useMemo(() => new Map(runtimeSignals.map(signal => [signal.id, signal])), [runtimeSignals]);
  const pointOptions = useMemo(() => [...new Map(observations.filter(point => (!selectedSourceKey || point.sourceKey === selectedSourceKey)
    && (['Point', 'Handle'].includes(point.kind) || point.party === 'Self' && point.isMappablePoint === true))
    .map(point => [`${point.prefix}/**`, { value: `${point.prefix}/**`, label: `${point.instance} · ${pointTrackingLabel(point) || point.kind}` }])).values()], [observations, selectedSourceKey, locale]);
  return (
    <section className="computed-signals stack" aria-label={t('计算信号')} data-testid="computed-signals-editor">
      <div className="computed-signals__heading"><h3>{t('计算信号')}</h3><Badge>{t('{0} 个计算', [drafts.length])}</Badge></div>
      <p className="caption muted">{t('组合 OSC 参数、定位结果和固定数值，再把计算结果映射到目标轴。计算信号也可以作为其他计算的输入。')}</p>
      {drafts.map(draft => <ComputedSignalCard key={draft.id} draft={draft} signals={drafts} runtime={runtimeById.get(draft.id)} graphDirty={graphDirty} selected={selected === draft.id} onSelect={setSelected} pathOptions={pathOptions} pointOptions={pointOptions}
        onChange={patch => onChange(drafts.map(existing => existing.id === draft.id ? { ...existing, ...patch } : existing))}
        onRemove={() => onChange(drafts.filter(existing => existing.id !== draft.id))} onMap={() => onMap(draft)} />)}
      <div className="actions"><Button disabled={drafts.length >= COMPUTED_SIGNAL_LIMIT} onClick={() => { const draft = newComputedDraft(drafts); setSelected(draft.id); onChange([...drafts, draft]); }}>{t('新增计算信号')}</Button></div>
    </section>
  );
}
