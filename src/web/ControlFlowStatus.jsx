import React from 'react';
import { t } from './i18n.js';
import { controlReadiness } from './control-workflow.js';
import { Button } from './ui.jsx';

export default function ControlFlowStatus({ onNavigate, ...state }) {
  const status = controlReadiness(state);
  const labels = { outputs: t('配置输出'), 'osc-settings': t('接收设置'),
    'osc-mappings': t('配置映射'), 'osc-diagnostics': t('查看实验诊断'), 'protocol-settings': t('配置协议输入') };
  return (
    <div className={`control-readiness control-readiness--${status.tone}`} data-state={status.key} role={status.tone === 'error' ? 'alert' : 'status'} aria-atomic="true">
      <div className="control-readiness__heading">
        <strong>{status.title}</strong>
        {status.action && <Button id="control-next-step" variant="text" onClick={() => onNavigate(status.action)}>{labels[status.action]}</Button>}
      </div>
      <details className="readiness-details">
        <summary>{t('可用输出 {0}/{1}', [status.availableOutputs, status.totalOutputs])} · {t('详情')}</summary>
        <p className="caption muted">{status.detail}</p>
      </details>
    </div>
  );
}
