import React from 'react';
import { Button } from './ui.tsx';
import { t } from './i18n.js';

export default function GettingStarted({ hasOutputs, onboarding, onStartGuide, onConnect }) {
  const resume = onboarding.status === 'dismissed';
  return <div className="actions workspace-header__actions">
    <Button tone={hasOutputs ? 'default' : 'primary'} data-testid={resume ? 'onboarding-resume' : 'onboarding-start'} onClick={onStartGuide}>
      {resume ? t('继续设置') : t('操作引导')}
    </Button>
    {!hasOutputs && <Button data-testid="setup-connect-device" onClick={onConnect}>{t('直接连接设备')}</Button>}
  </div>;
}
