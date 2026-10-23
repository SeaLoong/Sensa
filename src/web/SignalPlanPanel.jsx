import React, { useState } from 'react';
import { Button, Field, Modal, Notice } from './ui.jsx';
import { t } from './i18n.js';
import { exportSignalPlan, parseSignalPlan } from './signal-outputs.js';

export default function SignalPlanPanel({ config, onApply, disabled = false, emergencyAction }) {
  const [draft, setDraft] = useState(null), [error, setError] = useState(''), [saving, setSaving] = useState(false);
  const [name, setName] = useState('');
  function download() {
    try {
      const plan = exportSignalPlan(config);
      if (name.trim()) plan.name = name.trim();
      const blob = new globalThis.Blob([JSON.stringify(plan, null, 2)], { type: 'application/json' });
      const url = globalThis.URL.createObjectURL(blob), link = document.createElement('a');
      link.href = url; link.download = 'sensa-signal-plan.json'; link.click();
      globalThis.setTimeout(() => globalThis.URL.revokeObjectURL(url), 1000);
      setError('');
    } catch (reason) { setError(reason.message); }
  }
  async function read(file) {
    try {
      if (!file || file.size > 2 * 1024 * 1024) throw new Error(t('请选择不超过 2 MiB 的 Sensa 交互方案。'));
      const plan = parseSignalPlan(await file.text());
      setDraft(plan); setError('');
    } catch (reason) { setError(reason.message); }
  }
  async function apply() {
    if (!draft || saving) return;
    setSaving(true);
    try { await onApply(draft); setDraft(null); setError(''); }
    catch (reason) { setError(reason.message); }
    finally { setSaving(false); }
  }
  return <details className="signal-plan-panel" data-testid="signal-plan-panel"><summary>{t('保存与载入整套方案')}</summary><div className="stack">
    <p className="caption muted">{t('方案一起保存输入映射、计算、轴配置及输出连接。载入时先检查目标地址和设备，再启用输出。')}</p>
    <Field label={t('方案名称')} value={name} onChange={event => setName(event.target.value)} />
    <div className="actions"><Button data-testid="signal-plan-export" disabled={disabled || !config} onClick={download}>{t('导出交互方案')}</Button>
      <label className="button button--default button--variant-outline file-button">{t('选择交互方案')}<input data-testid="signal-plan-import" type="file" accept=".json,application/json" disabled={disabled || saving}
        onChange={event => { const file = event.target.files?.[0]; event.target.value = ''; if (file) void read(file); }} /></label>
    </div>
    {error && !draft && <Notice tone="error">{error}</Notice>}
    <Modal open={Boolean(draft)} title={t('检查交互方案')} emergencyAction={emergencyAction} onClose={() => { if (!saving) setDraft(null); }} error={error}
      actions={<><Button disabled={saving} onClick={() => setDraft(null)}>{t('取消')}</Button><Button data-testid="signal-plan-apply" tone="primary" disabled={disabled || saving} onClick={apply}>{t('应用方案')}</Button></>}>
      {draft && <div className="stack"><strong>{draft.name || t('Sensa 交互方案')}</strong>
        <p>{t('{0} 个计算，{1} 条轴映射，{2} 个输出。', [draft.computedSignals.length, draft.signals.length, draft.outputs.length])}</p>
        {draft.axisProfiles && <p>{t('{0} 套轴配置', [draft.axisProfiles.length])}</p>}
        <Notice>{t('应用后替换当前计算、映射、轴配置和输出，输入及输出启用状态关闭。设备地址保留在草稿中供检查。')}</Notice>
        <ul>{draft.outputs.map((output, index) => <li key={`${output.id}-${index}`}>{output.name || output.id} · {output.type}</li>)}</ul>
      </div>}
    </Modal>
  </div></details>;
}
