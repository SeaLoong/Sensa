import React from 'react';
import { Button, Disclosure } from './ui.tsx';
import { t } from './i18n.js';

// Choosing a task only opens its setup view. Input activation stays explicit.
export default function GettingStarted({ hasOutputs = false, inputModes, onNavigate }) {
  const supports = mode => !inputModes || inputModes.includes(mode);
  const choices = [
    ...(supports('osc') ? [{ id: 'osc', label: t('VRChat / SPS → 设备'), detail: t('接收 OSC，设置动作映射。') }] : []),
    ...(supports('script') ? [{ id: 'script', label: t('funscript → 设备'), detail: t('载入脚本，检查播放目标。') }] : []),
    ...(supports('manual') ? [{ id: 'manual', label: t('手动控制'), detail: t('使用滑条调整动作目标。') }] : []),
  ];
  const content = <div className="stack getting-started__content">
    <div className="getting-started__choices">
      {choices.map(choice => <Button key={choice.id} className="getting-started__choice"
        data-testid={`setup-task-${choice.id}`} onClick={() => onNavigate(choice.id)}>
        <strong>{choice.label}</strong><small>{choice.detail}</small>
      </Button>)}
    </div>
    <div className="actions">
      <Button data-testid="setup-connect-device" onClick={() => onNavigate('outputs')}>{t('连接设备')}</Button>
      <span className="caption muted">{t('准备好后，再打开顶部的“输入启用”。')}</span>
    </div>
  </div>;
  return <div className="getting-started" data-testid="getting-started">
    {hasOutputs ? <Disclosure title={t('快速设置')} data-testid="quick-setup">{content}</Disclosure>
      : <div className="stack getting-started__first-run">
          <strong>{t('你想怎样控制设备？')}</strong>
          {content}
        </div>}
  </div>;
}
