import React from 'react';
import { Badge, Button, TaskTile } from './ui.tsx';
import { ONBOARDING_STEPS, onboardingScenes, onboardingInstructions } from './onboarding.js';
import { t } from './i18n.js';

export default function Onboarding({ state, platform = {}, outputCount = 0, availableOutputs = 0, inputPrepared = false,
  onSimulate, onViewParameters, onAppendL0, onEditMappings, savedMappingCount = 0, draftMappingCount = savedMappingCount, actualMode, inputActive = false, disabled = false, onChange, onNavigate, onApplyInput, onCreateProfile }) {
  const scenes = onboardingScenes(platform);
  const scene = scenes.find(item => item.id === state.goal);
  const activeStep = scene ? state.step : 'goal';
  const current = ONBOARDING_STEPS.indexOf(activeStep);
  const labels = [t('选择场景'), t('准备输入'), t('轴映射'), t('轴配置'), t('连接设备'), t('查看日志'), t('检查并完成')];
  const go = step => onChange({ type: 'step', step });
  const instructions = onboardingInstructions(activeStep, state.goal, draftMappingCount > 0);
  const pageLabel = { input: t('输入'), mapping: t('映射与变换'), axes: t('轴配置'), device: t('输出'), diagnostics: t('诊断'), ready: t('输入') }[activeStep];
  const firstOscMapping = state.goal === 'osc' && !draftMappingCount;
  const canContinue = Boolean(scene);
  const needsMapping = state.goal === 'osc' && savedMappingCount === 0;
  const canFinish = availableOutputs > 0 && inputPrepared && !needsMapping;
  return <section className="onboarding-panel" data-testid="onboarding-panel" aria-label={t('设备设置向导')} tabIndex={-1}>
    <div key={activeStep} className="onboarding-panel__content">
    <header className="onboarding-panel__header">
      <span className="muted">{t('第 {0} 步，共 {1} 步', [current + 1, ONBOARDING_STEPS.length])}</span>
      <Button variant="text" data-testid="onboarding-skip" onClick={() => onChange({ type: 'dismiss' })}>{t('保存并退出')}</Button>
    </header>
    <div className="onboarding-panel__body">
      {pageLabel && <p className="caption muted onboarding-location">{t('当前页面：{0}', [pageLabel])}</p>}
      {activeStep === 'goal' && <p>{(platform.supportsListeners === false ? t('从手动控制 L0 主轴开始，也可以选择脚本。') : t('想让主轴跟随 VRChat 动作？选“VRChat / SPS 联动”。先看 Sensa 能否收到动作数值，不用启动设备。'))}</p>}
      {instructions.length > 0 && <h3>{activeStep === 'input' ? t('准备 {0}', [scene?.title]) : labels[current]}</h3>}
      {instructions.length > 0 && <ol className="onboarding-instructions">{instructions.map(instruction => <li key={instruction}>{instruction}</li>)}</ol>}
      {activeStep === 'goal' && <div className="task-tiles">
        {scenes.map(item => <TaskTile key={item.id} title={item.title} description={item.description} selected={state.goal === item.id}
          data-testid={`onboarding-goal-${item.id}`} onClick={() => onChange({ type: 'goal', goal: item.id })} />)}
      </div>}
      {activeStep === 'mapping' && <div className="stack">
        <p className="caption">{savedMappingCount ? t('已保存 {0} 条轴映射', [savedMappingCount]) : t('尚未保存轴映射')}</p>
        {firstOscMapping && <Button tone="primary" data-testid="onboarding-append-l0" onClick={onAppendL0}>{t('追加 L0 示例')}</Button>}
        <Button tone={firstOscMapping ? undefined : 'primary'} data-testid="onboarding-edit-mappings" onClick={onEditMappings}>{t('编辑轴映射')}</Button>
        {state.goal === 'osc' && !firstOscMapping && <Button data-testid="onboarding-append-l0" onClick={onAppendL0}>{t('追加 L0 示例')}</Button>}
      </div>}
      {activeStep === 'mapping' && onSimulate && <Button data-testid="onboarding-simulate-sway" onClick={() => onSimulate('mapping')}>{t('先试横移示例')}</Button>}
      {activeStep === 'axes' && <div className="stack">
        <Button data-testid="onboarding-create-profile" disabled={disabled} onClick={onCreateProfile}>{t('新增轴配置')}</Button>
      </div>}
      {activeStep === 'device' && <div className="stack">
        <Badge tone={availableOutputs > 0 ? 'success' : 'default'}>{t('可用输出 {0}/{1}', [availableOutputs, outputCount])}</Badge>
        <div className="actions"><Button tone="primary" data-testid="onboarding-connect-device" onClick={() => onNavigate('outputs')}>{t('连接或配置设备')}</Button>
          {onSimulate && <Button data-testid="onboarding-simulate-device" onClick={() => onSimulate('manual')}>{t('打开 3D 模拟器')}</Button>}
          <Button onClick={() => go('axes')}>{t('轴配置')}</Button></div>
      </div>}
      {activeStep === 'input' && scene && <div className="stack">
        <Badge tone={inputPrepared ? 'success' : 'default'}>{inputPrepared ? t('输入已准备') : t('输入待准备')}</Badge>
        <div className="actions"><Button tone="primary" data-testid="onboarding-prepare-input" onClick={() => onNavigate(scene.destination)}>{t('打开输入设置')}</Button>
          {state.goal === 'osc' && <Button data-testid="onboarding-view-parameters" onClick={onViewParameters}>{t('查看收到的参数')}</Button>}
          {actualMode !== state.goal && <Button data-testid="onboarding-apply-input" disabled={disabled} onClick={() => onApplyInput(state.goal)}>{t('应用输入方式')}</Button>}
        </div>
      </div>}
      {activeStep === 'ready' && <div className="stack">
        <h3>{canFinish ? t('设置已备好') : t('还差一步')}</h3>
        <p className="caption muted">{scene?.title || t('尚未选择场景')}</p>
        <ul className="onboarding-checklist" role="list">
          <li><Badge tone={inputPrepared ? 'success' : 'warning'}>{inputPrepared ? t('输入已准备') : t('输入待准备')}</Badge>
            {!inputPrepared && <Button data-testid="onboarding-review-input" onClick={() => go('input')}>{t('准备输入')}</Button>}</li>
          {needsMapping && <li><Badge tone="warning">{t('尚未保存轴映射')}</Badge>
            <Button data-testid="onboarding-review-mapping" onClick={() => go('mapping')}>{t('编辑轴映射')}</Button></li>}
          <li><Badge tone={availableOutputs > 0 ? 'success' : 'warning'}>{t('可用输出 {0}/{1}', [availableOutputs, outputCount])}</Badge>
            {availableOutputs === 0 && <Button data-testid="onboarding-review-device" onClick={() => go('device')}>{t('连接设备')}</Button>}</li>
        </ul>
        <p>{inputActive ? t('输入已启用，继续通过顶部开关控制。') : t('检查高亮的输入启用开关。完成引导不会启用输入，准备好后由你打开。')}</p>
      </div>}
    </div>
    <details className="onboarding-jump">
      <summary>{t('跳转步骤')}</summary>
    <ol className="guided-steps" aria-label={t('首次设置步骤')}>
      {ONBOARDING_STEPS.map((step, index) => <li key={step} className={`guided-step${index === current ? ' guided-step--active' : index < current ? ' guided-step--completed' : ''}`}>
        <Button data-testid={`onboarding-step-${step}`} aria-current={step === activeStep ? 'step' : undefined}
          disabled={index > 0 && !scene} onClick={() => go(step)}><span>{index + 1}</span>{labels[index]}</Button>
      </li>)}
    </ol>
    </details>
    </div>
    <footer className="onboarding-panel__footer actions">
      {current > 0 && <Button data-testid="onboarding-back" onClick={() => go(ONBOARDING_STEPS[current - 1])}>{t('上一步')}</Button>}
      {current < ONBOARDING_STEPS.length - 1 ? <Button tone="primary" data-testid="onboarding-next" disabled={!canContinue} onClick={() => go(ONBOARDING_STEPS[current + 1])}>{t('下一步')}</Button>
        : <Button tone="primary" data-testid="onboarding-complete" onClick={() => onChange({ type: canFinish ? 'complete' : 'dismiss' })}>{canFinish ? t('完成引导') : t('稍后继续')}</Button>}
    </footer>
  </section>;
}
