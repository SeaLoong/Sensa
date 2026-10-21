import React, { useState } from 'react';
import { t, diagnostic, getLocale } from './i18n.js';
import { capturePointEndpoint, calibratedPointDraft, pointCalibrationProgress } from './osc-preview.js';
import { Badge, Button, Notice } from './ui.jsx';
import { SelectField } from './controls.jsx';

function PointProjection({ point }) {
  const valid = point?.valid && [point.position?.x, point.position?.y, point.position?.z].every(Number.isFinite);
  const extent = Number(point?.displayHalfRange) || .25;
  const avatarRoot = point?.coordinateFrame === 'AvatarRootLocal';
  const center = point?.displayCenter || { x: 0, y: 0, z: 0 };
  const coord = (value, field) => Math.max(-extent, Math.min(extent, value - center[field])) * 80 / extent;
  return (
    <svg
      className="point-projection"
      viewBox="0 0 420 230"
      role="img"
      aria-label={avatarRoot ? t('Avatar 局部坐标投影，参考范围正负 {0} 单位', [extent]) : t('测量点在 XZ 和 YZ 平面的投影，参考半径 {0} 厘米', [extent * 100])}
    >
      {[
        { axis: 'X', field: 'x', offset: 105 },
        { axis: 'Y', field: 'y', offset: 315 },
      ].map(({ axis, field, offset }) => (
        <g key={axis} transform={`translate(${offset},112)`}>
          <rect x="-90" y="-90" width="180" height="180" rx="12" fill="#f4f8fc" stroke="#dce6f0" />
          {[-80, -40, 0, 40, 80].map((n) => (
            <g key={n} stroke={n === 0 ? '#91a5bb' : '#e1eaf3'}>
              <line x1={n} y1="-80" x2={n} y2="80" />
              <line x1="-80" y1={n} x2="80" y2={n} />
            </g>
          ))}
          <text x="0" y="-97" textAnchor="middle" fill="#40566f" fontSize="12">
            {axis} / Z
          </text>
          <text x="72" y="102" fill="#526177" fontSize="11">
            +{axis}
          </text>
          <text x="7" y="-65" fill="#526177" fontSize="11">
            +Z
          </text>
          {valid ? (
            <>
              <line
                x1="0"
                y1="0"
                x2={coord(point.position[field], field)}
                y2={-coord(point.position.z, 'z')}
                stroke="#1976d2"
                strokeWidth="2"
              />
              <circle
                cx={coord(point.position[field], field)}
                cy={-coord(point.position.z, 'z')}
                r="6"
                fill="#1976d2"
                stroke="white"
                strokeWidth="2"
              />
            </>
          ) : (
            <text textAnchor="middle" y="5" fill="#526177" fontSize="12">
              {t('等待有效位置')}
            </text>
          )}
        </g>
      ))}
      <text x="210" y="226" textAnchor="middle" fill="#526177" fontSize="11">
        {avatarRoot ? t('中心 {0}/{1}/{2} · ±{3} 本地单位', [center.x, center.y, center.z, extent]) : t('局部投影 ±{0} cm · 并非有效采样区域边界', [extent * 100])}
      </text>
    </svg>
  );
}

