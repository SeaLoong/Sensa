import { t, getLocale, diagnostic, docUrl } from './i18n.js';
import React, { useState } from 'react';
import { Alert, Box, Button, Chip, FormControl, InputLabel, LinearProgress, MenuItem, Select, Stack, Typography } from '@mui/material';
import { capturePointEndpoint, calibratedPointDraft, pointCalibrationProgress } from './osc-preview.js';

function PointProjection({point}) {
  const valid=point?.valid && [point.position?.x,point.position?.y,point.position?.z].every(Number.isFinite);
  const coord=value=>Math.max(-.25,Math.min(.25,value))*320;
  return <svg className="point-projection" viewBox="0 0 420 230" role="img" aria-label={t("测量点在 XZ 和 YZ 平面的投影，参考范围正负 25 厘米")}>
    {[{axis:'X',field:'x',offset:105},{axis:'Y',field:'y',offset:315}].map(({axis,field,offset})=><g key={axis} transform={`translate(${offset},112)`}>
      <rect x="-90" y="-90" width="180" height="180" rx="12" fill="#f4f8fc" stroke="#dce6f0" />
      {[-80,-40,0,40,80].map(n=><g key={n} stroke={n===0?'#91a5bb':'#e1eaf3'}><line x1={n} y1="-80" x2={n} y2="80"/><line x1="-80" y1={n} x2="80" y2={n}/></g>)}
      <text x="0" y="-97" textAnchor="middle" fill="#40566f" fontSize="12">{axis} / Z</text>
      <text x="72" y="102" fill="#627a92" fontSize="11">+{axis}</text><text x="7" y="-65" fill="#627a92" fontSize="11">+Z</text>
      {valid?<><line x1="0" y1="0" x2={coord(point.position[field])} y2={-coord(point.position.z)} stroke="#1976d2" strokeWidth="2"/><circle cx={coord(point.position[field])} cy={-coord(point.position.z)} r="6" fill="#1976d2" stroke="white" strokeWidth="2"/></>:<text textAnchor="middle" y="5" fill="#718298" fontSize="12">{t("等待有效位置")}</text>}
    </g>)}
    <text x="210" y="226" textAnchor="middle" fill="#718298" fontSize="11">{t("局部坐标投影 ±25 cm · 并非有效采样区域边界")}</text>
  </svg>;
}

