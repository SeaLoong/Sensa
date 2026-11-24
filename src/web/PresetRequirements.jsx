import React from 'react';
import { axisForRole } from '../core/runtime/motion.ts';
import profiles from './data/osc-preset-requirements.json' with { type: 'json' };
import { docUrl, t } from './i18n.js';

export default function PresetRequirements({ profile, mappings, optionalSecondaryAxes = false }) {
  const setup = profiles[profile];
  if (!setup) return null;
  const axes = [...new Set(mappings.map(row => axisForRole(row.role)).filter(Boolean))].sort();
  const optionalAxes = optionalSecondaryAxes ? axes.filter(axis => axis !== 'L0') : [];
  return <section className="preset-requirements" data-testid="preset-requirements">
    <h4>{t('使用条件')}</h4>
    <dl>
      <dt>{t('自己的 Avatar 或发送端')}</dt><dd>{t(setup.own)}</dd>
      <dt>{t('对方的 Avatar')}</dt><dd>{t(setup.partner)}</dd>
      <dt>{t('需要开启')}</dt><dd>{profile !== 'direct' && profile !== 'frame-shader' && t('VRChat 开启 OSC，Sensa 选择 OSC 输入。')}{' '}{t(setup.enable)}</dd>
      <dt>{t('设备输出')}</dt><dd>{optionalAxes.length && axes.includes('L0') ? t('L0 控制进退。设备支持的附加轴：{0}。', [optionalAxes.join(' / ')]) : axes.join(' / ')} {axes.includes('V0') && t('需要支持振动的输出。')}</dd>
    </dl>
    <a href={docUrl(setup.doc)} target="_blank" rel="noreferrer">{t('配置步骤')}</a>
  </section>;
}
