import React, { useState } from 'react';
import { Alert, Box, Button, Chip, FormControl, InputLabel, MenuItem, Select, Stack, Typography } from '@mui/material';
import { capturePointEndpoint, calibratedPointDraft } from './osc-preview.js';

export default function SpsRootPanel({ observations = [], onUsePoint }) {
  const [selected, setSelected] = useState('');
  const [metric, setMetric] = useState('Z');
  const [zero, setZero] = useState(null);
  const [full, setFull] = useState(null);
  const root = observations.find(p => p.key === selected) || observations[0];
  const local = root && ['Point','Handle'].includes(root.kind);
  const cm = value => (value * 100).toFixed(1);
  const endpoint = capturePointEndpoint(root,metric);
  const calibration = calibratedPointDraft(root,metric,zero,full);
  const samePoint = sample => sample && sample.key===root?.key && sample.metric===metric;
  return <Box className="dialog-panel pose-panel">
    <Stack direction="row" gap={1} alignItems="center" useFlexGap flexWrap="wrap">
      <Typography variant="subtitle1" fontWeight={700}>根部与本地点测量</Typography>
      <Chip size="small" label={local ? '本地骨骼 / PB · 局部坐标' : '单侧 SPS · 诊断'} variant="outlined" />
    </Stack>
    <Typography variant="body2" color="text.secondary" sx={{ my: 1 }}>{local ? '读取自己的骨骼或 PB 把手位置；不是对方的完整姿态，也不是 GPU 形变网格。PB 把手仅在抓取时启用。' : '自己安装根部探针，对方保留标准 TPS_Pen_Root 即可。共享阵列一次只测量一个槽位；不能据此还原尖端、倾角、扭转或插入比例。'}</Typography>
    {!root ? <Alert severity="info">等待阵列采样（标准八路，本地点四路）。Unity 中可使用 Automatic SPS Setup 自动配置，或添加 Local Bone or PB Probe。支持 SpsRoot、SharedRoot、Point、Handle 四种来源；根部诊断不等于完整姿态。</Alert> : <>
      <Stack direction="row" gap={1} alignItems="center" useFlexGap flexWrap="wrap">
        <FormControl size="small" sx={{ minWidth: 230 }}><InputLabel id="sps-root-label">测量对象</InputLabel><Select labelId="sps-root-label" label="测量对象" value={root.key} onChange={e => setSelected(e.target.value)}>{observations.map(p => <MenuItem value={p.key} key={p.key}>{p.instance} · {p.kind} · {p.party} · {p.sourceLabel}</MenuItem>)}</Select></FormControl>
        <Chip size="small" color={root.valid ? 'success' : 'warning'} label={root.reason} />
        <Chip size="small" label={`${root.sampleCount}/${local?4:8} 采样`} />
        {root.kind === 'SharedRoot' && <Chip size="small" label={`共享槽位 ${root.slot || '停用'}`} />}
      </Stack>
      <Box className="pose-metrics" sx={{ my: 1 }}>
        {[
          [local ? '测量点 X / Y / Z' : '根部 X / Y / Z', root.valid ? `${cm(root.position.x)} / ${cm(root.position.y)} / ${cm(root.position.z)} cm` : '—'],
          ['横向距离', root.valid ? `${cm(Math.hypot(root.position.x, root.position.y))} cm` : '—'],
          ['球形拟合残差', root.valid ? `${(root.residual * 1000).toFixed(2)} mm` : '—'],
          [local ? '姿态 / 插入比例' : '尖端 / 姿态 / 行程', '不可观测'],
        ].map(([label, value]) => <Box className="pose-metric" key={label}><Typography variant="caption" color="text.secondary">{label}</Typography><Typography fontWeight={700}>{value}</Typography></Box>)}
      </Box>
      {local && <Box sx={{my:1}}>
        <Typography variant="subtitle2">两点量程校准</Typography>
        <Typography variant="caption" color="text.secondary">将目标移到期望的 0% 和 100% 位置，分别采集。PB 把手采集时须保持抓取；生成草稿不会保存配置或启用输出。</Typography>
        <Stack direction="row" gap={1} alignItems="center" useFlexGap flexWrap="wrap" sx={{my:1}}>
          <FormControl size="small" sx={{minWidth:130}}><InputLabel id="point-axis-label">测量轴</InputLabel><Select labelId="point-axis-label" label="测量轴" value={metric} onChange={e=>{setMetric(e.target.value);setZero(null);setFull(null);}}>{['X','Y','Z','Distance'].map(axis=><MenuItem key={axis} value={axis}>{axis==='Distance'?'距参考原点':axis}</MenuItem>)}</Select></FormControl>
          <Button size="small" disabled={!endpoint} onClick={()=>setZero(endpoint)}>采集 0%</Button>
          <Chip size="small" label={`0%: ${samePoint(zero)?cm(zero.value)+' cm':'未采集'}`} />
          <Button size="small" disabled={!endpoint} onClick={()=>setFull(endpoint)}>采集 100%</Button>
          <Chip size="small" label={`100%: ${samePoint(full)?cm(full.value)+' cm':'未采集'}`} />
          <Button size="small" disabled={!calibration.draft} onClick={()=>onUsePoint?.(root,calibration.draft)}>生成校准映射草稿</Button>
          <Button size="small" onClick={()=>{setZero(null);setFull(null);}}>清除采样</Button>
        </Stack>
        <Typography variant="caption" color="text.secondary">{calibration.error || (calibration.draft.invertDirection?'量程随坐标减小而增大，已自动反向。':'量程随坐标增大而增大。')}</Typography>
      </Box>}
      <Typography variant="caption" color="text.secondary">数值为探针局部坐标。残差不等于实际误差；多个同标签目标可能混入。{local ? '位移映射需校准，多个目标匹配或失去有效采样时停止输入。' : 'SPS 根部和共享阵列只提供诊断，不生成运动映射。'}</Typography>
    </>}
  </Box>;
}