export default function SpsRootPanel({ observations = [], onUsePoint, mode = 'diagnostics' }) {
  const [selected, setSelected] = useState('');
  const [metric, setMetric] = useState('Z');
  const [zero, setZero] = useState(null);
  const [full, setFull] = useState(null);
  const root = selected ? observations.find(p => p.key === selected) : observations[0];
  const local = root && ['Point','Handle'].includes(root.kind);
  const cm = value => (value * 100).toFixed(1);
  const endpoint = capturePointEndpoint(root,metric);
  const calibration = calibratedPointDraft(root,metric,zero,full);
  const progress = pointCalibrationProgress(root,metric,zero,full);
  const samePoint = sample => sample && sample.key===root?.key && sample.metric===metric;
  return <Box className="dialog-panel pose-panel">
    <Stack direction="row" gap={1} alignItems="center" useFlexGap flexWrap="wrap">
      <Typography variant="subtitle1" fontWeight={700}>{mode==='calibration'?t("量程校准"):t("位置诊断")}</Typography>
      <Chip size="small" label={local ? t("本地骨骼 / PB · 局部坐标") : t("单侧 SPS · 诊断")} variant="outlined" />
    </Stack>
    <Typography variant="body2" color="text.secondary" sx={{ my: 1 }}>{local ? t("读取自己的骨骼或 PB 把手位置；不是对方的完整姿态，也不是 GPU 形变网格。PB 把手仅在抓取时启用。") : t("自己安装根部探针，对方保留标准 TPS_Pen_Root 即可。共享阵列一次只测量一个槽位；不能据此还原尖端、倾角、扭转或插入比例。")}</Typography>
    {!root ? <Alert severity="info" action={selected?<Button onClick={()=>{setSelected('');setZero(null);setFull(null);}}>{t("重新选择")}</Button>:undefined}>{selected?t("所选目标已不在当前来源中。重新选择目标后再校准，旧采样不会自动用于其他目标。"):t("等待阵列采样（标准八路，本地点四路）。Unity 中添加 Automatic SPS Setup 或 Local Bone or PB Probe；输入关闭时也可以观察与校准。")}</Alert> : <>
      <Stack direction="row" gap={1} alignItems="center" useFlexGap flexWrap="wrap">
        <FormControl size="small" sx={{ minWidth: 0, width:{xs:'100%',sm:340} }}><InputLabel id="sps-root-label">{t("测量对象")}</InputLabel><Select labelId="sps-root-label" label={t("测量对象")} value={root.key} onChange={e => {setSelected(e.target.value);setZero(null);setFull(null);}}>{observations.map(p => <MenuItem value={p.key} key={p.key}>{p.instance} · {p.kind} · {p.party} · {p.sourceLabel}</MenuItem>)}</Select></FormControl>
        <Chip size="small" color={root.valid ? 'success' : 'warning'} label={diagnostic(root.reason)} />
        <Chip size="small" label={t("{0}/{1} 采样", [root.sampleCount, local?4:8])} />
        {root.kind === 'SharedRoot' && <Chip size="small" label={t("共享槽位 {0}", [root.slot || t("停用")])} />}
      </Stack>
      {!root.valid && <Alert severity="warning" sx={{mt:1}}>{t("当前不能采集校准点：")}{diagnostic(root.reason)}{t("。检查目标是否在范围内、采样是否完整；PB 还需保持抓取。")}</Alert>}
      {mode!=='calibration' && <Box className="point-diagnostic-grid">
      <PointProjection point={root}/>
      <Box className="pose-metrics" sx={{ my: 1 }}>
        {[
          [local ? t("测量点 X / Y / Z") : t("根部 X / Y / Z"), root.valid ? `${cm(root.position.x)} / ${cm(root.position.y)} / ${cm(root.position.z)} cm` : '—'],
          [t("横向距离"), root.valid ? `${cm(Math.hypot(root.position.x, root.position.y))} cm` : '—'],
          [t("球形拟合残差"), root.valid ? `${(root.residual * 1000).toFixed(2)} mm` : '—'],
          [local ? t("姿态 / 插入比例") : t("尖端 / 姿态 / 行程"), t("不可观测")],
        ].map(([label, value]) => <Box className="pose-metric" key={label}><Typography variant="caption" color="text.secondary">{label}</Typography><Typography fontWeight={700}>{value}</Typography></Box>)}
      </Box>
      </Box>}
      {mode==='calibration' && !local && <Alert severity="info" sx={{my:2}}>{t("请选择 Point 或 Handle 本地点进行量程校准。标准 SPS Root 和共享根部只有诊断位置，不能当作完整行程。")}</Alert>}
      {mode==='calibration' && local && <Box className="point-calibration" sx={{my:1}}>
        <Typography variant="subtitle2">{t("两点量程校准")}</Typography>
        <Typography variant="caption" color="text.secondary">{t("将目标移到期望的 0% 和 100% 位置，分别采集。PB 把手须保持抓取；结果将替换整套草稿并移除旧门控，保存前可恢复原配置。")}</Typography>
        <Box sx={{mt:1}}><Chip size="small" variant="outlined" color={endpoint?'primary':'default'} label={t("当前 {0}：{1}", [metric==='Distance'?t("距原点"):metric, endpoint?cm(endpoint.value)+' cm':t("等待有效采样")])}/></Box>
        <Stack direction="row" gap={1} alignItems="center" useFlexGap flexWrap="wrap" sx={{my:1}}>
          <FormControl size="small" sx={{minWidth:130}}><InputLabel id="point-axis-label">{t("测量轴")}</InputLabel><Select labelId="point-axis-label" label={t("测量轴")} value={metric} onChange={e=>{setMetric(e.target.value);setZero(null);setFull(null);}}>{['X','Y','Z','Distance'].map(axis=><MenuItem key={axis} value={axis}>{axis==='Distance'?t("距参考原点"):axis}</MenuItem>)}</Select></FormControl>
          <Button size="small" onClick={()=>{setZero(null);setFull(null);}}>{t("清除采样")}</Button>
        </Stack>
        <Box className="point-calibration-steps">
          <Box className="point-calibration-step"><Typography variant="overline">{t("01 · 起点")}</Typography><Typography variant="h6">{samePoint(zero)?cm(zero.value)+' cm':t("待采集")}</Typography><Button variant="outlined" size="small" disabled={!endpoint} onClick={()=>setZero(endpoint)}>{t("采集 0%")}</Button></Box>
          <Box className="point-calibration-step"><Typography variant="overline">{t("02 · 终点")}</Typography><Typography variant="h6">{samePoint(full)?cm(full.value)+' cm':t("待采集")}</Typography><Button variant="outlined" size="small" disabled={!endpoint} onClick={()=>setFull(endpoint)}>{t("采集 100%")}</Button></Box>
          <Box className="point-calibration-step"><Typography variant="overline">{t("03 · 预览与草稿")}</Typography><Typography variant="h6">{progress?progress.percent.toFixed(1)+'%':'—'}</Typography><LinearProgress variant="determinate" value={progress?.percent||0} sx={{width:'100%',my:1,borderRadius:1}}/><Button variant="contained" size="small" disabled={!calibration.draft} onClick={()=>onUsePoint?.(root,calibration.draft)}>{t("替换为校准映射")}</Button></Box>
        </Box>
        {progress?.outside && <Typography variant="caption" color="warning.main">{t("当前位置超出校准量程，预览已限制到 0–100%。")}</Typography>}
        <Typography variant="caption" color="text.secondary">{calibration.error || (calibration.draft.invertDirection?t("量程随坐标减小而增大，已自动反向。"):t("量程随坐标增大而增大。"))}</Typography>
      </Box>}
      <Typography variant="caption" color="text.secondary">{t("数值为探针局部坐标。残差不等于实际误差；多个同标签目标可能混入。")}{local ? t("位移映射需校准，多个目标匹配或失去有效采样时停止输入。") : t("SPS 根部和共享阵列只提供诊断，不生成运动映射。")}</Typography>
    </>}
  </Box>;
}
