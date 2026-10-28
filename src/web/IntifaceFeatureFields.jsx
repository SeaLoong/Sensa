import React, { useId } from 'react';
import { Button, Field, Notice, Toggle } from './ui.jsx';
import { SelectField } from './controls.jsx';
import { t } from './i18n.js';
import { PROTOCOL_AXES } from './protocol-inputs.js';
import { INTIFACE_OUTPUT_TYPES, makeIntifaceFeatureRoute } from './intiface-feature-routing.js';

export default function IntifaceFeatureFields({ routes = [], devices = [], onChange }) {
  const namesId = useId();
  const update = (index, patch) => onChange(routes.map((route, i) => i === index ? { ...route, ...patch } : route));
  const axes = PROTOCOL_AXES.map(value => ({ value, label: value }));
  return <details data-testid="intiface-feature-mappings"><summary>{t('执行器映射')}</summary><div className="stack">
    <p className="caption muted">{t('未配置映射时使用默认的位置与振动路由。映射覆盖匹配特征的同类能力；其他特征保留默认路由。')}</p>
    <datalist id={namesId}>{[...new Set(devices.map(device => device.name))].map(name => <option key={name} value={name} />)}</datalist>
    {devices.length > 0 && <p className="caption muted">{t('已发现设备：{0}', [devices.map(device => device.name).join(' · ')])}</p>}
    {devices.some(device => device.features?.length) && <ul className="caption muted wrap" data-testid="intiface-advertised-features">
      {devices.flatMap(device => (device.features || []).map(feature => <li key={`${device.index}/${feature.index}`}>
        {device.name} · {feature.index} · {feature.description || ''} · {(feature.outputTypes || []).join(' / ')}
      </li>))}
    </ul>}
    {routes.map((route, index) => <fieldset className="editor-group" data-testid="intiface-feature-route" key={index}>
      <legend>{t('执行器映射 {0}', [index + 1])}</legend><div className="form-grid">
        <Field label={t('匹配设备名称')} value={route.deviceName} list={namesId} placeholder={t('留空匹配所有设备')}
          onChange={event => update(index, { deviceName: event.target.value })} />
        <Field label={t('特征索引')} type="number" min={0} max={4294967295} step={1} value={route.featureIndex ?? ''} placeholder={t('留空匹配所有特征')}
          onChange={event => update(index, { featureIndex: event.target.value === '' ? null : Number(event.target.value) })} />
        <SelectField label={t('执行器类型')} value={route.outputType} options={INTIFACE_OUTPUT_TYPES.map(value => ({ value, label: value }))}
          onChange={outputType => update(index, { outputType, ...(outputType === 'Rotate' ? {} : { directionAxis: '' }) })} />
        <SelectField label={t('来源轴')} value={route.sourceAxis} options={axes} onChange={sourceAxis => update(index, { sourceAxis })} />
        {route.outputType === 'Rotate' && <SelectField label={t('旋转方向轴')} value={route.directionAxis} options={[
          { value: '', label: t('使用固定方向') }, ...axes,
        ]} onChange={directionAxis => update(index, { directionAxis })} />}
      </div>
      {route.outputType === 'Rotate' ? <>
        <p className="caption muted">{t('来源值表示旋转速度强度；方向轴大于等于 0.5 为顺时针，小于 0.5 为逆时针。')}</p>
        {!route.directionAxis && <Toggle label={t('顺时针')} checked={route.clockwise} onChange={clockwise => update(index, { clockwise })} />}
      </> : ['Position', 'HwPositionWithDuration'].includes(route.outputType)
        ? <p className="caption muted">{t('位置按设备声明范围换算；计时位置保留上游到达时长。')}</p>
        : <p className="caption muted">{t('0–1 数值换算到设备声明的执行器范围。')}</p>}
      <Toggle label={t('反向数值（1−x）')} checked={route.invert} onChange={invert => update(index, { invert })} />
      <Button tone="danger" onClick={() => onChange(routes.filter((_, i) => i !== index))}>{t('移除执行器映射')}</Button>
    </fieldset>)}
    <Button disabled={routes.length >= 32} onClick={() => onChange([...routes, makeIntifaceFeatureRoute()])}>{t('添加执行器映射')}</Button>
    {routes.length > 0 && <Notice>{t('只向设备实际声明的能力发送。旋转是速度与方向，不能当成绝对转角；反向数值只改变 1−x，不改变旋转方向。')}</Notice>}
  </div></details>;
}
