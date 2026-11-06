import React from 'react';
import { Button, TaskTile, WorkspaceHeader } from './ui.tsx';
import { onboardingScenes } from './onboarding.js';
import { t } from './i18n.js';

export default function GettingStarted({ hasOutputs = false, inputModes, supportsListeners = true,
  onboarding = { status: 'new' }, onNavigate, onStartGuide, onDismissGuide, onOpenPresets }) {
  const welcome = !hasOutputs && onboarding.status === 'new';
  const scenes = onboardingScenes({ inputModes, supportsListeners });
  return <section className={`getting-started scene-launchpad scene-launchpad--${welcome ? 'welcome' : 'compact'}`} data-testid="getting-started">
    <WorkspaceHeader title={welcome ? t('让设备开始联动') : t('选择使用场景')}
      description={welcome ? t('选一种用法，跟着引导连接设备、准备输入，再由你启用。') : undefined}
      actions={<><Button data-testid="open-scene-presets" onClick={() => onOpenPresets?.()}>{t('场景预设')}</Button>
        <Button tone={welcome ? 'primary' : 'default'} data-testid={onboarding.status === 'dismissed' ? 'onboarding-resume' : 'onboarding-start'} onClick={onStartGuide}>
          {onboarding.status === 'dismissed' ? t('继续设置') : welcome ? t('开始设置向导') : t('操作引导')}
        </Button></>} />
    {welcome && <ol className="guided-steps onboarding-invitation" aria-label={t('首次设置步骤')}>
      {[t('选择场景'), t('连接设备'), t('准备输入'), t('检查并完成')].map((label, index) => <li className="guided-step" key={label}><span>{index + 1}</span>{label}</li>)}
    </ol>}
    <div className={welcome ? 'task-tiles' : 'scene-launchpad__shortcuts'}>
      {scenes.map(scene => <TaskTile key={scene.id} title={scene.title} description={welcome ? scene.description : undefined}
        className="getting-started__choice" data-testid={`setup-task-${scene.id}`} selected={onboarding.goal === scene.id}
        onClick={() => onNavigate(scene.destination, scene.id)} />)}
    </div>
    {welcome && <div className="actions scene-launchpad__footer">
      <Button data-testid="setup-connect-device" onClick={() => onNavigate('outputs')}>{t('直接连接设备')}</Button>
      <Button variant="text" data-testid="onboarding-skip" onClick={onDismissGuide}>{t('稍后设置')}</Button>
    </div>}
  </section>;
}
