import React, { useState } from 'react';
import { t, diagnostic, getLocale } from './i18n.js';
import { capturePointEndpoint, calibratedPointDraft, pointCalibrationProgress, pointMetricOptions, pointTrackingLabel } from './osc-preview.js';
import { Badge, Button, Notice } from './ui.jsx';
import { SelectField } from './controls.jsx';

function PointProjection({ point }) {
  const valid = point?.valid && [point.position?.x, point.position?.y, point.position?.z].every(Number.isFinite);
  const extent = Number(point?.displayHalfRange) || .25;
  const avatarRoot = point?.coordinateFrame === 'AvatarRootLocal';
  const avatarMeters = point?.coordinateFrame === 'AvatarRootMeters';
  const center = point?.displayCenter || { x: 0, y: 0, z: 0 };
  const coord = (value, field) => Math.max(-extent, Math.min(extent, value - center[field])) * 80 / extent;
  return (
    <svg
      className="point-projection"
      viewBox="0 0 420 230"
      role="img"
      aria-label={avatarMeters ? t('Avatar 根坐标投影，参考范围正负 {0} 米', [extent]) : avatarRoot ? t('Avatar 局部坐标投影，参考范围正负 {0} 单位', [extent]) : t('测量点在 XZ 和 YZ 平面的投影，参考半径 {0} 厘米', [extent * 100])}
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
        {avatarMeters ? t('中心 {0}/{1}/{2} · ±{3} m', [center.x, center.y, center.z, extent]) : avatarRoot ? t('中心 {0}/{1}/{2} · ±{3} 本地单位', [center.x, center.y, center.z, extent]) : t('绘图范围 ±{0} cm · 有效范围见覆盖区域图', [extent * 100])}
      </text>
    </svg>
  );
}

