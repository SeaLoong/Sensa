import React, { useState } from 'react';
import { Badge, Button, Field, Toggle } from './ui.tsx';
import { SelectField } from './controls.jsx';
import { t } from './i18n.js';
import { PROTOCOL_AXES, normalizeDeviceOutput } from './protocol-inputs.js';

export default function VendorDeviceFields({ type, value, onChange }) {
  const options = normalizeDeviceOutput(value);
  const patch = change => onChange({ ...options, ...change });
  return <div className="stack" data-testid="vendor-device-fields">
    <Field label={t('设备 API 地址')} value={options.endpoint} placeholder={type === 'Handy' ? 'https://www.handyfeeling.com/api/handy/v2' : type === 'Lovense' ? 'https://127-0-0-1.lovense.club:30010' : 'https://latency.autoblowapi.com'}
      onChange={event => patch({ endpoint: event.target.value })} />
    {type !== 'Lovense' && <Field label={t('设备连接密钥')} type="password" autoComplete="off" value={options.connectionKey}
      onChange={event => patch({ connectionKey: event.target.value })} />}
    <SelectField label={t('来源轴')} value={options.axis} options={PROTOCOL_AXES.map(axis => ({ value: axis, label: axis }))}
      onChange={axis => patch({ axis })} />
    {type === 'Lovense' && <>
      <Field label={t('设备标识')} value={options.deviceId} onChange={event => patch({ deviceId: event.target.value })} />
      <SelectField label={t('设备功能')} value={options.function} options={['Vibrate', 'Rotate', 'Pump', 'Thrusting', 'Fingering', 'Suction'].map(name => ({ value: name, label: name }))}
        onChange={name => patch({ 'function': name })} />
    </>}
    {type === 'VacuGlide' && <p className="caption muted">{t('来源值表示 0–1 的速度强度，也可在输出卡片中准备同步脚本。')}</p>}
    {['Handy', 'Autoblow', 'VacuGlide'].includes(type) && <Field label={t('同步脚本地址')} value={options.scriptUrl || ''} type="url"
      placeholder="https://example.com/script.csv" onChange={event => patch({ scriptUrl: event.target.value })} />}
    <details><summary>{t('API 与同步设置')}</summary><div className="stack">
      {type === 'Handy' && <>
        <SelectField label={t('Handy API 版本')} value={options.apiVersion} options={[{ value: 2, label: 'v2' }, { value: 3, label: 'v3' }]}
          onChange={apiVersion => patch({ apiVersion: Number(apiVersion) })} />
        {Number(options.apiVersion) === 3 && <>
          <Field label={t('API 密钥')} type="password" autoComplete="off" value={options.apiKey} onChange={event => patch({ apiKey: event.target.value })} />
          <Field label={t('API 访问令牌')} type="password" autoComplete="off" value={options.authToken} onChange={event => patch({ authToken: event.target.value })} />
        </>}
      </>}
      {['Autoblow', 'VacuGlide'].includes(type) && <Field label={t('受信任的集群主机')} value={options.trustedClusterHost}
        placeholder="cluster.example.com" onChange={event => patch({ trustedClusterHost: event.target.value })} />}
      <div className="form-grid">
        <Field label={t('API 超时（ms）')} type="number" min={100} max={15000} value={options.requestTimeoutMs}
          onChange={event => patch({ requestTimeoutMs: Number(event.target.value) })} />
        <Field label={t('最短发送间隔（ms）')} type="number" min={25} max={10000} value={options.minIntervalMs}
          onChange={event => patch({ minIntervalMs: Number(event.target.value) })} />
        {['Handy', 'Autoblow', 'VacuGlide'].includes(type) && <>
          <SelectField label={t('脚本文件格式')} value={options.scriptFormat} options={[{ value: 'Csv', label: 'CSV' }, { value: 'Funscript', label: 'Funscript' }]}
            onChange={scriptFormat => patch({ scriptFormat })} />
          <Field label={t('脚本准备超时（ms）')} type="number" min={100} max={180000} value={options.scriptTimeoutMs}
            onChange={event => patch({ scriptTimeoutMs: Number(event.target.value) })} />
        </>}
        {['Handy', 'Autoblow', 'VacuGlide'].includes(type) && <Field label={t('同步偏移（ms）')} type="number" min={-60000} max={60000} value={options.offsetMs}
          onChange={event => patch({ offsetMs: Number(event.target.value) })} />}
        {type === 'Autoblow' && <Field label={t('移动速度（%）')} type="number" min={1} max={100} value={options.speed}
          onChange={event => patch({ speed: Number(event.target.value) })} />}
      </div>
    </div></details>
  </div>;
}

export function VendorScriptControls({ output, disabled, stopDisabled = disabled, inputActive = false, status = {}, onAction }) {
  const [position, setPosition] = useState(0);
  // Disabled/newly added outputs have an explicit null deviceApi snapshot until connected.
  const scriptPrepared = status?.scriptPrepared === true;
  return <details className="output-detail" data-testid="vendor-script-controls"><summary>{t('同步脚本播放')}</summary><div className="stack">
    <p className="caption muted wrap">{output.device?.scriptUrl || t('请先在输出设置中填写同步脚本地址。')}</p>
    <p className="caption muted">{t('准备脚本会关闭输入；准备完成后，重新启用输入再播放或定位。')}</p>
    <div className="actions"><Badge tone={scriptPrepared ? 'success' : 'default'}>{scriptPrepared ? t('脚本已准备') : t('脚本尚未准备')}</Badge>
      {status?.scriptPlaying && <Badge tone="success">{t('播放中')}</Badge>}</div>
    <Field label={t('脚本位置（ms）')} type="number" min={0} max={86400000} step={100} value={position}
      onChange={event => setPosition(Number(event.target.value))} />
    {status?.supportsScriptLoop === true && <>
      <Toggle label={t('循环播放同步脚本')} checked={status?.scriptLoop === true}
        disabled={disabled || !scriptPrepared || status?.scriptPlaying === true}
        onChange={loop => onAction('loop', { loop })} />
      {status?.scriptPlaying === true && <p className="caption muted">{t('请先停止播放，再更改循环设置。')}</p>}
    </>}
    <div className="actions">
      <Button disabled={disabled || !output.device?.scriptUrl} onClick={() => onAction('prepare', { url: output.device.scriptUrl })}>{t('准备同步脚本')}</Button>
      <Button disabled={disabled || !inputActive || !scriptPrepared || !output.device?.scriptUrl || !Number.isFinite(position) || position < 0 || position > 86400000} onClick={() => onAction('play', { positionMs: position })}>{t('播放同步脚本')}</Button>
      <Button disabled={disabled || !inputActive || !scriptPrepared || !Number.isFinite(position) || position < 0 || position > 86400000} onClick={() => onAction('seek', { positionMs: position })}>{t('定位同步脚本')}</Button>
      <Button disabled={stopDisabled} onClick={() => onAction('stop', {})}>{t('停止同步脚本')}</Button>
    </div>
  </div></details>;
}
