import React from 'react';
import { Button, Notice } from './ui.tsx';
import { SelectField } from './controls.jsx';
import { SignalMappingRow } from './configuration-views.jsx';
import OscFlowStatus from './OscFlowStatus.jsx';
import { t } from './i18n.js';

export default function AxisMappingsPanel({ toolbar, signalDrafts = [], computedDrafts = [],
  oscMappingPresets = [], selectedOscPreset = '', selectedOscPresetConfig, busy = false,
  onSelectPreset, onApplyPreset, onOpenPreset, onDeletePreset, onOpenComputations,
  savedMappings = [], runtime = {}, actualInputMode = '', listening = false, hasUnsavedMappings = false,
  signalOverlapWarnings = [], latestForDraft, pathOptions = [], onUpdateMapping, onRemoveMapping, onAddMapping, onClearMappings }) {
  return <div className="axis-mappings-panel stack" data-testid="axis-mappings-panel">
    <div className="preset-strip">
      <SelectField label={t('预设方案')} value={selectedOscPreset}
        options={oscMappingPresets.map(preset => ({ value: preset.id, label: preset.name }))} onChange={onSelectPreset} />
      <div className="actions">
        <Button onClick={() => onApplyPreset('replace')} disabled={!selectedOscPresetConfig}>{t('替换草稿')}</Button>
        <Button onClick={() => onApplyPreset('append')} disabled={!selectedOscPresetConfig}>{t('追加草稿')}</Button>
      </div>
    </div>
    {toolbar}
    <div className="computed-signals-bridge actions">
      <Button data-testid="edit-computations" variant="text" onClick={onOpenComputations}>{t('在流程中编辑计算信号')}</Button>
    </div>
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
    {selectedOscPresetConfig?.description && <p className="caption muted">{selectedOscPresetConfig.description}</p>}
    <details className="workflow-details"><summary>{t('映射检查')}</summary>
      <OscFlowStatus mappings={savedMappings} drafts={signalDrafts} dirty={hasUnsavedMappings} runtime={runtime}
        mode={actualInputMode} listening={listening} />
    </details>
    {signalOverlapWarnings.length > 0 && <Notice>{t('同一目标轴按归一化优先级选择输入；需要混合时可先建立计算信号。')}</Notice>}
    {signalDrafts.length === 0 ? <p className="empty-state">{t('还没有轴映射')}</p> : <div className="mapping-list">
      {signalDrafts.map(draft => <div key={draft._draftId} data-mapping-draft-id={draft._draftId}>
        <SignalMappingRow draft={draft} latestEntry={latestForDraft?.(draft)} pathOptions={pathOptions} computedSignals={computedDrafts}
          onChange={patch => onUpdateMapping(draft._draftId, patch)} onRemove={() => onRemoveMapping(draft._draftId)} />
      </div>)}
    </div>}
    <div className="actions mapping-actions">
      <Button onClick={() => onAddMapping()}>{t('新增映射')}</Button>
      <Button tone="danger" disabled={!signalDrafts.length} onClick={onClearMappings}>{t('清空映射')}</Button>
    </div>
  </div>;
}
