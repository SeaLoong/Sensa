import React, { useId, useState } from 'react';
import { Button, Field } from './ui.tsx';
import { SelectField } from './controls.jsx';
import { SIGNAL_ROLE_OPTIONS } from './configuration.js';
import { COMPUTED_SIGNAL_LIMIT, computedOperationOptions } from './computed-signals.js';
import { axisRoutePresets } from './axis-routes.js';
import { mappingPathSuggestions } from './mapping-path-suggestions.js';
import { t } from './i18n.js';

export default function AxisRouteBuilder({ pathOptions, computedCount, onAdd }) {
  const [path, setPath] = useState(''), [choice, setChoice] = useState('direct'), [role, setRole] = useState('Depth');
  const [focused, setFocused] = useState(false);
  const list = useId(), presets = axisRoutePresets(), preset = presets.find(option => option.value === choice);
  const [custom, setCustom] = useState(null), [operation, setOperation] = useState('Smooth');
  const steps = custom ?? preset.steps;
  const atLimit = computedCount + steps.length > COMPUTED_SIGNAL_LIMIT;
  const operations = computedOperationOptions().filter(item => ['Smooth', 'DeadZone', 'Delay', 'Hysteresis', 'Derivative', 'PeakHold'].includes(item.value));
  const operationLabel = id => operations.find(item => item.value === id)?.label || id;
  return <section className="route-builder stack" data-testid="axis-route-builder">
    <h3>{t('新建参数到轴的路线')}</h3>
    <div className="route-builder__fields">
      <Field label={t('来源 · OSC 参数')} data-testid="route-source" value={path} list={list} placeholder="/avatar/parameters/Depth"
        onFocus={() => setFocused(true)} onBlur={() => setFocused(false)} onChange={event => setPath(event.target.value)} />
      <datalist id={list}>{mappingPathSuggestions(pathOptions, path, { focused }).map(value => <option key={value} value={value} />)}</datalist>
      <SelectField label={t('处理 · 计算预设')} data-testid="route-preset" value={custom === null ? choice : 'custom'} options={custom === null ? presets : [...presets, { value: 'custom', label: t('自定义计算顺序'), disabled: true }]} onChange={value => { setChoice(value); setCustom(null); }} />
      <SelectField label={t('输出 · 目标轴')} data-testid="route-axis" value={role} options={SIGNAL_ROLE_OPTIONS()} onChange={setRole} />
    </div>
    <p className="caption muted">{atLimit ? t('计算节点已达上限，请减少步骤或使用直接映射。') : t('从接收到的参数中选择，或输入实际路径。首次配置可直接映射到 L0，输入 0～1 对应轴目标 0～999。')}</p>
    <details className="inline-details"><summary>{t('自定义计算顺序')}</summary>
      {steps.length > 0 && <ol className="route-steps">{steps.map((step, index) => <li key={index}>
        {operationLabel(step.operation)}{' '}
        <Button variant="text" aria-label={t('移除第 {0} 步', [index + 1])} onClick={() => setCustom(steps.filter((_, i) => i !== index))}>{t('移除')}</Button>
      </li>)}</ol>}
      <div className="actions">
        <SelectField label={t('下一步运算')} value={operation} options={operations} onChange={setOperation} />
        <Button disabled={steps.length >= 16 || computedCount + steps.length >= COMPUTED_SIGNAL_LIMIT}
          onClick={() => setCustom([...steps, operation === 'DeadZone' ? { operation, threshold: 0.05 } : { operation }])}>{t('追加步骤')}</Button>
      </div>
    </details>
    <output className="route-preview">{[path.trim() || t('OSC 参数'), ...steps.map(step => operationLabel(step.operation)),
      SIGNAL_ROLE_OPTIONS().find(option => option.value === role)?.label].join(' → ')}</output>
    <div className="actions"><Button data-testid="add-axis-route" tone="primary" disabled={!path.trim() || atLimit}
      onClick={() => { onAdd(path, steps, role); setPath(''); }}>{t('添加到映射草稿')}</Button></div>
  </section>;
}
