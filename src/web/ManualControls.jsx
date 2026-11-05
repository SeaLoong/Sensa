import React from 'react';
import { AxisSlider } from './controls.jsx';
import { Disclosure, Toggle } from './ui.tsx';
import { MANUAL_AXES } from './input-workflows.js';
import { t } from './i18n.js';

// The same axis editor is used for direct Manual input and Combined sources.
// Values stay mounted when details close, preserving drafts and output selection.
export default function ManualControls({ draft, onChange, selectedAxes, onAxesChange, busy = false }) {
  const axes = MANUAL_AXES();
  const renderAxis = axis => <AxisSlider key={axis.key} axis={axis} value={draft[axis.key]}
    onChange={next => onChange({ [axis.key]: next })} />;
  return <>
    <div className="manual-primary">{renderAxis(axes[0])}</div>
    <Disclosure title={t('更多动作轴')} className="manual-more-axes" data-testid="manual-more-axes"
      description={<>{t('L1/L2、旋转、振动与辅助轴')}{selectedAxes && <> · {t('输出动作轴：{0}', [selectedAxes.join(' · ')])}</>}</>}>
      {selectedAxes && onAxesChange && <div className="manual-axis-selection" role="group" aria-label={t('输出动作轴')}>
        {axes.map(axis => <Toggle key={axis.key} label={axis.key} checked={selectedAxes.includes(axis.key)}
          disabled={busy || selectedAxes.length === 1 && selectedAxes[0] === axis.key}
          onChange={checked => onAxesChange(checked ? [...selectedAxes, axis.key] : selectedAxes.filter(value => value !== axis.key))} />)}
      </div>}
      <div className="manual-grid manual-extra-axes">{axes.slice(1).map(renderAxis)}</div>
    </Disclosure>
  </>;
}
