import React, { useMemo, useState } from 'react';
import { Badge, Button, Field, Notice, Toggle } from './ui.jsx';
import { SelectField } from './controls.jsx';
import { t, diagnostic } from './i18n.js';
import SignalSourceFields from './SignalSourceFields.jsx';
import PairingQRCode from './PairingQRCode.jsx';
import { SIGNAL_BINDING_LIMIT, applyVrChatOutput, buildSignalOutputDraft, dglabBasicFrames, isSignalOutputType, makeOutputBinding, recordingDownloadUrl, recordingFiles, recordingFormatOptions } from './signal-outputs.js';

const numeric = (event, onChange, key) => onChange({ [key]: event.target.value === '' ? '' : Number(event.target.value) });
const curveOptions = () => [{ value: 'Linear', label: t('线性') }, { value: 'EaseIn', label: t('缓入') },
  { value: 'EaseOut', label: t('缓出') }, { value: 'SCurve', label: t('缓入缓出') }];

function BindingCard({ binding, outputType, recordingFormat, targetAxes, signals, pathOptions, status, onChange, onRemove, defaultOpen }) {
  const [open, setOpen] = useState(defaultOpen);
  const targetLabel = outputType === 'Dglab' ? t('控制内容') : outputType === 'Mqtt' ? t('发布主题') : outputType === 'Recording' ? recordingFormat === 'Funscript' ? t('轨道名称') : t('记录字段') : t('目标参数');
  const field = (key, label, extra = {}) => <Field key={key} label={t(label)} type="number" step="any" value={binding[key]}
    onChange={event => numeric(event, onChange, key)} {...extra} />;
  return <details className="signal-binding stack" open={open} onToggle={event => setOpen(event.currentTarget.open)} data-testid="output-binding" data-binding-id={binding.id}>
    <summary><strong>{binding.name || binding.id}</strong><code>{binding.address}</code>
      {status && <Badge tone={status.valid ? 'success' : 'default'}>{status.valid ? t('有效') : t('等待输入')}</Badge>}</summary>
    {open && <div className="stack signal-binding__body">
      <div className="editor-group"><h4>{t('信号从哪里来')}</h4>
      <div className="form-grid">
        <Field label={t('连接名称')} value={binding.name} onChange={event => onChange({ name: event.target.value })} />
        <SignalSourceFields source={binding.source} signals={signals} pathOptions={pathOptions}
          onChange={patch => onChange({ source: { ...binding.source, ...patch } })} />
      </div></div>
      <div className="editor-group"><h4>{t('发送到哪里')}</h4>
      <div className="form-grid">
        {outputType === 'Dglab' ? <><SelectField label={targetLabel} value={binding.address} options={[
          { value: 'Intensity', label: t('临时强度') }, { value: 'Pulse', label: t('波形任务') },
        ]} onChange={address => onChange({ address, sendMode: address === 'Pulse' ? 'OnEvent' : 'OnChange' })} />
          <SelectField label={t('任务通道')} value={binding.channel ?? ''} options={[
            { value: '', label: t('使用输出通道') }, { value: '0', label: 'A' }, { value: '1', label: 'B' },
          ]} onChange={channel => onChange({ channel: channel === '' ? null : Number(channel) })} /></>
          : outputType.startsWith('TCode') || outputType === 'Intiface' ? <SelectField label={t('目标轴')} value={binding.address}
            options={targetAxes.map(value => ({ value, label: value }))} onChange={address => onChange({ address })} />
            : <Field label={targetLabel} value={binding.address} onChange={event => onChange({ address: event.target.value })}
              placeholder={outputType === 'OscParameter' ? '/avatar/parameters/SensaFeedback' : outputType === 'Midi' ? 'CC/1/1'
                : outputType === 'Recording' && recordingFormat === 'Funscript' ? 'L0 / R0 / Track1' : 'value'} />}
        <SelectField label={t('数值类型')} value={binding.valueType} options={[
          { value: 'Float', label: t('Float · 连续数值') }, { value: 'Int', label: t('Int · 整数') }, ...(outputType === 'Midi' ? [] : [{ value: 'Bool', label: t('Bool · 开关') }]),
        ]} onChange={valueType => onChange({ valueType })} />
      </div></div>
      <div className="editor-group"><h4>{t('怎样换算数值')}</h4><p className="caption muted">{t('输入起点对应输出起点，输入终点对应输出终点。中间的数值按所选曲线转换。')}</p>
      <div className="form-grid">
        {field('inputMin', '输入起点')}{field('inputMax', '输入终点')}
        {field('outputMin', '输出起点')}{field('outputMax', '输出终点')}
        <SelectField label={t('转换曲线')} value={binding.curve} options={curveOptions()} onChange={curve => onChange({ curve })} />
        {!['Dglab', 'Recording'].includes(outputType) && field('stopValue', '停止时发送值')}
      </div></div>
      {outputType === 'Dglab' ? <SelectField label={t('发送方式')}
        value={binding.address === 'Pulse' ? binding.sendMode === 'FixedRate' ? 'FixedRate' : 'OnEvent' : binding.sendMode === 'OnEvent' ? 'OnEvent' : 'OnChange'}
        options={binding.address === 'Pulse' ? [{ value: 'FixedRate', label: t('持续播放') }, { value: 'OnEvent', label: t('触发一次') }]
          : [{ value: 'OnChange', label: t('跟随输入') }, { value: 'OnEvent', label: t('触发一次') }]}
        onChange={sendMode => onChange({ sendMode })} /> : <details><summary>{t('发送频率与变化阈值')}</summary><div className="form-grid">
        <SelectField label={t('发送方式')} value={binding.sendMode} options={[
          { value: 'OnChange', label: t('数值变化时发送') }, { value: 'FixedRate', label: t('按固定频率发送') },
          { value: 'OnEvent', label: t('正向触发时发送') },
        ]} onChange={sendMode => onChange({ sendMode })} />
        {field('rateHz', '最大发送频率（Hz）', { min: 1, max: 100 })}
        {field('epsilon', '最小变化量', { min: 0 })}
      </div></details>}
      {outputType === 'Dglab' && <p className="caption muted">{binding.address === 'Pulse'
        ? binding.sendMode === 'FixedRate' ? t('映射结果达到 0.5 时按当前相位持续播放，停止或失效时清理任务。') : t('映射结果达到 0.5 时触发一次波形任务，任务按持续时间结束。')
        : t('映射结果作为 0–1 强度系数，再乘以通道上限得到临时强度。')}</p>}
      {outputType === 'Dglab' && <p className="caption muted">{t('强度跟随输入时自动续接短任务；持续播放的波形按 100 ms 整帧续接。')}</p>}
      {outputType === 'Midi' && <p className="caption muted">{t('MIDI CC 地址格式为 CC／通道／控制器，例如 CC/1/1；输出值范围为 0–127。')}</p>}
      {outputType === 'Recording' && recordingFormat === 'Funscript' && <p className="caption muted">{t('使用 L0、R0 等轴名可生成对应的多轴文件名，也可填写自定义轨道名称。')}</p>}
      {status && <p className="caption muted" data-testid="output-binding-status">
        {t('原始值 {0} → 发送值 {1}', [status.rawValue ?? '—', status.value ?? '—'])}
        {status.reason ? ` · ${diagnostic(status.reason)}` : ''}
      </p>}
      <div className="actions"><Button tone="danger" onClick={onRemove}>{t('移除连接')}</Button></div>
    </div>}
  </details>;
}

