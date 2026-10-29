import React, { useEffect, useId, useMemo, useRef, useState } from 'react';
import { SensaEngine, AXES, scriptValue, isAxis } from '../core/index.ts';
import type { Axis, FunscriptAction, InputMode } from '../core/index.ts';
import type { ButtonHTMLAttributes, InputHTMLAttributes, ReactElement } from 'react';
import { createOutputTransport, discoverIntiface, discoverMidi } from './transports.ts';
import type { OutputConfig, IntifaceFeature, IntifaceDiscovery, MidiOutputDescription } from './transports.ts';
import { BLUETOOTH_PROFILES } from './device-codecs.ts';
import type { BluetoothProfileId } from './device-codecs.ts';
import { createExplorerInput } from './explorer-input.ts';
import { resolveWebSensaLocale, saveWebSensaLocale } from './locale.ts';
import type { WebSensaLocale } from './locale.ts';
import { detectCapabilities } from './capabilities.ts';
import type { CapabilityReport } from './capabilities.ts';

const PAGES = ['control', 'outputs', 'about'] as const;
type Page = typeof PAGES[number];
type OutputType = OutputConfig['type'];
interface OutputDraft {
  type: OutputType; url: string; axis: Axis; name: string; baudRate: number;
  channel: number; cc: number; profile: BluetoothProfileId; featureId: string; mapDevice: boolean; deviceId: string;
}
interface WebSensaProps { controller?: SensaEngine; initialLanguage?: WebSensaLocale; initialPage?: Page; capabilities?: CapabilityReport; }
type ButtonProps = Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'type'> & { primary?: boolean; danger?: boolean };
type FieldProps = Omit<InputHTMLAttributes<HTMLInputElement>, 'children'> & { label: string; children?: ReactElement<{ id?: string }> };
type ToggleProps = Omit<InputHTMLAttributes<HTMLInputElement>, 'type'> & { label: string };
function isOutputType(value: string): value is OutputType { return ['intiface', 'serial', 'tcode-ws', 'bluetooth', 'json-ws', 'http', 'midi'].some(type => type === value); }

function Button({ children, primary = false, danger = false, ...props }: ButtonProps) {
  return <button type="button" className={'button' + (primary ? ' button--primary button--variant-base' : danger ? ' button--danger button--variant-base' : '')} {...props}>{children}</button>;
}
function Field({ label, children, ...props }: FieldProps) {
  const id = useId();
  return <div className="field"><label htmlFor={id}>{label}</label>{children ? React.cloneElement(children, { id }) : <input id={id} {...props} />}</div>;
}
function Toggle({ label, ...props }: ToggleProps) { return <label className="toggle"><input type="checkbox" {...props} /><span>{label}</span></label>; }
function initialLocale() { return resolveWebSensaLocale(typeof window === 'undefined' ? {} : window); }

function downloadScript(actions: readonly FunscriptAction[], name: string) {
  const blob = new Blob([JSON.stringify({ version: '1.0', inverted: false, range: 100, actions })], { type: 'application/json' });
  const url = URL.createObjectURL(blob), link = document.createElement('a');
  link.href = url; link.download = name; link.click(); setTimeout(() => URL.revokeObjectURL(url), 0);
}
function time(value: number) { return (value / 1000).toFixed(2) + ' s'; }

