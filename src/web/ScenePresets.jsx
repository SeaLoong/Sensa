import React, { useEffect, useState } from 'react';
import { Button, Modal, Tabs } from './ui.tsx';
import { SelectField } from './controls.jsx';
import { t } from './i18n.js';

export default function ScenePresets({ open, initialGroup = 'osc', supportsOsc = true, oscPresets = [], axisPresets = [],
  oscPresetId, onOscPresetChange, onUseOscPreset, onReviewAxisPreset, onClose, emergencyAction, error, disabled = false }) {
  const [group, setGroup] = useState(supportsOsc ? initialGroup : 'profile');
  const [axisPresetId, setAxisPresetId] = useState('osr-first-run');
  useEffect(() => { if (open) setGroup(supportsOsc ? initialGroup : 'profile'); }, [open, initialGroup, supportsOsc]);
  const selectedOsc = oscPresets.find(preset => preset.id === oscPresetId);
  const selectedAxis = axisPresets.find(preset => preset.id === axisPresetId) || axisPresets[0];
  return <Modal open={open} onClose={onClose} title={t('场景预设')} wide className="scene-presets"
    emergencyAction={emergencyAction} error={error} actions={<Button onClick={onClose}>{t('关闭预设')}</Button>}>
    <div data-testid="scene-presets-dialog" className="stack">
      <p className="muted">{t('选择常用映射或设备动作，载入编辑器继续调整。')}</p>
      <Tabs id="scene-preset-tabs" label={t('预设类型')} value={group} onChange={setGroup}
        options={[...(supportsOsc ? [{ value: 'osc', label: t('VRChat / OSC 映射') }] : []), { value: 'profile', label: t('设备轴配置') }]} />
      <div id="scene-preset-tabs-panel" role="tabpanel" aria-labelledby={`scene-preset-tabs-${group}`} className="scene-presets__group stack">
        {group === 'osc' && <>
          <SelectField data-testid="scene-osc-preset" label={t('OSC 预设')} value={oscPresetId} onChange={onOscPresetChange}
            options={oscPresets.map(preset => ({ value: preset.id, label: preset.name }))} />
          {selectedOsc && <><p>{selectedOsc.description}</p><span className="caption muted">{t('{0} 条映射', [selectedOsc.mappings.length])}</span></>}
          <div className="actions"><Button tone="primary" data-testid="scene-osc-append" disabled={disabled || !selectedOsc} onClick={() => onUseOscPreset('append')}>{t('追加到映射草稿')}</Button>
            <Button data-testid="scene-osc-replace" disabled={disabled || !selectedOsc} onClick={() => onUseOscPreset('replace')}>{t('替换映射草稿')}</Button></div>
          <p className="caption muted">{t('替换只影响映射草稿，计算信号保持不变；保存映射后应用。')}</p>
        </>}
        {group === 'profile' && <>
          <SelectField data-testid="scene-axis-preset" label={t('设备动作预设')} value={selectedAxis?.id || ''} onChange={setAxisPresetId}
            options={axisPresets.map(preset => ({ value: preset.id, label: preset.name }))} />
          {selectedAxis && <p>{selectedAxis.description}</p>}
          <Button tone="primary" data-testid="scene-axis-review" disabled={disabled || !selectedAxis} onClick={() => onReviewAxisPreset(selectedAxis.id)}>{t('查看并创建轴配置')}</Button>
          <p className="caption muted">{t('在编辑器中检查后保存，再到 TCode 输出中选择这套轴配置。')}</p>
        </>}
      </div>
    </div>
  </Modal>;
}