function RecordingFiles({ status, onLoadScript, busy }) {
  const [page, setPage] = useState(0);
  const files = recordingFiles(status), pageCount = Math.ceil(files.length / 20);
  const current = Math.min(page, Math.max(0, pageCount - 1));
  if (!files.length) return null;
  return <div className="stack" data-testid="recording-files">
    {files.slice(current * 20, (current + 1) * 20).map(file => <div className="stack" key={file.fileName} data-testid="recording-file"
      data-recording-file={file.fileName} data-recording-signal={file.signalId} data-recording-segment={file.segment}
      data-recording-completed={file.completed !== false}>
      <p className="caption muted">{file.signalId ? <strong>{file.signalId}{file.axis && file.axis !== file.signalId ? ` · ${file.axis}` : ''}</strong> : t('录制文件')}
        {file.segment != null && <> · {t('片段 {0} · 起点 {1} ms', [file.segment, file.timeOffsetMs ?? 0])}</>}
        {' '}<code>{file.fileName}</code></p>
      <div className="actions">{file.completed === false ? <span className="caption muted">{t('录制中')}</span>
        : <a data-testid="recording-download" href={recordingDownloadUrl(file.fileName)} download>{t('下载录制')}</a>}
        {file.fileName.toLowerCase().endsWith('.funscript') && onLoadScript && <Button data-testid="recording-load-script"
          disabled={busy || file.completed === false} onClick={() => onLoadScript(file.fileName)}>{t('载入脚本播放器')}</Button>}
      </div>
    </div>)}
    {pageCount > 1 && <div className="actions"><Button disabled={current === 0} onClick={() => setPage(current - 1)}>{t('上一页')}</Button>
      <span>{t('第 {0} / {1} 页', [current + 1, pageCount])}</span><Button disabled={current >= pageCount - 1} onClick={() => setPage(current + 1)}>{t('下一页')}</Button></div>}
    {onLoadScript && files.some(file => file.fileName.toLowerCase().endsWith('.funscript')) && <p className="caption muted">{t('载入脚本播放器后，此轨道的位置通过脚本 L0 信号提供；在输出连接中选择目标轴。')}</p>}
  </div>;
}