export default function WebSensa({ controller: suppliedController, initialLanguage, initialPage = 'control', capabilities: suppliedCapabilities }: WebSensaProps) {
  const capabilities = useMemo(() => suppliedCapabilities || detectCapabilities(), [suppliedCapabilities]);
  const [controller] = useState(() => suppliedController || new SensaEngine());
  const [state, setState] = useState(() => controller.snapshot());
  const [language, setLanguage] = useState<WebSensaLocale>(() => initialLanguage || initialLocale());
  const text = (zh: string, en: string) => language === 'zh' ? zh : en;
  const [page, setPage] = useState<Page>(initialPage), [busy, setBusy] = useState(false), [error, setError] = useState('');
  const [config, setConfig] = useState<OutputDraft>({ type: 'intiface', url: 'ws://127.0.0.1:12345', axis: 'L0', name: '', baudRate: 115200, channel: 1, cc: 1, profile: 'loob', featureId: '', mapDevice: false, deviceId: '' });
  const [midiOutputs, setMidiOutputs] = useState<readonly MidiOutputDescription[]>([]);
  const [features, setFeatures] = useState<readonly IntifaceFeature[]>([]), [discovery, setDiscovery] = useState<IntifaceDiscovery | null>(null);
  const explorer = useMemo(() => {
    if (typeof window === 'undefined') return null;
    const opener: unknown = window.opener;
    return createExplorerInput({ opener, origin: window.location.origin,
      session: new URLSearchParams(window.location.search).get('session') || '',
      receive: values => controller.receiveExternal(values), stop: () => controller.externalDisconnected() });
  }, [controller]);
  const [explorerReady, setExplorerReady] = useState(false);
  const root = typeof document === 'undefined' ? '../' : document.querySelector<HTMLMetaElement>('meta[name="sensa-site-root"]')?.content || '../';
  const guideRoot = 'https://sealoong.github.io/Sensa/';
  const explorerUrl = typeof document === 'undefined' ? guideRoot + 'parameter-geometry.html'
    : document.querySelector<HTMLMetaElement>('meta[name="sensa-explorer-url"]')?.content || root + (root === '/' ? 'docs/parameter-geometry.html' : 'parameter-geometry.html');
  const busyCount = useRef(0);
  const run = async (action: () => unknown) => {
    busyCount.current++; setBusy(true); setError('');
    try { await action(); } catch (failure) { setError(failure instanceof Error ? failure.message : String(failure)); }
    finally { busyCount.current--; setBusy(busyCount.current > 0); }
  };
  useEffect(() => controller.subscribe(setState), [controller]);
  useEffect(() => {
    document.documentElement.lang = language === 'zh' ? 'zh-CN' : 'en-US';
    document.title = 'WebSensa · ' + (language === 'zh' ? '浏览器信号工作台' : 'Browser signal workbench');
    saveWebSensaLocale(language, window);
  }, [language]);
  useEffect(() => {
    const receive = (event: MessageEvent<unknown>) => explorer?.handle(event);
    const stop = () => { explorer?.disconnect(); setExplorerReady(false); void controller.stop(); };
    const restored = (event: PageTransitionEvent) => { if (event.persisted) setExplorerReady(false); };
    window.addEventListener('message', receive); window.addEventListener('pagehide', stop); window.addEventListener('pageshow', restored);
    return () => { window.removeEventListener('message', receive); window.removeEventListener('pagehide', stop); window.removeEventListener('pageshow', restored); void controller.dispose(); };
  }, [controller, explorer]);
  useEffect(() => () => discovery?.close(), [discovery]);
  const update = <Key extends keyof OutputDraft>(key: Key, value: OutputDraft[Key]) => setConfig(previous => ({ ...previous, [key]: value }));
  const lastError = state.errors.at(-1);
  const navigation: ReadonlyArray<readonly [Page, string, string]> = [['control', text('控制', 'Control'), text('手动与脚本', 'Manual and script')], ['outputs', text('输出', 'Outputs'), text('设备与应用', 'Devices and apps')], ['about', text('使用帮助', 'Help'), text('连接方式', 'Connections')]];
  const inputModes: ReadonlyArray<readonly [InputMode, string]> = [['manual', text('手动', 'Manual')], ['script', text('脚本', 'Script')], ['external', text('参数图解', 'Parameter explorer')]];
  const outputCapability = capabilities.outputs[config.type];
  const outputNames: Readonly<Record<OutputType, string>> = { intiface: 'Intiface', serial: 'Web Serial', 'tcode-ws': 'TCode WebSocket', bluetooth: 'Bluetooth LE', 'json-ws': 'JSON WebSocket', http: 'JSON HTTP', midi: 'MIDI CC' };
  const selectOutput = (type: OutputType) => {
    discovery?.close(); setDiscovery(null); setFeatures([]);
    setConfig(previous => ({ ...previous, type, featureId: '', url: type === 'intiface' ? 'ws://127.0.0.1:12345' : type === 'http' ? 'http://127.0.0.1:12403/command' : 'ws://127.0.0.1:12403' }));
  };
  const connected = state.outputs.filter(output => output.connected).length;
  const script = state.script, duration = script?.durationMs || 0;
  const preview = script ? scriptValue(script, state.positionMs) : state.values.L0;
  const points = script ? script.actions.filter((_, index) => index % Math.max(1, Math.floor(script.actions.length / 1000)) === 0 || index === script.actions.length - 1)
    .map(action => `${duration ? action.at / duration * 1000 : 0},${100 - action.pos}`).join(' ') : '';
  const changeMode = (value: InputMode) => run(() => controller.setMode(value));
  const connect = () => run(async () => {
    const stopped = controller.stop();
    const transport = await createOutputTransport(config);
    await stopped;
    controller.addOutput(config.name.trim() || transport.name || text('输出', 'Output'), transport, { type: config.type, axis: ['serial', 'tcode-ws', 'json-ws', 'http'].includes(config.type) ? '*' : config.type === 'intiface' && config.mapDevice ? 'Auto' : config.axis });
    if (discovery) { discovery.close(); setDiscovery(null); }
  });
  const scan = () => run(async () => {
    discovery?.close(); setDiscovery(null);
    const result = await discoverIntiface(config.url);
    setDiscovery(result);
    result.subscribeFeatures(next => {
      setFeatures(next);
      if (next.length) setError('');
      setConfig(previous => next.some(feature => feature.id === previous.featureId) ? previous
        : { ...previous, featureId: next[0]?.id || '', axis: next[0]?.axis || previous.axis });
    });
  });
  return <div className="app-shell websensa">
    <a className="skip-link" href="#websensa-main">{text('跳到工作区', 'Skip to workbench')}</a>
    <header className="app-header"><div className="app-header__inner">
      <div className="brand-group"><div className="brand"><a href={root}><span className="brand-mark" aria-hidden="true"><i /><i /><i /></span>WebSensa</a></div><span className="brand-caption">{text('浏览器信号工作台', 'Browser workbench')}</span></div>
      <div className="header-status"><span className={'badge badge--' + (connected ? 'success' : 'default')}>{connected} {text('路已连接', 'connected')}</span></div>
      <div className="header-actions">
        <Toggle label={text('输入启用', 'Input enabled')} checked={state.active} disabled={busy || state.emergency} onChange={event => run(() => controller.activate(event.target.checked))} />
        <Button danger onClick={() => run(() => state.emergency ? controller.clearEmergency() : controller.stop(true))}>{state.emergency ? text('解除急停', 'Clear stop') : text('紧急停止', 'Emergency stop')}</Button>
        <select className="language-select" aria-label={text('语言', 'Language')} value={language} onChange={event => setLanguage(event.target.value === 'zh' ? 'zh' : 'en')}><option value="zh">简体中文</option><option value="en">English</option></select>
      </div>
    </div></header>
    <aside className="workspace-sidebar"><p className="workspace-sidebar__label">{text('工作区', 'WORKSPACE')}</p>
      <nav className="workspace-nav" aria-label={text('工作区导航', 'Workbench navigation')}><div className="tabs tabs--workspace" role="tablist">
        {navigation.map(([id, label, hint]) => <button key={id} type="button" role="tab" id={'tab-' + id} aria-controls={'panel-' + id} aria-selected={page === id} tabIndex={page === id ? 0 : -1} onClick={() => setPage(id)} onKeyDown={event => {
          const ids = PAGES, index = ids.indexOf(id);
          if (!['ArrowRight', 'ArrowLeft', 'ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) return;
          event.preventDefault();
          const next = event.key === 'Home' ? 0 : event.key === 'End' ? ids.length - 1 : (index + (['ArrowRight', 'ArrowDown'].includes(event.key) ? 1 : -1) + ids.length) % ids.length;
          const nextPage = ids[next]; if (nextPage) { setPage(nextPage); document.getElementById('tab-' + nextPage)?.focus(); }
        }}><span className="tab-label">{label}<small>{hint}</small></span></button>)}
      </div></nav>
      <div className="workspace-sidebar__help"><a href={guideRoot + (language === 'zh' ? 'zh-CN/docs/websensa.html' : 'en/docs/websensa.html')}>{text('WebSensa 指南', 'WebSensa guide')} ↗</a><a href="https://github.com/SeaLoong/Sensa/releases/latest">{text('下载可执行版本', 'Download desktop app')} ↗</a></div>
    </aside>
    <main id="websensa-main" className="workspace-scroll" tabIndex={-1}><div className="workspace-shell"><div className="workspace-panel">
      <div className="workspace-intro"><span className="workspace-intro__number">{page === 'control' ? '01' : page === 'outputs' ? '02' : '03'}</span><div><h1>{page === 'control' ? text('让信号开始工作', 'Put signals to work') : page === 'outputs' ? text('连接设备与应用', 'Connect devices and apps') : text('在浏览器里完成联动', 'Work in your browser')}</h1><p>{text('添加输出，用手动控制或脚本驱动一个或多个目标。', 'Add outputs, then use manual controls or a script to drive one or several destinations.')}</p></div></div>
      {error && <div role="alert" className="notice notice--error websensa-error">{error}</div>}
      {lastError && <div role="status" className="notice notice--error websensa-error">{lastError.message}</div>}
      {state.emergency && <div role="status" className="notice">{text('已停止全部输出。解除急停后可重新启用输入。', 'All outputs stopped. Clear the stop, then enable input when ready.')}</div>}
      <section role="tabpanel" id={'panel-' + page} aria-labelledby={'tab-' + page} className="stack">
      {page === 'control' && <>
        <section className="websensa-card stack"><div className="websensa-status"><h2>{text('输入', 'Input')}</h2><span className="badge">{state.active ? text('已启用', 'Enabled') : text('已关闭', 'Disabled')}</span></div>
          <div className="tabs tabs--segmented" role="group" aria-label={text('输入方式', 'Input mode')}>
            {inputModes.map(([mode, label]) => <Button key={mode} primary={state.mode === mode} disabled={busy} aria-pressed={state.mode === mode} onClick={() => changeMode(mode)}>{label}</Button>)}
          </div>
          {state.mode === 'manual' && <><div className="websensa-axis-choices">{AXES.map(axis => <label key={axis}><input type="checkbox" checked={state.axes.includes(axis)} disabled={busy || state.axes.length === 1 && state.axes[0] === axis} onChange={event => run(() => controller.setAxes(event.target.checked ? [...state.axes, axis] : state.axes.filter(value => value !== axis)))} />{axis}</label>)}</div>
            <div className="websensa-axes">{state.axes.map(axis => <div key={axis} className="websensa-axis"><label className="websensa-axis__label" htmlFor={'axis-' + axis}><span>{axis} {axis === 'L0' ? text('主轴', 'Stroke') : axis === 'V0' ? text('强度', 'Intensity') : ''}</span><output>{Math.round(state.values[axis] * 100)}%</output></label><input id={'axis-' + axis} aria-label={(axis + ' ' + (axis === 'L0' ? text('主轴', 'Stroke') : axis === 'V0' ? text('强度', 'Intensity') : '')).trim()} type="range" min="0" max="100" step="1" value={Math.round(state.values[axis] * 100)} onChange={event => controller.setManual(axis, Number(event.target.value) / 100)} /></div>)}</div>
            <div className="actions"><Button primary disabled={!state.active} onClick={() => run(() => controller.send())}>{text('发送一次', 'Send once')}</Button><Button disabled={!state.active} onClick={() => run(() => controller.stop())}>{text('停止输入', 'Stop input')}</Button></div>
            <div className="actions"><Toggle label={text('录制 L0 轨道', 'Record L0 track')} checked={state.recording} disabled={!state.active || !state.axes.includes('L0')} onChange={event => controller.record(event.target.checked)} /><Button disabled={!state.recordedActions.length} onClick={() => downloadScript(state.recordedActions, 'WebSensa-recording.funscript')}>{text('下载录制', 'Download recording')}</Button><span className="muted">{state.recordedActions.length} {text('个动作点', 'actions')}</span></div>
          </>}
          {state.mode === 'script' && <>
            <Field label={text('Funscript 文件', 'Funscript file')} type="file" accept=".funscript,.json,application/json" onChange={event => { const file = event.target.files?.[0]; if (!file) return; void run(async () => { if (file.size > 10485760) throw new Error('Choose a script smaller than 10 MiB.'); await controller.loadScript(await file.text(), file.name); }); event.target.value = ''; }} />
            {script ? <><div className="websensa-status"><strong>{state.scriptName}</strong><span>{time(state.positionMs)} / {time(duration)} · {Math.round(preview * 100)}%</span></div>
              <svg className="websensa-timeline-chart" viewBox="0 0 1000 100" preserveAspectRatio="none" role="img" aria-label={text('脚本轨迹', 'Script trajectory')}><polyline points={points} /><line x1={duration ? state.positionMs / duration * 1000 : 0} x2={duration ? state.positionMs / duration * 1000 : 0} y1="0" y2="100" /></svg>
              <input className="websensa-timeline" type="range" min="0" max={duration || 1} step="1" value={state.positionMs} aria-label={text('播放位置', 'Playback position')} onChange={event => controller.seek(Number(event.target.value))} />
              <div className="actions"><Button primary disabled={!state.active || busy} onClick={() => run(() => state.playing ? controller.pause() : controller.play())}>{state.playing ? text('暂停', 'Pause') : text('播放', 'Play')}</Button><Button onClick={() => run(async () => { await controller.stop(); controller.seek(0); })}>{text('停止并回到开头', 'Stop and rewind')}</Button><Toggle label={text('循环', 'Loop')} checked={state.loop} onChange={event => controller.setLoop(event.target.checked)} /></div>
              <div className="form-grid"><Field label={text('播放速度', 'Playback speed')}><select value={state.speed} onChange={event => controller.setSpeed(Number(event.target.value))}>{[0.1, 0.25, 0.5, 0.75, 1, 1.25, 1.5, 2, 3, 4].map(speed => <option key={speed} value={speed}>{speed}×</option>)}</select></Field><Field label={text('脚本目标轴', 'Script target axis')}><select value={state.scriptAxis} disabled={busy} onChange={event => { const axis = event.target.value; if (isAxis(axis)) void run(() => controller.setScriptAxis(axis)); }}>{AXES.map(axis => <option key={axis}>{axis}</option>)}</select></Field></div>
            </> : <p className="muted">{text('选择脚本后查看轨迹，再启用输入并播放。', 'Choose a script to inspect its trajectory, then enable input and play.')}</p>}
          </>}
          {state.mode === 'external' && <>
            <p>{text('在参数图解中选择参数和范围，再点击“连接 WebSensa”。', 'Choose a parameter and range in the parameter explorer, then select “Connect WebSensa”.')}</p>
            <div className="actions"><a className="button" href={explorerUrl + (language === 'zh' ? '?lang=zh-CN' : '?lang=en-US')}>{text('打开参数图解', 'Open parameter explorer')}</a>{explorer && <Button primary disabled={explorerReady} onClick={() => { explorer.connect(); setExplorerReady(true); }}>{text('连接参数图解', 'Connect parameter explorer')}</Button>}</div>
            <div role="status" className="websensa-metrics"><span>{state.externalConnected ? text('正在接收', 'Receiving') : text('等待参数', 'Waiting for a signal')}</span>{state.externalConnected && Object.entries(controller.externalValues || {}).map(([axis, value]) => typeof value === 'number' ? <span key={axis}>{axis} {Math.round(value * 100)}%</span> : null)}</div>
            <div className="websensa-axis-choices">{AXES.map(axis => <label key={axis}><input type="checkbox" checked={state.axes.includes(axis)} disabled={busy || state.axes.length === 1 && state.axes[0] === axis} onChange={event => run(() => controller.setAxes(event.target.checked ? [...state.axes, axis] : state.axes.filter(value => value !== axis)))} />{axis}</label>)}</div>
          </>}
        </section>
        <section className="websensa-card stack"><div className="websensa-status"><h2>{text('输出', 'Outputs')}</h2><Button onClick={() => setPage('outputs')}>{text('添加输出', 'Add output')}</Button></div>{!state.outputs.length ? <p className="muted">{text('连接 Intiface、串口、蓝牙或网络目标。', 'Connect an Intiface device, serial port, Bluetooth device or network destination.')}</p> : state.outputs.map(output => <div key={output.id} className="websensa-status"><span>{output.name}</span><span className={'badge badge--' + (output.connected ? 'success' : 'error')}>{output.connected ? text('已连接', 'Connected') : text('已断开', 'Disconnected')}</span></div>)}</section>
      </>}
      {page === 'outputs' && <>
        <section className="websensa-card stack"><h2>{text('添加输出', 'Add output')}</h2>
          <div className="form-grid"><Field label={text('输出类型', 'Output type')}><select value={config.type} disabled={busy} onChange={event => { const type = event.target.value; if (isOutputType(type)) selectOutput(type); }}>
            <option value="intiface" disabled={!capabilities.outputs['intiface'].available}>Intiface / Buttplug</option><option value="serial" disabled={!capabilities.outputs['serial'].available}>TCode · Web Serial</option><option value="tcode-ws" disabled={!capabilities.outputs['tcode-ws'].available}>TCode · WebSocket</option><option value="bluetooth" disabled={!capabilities.outputs['bluetooth'].available}>Bluetooth LE</option><option value="json-ws" disabled={!capabilities.outputs['json-ws'].available}>JSON · WebSocket</option><option value="http" disabled={!capabilities.outputs['http'].available}>JSON · HTTP</option><option value="midi" disabled={!capabilities.outputs['midi'].available}>MIDI CC</option>
          </select></Field><Field label={text('名称（可选）', 'Name (optional)')} value={config.name} onChange={event => update('name', event.target.value)} /></div>
          {['intiface', 'tcode-ws', 'json-ws', 'http'].includes(config.type) && <Field label={text('连接地址', 'Endpoint URL')} value={config.url} type="url" autoComplete="off" spellCheck="false" onChange={event => { discovery?.close(); setDiscovery(null); update('url', event.target.value); setFeatures([]); update('featureId', ''); }} />}
          {config.type === 'intiface' && <><div className="actions"><Button disabled={busy} onClick={scan}>{text('扫描设备', 'Scan devices')}</Button><span className="muted">{text('多个设备共用一条连接，每个设备由一条输出管理。', 'Different devices share one connection; each device has one output.')}</span></div>{discovery && !features.length && <p role="status" className="muted">{text('正在查找设备…', 'Looking for devices…')}</p>}{features.length > 0 && <><Toggle label={text('映射该设备的全部功能', 'Map all features on this device')} checked={config.mapDevice} onChange={event => update('mapDevice', event.target.checked)} /><Field label={text('设备与功能', 'Device and feature')}><select value={config.featureId} onChange={event => { const feature = features.find(item => item.id === event.target.value); if (!feature) return; setConfig(previous => ({ ...previous, featureId: feature.id, axis: feature.axis })); }}>{features.map(feature => <option key={feature.id} value={feature.id}>{feature.name}</option>)}</select></Field></>}</>}
          {config.type === 'serial' && <><Field label={text('串口波特率', 'Serial baud rate')} type="number" min="300" max="3000000" value={config.baudRate} onChange={event => update('baudRate', Number(event.target.value))} /><p className="muted">{text('连接时从浏览器选择串口。', 'Choose a serial port in the browser connection dialog.')}</p></>}
          {config.type === 'bluetooth' && <Field label={text('设备协议', 'Device protocol')}><select value={config.profile} onChange={event => { const profile = BLUETOOTH_PROFILES.find(item => item.id === event.target.value); if (!profile) return; setConfig(previous => ({ ...previous, profile: profile.id, axis: profile.axis })); }}>{BLUETOOTH_PROFILES.map(profile => <option key={profile.id} value={profile.id}>{profile.name}</option>)}</select></Field>}
          {['intiface', 'bluetooth', 'midi'].includes(config.type) && <Field label={text('信号来源轴', 'Source axis')}><select value={config.axis} onChange={event => { const axis = event.target.value; if (isAxis(axis)) update('axis', axis); }}>{AXES.map(axis => <option key={axis}>{axis}</option>)}</select></Field>}
          {config.type === 'midi' && <><div className="actions"><Button disabled={busy} onClick={() => run(async () => { const outputs = await discoverMidi(); setMidiOutputs(outputs); const first = outputs[0]; if (first) update('deviceId', first.id); })}>{text('查找 MIDI 输出', 'Find MIDI outputs')}</Button></div>{midiOutputs.length > 0 && <Field label={text('MIDI 设备', 'MIDI device')}><select value={config.deviceId || ''} onChange={event => update('deviceId', event.target.value)}>{midiOutputs.map(output => <option key={output.id} value={output.id}>{output.name}</option>)}</select></Field>}<div className="form-grid"><Field label={text('MIDI 通道', 'MIDI channel')} type="number" min="1" max="16" value={config.channel} onChange={event => update('channel', Number(event.target.value))} /><Field label="MIDI CC" type="number" min="0" max="127" value={config.cc} onChange={event => update('cc', Number(event.target.value))} /></div></>}
          {!outputCapability.available && <div className="stack"><p role="status" className="muted">{language === 'zh' ? outputCapability.reasonZh : outputCapability.reason}</p><div className="actions">{outputCapability.alternatives.slice(0, 2).map(alternative => <Button key={alternative} onClick={() => selectOutput(alternative)}>{text('改用', 'Use')} {outputNames[alternative]}</Button>)}</div></div>}
          <div className="actions"><Button primary disabled={busy || !outputCapability.available || config.type === 'intiface' && !config.featureId} onClick={connect}>{busy ? text('连接中…', 'Connecting…') : text('连接输出', 'Connect output')}</Button></div>
        </section>
        <section className="websensa-card"><h2>{text('已添加的输出', 'Your outputs')}</h2>{!state.outputs.length ? <p className="websensa-empty">{text('先添加一个输出。', 'Add your first output above.')}</p> : state.outputs.map(output => <div className="websensa-row" key={output.id}><div className="websensa-status"><strong>{output.name}</strong><span className={'badge badge--' + (output.connected ? 'success' : 'error')}>{output.connected ? text('已连接', 'Connected') : text('已断开', 'Disconnected')}</span></div><p className="muted">{output.type} · {output.axis === '*' ? text('已选轴', 'Selected axes') : output.axis === 'Auto' ? text('设备轴映射', 'Device axis mappings') : output.axis}</p>{output.error && <p className="websensa-error">{output.error}</p>}<div className="actions"><Button onClick={() => run(() => controller.removeOutput(output.id))}>{text('断开并移除', 'Disconnect and remove')}</Button></div></div>)}</section>
      </>}
      {page === 'about' && <>
        <section className="websensa-card stack"><h2>{text('三步开始', 'Three steps to start')}</h2><ol className="websensa-help-list"><li>{text('在“输出”连接设备或应用，可添加多路。', 'Connect one or more devices or applications in Outputs.')}</li><li>{text('返回“控制”，调整手动轴或载入 funscript。', 'Return to Control and adjust manual axes or load a funscript.')}</li><li>{text('启用输入，发送手动值或播放脚本。', 'Enable input, then send manual values or play the script.')}</li></ol><div className="actions"><a className="button" href={guideRoot + (language === 'zh' ? 'zh-CN/docs/websensa.html' : 'en/docs/websensa.html')}>{text('完整指南', 'Full guide')}</a><a className="button" href={root}>{text('Sensa 首页', 'Sensa home')}</a></div></section>
        <section className="websensa-card stack"><h2>{text('选择连接方式', 'Choose a connection')}</h2><p>{text('Intiface 与 TCode 可连接本机服务；串口、蓝牙和 MIDI 由浏览器显示设备授权窗口。网络输出使用你填写的目标地址。', 'Intiface and TCode connect to a local service. Serial, Bluetooth and MIDI use browser device permissions. Network outputs use the endpoint you enter.')}</p><p className="muted">{text('串口与蓝牙主要由 Chromium 浏览器提供。HTTPS 页面的本机网络访问取决于浏览器和目标服务的连接设置。', 'Serial and Bluetooth are mainly available in Chromium browsers. Local network access from HTTPS pages depends on the browser and endpoint settings.')}</p><p>{text('每路输出独立发送；关闭页面会停止本页的发送。设备配置保留在当前页面，语言偏好保存在浏览器。', 'Each output sends independently. Closing the page ends its sending session. Connections stay in this page; the browser remembers your language preference.')}</p></section>
      </>}
      </section>
      {PAGES.filter(id => id !== page).map(id => <section key={id} hidden role="tabpanel" id={'panel-' + id} aria-labelledby={'tab-' + id} />)}
    </div></div></main>
  </div>;
}
