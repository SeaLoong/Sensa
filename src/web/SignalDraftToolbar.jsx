import React from 'react';
import { Badge, Button, Notice } from './ui.tsx';
import { t } from './i18n.js';

export default function SignalDraftToolbar({ workspace, mappingCount = 0, computedCount = 0,
  mappingDirty = false, computedDirty = false, incompleteMappings = 0, incompleteComputations = 0,
  online = false, busy = false, onSave, onRestore, onOpenMappings, onOpenComputations }) {
  const incomplete = incompleteMappings > 0 || incompleteComputations > 0;
  const dirty = mappingDirty || computedDirty;
  return <div className="signal-draft-toolbar stack" data-testid="signal-draft-toolbar" data-workspace={workspace}>
    <div className="mapping-toolbar">
      <div className="signal-draft-toolbar__counts actions">
        <span>{t('{0} 条轴映射', [mappingCount])} <Badge tone={incompleteMappings || mappingDirty ? 'warning' : 'default'}>
          {incompleteMappings ? t('待填写') : mappingDirty ? t('未保存') : t('已保存')}</Badge></span>
        <span>{t('{0} 个计算信号', [computedCount])} <Badge tone={incompleteComputations || computedDirty ? 'warning' : 'default'}>
          {incompleteComputations ? t('待填写') : computedDirty ? t('未保存') : t('已保存')}</Badge></span>
      </div>
      <div className="signal-draft-toolbar__actions actions">
        <Button data-testid="restore-signal-drafts" disabled={(!dirty && !incomplete) || busy} onClick={onRestore}>{t('恢复更改')}</Button>
        <Button data-testid="save-signal-drafts" tone="primary" disabled={!online || busy || incomplete} onClick={onSave}>{t('保存更改')}</Button>
      </div>
    </div>
    <p className="caption muted signal-draft-toolbar__scope">{t('计算信号与轴映射一起保存或恢复；输出连接单独保存。')}</p>
    {incomplete && <Notice tone="warning" className="signal-draft-toolbar__issues">
      {incompleteMappings > 0 && <div>{t('{0} 条轴映射待填写。', [incompleteMappings])}{' '}
        {workspace !== 'osc' && <Button variant="text" onClick={onOpenMappings}>{t('前往轴映射')}</Button>}</div>}
      {incompleteComputations > 0 && <div>{t('{0} 个计算信号待填写。', [incompleteComputations])}{' '}
        {workspace !== 'pipeline' && <Button variant="text" onClick={onOpenComputations}>{t('在流程中编辑计算信号')}</Button>}</div>}
    </Notice>}
  </div>;
}