export function OutputSignalStatus({ status, onLoadScript, busy = false }) {
  if (!status) return null;
  const states = { disconnected: t('未连接'), connected: t('已连接'), connecting: t('连接中'), error: t('输出发生错误'),
    Disconnected: t('未连接'), Connecting: t('连接中'), WaitingForServer: t('等待中继响应'),
    WaitingForApp: t('等待 APP 配对'), Paired: t('APP 已配对'), CommandError: t('设备命令执行失败'),
    'recording-limit': t('录制已达到文件大小上限'), 'stop-unconfirmed': t('停止结果待确认'),
  };
  return <div className="signal-output-status stack" data-testid="signal-output-status">
    {status.status && <p className="caption muted">{states[status.status] || diagnostic(status.status)}</p>}
    {status.error && <p className="caption muted">{diagnostic(status.error)}</p>}
    {status.routes?.length > 0 && <dl className="signal-output-readings">{status.routes.slice(0, 8).map(route => <div key={route.id}>
      <dt>{route.name || route.id}</dt><dd>{route.valid ? String(route.value ?? '—') : diagnostic(route.reason) || t('等待输入')}</dd>
    </div>)}</dl>}
    <RecordingFiles status={status} onLoadScript={onLoadScript} busy={busy} />
  </div>;
}

