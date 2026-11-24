import React, { useEffect, useMemo, useRef, useState } from 'react';
import { AXIS_PROFILE_DEFS, SIGNAL_ROLE_OPTIONS } from './configuration.js';
import { SelectField, ValueSliderField } from './controls.jsx';
import { Button, Modal, Tabs, Toggle } from './ui.tsx';
import { t } from './i18n.js';
import { centeredCounts, createMappingSimulation, platformAxes, simulationInputs, targetCounts } from './osr6-simulation.js';
import { drawPlatform } from './osr6-scene.js';

const initialView = { yaw: .56, elevation: .40 };

function PlatformView({ counts }) {
  const canvas = useRef(null), drag = useRef(null);
  const [view, setView] = useState(initialView);
  const [size, setSize] = useState(null);
  useEffect(() => {
    const observer = new ResizeObserver(([entry]) => setSize(entry.contentRect));
    observer.observe(canvas.current);
    return () => observer.disconnect();
  }, []);
  useEffect(() => {
    const node = canvas.current;
    if (!size?.width || !size.height) return;
    const ratio = Math.min(window.devicePixelRatio || 1, 2);
    const width = Math.round(size.width * ratio), height = Math.round(size.height * ratio);
    if (node.width !== width || node.height !== height) { node.width = width; node.height = height; }
    const ctx = node.getContext('2d');
    if (!ctx) return;
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    drawPlatform(ctx, size.width, size.height, counts, view);
  }, [counts, view, size]);
  return <div className="osr6-stage">
    <canvas ref={canvas} role="img" aria-label={t('OSR6 六轴平台三维姿态')}
      onPointerDown={event => {
        if (event.button !== 0) return;
        drag.current = { x: event.clientX, y: event.clientY, view };
        event.currentTarget.setPointerCapture(event.pointerId);
      }}
      onPointerMove={event => {
        if (!drag.current) return;
        const start = drag.current;
        setView({ yaw: start.view.yaw - (event.clientX-start.x)*.012,
          elevation: Math.max(.02,Math.min(1.35,start.view.elevation + (event.clientY-start.y)*.009)) });
      }}
      onLostPointerCapture={() => { drag.current = null; }} />
    <p className="osr6-caption">{t('平台姿态示意 · 拖动模型旋转视角')}</p>
    <div className="osr6-cameras" aria-label={t('观察视角')} role="group">
      <Button onClick={() => setView(initialView)}>{t('立体视图')}</Button>
      <Button onClick={() => setView({ yaw: 0, elevation: .04 })}>{t('正视图')}</Button>
      <Button onClick={() => setView({ yaw: Math.PI/2, elevation: .04 })}>{t('侧视图')}</Button>
    </div>
  </div>;
}

function MappingControls({ rows, onFrame }) {
  const plan = useMemo(() => simulationInputs(rows), [rows]);
  const [readings, setReadings] = useState({});
  const simulation = useRef(null);
  useEffect(() => {
    const instance = createMappingSimulation(plan, () => performance.now());
    simulation.current = instance;
    setReadings({});
    const publish = () => {
      const next = instance.sample();
      onFrame(previous => previous.blocked === next.blocked && platformAxes.every(axis => previous.counts[axis] === next.counts[axis]) ? previous : next);
    };
    publish();
    const timer = setInterval(publish, 32);
    return () => { clearInterval(timer); instance.dispose(); simulation.current = null; };
  }, [plan, onFrame]);
  return <div className="osr6-fields">
    {rows.length > 0 && !rows.some(row => ['Depth', 'DepthOverride', 'Sway', 'Surge', 'AngleX', 'AngleY', 'Twist'].includes(row.role)) &&
      <p className="caption muted">{t('这组映射没有控制 OSR6 的运动轴。可选择含 L0～R2 的预设观察平台动作。')}</p>}
    {plan.inputs.length === 0 && <p className="muted">{t('当前草稿没有映射，请选择一个预设。')}</p>}
    {plan.inputs.map(input => {
      const setValue = value => {
        setReadings(previous => ({ ...previous, [input.path]: value }));
        simulation.current?.set(input.path, value);
      };
      const reading = readings[input.path] ?? input.initial;
      const native = input.sourceMode === 'Direct';
      const contact = native && /_SenderType$/.test(input.source);
      const grab = native && /_IsGrabbed$/.test(input.source);
      if ((contact || grab) && input.roles.length === 1 && input.roles[0] === 'GateEnable' && input.min === 0 && input.max === 1)
        return <Toggle key={input.path} label={contact ? t('检测到接触') : t('已抓取')} checked={reading > 0}
          onChange={checked => setValue(checked ? 1 : 0)} />;
      const roleLabel = SIGNAL_ROLE_OPTIONS().filter(option => input.roles.includes(option.value)).map(option => option.label).join(' / ');
      const contactAxis = native && input.source.match(/_SenderLocalPosition([XYZ])$/)?.[1];
      const contactLabels = { X: t('左右位置'), Y: t('上下位置'), Z: t('前后位置') };
      const label = contactAxis ? contactLabels[contactAxis] + ' (' + contactAxis + ')' : roleLabel;
      const step = Math.max(.00001, Number(((input.max-input.min)/200).toPrecision(2)));
      return <div className="osr6-input" key={input.path}>
        <ValueSliderField label={label} title={input.source} min={input.min} max={Math.max(input.min + step, input.max)}
          step={step} unit={contactAxis ? 'm' : ''} value={reading} onChange={setValue} />
        <small className="caption muted" title={input.source}>{input.metric || input.source.split(';')[0]}</small>
      </div>;
    })}
  </div>;
}

