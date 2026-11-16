import React, { useEffect, useState } from 'react';
import { Button, Modal, Tabs } from './ui.tsx';
import { transformPresets } from './transform-presets.js';
import { t } from './i18n.js';

export default function ScenePresets({ open, initialGroup = 'osc', supportsOsc = true, oscPresets = [], axisPresets = [],
  oscPresetId, onOscPresetChange, onUseOscPreset, onUseTransformPreset, onReviewAxisPreset, onClose, emergencyAction, error, disabled = false }) {
  const [group, setGroup] = useState(initialGroup === 'osc' && !supportsOsc ? 'profile' : initialGroup);
  const [axisPresetId, setAxisPresetId] = useState('osr-first-run');
  useEffect(() => { if (open) setGroup(initialGroup === 'osc' && !supportsOsc ? 'profile' : initialGroup); }, [open, initialGroup, supportsOsc]);
  const selectedOsc = oscPresets.find(preset => preset.id === oscPresetId);
  const selectedAxis = axisPresets.find(preset => preset.id === axisPresetId) || axisPresets[0];
  return <Modal open={open} onClose={onClose} title={t('场景预设')} wide className="scene-presets"
    emergencyAction={emergencyAction} error={error} actions={<Button onClick={onClose}>{t('关闭预设')}</Button>}>
    <div data-testid="scene-presets-dialog" className="stack">
      <p className="muted">{t('按用途选择预设，查看效果后载入草稿，再按设备调整。')}</p>
      <Tabs id="scene-preset-tabs" label={t('预设类型')} value={group} onChange={setGroup}
        options={[...(supportsOsc ? [{ value: 'osc', label: t('VRChat / OSC 映射') }] : []), { value: 'transform', label: t('常用变换') }, { value: 'profile', label: t('设备轴配置') }]} />
      <div id="scene-preset-tabs-panel" role="tabpanel" aria-labelledby={`scene-preset-tabs-${group}`} className="scene-presets__group stack">
        {group === 'osc' && <>
          <div className="preset-cards">{oscPresets.map(preset => <Button key={preset.id} className="preset-card" data-testid={`scene-osc-preset-${preset.id}`} aria-pressed={preset.id === oscPresetId} onClick={() => onOscPresetChange(preset.id)}><strong>{preset.name}</strong><span className="caption">{preset.description}</span><span className="caption muted">{t('{0} 条映射', [preset.mappings.length])}</span></Button>)}</div>
          {selectedOsc && <><p>{selectedOsc.description}</p><span className="caption muted">{t('{0} 条映射', [selectedOsc.mappings.length])}</span></>}
          <div className="actions"><Button tone="primary" data-testid="scene-osc-append" disabled={disabled || !selectedOsc} onClick={() => onUseOscPreset('append')}>{t('追加到映射草稿')}</Button>
            <Button data-testid="scene-osc-replace" disabled={disabled || !selectedOsc} onClick={() => onUseOscPreset('replace')}>{t('替换映射草稿')}</Button></div>
          <p className="caption muted">{t('替换只影响映射草稿，计算信号保持不变；点击“保存更改”应用。')}</p>
        </>}
        {group === 'transform' && <>
          <div className="preset-cards">{transformPresets().map(preset => <article key={preset.id} className="preset-card section">
            <strong>{preset.name}</strong><p className="caption">{preset.description}</p>
            <Button data-testid={`transform-preset-${preset.id}`} disabled={disabled} onClick={() => onUseTransformPreset(preset.id)}>{t('载入计算草稿')}</Button>
          </article>)}</div>
          <p className="caption muted">{t('仅追加计算草稿，保存后可用于轴映射或输出连接。')}</p>
        </>}
        {group === 'profile' && <>
          <div className="preset-cards">{axisPresets.map(preset => <Button key={preset.id} className="preset-card" data-testid={`scene-axis-preset-${preset.id}`} aria-pressed={preset.id === selectedAxis?.id} onClick={() => setAxisPresetId(preset.id)}><strong>{preset.name}</strong><span className="caption">{preset.description}</span></Button>)}</div>
          {selectedAxis && <p>{selectedAxis.description}</p>}
          <Button tone="primary" data-testid="scene-axis-review" disabled={disabled || !selectedAxis} onClick={() => onReviewAxisPreset(selectedAxis.id)}>{t('查看并创建轴配置')}</Button>
          <p className="caption muted">{t('在编辑器中检查后保存，再到 TCode 输出中选择这套轴配置。')}</p>
        </>}
      </div>
    </div>
  </Modal>;
}