export default function OutputBindings({ output, signals = [], pathOptions = [], status, onChange, midiPorts = [], onRefreshMidi, busy = false }) {
  const signal = useMemo(() => buildSignalOutputDraft(output.type, output.signal), [output.type, output.signal]);
  const selectedDevice = status?.devices?.find(device => device.slotId === signal.slotId && (device.clientId || '') === signal.clientId);
  const deviceKey = device => JSON.stringify([device.clientId || '', device.slotId]);
  const coyote3 = selectedDevice?.type === 'COYOTE_030';
  const waveformPreset = useMemo(() => ['steady', 'fade', 'alternating'].find(preset => JSON.stringify(dglabBasicFrames(preset)) === JSON.stringify(signal.waveformFrames)) || '', [signal.waveformFrames]);
  const setSignal = patch => onChange({ signal: { ...signal, ...patch } });
  const targetAxes = output.type === 'Intiface' ? [...new Set(['L0', output.vibrationAxis || 'V0'])]
    : ['L0', 'L1', 'L2', 'R0', 'R1', 'R2', 'V0', 'V1', 'V2', 'A0', 'A1', 'A2'];
  const numberField = (key, label, extra = {}) => <Field key={key} label={t(label)} type="number" step="any" value={signal[key]}
    onChange={event => numeric(event, setSignal, key)} {...extra} />;
  const networkEndpoint = ['OscParameter', 'Mqtt'].includes(output.type);
  const descriptions = {
    Dglab: t('通过 DG-LAB 4 APP 控制已配对的设备，强度和波形可以分别选择信号来源。'),
    Recording: t('把信号录制为可播放的 Funscript 轨道，或保存为 JSON Lines、CSV 信号数据。'),
    HttpJson: t('每条连接将参数名、转换后数值和时间组成 JSON，通过 HTTP POST 发送到服务地址。'),
    WebSocketJson: t('每条连接将参数名、转换后数值和时间组成 JSON，通过 WebSocket 长连接发送。'),
    Mqtt: t('主题前缀和每条连接的发布主题组成目标主题，数值以 JSON 发送给 MQTT 服务。'),
    Midi: t('将转换结果作为 MIDI CC 控制值发送到指定端口，用于调节软件参数或兼容设备。'),
  };
  return <section className="signal-output-settings stack" data-testid="signal-output-settings" aria-label={t('信号输出设置')}>
    {descriptions[output.type] && <p className="caption muted">{descriptions[output.type]}</p>}
    {output.type === 'OscParameter' && <>
      <Toggle label={t('回写到 VRChat OSC')} checked={signal.vrChat} onChange={checked => onChange(applyVrChatOutput(output, checked))} />
      <p className="caption muted">{t('选择当前 Avatar 可写的参数及对应类型。每条连接可以使用不同的计算结果和量程。')}</p>
    </>}
    {networkEndpoint && <div className="form-grid form-grid--endpoint">
      <Field label={t('目标地址')} value={output.type === 'OscParameter' && signal.vrChat ? '127.0.0.1' : output.host}
        disabled={output.type === 'OscParameter' && signal.vrChat} onChange={event => onChange({ host: event.target.value })} />
      <Field label={t('目标端口')} type="number" min={1} max={65535} value={output.type === 'OscParameter' && signal.vrChat ? 9000 : output.port}
        disabled={output.type === 'OscParameter' && signal.vrChat} onChange={event => onChange({ port: event.target.value === '' ? '' : Number(event.target.value) })} />
    </div>}
    {['HttpJson', 'WebSocketJson'].includes(output.type) && <Field label={t('服务地址')} value={output.websocketAddress}
      placeholder={output.type === 'HttpJson' ? 'http://127.0.0.1:8080/sensa' : 'ws://127.0.0.1:8080/sensa'} onChange={event => onChange({ websocketAddress: event.target.value })} />}
    {output.type === 'Mqtt' && <div className="form-grid">
      <Field label={t('主题前缀')} value={signal.mqttTopicPrefix} onChange={event => setSignal({ mqttTopicPrefix: event.target.value })} />
      <Field label={t('客户端标识')} value={signal.mqttClientId} onChange={event => setSignal({ mqttClientId: event.target.value })} />
      <Toggle label={t('使用 TLS')} checked={signal.mqttUseTls} onChange={mqttUseTls => setSignal({ mqttUseTls })} />
    </div>}
    {output.type === 'Midi' && <div className="stack"><Field label={t('MIDI 输出端口')} value={signal.midiPortName}
      onChange={event => setSignal({ midiPortName: event.target.value })} />
      <div className="actions"><SelectField label={t('可用 MIDI 端口')} value={midiPorts.some(port => (port.id || port.name || port) === signal.midiPortName) ? signal.midiPortName : ''}
        options={[{ value: '', label: t('选择端口') }, ...midiPorts.map(port => ({ value: port.id || port.name || port, label: port.name || port.id || port }))]}
        onChange={midiPortName => { if (midiPortName) setSignal({ midiPortName }); }} />
        <Button disabled={busy} onClick={onRefreshMidi}>{t('刷新 MIDI 端口')}</Button></div></div>}
    {output.type === 'Dglab' && <>
      <Field label={t('DG-LAB 中继地址')} value={signal.serverUrl} onChange={event => setSignal({ serverUrl: event.target.value })} />
      {status?.pairingUrl ? <div className="notice notice--info"><p>{t('使用 DG-LAB 4 APP 扫码配对。')}</p>
        <PairingQRCode value={status.pairingUrl} />
        <code className="signal-pairing-url">{status.pairingUrl}</code>
        {status.targetId && <p className="caption">{t('配对标识')}：{status.targetId}</p>}
      </div> : <p className="caption muted">{t('保存并连接输出后显示配对地址，再选择 APP、设备和通道。')}</p>}
      {status?.devices?.length > 0 && <SelectField label={t('已发现的设备')} value={selectedDevice ? deviceKey(selectedDevice) : ''} options={[
        { value: '', label: t('选择设备') }, ...status.devices.map(device => ({ value: deviceKey(device), label: `${device.name || device.type || device.slotId} · ${device.clientId ? `${device.clientId}/` : ''}${device.slotId}` })),
      ]} onChange={key => { const device = status.devices.find(item => deviceKey(item) === key); setSignal({ slotId: device?.slotId || '', ...(device?.clientId ? { clientId: device.clientId } : {}),
        ...(!signal.waveformFrames.length && device?.type === 'COYOTE_030' ? { waveformFrames: dglabBasicFrames('steady') } : {}),
      }); }} />}
      <div className="form-grid">
        <Field label={t('APP 连接标识')} value={signal.clientId} onChange={event => setSignal({ clientId: event.target.value })} />
        <Field label={t('设备标识')} value={signal.slotId} onChange={event => setSignal({ slotId: event.target.value })} />
        <SelectField label={t('输出通道')} value={String(signal.channel)} options={[{ value: '0', label: 'A' }, { value: '1', label: 'B' }]} onChange={channel => setSignal({ channel: Number(channel) })} />
        {numberField('maxIntensity', '通道强度上限', { min: 0 })}
        {numberField('taskDurationMs', '任务持续时间（ms）', { min: 100, max: 1000, step: 50 })}
      </div>
      <p className="caption muted">{t('上限从 0 开始。按设备当前量程设置上限后，输入信号在此范围内调节强度；任务使用有限持续时间。')}</p>
      <SelectField label={t('基础效果')} value={waveformPreset} disabled={!coyote3} options={[
        { value: '', label: t('自定义效果') }, { value: 'steady', label: t('Sensa · 平稳') }, { value: 'fade', label: t('Sensa · 渐变') }, { value: 'alternating', label: t('Sensa · 交替') },
      ]} onChange={preset => { if (preset) setSignal({ waveformFrames: dglabBasicFrames(preset) }); }} />
      <p className="caption muted">{t('基础效果使用郊狼 3.0 的帧格式，选择对应设备后可用。播放方式由波形连接的发送方式决定。')}</p>
      <details><summary>{t('自定义波形帧')}</summary><div className="stack"><Field label={t('波形帧（每行一帧）')} multiline rows={3} value={signal.waveformFrames.join('\n')}
        onChange={event => setSignal({ waveformFrames: event.target.value.split(/\r?\n/) })} />
        <a href="https://github.com/dungeonlab-open/dglab-bluetooth-protocol/blob/main/coyote/v3/README_CN.md" target="_blank" rel="noreferrer">{t('DG-LAB 官方帧格式')}</a>
      </div></details>
    </>}
    {output.type === 'Recording' && <><div className="form-grid">
      <SelectField label={t('录制格式')} value={signal.recordingFormat} options={recordingFormatOptions()}
        onChange={recordingFormat => setSignal({ recordingFormat })} />
      <Field label={t('录制名称')} value={signal.recordingName} placeholder={t('自动命名')} onChange={event => setSignal({ recordingName: event.target.value })} />
    </div>{signal.recordingFormat === 'Funscript' ? <><p className="caption muted">{t('每条连接录制为独立轨道。将映射结果限制在 0–1，再转换为 Funscript 的 pos 0–100；动作时间以毫秒记录。')}</p>
      <p className="caption muted">{t('输入失效时结束当前片段，恢复后录制下一片段；每个文件从 0 ms 开始，并显示其在原录制中的起点。')}</p>
      <p className="caption muted">{t('完成的片段可下载或载入脚本播放器。载入信号回放后使用路径 {0}。', [`${output.id}/value`])}</p></>
      : <><p className="caption muted">{t('信号数据保留原始值、转换值、有效状态和时间，供分析与信号流程回放。')}</p>
        {signal.bindings.some(binding => binding.address) && <p className="caption muted">{t('回放来源路径')}：{signal.bindings.filter(binding => binding.address).slice(0, 4).map((binding, index) => <React.Fragment key={binding.id}>{index > 0 ? ' · ' : ''}<code>{output.id}/{binding.address}</code></React.Fragment>)}</p>}</>}
    </>}
    <div className="signal-bindings-heading"><h3>{t('输入到输出的连接')}</h3><Badge>{signal.bindings.length}/{SIGNAL_BINDING_LIMIT}</Badge></div>
    <p className="caption muted">{t('选择来源，把输入范围转换为目标范围。手动轴和脚本位置使用 0–1，时间信号使用秒。')}</p>
    {signal.bindings.map((binding, index) => <BindingCard key={binding.id} binding={binding} outputType={output.type} recordingFormat={signal.recordingFormat} targetAxes={targetAxes}
      signals={signals} pathOptions={pathOptions} status={status?.routes?.find(route => route.id === binding.id)} defaultOpen={index === 0}
      onChange={patch => setSignal({ bindings: signal.bindings.map(item => item.id === binding.id ? { ...item, ...patch } : item) })}
      onRemove={() => setSignal({ bindings: signal.bindings.filter(item => item.id !== binding.id) })} />)}
    <div className="actions"><Button disabled={signal.bindings.length >= SIGNAL_BINDING_LIMIT} onClick={() => setSignal({ bindings: [...signal.bindings, makeOutputBinding(signal.bindings, output.type,
      output.type === 'Intiface' ? { address: output.vibrationAxis || 'V0' } : {})] })}>{t('新增连接')}</Button></div>
    {!isSignalOutputType(output.type) && !signal.bindings.length && <p className="caption muted">{t('沿用现有轴映射。添加独立连接后，此输出使用自己的信号来源。')}</p>}
  </section>;
}

