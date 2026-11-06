import React from 'react';
import { Badge, Button, Notice, Section } from './ui.tsx';
import { buildOutputSummary, getOutputOverview } from './configuration.js';
import { isSignalOutputType } from './signal-outputs.js';
import { computedInputOptions } from './computed-signals.js';
import ComputedSignalsPanel from './ComputedSignalsPanel.jsx';
import SignalPlanPanel from './SignalPlanPanel.jsx';
import { diagnostic, t } from './i18n.js';

export function formatSavedBindingSource(binding, savedComputations = []) {
  const source = binding.source || {};
  const mode = source.sourceMode || 'Direct';
  const kind = computedInputOptions().find(option => option.value === mode)?.label || mode;
  const saved = mode === 'Computed' ? savedComputations.find(signal => signal.id === source.oscPath) : null;
  const value = mode === 'Constant' ? String(source.value ?? 0)
    : saved?.name ? `${saved.name} (${saved.id})` : source.oscPath || '—';
  return `${kind} · ${value}`;
}

function OutputRoutingSummary({ outputs, overview, savedComputations, outputAvailability, online, busy, onEditOutput, onManageOutputs }) {
  return <section className="flow-output-routing stack" data-testid="flow-output-routing" aria-label={t('输出连接')}>
    <div className="workspace-header"><h3>{t('输出连接')}</h3>
      <Button onClick={onManageOutputs}>{outputs.length ? t('管理输出') : t('添加输出')}</Button></div>
    <p className="caption muted">{t('选择计算来源时使用已保存结果，输出连接单独保存。')}</p>
    {!outputs.length ? <p className="empty-state">{t('暂无输出')}</p> : <div className="flow-output-routing__list">
      {outputs.map(output => {
        const state = getOutputOverview(overview, output.id) || {};
        const availability = outputAvailability?.get(output.type);
        const unavailable = availability?.available === false;
        const bindings = output.signal?.bindings || [];
        const independent = isSignalOutputType(output.type) || bindings.length > 0;
        const errors = [...new Set([state.lastError, state.signalStatus?.error].filter(Boolean))];
        const routeReasons = [...new Set((state.signalStatus?.routes || []).filter(route => !route.valid && route.reason).map(route => diagnostic(route.reason)))];
        const status = state.signalStatus?.status;
        const statusLabels = { WaitingForServer: t('等待中继响应'), WaitingForApp: t('等待 APP 配对'), Paired: t('APP 已配对'),
          CommandError: t('设备命令执行失败'), error: t('输出发生错误'), 'recording-limit': t('录制已达到文件大小上限'), 'stop-unconfirmed': t('停止结果待确认') };
        const statusLabel = status && !['Disconnected', 'disconnected', 'Connected', 'connected', 'Connecting', 'connecting'].includes(status)
          ? statusLabels[status] || diagnostic(status) : '';
        return <article className="flow-output-route stack" key={output.id} data-output-id={output.id}>
          <div className="flow-output-route__heading"><strong>{output.name || output.id}</strong>
            <Badge tone={unavailable ? 'warning' : !output.enabled ? 'default' : state.connected ? 'success' : 'warning'}>
              {unavailable ? t('当前不可用') : !output.enabled ? t('已禁用') : state.connected ? t('已连接') : t('未连接')}</Badge></div>
          <div className="flow-output-route__meta"><span className="caption muted">{independent ? t('{0} 条独立连接', [bindings.length]) : t('使用当前动作目标')}</span>
            <span className="caption mono wrap">{buildOutputSummary(output)}</span></div>
          {state.deviceApi?.scriptPlaying === true ? <Badge tone="success">{t('播放中')}</Badge>
            : state.deviceApi?.scriptPrepared === true && <span className="caption muted">{t('设备脚本已准备')}</span>}
          {unavailable && availability.reason && <Notice tone="warning">{availability.reason}</Notice>}
          {errors.map(error => <Notice key={error} tone="error">{diagnostic(error)}</Notice>)}
          {statusLabel && <p className="caption muted">{statusLabel}</p>}
          {routeReasons.length > 0 && <Notice tone="warning">{routeReasons.join('；')}</Notice>}
          {bindings.length > 0 && <details><summary>{t('查看已保存连接')}</summary><ul className="flow-output-route__bindings">
            {bindings.map(binding => <li key={binding.id}><strong>{binding.name || binding.id}</strong>{' '}
              <span>{formatSavedBindingSource(binding, savedComputations)}</span>{' → '}<code>{binding.address}</code></li>)}
          </ul></details>}
          <div className="flow-output-route__actions actions"><Button data-testid="edit-output-bindings" disabled={!online || busy} onClick={() => onEditOutput(output.id)}>{t('编辑输出连接')}</Button></div>
        </article>;
      })}
    </div>}
  </section>;
}

export default function SignalPipelineWorkspace({ toolbar, computedDrafts = [], runtimeSignals = [], observations = [],
  selectedSourceKey = '', computedGraphDirty = false, pathOptions = [], onComputedChange, onMapCalculation,
  computedView, onComputedViewChange, config, outputs = [], overview, outputAvailability, online = false, busy = false,
  onEditOutput, onManageOutputs, onSetCombinedInput, onApplyPlan, emergencyAction }) {
  return <Section title={t('信号流程')} description={t('选择来源、处理数值，再连接到设备、应用或录制。')}
    className="signal-pipeline-workspace" actions={<Button onClick={onSetCombinedInput}>{t('设置组合输入')}</Button>}>
    {toolbar}
    <ComputedSignalsPanel drafts={computedDrafts} runtimeSignals={runtimeSignals} observations={observations}
      selectedSourceKey={selectedSourceKey} graphDirty={computedGraphDirty} pathOptions={pathOptions}
      viewState={computedView} onViewStateChange={onComputedViewChange} onChange={onComputedChange} onMap={onMapCalculation} />
    <OutputRoutingSummary outputs={outputs} overview={overview} savedComputations={config?.computedSignals || []} outputAvailability={outputAvailability} online={online}
      busy={busy} onEditOutput={onEditOutput} onManageOutputs={onManageOutputs} />
    <SignalPlanPanel config={config} onApply={onApplyPlan} disabled={!online || busy} emergencyAction={emergencyAction} />
  </Section>;
}
