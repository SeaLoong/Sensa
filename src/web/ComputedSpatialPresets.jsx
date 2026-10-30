import React, { useId, useMemo, useState } from 'react';
import { Button, Field, Toggle } from './ui.tsx';
import { SelectField } from './controls.jsx';
import { t } from './i18n.js';
import { COMPUTED_SIGNAL_LIMIT, SPATIAL_COMPUTED_OPERATIONS, computedOperationOptions, followingPlaneDrafts, newSpatialComputedDraft } from './computed-signals.js';

export default function ComputedSpatialPresets({ drafts, pointOptions, onAdd }) {
  const [operation, setOperation] = useState('PointDistance');
  const [mode, setMode] = useState('Markers');
  const [pointPath, setPointPath] = useState('');
  const [originPath, setOriginPath] = useState('');
  const [includeDistance, setIncludeDistance] = useState(false);
  const pointList = useId(), originList = useId();
  const origins = pointOptions.filter(point => mode === 'Shader' ? /^Sensa\/Shader\//.test(point.value) : /_Origin\/\*\*$/.test(point.value));
  const following = useMemo(() => followingPlaneDrafts(drafts, { pointPath, originPath, mode, includeDistance }),
    [drafts, pointPath, originPath, mode, includeDistance]);
  return <details className="computed-spatial-presets" data-testid="computed-spatial-presets">
    <summary>{t('空间计算预设')}</summary>
    <div className="stack">
      <div className="editor-group">
        <h4>{t('从基本运算开始')}</h4>
        <p className="caption muted">{t('选择一种空间关系，再填写测量对象或固定坐标。预设只添加计算草稿，保存后可用于映射和输出。')}</p>
        <div className="form-grid">
          <SelectField label={t('空间运算')} value={operation} options={computedOperationOptions().filter(option => SPATIAL_COMPUTED_OPERATIONS.includes(option.value))} onChange={setOperation} />
          <Button disabled={drafts.length >= COMPUTED_SIGNAL_LIMIT} onClick={() => onAdd([newSpatialComputedDraft(drafts, operation,
            pointOptions[0]?.value, pointOptions.find(point => /^Sensa\/Shader\//.test(point.value))?.value)])}>{t('新增空间计算')}</Button>
        </div>
      </div>
      <div className="editor-group">
        <h4>{t('跟随移动平面')}</h4>
        <p className="caption muted">{t('选择自己 Avatar 内的测量位置和参考对象，一起创建深度和平面内偏移。参考对象移动或转动时，计算使用它当前的位置和朝向。')}</p>
        <SelectField label={t('平面定位方式')} value={mode} options={[
          { value: 'Markers', label: t('Tracking Frame · Origin / Forward') },
          { value: 'Shader', label: t('Shader · 位置与 Forward 方向') },
        ]} onChange={next => { setMode(next); setOriginPath(''); }} />
        <Field label={t('测量对象路径')} value={pointPath} list={pointList} placeholder="Sensa/Contact/Target/**" onChange={event => setPointPath(event.target.value)} />
        <datalist id={pointList}>{pointOptions.map(point => <option key={point.value} value={point.value}>{point.label}</option>)}</datalist>
        <Field label={t('平面参考对象路径')} value={originPath} list={originList}
          placeholder={mode === 'Markers' ? 'Sensa/Contact/Frame_Origin/**' : 'Sensa/Shader/42/**'} onChange={event => setOriginPath(event.target.value)} />
        <datalist id={originList}>{origins.map(point => <option key={point.value} value={point.value}>{point.label}</option>)}</datalist>
        <p className="caption muted">{mode === 'Markers'
          ? t('选择 Tracking Frame 的 _Origin 组。预设读取同名 _Forward 组，用两点之差确定 +Z 朝向，并创建三个可复用的方向分量。')
          : t('工作平面经过 Shader 定位点，并垂直于它报告的 Forward 方向。若要使用两条实际轴张成的平面，可选择“两条轴”运算。')}</p>
        <p className="caption muted">{t('深度正值沿平面朝向，负值在另一侧；平面内偏移表示投影点离参考点的距离。测量位置和参考位置使用同一坐标系、同一单位。')}</p>
        <Toggle label={t('同时创建两点距离')} checked={includeDistance} onChange={setIncludeDistance} />
        <div className="actions"><Button disabled={!following.length} onClick={() => onAdd(following)}>{t('添加跟随平面草稿')}</Button>
          {following.length > 0 && <span className="caption muted">{t('将新增 {0} 个计算', [following.length])}</span>}</div>
      </div>
    </div>
  </details>;
}