export function RecordingReplayControls({ outputId, status, onAction, files = [], onRefreshFiles, busy = false }) {
  const [fileName, setFileName] = useState(''), [timeMs, setTimeMs] = useState(0);
  const funscript = (status?.replay?.fileName || fileName || status?.recordingFile || '').toLowerCase().endsWith('.funscript');
  return <details className="recording-replay" data-testid="recording-replay"><summary>{t('录制回放')}</summary><div className="stack">
    <div className="actions"><SelectField data-testid="replay-file-list" label={t('已录制文件')}
      value={files.some(file => file.fileName === fileName) ? fileName : ''} disabled={busy}
      options={[{ value: '', label: t('选择录制文件') }, ...files.map(file => ({ value: file.fileName, label: file.fileName }))]}
      onChange={name => { if (name) setFileName(name); }} />
      <Button data-testid="replay-refresh-files" disabled={busy} onClick={onRefreshFiles}>{t('刷新录制列表')}</Button></div>
    <Field label={t('回放文件名')} value={fileName} placeholder={status?.recordingFile || ''} onChange={event => setFileName(event.target.value)} />
    <div className="actions">
      <Button data-testid="replay-load" disabled={busy || !(fileName || status?.recordingFile) || !fileName && recordingFiles(status).some(file => file.fileName === status?.recordingFile && file.completed === false)} onClick={() => onAction('load', { outputId, fileName: fileName || status.recordingFile })}>{t('载入录制')}</Button>
      <Button data-testid="replay-play" disabled={busy || !status?.replay?.loaded} onClick={() => onAction('play', { outputId })}>{t('播放回放')}</Button>
      <Button data-testid="replay-pause" disabled={busy || !status?.replay?.playing} onClick={() => onAction('pause', { outputId })}>{t('暂停回放')}</Button>
    </div>
    <div className="form-grid"><Field label={t('回放位置（ms）')} type="number" min={0} max={status?.replay?.durationMs || undefined} value={timeMs}
      onChange={event => setTimeMs(event.target.value === '' ? '' : Number(event.target.value))} />
      <Button data-testid="replay-seek" disabled={busy || !status?.replay?.loaded || timeMs === ''} onClick={() => onAction('seek', { outputId, timeMs: Number(timeMs) })}>{t('跳转回放')}</Button></div>
    {status?.replay?.loaded && <p className="caption muted">{t('回放位置 {0} / {1} ms', [Math.round(status.replay.timeMs || 0), Math.round(status.replay.durationMs || 0)])}</p>}
    <Notice>{funscript ? t('Funscript 回放以 0–1 提供位置，使用“录制回放”，路径填写 {0}。', [`${outputId}/value`])
      : t('把录制信号作为计算输入时，使用“录制回放”，路径填写录制输出标识／信号标识。')}</Notice>
  </div></details>;
}
