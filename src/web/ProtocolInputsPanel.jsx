import React, { useEffect, useRef, useState } from 'react';
import { Badge, Button, Field, Notice, Toggle } from './ui.jsx';
import { SelectField } from './controls.jsx';
import { diagnostic, docUrl, t } from './i18n.js';
import { PROTOCOL_AXES, PROTOCOL_INPUT_TYPES, PROTOCOL_SCALAR_TYPES, makeProtocolDraft, makeProtocolFeature, newProtocolDraft,
  protocolDraftErrors, protocolEndpoint, saveProtocolDrafts } from './protocol-inputs.js';

export default function ProtocolInputsPanel({ config, runtime = [], online = true, saving = false, onSave }) {
  const serialized = JSON.stringify(config?.protocolInputs || []);
  const [drafts, setDrafts] = useState(() => (config?.protocolInputs || []).map(makeProtocolDraft));
  const savedDrafts = useRef(JSON.stringify(drafts));
  const [error, setError] = useState('');
  useEffect(() => {
    const next = JSON.parse(serialized).map(makeProtocolDraft);
    setDrafts(current => JSON.stringify(current) === savedDrafts.current ? next : current);
    savedDrafts.current = JSON.stringify(next);
  }, [serialized]);
  const dirty = JSON.stringify(drafts) !== savedDrafts.current;
  const errors = protocolDraftErrors(drafts);
  const update = (index, patch) => setDrafts(current => current.map((draft, i) => i === index ? { ...draft, ...patch } : draft));
  async function save() {
    setError('');
    const submitted = drafts;
    try {
      const saved = await onSave(saveProtocolDrafts(config, submitted));
      const normalized = (saved?.protocolInputs || submitted).map(makeProtocolDraft);
      savedDrafts.current = JSON.stringify(normalized);
      setDrafts(current => current === submitted ? normalized : current);
    } catch (failure) { setError(failure.message || t('保存协议输入失败')); }
  }
  return <div className="stack" data-testid="protocol-inputs-panel">
    <p>{t('让网站或应用把 Sensa 当作设备，再将控制转到实际输出。连接与输入启用分别管理。')}</p>
    <p className="caption"><a href={docUrl('docs/protocol-inputs.md')} target="_blank" rel="noreferrer">{t('协议、客户端与蓝牙／虚拟串口接入说明')}</a></p>
    {!drafts.length && <Notice>{t('添加一个来源，在客户端填写对应地址。蓝牙和虚拟串口可以通过协议桥工具接入。')}</Notice>}
    {drafts.map((draft, index) => {
      const status = runtime.find(input => input.id === draft.id);
      const saved = (config?.protocolInputs || []).some(input => input.id === draft.id);
      const featureChange = (featureIndex, patch) => update(index, { features: draft.features.map((feature, i) => i === featureIndex ? { ...feature, ...patch } : feature) });
      return <details key={index} className="computed-signal" open data-testid="protocol-input-card">
        <summary><strong>{draft.name || draft.id}</strong> <Badge tone={status?.lastError ? 'error' : status?.connected ? 'success' : 'default'}>
          {status?.lastError ? t('连接异常') : status?.connected ? t('已连接') : status?.listening ? t('等待客户端') : t('未监听')}</Badge></summary>
        <div className="stack">
          <div className="form-grid">
            <Field label={t('来源名称')} value={draft.name} onChange={event => update(index, { name: event.target.value })} />
            <Field label={t('来源标识')} value={draft.id} disabled={saved} onChange={event => update(index, { id: event.target.value })} />
            <SelectField label={t('输入协议')} value={draft.type} options={PROTOCOL_INPUT_TYPES()}
              onChange={type => update(index, { type, port: PROTOCOL_INPUT_TYPES().find(option => option.value === type).port })} />
            <Field label={t('连接超时（ms）')} type="number" min={1000} max={600000} step={1000} value={draft.timeoutMs}
              onChange={event => update(index, { timeoutMs: event.target.value === '' ? '' : Number(event.target.value) })} />
          </div>
          {draft.type === 'TCodeSerial' ? <div className="form-grid">
            <Field label={t('串口')} value={draft.comPort} placeholder="COM8 / /dev/pts/3" onChange={event => update(index, { comPort: event.target.value })} />
            <Field label={t('波特率')} type="number" min={1200} max={4000000} value={draft.baudRate} onChange={event => update(index, { baudRate: Number(event.target.value) })} />
          </div> : draft.type === 'IntifaceDevice' ? <div className="form-grid">
            <Field label={t('Intiface 设备端地址')} value={draft.address} onChange={event => update(index, { address: event.target.value })} />
            <Field label={t('设备识别名称')} value={draft.identifier} placeholder={draft.name} onChange={event => update(index, { identifier: event.target.value })} />
          </div> : <div className="form-grid">
            <Field label={t('监听地址')} value={draft.host} onChange={event => update(index, { host: event.target.value })} />
            <Field label={t('监听端口')} type="number" min={1} max={65535} value={draft.port}
              onChange={event => update(index, { port: event.target.value === '' ? '' : Number(event.target.value) })} />
          </div>}

          {['AutoblowHttp', 'VacuGlideHttp'].includes(draft.type) && <>
            <Field label={t('本地设备令牌（可选）')} type="password" autoComplete="off" value={draft.identifier}
              onChange={event => update(index, { identifier: event.target.value })} />
            <p className="caption muted">{t('这是本地兼容接口的令牌。设置后，客户端的 x-device-token 必须匹配；无需填写厂商云密钥。')}</p>
          </>}
          {['HandyHttp', 'AutoblowHttp', 'VacuGlideHttp', 'LovenseHttp'].includes(draft.type) && <p className="caption muted">{t('兼容接口需要客户端能配置此地址；仅支持文档列出的控制功能，厂商云不会自动转发到 Sensa。')}</p>}
          {draft.type === 'HandyHttp' && <details><summary>{t('速度换算')}</summary><div className="stack">
            <Field label={t('虚拟设备最大速度（全行程/秒）')} type="number" min={.01} max={20} step={.01}
              value={draft.maxSpeedPerSecond} onChange={event => update(index, { maxSpeedPerSecond: event.target.value === '' ? '' : Number(event.target.value) })} />
            <p className="caption muted">{t('用于将上游虚拟设备速度换算为到达时长。实际输出范围和限位仍由输出设置决定。')}</p>
          </div></details>}
          {['HandyHttp', 'AutoblowHttp', 'VacuGlideHttp'].includes(draft.type) && <details><summary>{t('脚本任务设置')}</summary><div className="stack">
            <Field label={t('脚本任务上限（ms）')} type="number" min={1000} max={3600000} step={1000}
              value={draft.maxScriptDurationMs} onChange={event => update(index, { maxScriptDurationMs: event.target.value === '' ? '' : Number(event.target.value) })} />
            <p className="caption muted">{t('已接收脚本运行到自然结束、明确停止或此上限；HTTP 空闲超时不代替任务期限。')}</p>
          </div></details>}
          <div className="stack" data-testid="protocol-features">
            {draft.features.map((feature, featureIndex) => <fieldset key={featureIndex} className="editor-group" data-testid="protocol-feature">
              <legend>{t('控制通道 {0}', [featureIndex + 1])}</legend>
              <div className="form-grid">
                <Field label={t('通道标识')} value={feature.channel} onChange={event => featureChange(featureIndex, { channel: event.target.value })} />
                <Field label={t('通道名称')} value={feature.name} onChange={event => featureChange(featureIndex, { name: event.target.value })} />
                <SelectField label={t('控制类型')} value={feature.actuator} options={[
                  { value: 'Position', label: t('位置与到达时长') }, { value: 'Scalar', label: t('强度') }, { value: 'Rotation', label: t('旋转速度与方向') },
                ]} onChange={actuator => featureChange(featureIndex, { actuator, targetAxis: actuator === 'Rotation' ? '' : actuator === 'Scalar' && !/^V[012]$/.test(feature.targetAxis) ? 'V0' : feature.targetAxis })} />
                {feature.actuator === 'Scalar' && <SelectField label={t('标量执行器类型')} value={feature.scalarType}
                  options={PROTOCOL_SCALAR_TYPES.map(value => ({ value, label: value }))} onChange={scalarType => featureChange(featureIndex, { scalarType })} />}
                <SelectField label={t('直接映射到轴')} value={feature.targetAxis} disabled={feature.actuator === 'Rotation'} options={[
                  { value: '', label: t('仅提供信号') }, ...PROTOCOL_AXES.filter(axis => feature.actuator !== 'Scalar' || axis.startsWith('V')).map(value => ({ value, label: value })),
                ]} onChange={targetAxis => featureChange(featureIndex, { targetAxis })} />
              </div>
              {feature.actuator === 'Scalar' && ['Led', 'Temperature', 'Spray'].includes(feature.scalarType)
                && <p className="caption muted">{t('此执行器类型需要 Buttplug v4 客户端。')}</p>}
              <p className="caption muted">{t('信号路径：{0}', [`${draft.id}/${feature.channel}`])}</p>
              <Button tone="danger" disabled={draft.features.length === 1} onClick={() => update(index, { features: draft.features.filter((_, i) => i !== featureIndex) })}>{t('移除通道')}</Button>
            </fieldset>)}
            <Button disabled={draft.features.length >= 16} onClick={() => {
              const channels = new Set(draft.features.map(feature => feature.channel));
              const axis = PROTOCOL_AXES.find(candidate => !channels.has(candidate));
              update(index, { features: [...draft.features, makeProtocolFeature({ channel: axis || `Channel${draft.features.length + 1}`, targetAxis: axis || '' })] });
            }}>{t('添加控制通道')}</Button>
          </div>
          <div className="actions"><p className="caption wrap"><strong>{t('客户端地址')}</strong> <code data-testid="protocol-endpoint">{status?.address || protocolEndpoint(draft)}</code></p>
            <Button onClick={async () => {
              try { await navigator.clipboard.writeText(status?.address || protocolEndpoint(draft)); }
              catch { setError(t('复制失败，请选择并复制地址。')); }
            }}>{t('复制地址')}</Button></div>
          {status?.session && <p className="caption muted">{t('当前会话：{0}', [status.session])}</p>}
          {status && <p className="caption muted">{t('已接收 {0} 条命令', [status.receivedCommands || 0])}</p>}
          {status?.lastError && <Notice tone="error">{diagnostic(status.lastError)}</Notice>}
          <div className="actions"><Toggle label={t('启用监听')} checked={draft.enabled} onChange={enabled => update(index, { enabled })} />
            <Toggle label={t('直接驱动动作轴')} checked={draft.routeToMotion} onChange={routeToMotion => update(index, { routeToMotion })} />
            <Button tone="danger" onClick={() => setDrafts(current => current.filter((_, i) => i !== index))}>{t('移除来源')}</Button></div>
        </div>
      </details>;
    })}
    {(error || errors.length > 0) && <Notice tone="error">{error || errors.join('\n')}</Notice>}
    <div className="actions"><Button disabled={drafts.length >= 16} onClick={() => setDrafts(current => [...current, newProtocolDraft(current)])}>{t('添加协议来源')}</Button>
      <Button disabled={!dirty || saving} onClick={() => { setDrafts((config?.protocolInputs || []).map(makeProtocolDraft)); setError(''); }}>{t('恢复协议输入')}</Button>
      <Button tone="primary" disabled={!online || !dirty || saving || errors.length > 0} onClick={save}>{t('保存协议输入')}</Button>
    </div>
    {dirty && <p className="caption muted">{t('保存会关闭输入并停止输出，准备好后再单独启用。')}</p>}
  </div>;
}
