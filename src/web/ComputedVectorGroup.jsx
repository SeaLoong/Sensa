import React, { useId, useState } from 'react';
import { Field } from './ui.jsx';
import { SelectField } from './controls.jsx';
import { t } from './i18n.js';
import SignalSourceFields from './SignalSourceFields.jsx';
import { computedVectorBinding, makeComputedVector } from './computed-signals.js';

export default function ComputedVectorGroup({ group, inputs, signals, pathOptions, pointOptions, onChange }) {
  const listId = useId();
  const [components, setComponents] = useState(false);
  const binding = computedVectorBinding(inputs);
  const supported = group.kind === 'position' ? ['Constant', 'Position'] : ['Constant', 'Forward', 'Right', 'Velocity'];
  const mode = components || !supported.includes(binding.mode) ? 'Components' : binding.mode;
  const modes = [
    { value: 'Constant', label: group.kind === 'position' ? t('固定坐标') : t('固定方向') },
    ...(group.kind === 'position' ? [{ value: 'Position', label: t('定位对象的位置 XYZ') }] : [
      { value: 'Forward', label: t('Shader 前向 · Forward XYZ') },
      { value: 'Right', label: t('Shader 右向 · Right XYZ') },
      { value: 'Velocity', label: t('Contact 速度方向 · Velocity XYZ') },
    ]),
    { value: 'Components', label: t('分别设置 X、Y、Z 来源') },
  ];
  const optionsFor = value => pointOptions.filter(point => !['Forward', 'Right', 'Velocity'].includes(value)
    || point.value.startsWith(value === 'Velocity' ? 'Sensa/Contact/' : 'Sensa/Shader/'));
  const candidates = optionsFor(mode);
  const update = (index, patch) => onChange(inputs.map((input, item) => item === index ? { ...input, ...patch } : input));
  return <fieldset className="computed-vector stack" data-testid="computed-vector-group" data-vector={group.key}>
    <legend>{group.label}</legend>
    {group.key === 'normal' && <p className="caption muted">{t('用 XYZ 指定垂直于平面的方向。Sensa 会将它归一化；例如 0 / 0 / 1 表示 +Z 朝向。')}</p>}
    <SelectField label={t('三分量来源')} value={mode} options={modes} onChange={next => {
      setComponents(next === 'Components');
      if (next === 'Components') return;
      const available = optionsFor(next);
      const path = available.some(point => point.value === binding.path) ? binding.path : available[0]?.value || '';
      onChange(makeComputedVector(next, path, group.kind === 'direction' ? [0, 0, 1] : [0, 0, 0]));
    }} />
    {mode === 'Constant' ? <div className="computed-vector__values">
      {['X', 'Y', 'Z'].map((axis, index) => <Field key={axis} label={axis} aria-label={t('{0} 分量', [axis])} type="number" step="any"
        value={inputs[index]?.value ?? ''} onChange={event => update(index, { value: event.target.value === '' ? '' : Number(event.target.value) })} />)}
    </div> : mode === 'Components' ? <div className="computed-inputs">
      {inputs.map((input, index) => <details className="computed-input" key={index} data-testid="computed-vector-component">
        <summary>{t('{0} 分量', [['X', 'Y', 'Z'][index]])} · {input.sourceMode === 'Constant' ? input.value : input.oscPath || t('选择来源')}</summary>
        <div className="form-grid"><SignalSourceFields source={input} signals={signals} pathOptions={pathOptions} pointOptions={pointOptions}
          onChange={patch => update(index, patch)} /></div>
      </details>)}
    </div> : <div className="stack">
      <Field label={t('测量对象路径')} value={binding.path} list={listId}
        placeholder={['Forward', 'Right'].includes(mode) ? 'Sensa/Shader/42/**' : mode === 'Velocity' ? 'Sensa/Contact/Target/**' : 'Sensa/SPS/Target/**'}
        onChange={event => onChange(makeComputedVector(mode, event.target.value))} />
      <datalist id={listId}>{candidates.map(point => <option key={point.value} value={point.value}>{point.label}</option>)}</datalist>
      <p className="caption muted">{t('三项依次读取 {0}。', [inputs.map(input => input.pointMetric).join(' / ')])}</p>
    </div>}
    {group.kind === 'position' && <p className="caption muted">{t('XYZ 使用同一坐标系：X 左右、Y 高度、Z 前后。固定坐标与测量位置采用相同单位。')}</p>}
  </fieldset>;
}
