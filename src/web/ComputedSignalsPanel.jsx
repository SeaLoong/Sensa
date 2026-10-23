import React, { useMemo, useState } from 'react';
import { Badge, Button, Field } from './ui.jsx';
import { SelectField } from './controls.jsx';
import { t, diagnostic, getLocale } from './i18n.js';
import SignalSourceFields from './SignalSourceFields.jsx';
import { pointTrackingLabel } from './osc-preview.js';
import { COMPUTED_INPUT_LIMIT, COMPUTED_SIGNAL_LIMIT, computedOperationOptions, computedOperationFields, computedOperationHelp, changeComputedOperation, UNARY_COMPUTED_OPERATIONS, makeComputedInput, newComputedDraft } from './computed-signals.js';

function ComputedInputRow({ input, index, operation, signals, pathOptions, pointOptions, onChange, onRemove }) {
  return <div className="computed-input stack" data-testid="computed-input-row">
    <div className="actions"><strong>{t('输入 {0}', [index + 1])}</strong><Button tone="danger" aria-label={t('移除输入 {0}', [index + 1])} onClick={onRemove}>{t('移除')}</Button></div>
    <div className="form-grid">
      <SignalSourceFields source={input} signals={signals} pathOptions={pathOptions} pointOptions={pointOptions} onChange={onChange} />
      {operation === 'WeightedAverage' && <Field label={t('权重')} type="number" min="0" step="any" value={input.weight} onChange={event => onChange({ weight: event.target.value === '' ? '' : Number(event.target.value) })} />}
    </div>
    {input.sourceMode === 'SensaPoint' && <p className="caption muted">{t('填写测量对象的整组路径，例如 Sensa/SPS/Root/**。可读取位置、Contact 速度，以及 Shader 方向与缩放；计算遵循对应定位方式的有效状态。')}</p>}
    {input.sourceMode === 'DeviceFeedback' && <p className="caption muted">{t('路径由输出标识和反馈指标组成，例如 output-id/connected 或 output-id/props.battery。')}</p>}
    {input.sourceMode === 'RecordingReplay' && <p className="caption muted">{t('先载入录制，再使用录制输出标识／信号标识读取对应回放值。')}</p>}
  </div>;
}

function ComputedSignalCard({ draft, signals, runtime, graphDirty, selected, pathOptions, pointOptions, onSelect, onChange, onRemove, onMap }) {
  const valid = runtime?.valid && Number.isFinite(runtime.value);
  const [open, setOpen] = useState(selected);
  const others = useMemo(() => signals.filter(signal => signal.id !== draft.id), [signals, draft.id]);
  const reason = graphDirty || !runtime ? t('保存后查看结果') : diagnostic(runtime.reason) || t('等待完整输入');
  const value = valid && !graphDirty ? Number(runtime.value.toFixed(6)).toString() : '—';
  return (
    <details className="computed-signal" data-testid="computed-signal-card" data-signal-id={draft.id} open={open} onToggle={event => { setOpen(event.currentTarget.open); if (event.currentTarget.open) onSelect(draft.id); }}>
      <summary><strong>{draft.name || draft.id}</strong><code>{draft.id}</code><Badge tone={valid && !graphDirty ? 'success' : 'default'}>{computedOperationOptions().find(option => option.value === draft.operation)?.label || draft.operation}</Badge><output data-testid="computed-signal-value">{value}</output></summary>
      {open && <div className="stack computed-signal__body">
        <div className="form-grid computed-signal__settings">
          <Field label={t('信号名称')} value={draft.name || ''} maxLength={80} onChange={event => onChange({ name: event.target.value })} />
          <SelectField data-testid="computed-operation" label={t('运算方式')} value={draft.operation} options={computedOperationOptions()} onChange={operation => onChange(changeComputedOperation(draft, operation))} />
          <Field label={t('输入有效期（ms）')} type="number" min={0} max={60000} step={100} value={draft.maxAgeMs ?? 0} onChange={event => onChange({ maxAgeMs: event.target.value === '' ? '' : Number(event.target.value) })} />
          {computedOperationFields(draft.operation).map(({ key, label, ...field }) => <Field key={key} label={label} type="number" {...field} value={draft[key] ?? ''}
            onChange={event => onChange({ [key]: event.target.value === '' ? '' : Number(event.target.value) })} />)}
        </div>
        {computedOperationHelp(draft.operation) && <p className="caption muted">{computedOperationHelp(draft.operation)}</p>}
        {draft.operation === 'WeightedAverage' && <p className="caption muted">{t('权重表示各输入所占的比例。例如 0.2 的权重为 1、0.8 的权重为 3，结果为 0.65。')}</p>}
        {['Difference', 'Ratio'].includes(draft.operation) && <p className="caption muted">{t('按输入顺序计算，使用两项输入。')}</p>}
        {draft.operation === 'Magnitude' && <p className="caption muted">{t('把各项作为向量分量，例如用 X、Y、Z 计算到原点的距离。')}</p>}
        <p className="caption muted">{t('0 使用 OSC 接收设置；填写毫秒数可限制每项输入的有效期。定位采样继续检查对应定位方式的有效状态。')}</p>
        <div className="computed-inputs">{draft.inputs.map((input, index) => <ComputedInputRow key={index} input={input} index={index} operation={draft.operation} signals={others} pathOptions={pathOptions} pointOptions={pointOptions}
          onChange={patch => onChange({ inputs: draft.inputs.map((existing, inputIndex) => inputIndex === index ? { ...existing, ...patch } : existing) })}
          onRemove={() => onChange({ inputs: draft.inputs.filter((_, inputIndex) => inputIndex !== index) })} />)}</div>
        <div className="actions">
          <Button disabled={draft.inputs.length >= (UNARY_COMPUTED_OPERATIONS.includes(draft.operation) || draft.operation === 'Sine' ? 1 : ['Difference', 'Ratio'].includes(draft.operation) ? 2 : COMPUTED_INPUT_LIMIT)} onClick={() => onChange({ inputs: [...draft.inputs, makeComputedInput()] })}>{t('新增输入')}</Button>
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
      <p className="caption muted">{t('组合 OSC、手动、脚本、设备反馈与定位结果；保存后可在输出连接、轴映射或其他计算中选择此信号。')}</p>
      {drafts.map(draft => <ComputedSignalCard key={draft.id} draft={draft} signals={drafts} runtime={runtimeById.get(draft.id)} graphDirty={graphDirty} selected={selected === draft.id} onSelect={setSelected} pathOptions={pathOptions} pointOptions={pointOptions}
        onChange={patch => onChange(drafts.map(existing => existing.id === draft.id ? { ...existing, ...patch } : existing))}
        onRemove={() => onChange(drafts.filter(existing => existing.id !== draft.id))} onMap={() => onMap(draft)} />)}
      <div className="actions"><Button disabled={drafts.length >= COMPUTED_SIGNAL_LIMIT} onClick={() => { const draft = newComputedDraft(drafts); setSelected(draft.id); onChange([...drafts, draft]); }}>{t('新增计算信号')}</Button></div>
    </section>
  );
}
