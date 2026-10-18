import React, { useState } from 'react';
import { t, diagnostic } from './i18n.js';
import { Badge, Button, Notice } from './ui.jsx';
import { SelectField } from './controls.jsx';

const number = (value, digits = 1) => (Number.isFinite(Number(value)) ? Number(value).toFixed(digits) : '—');

function PosePlot({ pose, projection }) {
  const xy = projection === 'front';
  const point = (p) => [200 + (xy ? p.x : p.z) * 450, 130 - (xy ? p.y : p.x) * 450];
  const root = point(pose.root),
    tip = point(pose.tip),
    side = point(pose.side);
  const intersection = point(pose.intersection);
  return (
    <svg
      viewBox="0 0 400 260"
      role="img"
      aria-label={xy ? t('孔口正视图：X/Y 偏移') : t('侧视图：Z 深度与 X 偏移')}
      className="pose-plot"
    >
      <defs>
        <pattern id={`pose-grid-${projection}`} width="22.5" height="22.5" patternUnits="userSpaceOnUse">
          <path d="M22.5 0H0V22.5" fill="none" stroke="#dbe7f1" strokeWidth=".5" />
        </pattern>
      </defs>
      <rect width="400" height="260" fill={`url(#pose-grid-${projection})`} />
      <path d="M0 130H400M200 0V260" stroke="#b1c5d6" strokeDasharray="4 4" />
      {xy ? (
        <circle cx="200" cy="130" r="18" fill="#ddf8f0" stroke="#12a886" strokeWidth="2" />
      ) : (
        <>
          <rect x="200" y="112" width="150" height="36" fill="#ddf8f0" opacity=".6" />
          <path d="M200 112V148" stroke="#12a886" strokeWidth="3" />
        </>
      )}
      <text x="12" y="22" fontSize="12" fill="#526575">
        {xy ? t('孔口平面 X / Y') : t('侧视 Z / X · 向右为入孔')}
      </text>
      {pose.valid && (
        <>
          <path
            d={`M${root}L${tip}`}
            stroke={pose.engaged ? '#14866d' : '#de9223'}
            strokeWidth="7"
            strokeLinecap="round"
          />
          <path d={`M${root}L${side}`} stroke="#8a67ca" strokeWidth="3" />
          {[
            [root, 'Root', '#167c9b'],
            [tip, 'Tip', '#ee8068'],
            [side, 'Side', '#8a67ca'],
          ].map(([position, label, color]) => (
            <g key={label}>
              <circle cx={position[0]} cy={position[1]} r="4" fill={color} />
              <text x={position[0] + 7} y={position[1] - 8} fontSize="11" fill={color}>
                {label}
              </text>
            </g>
          ))}
          <circle cx={intersection[0]} cy={intersection[1]} r="4" fill="white" stroke="#12a886" strokeWidth="2" />
        </>
      )}
      {!pose.valid && (
        <text x="200" y="140" textAnchor="middle" fontSize="14" fill="#65798a">
          {t('等待有效的三点定位')}
        </text>
      )}
      <text x="12" y="245" fontSize="11" fill="#65798a">
        {t('每小格 5 cm · Socket 局部坐标')}
      </text>
    </svg>
  );
}

export default function PosePanel({ observations = [], activeKey, onUseRig }) {
  const [selected, setSelected] = useState('');
  const [projection, setProjection] = useState('side');
  const pose = selected
    ? observations.find((item) => item.key === selected)
    : observations.find((item) => item.key === activeKey) || observations[0];
  return (
    <div className="stack">
      <h3>{t('三点姿态（实验）')}</h3>
      <p className="muted">{t('需要双方匹配的 Root、Tip、Side 标记。普通 OGB 距离信号不能还原完整位置和姿态。')}</p>
      {!pose ? (
        <Notice>
          {t('等待配套定位阵列')}
          {selected && <Button onClick={() => setSelected('')}>{t('重新选择')}</Button>}
        </Notice>
      ) : (
        <>
          <SelectField
            label={t('观测对象')}
            value={pose.key}
            options={observations.map((item) => ({
              value: item.key,
              label: `${item.instance} · ${item.party} · ${item.sourceLabel}`,
            }))}
            onChange={setSelected}
          />
          <div className="actions">
            <Badge tone={pose.valid ? 'success' : 'warning'}>{diagnostic(pose.reason)}</Badge>
            <Badge>{t('{0}/24 采样', [pose.sampleCount])}</Badge>
            <SelectField
              label={t('空间投影')}
              value={projection}
              options={[
                { value: 'side', label: t('侧视深度') },
                { value: 'front', label: t('正视偏移') },
              ]}
              onChange={setProjection}
            />
          </div>
          <div className="pose-dashboard">
            <PosePlot pose={pose} projection={projection} />
            <dl className="metrics">
              {[
                [t('插入比例'), pose.valid ? `${number(pose.depth * 100)}%` : '—'],
                [
                  t('孔口横偏 X / Y'),
                  pose.valid ? `${number(pose.intersection.x * 100)} / ${number(pose.intersection.y * 100)} cm` : '—',
                ],
                [t('偏航 / 俯仰'), pose.valid ? `${number(pose.yaw)}° / ${number(pose.pitch)}°` : '—'],
                [t('扭转'), pose.valid ? `${number(pose.roll)}°` : '—'],
                [t('最大拟合残差'), `${number(pose.residual * 1000, 2)} mm`],
              ].map(([label, value]) => (
                <div key={label}>
                  <dt>{label}</dt>
                  <dd>{value}</dd>
                </div>
              ))}
            </dl>
          </div>
          <div className="actions">
            <Button disabled={!pose.valid} onClick={() => onUseRig(pose)}>
              {t('生成深度草稿')}
            </Button>
            <Button disabled={!pose.valid} onClick={() => onUseRig(pose, true)}>
              {t('生成六轴草稿')}
            </Button>
          </div>
          <p className="caption muted">{t('替换整套草稿；残差只反映拟合一致性，不代表实际精度。')}</p>
        </>
      )}
    </div>
  );
}
