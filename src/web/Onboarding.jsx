import React from 'react';
import { Badge, Button, TaskTile, WorkspaceHeader } from './ui.tsx';
import { ONBOARDING_STEPS, onboardingScenes } from './onboarding.js';
import { t } from './i18n.js';

export default function Onboarding({ state, platform = {}, outputCount = 0, availableOutputs = 0, inputPrepared = false,
  actualMode, inputActive = false, disabled = false, onChange, onNavigate, onApplyInput, onOpenPresets }) {
  const scenes = onboardingScenes(platform);
  const scene = scenes.find(item => item.id === state.goal);
  const activeStep = scene ? state.step : 'goal';
  const current = ONBOARDING_STEPS.indexOf(activeStep);
  const labels = [t('选择场景'), t('连接设备'), t('准备输入'), t('检查并完成')];
  const go = step => onChange({ type: 'step', step });
  const canContinue = Boolean(scene);
  const canFinish = availableOutputs > 0 && inputPrepared;
  return <section className="onboarding-panel" data-testid="onboarding-panel" aria-label={t('设备设置向导')} tabIndex={-1}>
    <WorkspaceHeader title={t('设备设置向导')} eyebrow={t('第 {0} 步，共 {1} 步', [current + 1, 4])}
      actions={<Button variant="text" data-testid="onboarding-skip" onClick={() => onChange({ type: 'dismiss' })}>{t('保存进度，稍后继续')}</Button>} />
    <ol className="guided-steps" aria-label={t('首次设置步骤')}>
      {ONBOARDING_STEPS.map((step, index) => <li key={step} className={`guided-step${index === current ? ' guided-step--active' : index < current ? ' guided-step--completed' : ''}`}>
        <Button data-testid={`onboarding-step-${step}`} aria-current={step === activeStep ? 'step' : undefined}
          disabled={index > 0 && !scene} onClick={() => go(step)}><span>{index + 1}</span>{labels[index]}</Button>
      </li>)}
    </ol>
    <div className="onboarding-panel__body">
      {activeStep === 'goal' && <div className="task-tiles">
        {scenes.map(item => <TaskTile key={item.id} title={item.title} description={item.description} selected={state.goal === item.id}
          data-testid={`onboarding-goal-${item.id}`} onClick={() => onChange({ type: 'goal', goal: item.id })} />)}
      </div>}
      {activeStep === 'device' && <div className="stack">
        <h3>{t('先连接要控制的设备')}</h3>
        <p>{t('添加输出并完成连接设置，确认设备可用后继续。设备连接与输入启用分别控制。')}</p>
        <Badge tone={availableOutputs > 0 ? 'success' : 'default'}>{t('可用输出 {0}/{1}', [availableOutputs, outputCount])}</Badge>
        <div className="actions"><Button tone="primary" data-testid="onboarding-connect-device" onClick={() => onNavigate('outputs')}>{t('连接或配置设备')}</Button>
          <Button onClick={() => onOpenPresets('profile')}>{t('选择设备动作预设')}</Button></div>
      </div>}
      {activeStep === 'input' && scene && <div className="stack">
        <h3>{t('准备 {0}', [scene.title])}</h3><p>{scene.description}</p>
        <p>{state.goal === 'manual' ? t('检查主轴目标；振动或旋转设备请在更多动作轴中选择对应通道。')
          : state.goal === 'script' ? t('载入脚本，检查目标轴和播放位置，再应用脚本输入方式。')
            : state.goal === 'osc' ? t('载入匹配的映射预设，确认接收参数并保存，再应用 OSC 输入方式。')
              : t('添加协议来源，让上游客户端连接，再应用协议输入方式。')}</p>
        <Badge tone={inputPrepared ? 'success' : 'default'}>{inputPrepared ? t('输入已准备') : t('输入待准备')}</Badge>
        <div className="actions"><Button tone="primary" data-testid="onboarding-prepare-input" onClick={() => onNavigate(scene.destination)}>{t('打开输入设置')}</Button>
          {state.goal === 'osc' && <Button onClick={() => onOpenPresets('osc')}>{t('选择映射预设')}</Button>}
          {actualMode !== state.goal && <Button data-testid="onboarding-apply-input" disabled={disabled} onClick={() => onApplyInput(state.goal)}>{t('应用输入方式')}</Button>}
        </div>
      </div>}
      {activeStep === 'ready' && <div className="stack">
        <h3>{canFinish ? t('设置已备好') : t('还差一步')}</h3>
        <ul className="onboarding-checklist"><li>{scene?.title || t('尚未选择场景')}</li>
          <li>{t('可用输出 {0}/{1}', [availableOutputs, outputCount])}</li><li>{inputPrepared ? t('输入已准备') : t('输入待准备')}</li></ul>
        <p>{inputActive ? t('输入已启用，继续通过顶部开关控制。') : t('返回控制页，检查目标后打开顶部“输入启用”。')}</p>
      </div>}
    </div>
    <footer className="onboarding-panel__footer actions">
      {current > 0 && <Button data-testid="onboarding-back" onClick={() => go(ONBOARDING_STEPS[current - 1])}>{t('上一步')}</Button>}
      {current < 3 ? <Button tone="primary" data-testid="onboarding-next" disabled={!canContinue} onClick={() => go(ONBOARDING_STEPS[current + 1])}>{t('下一步')}</Button>
        : <Button tone="primary" data-testid="onboarding-complete" disabled={!canFinish} onClick={() => onChange({ type: 'complete' })}>{t('完成设置')}</Button>}
    </footer>
  </section>;
}