export default function Osr6Simulator({ initialMode, drafts, presets, runtime, online, onClose, emergencyAction }) {
  const [mode, setMode] = useState(initialMode);
  const [source, setSource] = useState('');
  const [manual, setManual] = useState(centeredCounts);
  const [mapping, setMapping] = useState({ counts: centeredCounts, blocked: false });
  const rows = presets.find(preset => preset.id === source)?.mappings ?? drafts;
  const live = runtime?.currentFrame?.values ?? runtime?.command;
  const counts = mode === 'manual' ? manual : mode === 'mapping' ? mapping.counts : targetCounts(live);
  const axes = AXIS_PROFILE_DEFS().filter(def => platformAxes.includes(def.axis));
  return <Modal open wide title={t('OSR6 六轴模拟器')} className="osr6-modal" onClose={onClose} emergencyAction={emergencyAction}>
    <Tabs id="osr6-mode" label={t('预览来源')} value={mode} onChange={setMode} options={[
      { value: 'manual', label: t('手动调轴') }, { value: 'mapping', label: t('模拟映射') }, { value: 'live', label: t('实时目标') },
    ]} />
    <div className="osr6-layout" id="osr6-mode-panel" role="tabpanel" aria-labelledby={'osr6-mode-' + mode}>
      <div className="osr6-preview">
        <PlatformView counts={counts} />
        <dl className="osr6-readings" aria-label={t('六轴目标值')}>{axes.map(axis => <div key={axis.axis}>
          <dt>{axis.axis}</dt><dd data-testid={'osr6-' + axis.axis}>{counts[axis.axis]}</dd>
        </div>)}</dl>
      </div>
      <div className="osr6-controls">
        {mode === 'manual' && <>
          <p className="caption muted">{t('拖动滑块或输入 0～999，观察平台姿态。模拟只在当前窗口运行。')}</p>
          <div className="osr6-fields">{axes.map(axis => <ValueSliderField key={axis.axis} label={axis.axis + ' · ' + axis.label}
            min={0} max={999} value={manual[axis.axis]} onChange={value => setManual(previous => ({ ...previous, [axis.axis]: value }))} />)}</div>
          <Button onClick={() => setManual(centeredCounts)}>{t('全部回中')}</Button>
        </>}
        {mode === 'mapping' && <>
          <SelectField label={t('试用映射')} value={source} onChange={setSource} options={[
            { value: '', label: t('当前映射草稿') }, ...presets.map(preset => ({ value: preset.id, label: preset.name, group: preset.group || t('自定义预设') })),
          ]} />
          <p className="caption muted">{t('调整进入映射的读数，观察方向、行程和跟随速度。试用预设无需保存草稿。')}</p>
          {mapping.blocked && <p role="status">{t('门控已关闭，平台停在上一位置。')}</p>}
          <MappingControls rows={rows} onFrame={setMapping} />
        </>}
        {mode === 'live' && <p role="status">{!online || !live ? t('等待 Sensa 实时数据。') : runtime.canSend && runtime.inputActive
          ? t('正在显示 Sensa 当前的六轴目标，位置取自设备限位之前。') : t('输出已暂停，显示最近的六轴目标。')}</p>}
      </div>
    </div>
  </Modal>;
}
