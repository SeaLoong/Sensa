import React from 'react';
import { Button, Notice } from './ui.tsx';
import { SelectField } from './controls.jsx';
import { SignalMappingRow } from './configuration-views.jsx';
import PresetRequirements from './PresetRequirements.jsx';
import OscFlowStatus from './OscFlowStatus.jsx';
import { previousMappingSource, routeDependencies, routeStepChoices } from './axis-routes.js';
import { COMPUTED_SIGNAL_LIMIT, computedOperationOptions } from './computed-signals.js';
import { t } from './i18n.js';

function MappingSteps({ draft, signals, onEdit, onAppend, onChange }) {
  if (!['Direct', 'Computed', 'SensaPose', 'SensaPoint'].includes(draft.sourceMode)) return null;
  const steps = routeDependencies(draft, signals);
  const previous = previousMappingSource(draft, signals);
  const choices = routeStepChoices();
  return <details className="mapping-processing">
    <summary>{steps.length ? t('计算步骤（{0}）', [steps.length]) : t('计算步骤（可选）')}</summary>
    <div className="stack">
      {steps.map(node => <Button key={node.id} variant="text" onClick={() => onEdit(draft._draftId, node.id)}>
        {node.inputs.map(input => input.sourceMode === 'Constant' ? String(input.value) : input.oscPath).join(' · ')} → {node.name || node.id} · {computedOperationOptions().find(op => op.value === node.operation)?.label || node.operation}
      </Button>)}
      <SelectField label={t('追加计算步骤')} value="" disabled={!draft.oscPath}
        options={[{ value: '', label: t('选择要追加的步骤') }, ...choices.map(preset => ({ ...preset,
          disabled: signals.length + preset.steps.length > COMPUTED_SIGNAL_LIMIT }))]}
        onChange={value => { const preset = choices.find(item => item.value === value);
          if (preset) onAppend(draft, preset.steps); }} />
      {previous && <Button variant="text" onClick={() => onChange(draft._draftId, previous)}>{t('在此映射跳过末步')}</Button>}
    </div>
  </details>;
}

export default function AxisMappingsPanel({ onSimulate, guidedMappingId, onEditStep, onAppendSteps, signalDrafts = [], computedDrafts = [],
  oscMappingPresets = [], selectedOscPreset = '', selectedOscPresetConfig, busy = false,
  onSelectPreset, onApplyPreset, onOpenPreset, onDeletePreset, onOpenFollowingPlane,
  savedMappings = [], runtime = {}, actualInputMode = '', listening = false, hasUnsavedMappings = false,
  signalOverlapWarnings = [], latestForDraft, pathOptions = [], onUpdateMapping, onRemoveMapping, onAddMapping, onClearMappings }) {
  const options = oscMappingPresets.map(preset => ({
    value: preset.id, label: preset.name, group: preset.group || t('自定义预设'),
  }));
  if (onOpenFollowingPlane) options.push({ value: '', label: t('横移时保持深度 · 跟随平面…'), group: t('推荐预设') });
  return <div className="axis-mappings-panel stack" data-testid="axis-mappings-panel">
    <div className="workspace-header"><h3>{t('轴映射')}</h3>
      <Button id="add-axis-mapping" tone="primary" onClick={() => onAddMapping()}>{t('新增映射')}</Button>
    </div>
    <div className="preset-strip">
      <SelectField label={t('预设方案')} id="mapping-preset-variant" value={selectedOscPreset || options[0]?.value}
        options={options} onChange={id => id ? onSelectPreset(id) : onOpenFollowingPlane()} />
      <div className="actions">
        <Button onClick={() => onApplyPreset('replace')} disabled={!selectedOscPresetConfig}>{t('替换草稿')}</Button>
        <Button id="append-mapping-preset" onClick={() => onApplyPreset('append')} disabled={!selectedOscPresetConfig}>{t('追加草稿')}</Button>
      </div>
    </div>
    {selectedOscPresetConfig?.description && <p className="caption muted">{selectedOscPresetConfig.description}</p>}
    {selectedOscPresetConfig?.isBuiltIn && <PresetRequirements profile={selectedOscPresetConfig.requirementProfile} mappings={selectedOscPresetConfig.mappings} optionalSecondaryAxes={selectedOscPresetConfig.group === t('推荐预设')} />}
    <details className="inline-details">
      <summary>{t('管理预设')}</summary>
      <div className="actions">
        <Button disabled={!selectedOscPresetConfig} onClick={() => onOpenPreset(selectedOscPreset)}>
          {selectedOscPresetConfig?.isBuiltIn ? t('复制预设') : t('编辑预设')}</Button>
        <Button onClick={() => onOpenPreset(null, { fromCurrent: true, currentMappings: signalDrafts })}>{t('另存为预设')}</Button>
        <Button onClick={() => onOpenPreset(null)}>{t('新建空预设')}</Button>
        <Button tone="danger" disabled={!selectedOscPresetConfig || selectedOscPresetConfig.isBuiltIn || busy} onClick={onDeletePreset}>{t('删除预设')}</Button>
      </div>
    </details>
    <details className="workflow-details"><summary>{t('映射检查')}</summary>
      <OscFlowStatus mappings={savedMappings} drafts={signalDrafts} dirty={hasUnsavedMappings} runtime={runtime}
        mode={actualInputMode} listening={listening} />
    </details>
    {signalOverlapWarnings.length > 0 && <Notice>{t('同一目标轴按归一化优先级选择输入；需要混合时可先建立计算信号。')}</Notice>}
    {signalDrafts.length === 0 ? <p className="empty-state">{t('还没有轴映射')}</p> : <div className="mapping-list">
      {signalDrafts.map(draft => <div key={draft._draftId} data-mapping-draft-id={draft._draftId}>
        <SignalMappingRow draft={draft} guided={draft._draftId === guidedMappingId} latestEntry={latestForDraft?.(draft)} pathOptions={pathOptions} computedSignals={computedDrafts}
          onChange={patch => onUpdateMapping(draft._draftId, patch)} onRemove={() => onRemoveMapping(draft._draftId)}>
          <MappingSteps draft={draft} signals={computedDrafts} onEdit={onEditStep} onAppend={onAppendSteps} onChange={onUpdateMapping} />
        </SignalMappingRow>
      </div>)}
    </div>}
    <div className="actions mapping-actions">
      <Button onClick={onSimulate}>{t('用 3D 模拟草稿')}</Button>
      <Button tone="danger" disabled={!signalDrafts.length} onClick={onClearMappings}>{t('清空映射')}</Button>
    </div>
  </div>;
}