export default function SpsRootPanel({ observations = [], onUsePoint, onInspectShaderParameters }) {
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
  const contact = root?.kind === 'ContactRoot';
  const shader = root?.kind === 'ShaderRoot';
  const avatarMeters = root?.coordinateFrame === 'AvatarRootMeters';
  const shaderMetric = shader && /^(?:Right|Forward)[XYZ]$|^AvatarScale$/.test(metric);
  const velocityMetric = ['VelocityX', 'VelocityY', 'VelocityZ', 'Speed', 'ProximitySpeed'].includes(metric);
  const reasonParts = root?.reason?.split(' / ');
  const reason = getLocale() === 'zh-CN' && reasonParts?.length === 2 ? reasonParts[0] : diagnostic(root?.reason);
  const length = (value) => avatarRoot || avatarMeters ? Number(value).toFixed(3) : cm(value);
  const unit = avatarMeters ? 'm' : avatarRoot ? t('本地单位') : 'cm';
  const metricUnit = shaderMetric ? metric === 'AvatarScale' ? t('米 / 本地单位') : t('根单位 / 目标单位') : metric === 'ProximitySpeed' ? '/s' : velocityMetric ? 'm/s' : unit;
  const withUnit = (value, valueUnit = unit) => <>{value}{' '}<span className="measurement-unit">{valueUnit}</span></>;
  const vector = value => root?.valid && value && [value.x, value.y, value.z].every(Number.isFinite)
    ? [value.x, value.y, value.z].map(component => component.toFixed(3)).join(' / ') : '—';
  const sampleLabel = (sample) =>
    sample && sample.key === root?.key && sample.metric === metric ? withUnit(velocityMetric || shaderMetric ? sample.value.toFixed(3) : length(sample.value), metricUnit) : t('待采集');
  const reset = () => {
    setZero(null);
    setFull(null);
  };
  return (
    <div className="stack" id="sensa-spatial-root" tabIndex={-1}>
      <h3>{t('根点坐标与校准')}</h3>
      <p className="muted">{t('查看测量点的位置，再把移动范围转换为 0%–100% 动作。坐标以所选参考对象为原点；Avatar 根局部坐标会随 Avatar 一起移动。')}</p>
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
              label: `${item.instance} · ${pointTrackingLabel(item)} · ${item.party} · ${item.sourceLabel}`,
            }))}
            onChange={(next) => {
              setSelected(next);
              setMetric('Z');
              reset();
            }}
          />
          <div className="actions">
            <Badge tone={root.valid ? 'success' : 'warning'}>{root.valid ? t('坐标有效') : t('等待有效位置')}</Badge>
            <Badge>{t('{0}/{1} 采样', [root.sampleCount, root.expectedSampleCount || (local ? 4 : 8)])}</Badge>
            <Badge>{avatarMeters ? t('Avatar 根坐标（米）') : avatarRoot ? t('Avatar 根局部坐标') : t('参考局部坐标')}</Badge>
          </div>
          {reason && <p className="caption muted wrap">{reason}</p>}
          <div className="point-diagnostic-grid">
            <PointProjection point={root} />
            <dl className="metrics">
              {[
                [
                  t('局部 X / Y / Z'),
                  root.valid ? withUnit(`${length(root.position.x)} / ${length(root.position.y)} / ${length(root.position.z)}`) : '—',
                  'point-position',
                ],
                ...(shader ? [
                  ['Right X / Y / Z', vector(root.right), 'point-right'],
                  ['Forward X / Y / Z', vector(root.forward), 'point-forward'],
                  ['AvatarScale', root.valid && Number.isFinite(root.avatarScale) && root.avatarScale > 0 ? withUnit(root.avatarScale.toFixed(3), t('米 / 本地单位')) : '—', 'point-avatar-scale'],
                ] : !contact ? [[t('距离拟合误差'), root.valid ? withUnit(avatarRoot ? Number(root.residual).toFixed(5) : (root.residual * 1000).toFixed(2), avatarRoot ? unit : 'mm') : '—']] : [
                  [t('接收覆盖半径'), withUnit(Number(root.displayHalfRange).toFixed(3), 'm'), 'point-coverage-radius'],
                  [t('相对速度 X / Y / Z'), root.valid && root.velocity ? withUnit([root.velocity.x, root.velocity.y, root.velocity.z].map(value => Number(value).toFixed(3)).join(' / '), 'm/s') : '—', 'point-velocity'],
                  [t('相对速率'), root.valid && Number.isFinite(root.speed) ? withUnit(root.speed.toFixed(3), 'm/s') : '—', 'point-speed'],
                  [t('接近值变化率'), root.valid && Number.isFinite(root.proximitySpeed) ? withUnit(root.proximitySpeed.toFixed(3), '/s') : '—', 'point-proximity-speed'],
                ]),
                ...(!shader ? [[t('朝向与插入比例'), t('需要三点测量')]] : []),
              ].map(([label, value, testId]) => (
                <div key={label}>
                  <dt>{label}</dt>
                  <dd data-testid={testId}>{value}</dd>
                </div>
              ))}
            </dl>
          </div>
          {contact && <p className="caption muted">{t('Contact 直接提供形状中心坐标。坐标以 Avatar 根为原点、沿根的旋转轴表示，单位为米。相对速度包含接触点处的旋转运动；接近值变化率以每秒为单位。')}</p>}
          {shader && <div className="stack">
            <p className="caption muted">{t('RightXYZ 与 ForwardXYZ 表示目标 X、Z 轴在 Avatar 根局部坐标中的方向和单位轴长，可描述目标平面与斜切。AvatarScale 表示每个根局部单位对应的世界米数。')}</p>
            <p className="caption muted">{t('选择定位测量的方向或缩放指标，可用于轴映射、输出绑定与计算信号，并遵循完整包有效状态。原始 OSC 参数可用于查看各项读数与定义。')}</p>
            <div className="actions"><Button onClick={() => onInspectShaderParameters?.(root)} data-testid="shader-parameters">{t('查看方向与缩放参数')}</Button></div>
          </div>}
          {local ? (
            <details>
              <summary>{t('两点量程校准')}</summary>
              <div className="stack">
                <p className="muted">{velocityMetric || shaderMetric ? t('保持目标有效，分别在期望的低值和高值状态下采集 0% 与 100%，再生成映射草稿。') : t('先选移动方向，把测量点移到动作起点并采集 0%，再移到终点并采集 100%。PB 把手在采集时需保持抓取。')}</p>
                <SelectField
                  label={contact || shader ? t('测量指标') : t('测量轴')}
                  value={metric}
                  options={pointMetricOptions(root)}
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
            <p className="muted">{t('要校准动作，请选择已配置专用根部标记、且坐标有效的自身对象。')}</p>
          )}
        </>
      )}
      <p className="caption muted">{shader ? t('“坐标有效”表示同一来源的完整 12 字段通过范围、轴向量与更新检查。三点渲染采样提供位置和目标 X/Z 平面，实际精度可用已知位置与方向验证。') : contact ? t('“坐标有效”表示完整参数、自身发送器、接近状态、覆盖半径与采样活动通过检查。请用已知位置和运动另行验证实际精度。') : t('“坐标有效”表示当前数据通过计算检查。拟合误差用于查看各路距离的一致性；实际精度请用已知位置测量，朝向需使用三点定位。')}</p>
    </div>
  );
}