export default function SpsRootPanel({ observations = [], onUsePoint }) {
  const [selected, setSelected] = useState('');
  const [metric, setMetric] = useState('Z');
  const [zero, setZero] = useState(null);
  const [full, setFull] = useState(null);
  const root = selected ? observations.find((item) => item.key === selected) : observations[0];
  const local = root && (['Point', 'Handle'].includes(root.kind) || root.isMappablePoint === true);
  const endpoint = capturePointEndpoint(root, metric);
  const calibration = calibratedPointDraft(root, metric, zero, full);
  const progress = pointCalibrationProgress(root, metric, zero, full);
  const cm = (value) => {
    const rounded = (value * 100).toFixed(1);
    return Number(rounded) === 0 ? '0.0' : rounded;
  };
  const avatarRoot = root?.coordinateFrame === 'AvatarRootLocal';
  const reasonParts = root?.reason?.split(' / ');
  const reason = getLocale() === 'zh-CN' && reasonParts?.length === 2 ? reasonParts[0] : diagnostic(root?.reason);
  const length = (value) => avatarRoot ? Number(value).toFixed(3) : cm(value);
  const unit = avatarRoot ? t('本地单位') : 'cm';
  const withUnit = (value, valueUnit = unit) => <>{value}{' '}<span className="measurement-unit">{valueUnit}</span></>;
  const sampleLabel = (sample) =>
    sample && sample.key === root?.key && sample.metric === metric ? withUnit(length(sample.value)) : t('待采集');
  const reset = () => {
    setZero(null);
    setFull(null);
  };
  return (
    <div className="stack" id="sensa-spatial-root" tabIndex={-1}>
      <h3>{t('根点坐标与校准')}</h3>
      <p className="muted">{t('查看测量点相对参考对象的位置，再把移动范围转换为 0%–100% 动作。Avatar 根局部坐标以 Avatar 为参考，随 Avatar 一起移动，不是世界坐标。')}</p>
      {!root ? (
        <Notice>
          {t('尚未收到位置数据，请先完成 Unity 定位设置，并检查 OSC 接收或 Shader 桥接程序。')}
          {selected && (
            <Button
              onClick={() => {
                setSelected('');
                reset();
              }}
            >
              {t('重新选择')}
            </Button>
          )}
        </Notice>
      ) : (
        <>
          <SelectField
            label={t('测量对象')}
            value={root.key}
            options={observations.map((item) => ({
              value: item.key,
              label: `${item.instance} · ${item.kind} · ${item.party} · ${item.sourceLabel}`,
            }))}
            onChange={(next) => {
              setSelected(next);
              reset();
            }}
          />
          <div className="actions">
            <Badge tone={root.valid ? 'success' : 'warning'}>{root.valid ? t('坐标有效') : t('等待有效位置')}</Badge>
            <Badge>{t('{0}/{1} 采样', [root.sampleCount, root.expectedSampleCount || (local ? 4 : 8)])}</Badge>
            <Badge>{root.coordinateFrame === 'AvatarRootLocal' ? t('Avatar 根局部坐标') : t('参考局部坐标')}</Badge>
          </div>
          {reason && <p className="caption muted wrap">{reason}</p>}
          <div className="point-diagnostic-grid">
            <PointProjection point={root} />
            <dl className="metrics">
              {[
                [
                  t('局部 X / Y / Z'),
                  root.valid ? withUnit(`${length(root.position.x)} / ${length(root.position.y)} / ${length(root.position.z)}`) : '—',
                ],
                [t('距离拟合误差'), root.valid && root.kind !== 'ShaderRoot' ? withUnit(avatarRoot ? Number(root.residual).toFixed(5) : (root.residual * 1000).toFixed(2), avatarRoot ? unit : 'mm') : '—'],
                [t('朝向与插入比例'), t('单个点无法确定')],
              ].map(([label, value]) => (
                <div key={label}>
                  <dt>{label}</dt>
                  <dd>{value}</dd>
                </div>
              ))}
            </dl>
          </div>
          {local ? (
            <details>
              <summary>{t('两点量程校准')}</summary>
              <div className="stack">
                <p className="muted">{t('先选移动方向，把测量点移到动作起点并采集 0%，再移到终点并采集 100%。PB 把手在采集时需保持抓取。')}</p>
                <SelectField
                  label={t('测量轴')}
                  value={metric}
                  options={['X', 'Y', 'Z', 'Distance'].map((value) => ({
                    value,
                    label: value === 'Distance' ? t('距参考原点') : value,
                  }))}
                  onChange={(next) => {
                    setMetric(next);
                    reset();
                  }}
                />
                <div className="calibration-grid">
                  <div>
                    <strong>{t('起点')}</strong>
                    <output>{sampleLabel(zero)}</output>
                    <Button disabled={!endpoint} onClick={() => setZero(endpoint)}>
                      {t('采集 0%')}
                    </Button>
                  </div>
                  <div>
                    <strong>{t('终点')}</strong>
                    <output>{sampleLabel(full)}</output>
                    <Button disabled={!endpoint} onClick={() => setFull(endpoint)}>
                      {t('采集 100%')}
                    </Button>
                  </div>
                  <div>
                    <strong>{t('预览')}</strong>
                    <output>{progress ? progress.percent.toFixed(1) + '%' : '—'}</output>
                    <Button
                      tone="primary"
                      disabled={!calibration.draft}
                      onClick={() => onUsePoint?.(root, calibration.draft)}
                    >
                      {t('替换草稿')}
                    </Button>
                  </div>
                </div>
                <div className="actions">
                  <Button onClick={reset}>{t('清除采样')}</Button>
                  <span className="muted">
                    {calibration.error || (calibration.draft?.invertDirection ? t('方向已反转') : '')}
                  </span>
                </div>
              </div>
            </details>
          ) : (
            <p className="muted">{t('当前对象只能查看数据。请选择已配置专用根部标记、且坐标有效的自身对象来校准动作。')}</p>
          )}
        </>
      )}
      <p className="caption muted">{t('位置有效仅表示当前数据可用于计算。距离拟合误差越小，各路测量越一致，但不等于实际定位越准确；一个点也无法判断朝向。')}</p>
    </div>
  );
}
