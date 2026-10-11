import React, { useState } from 'react';
import { Alert, Box, Button, Chip, FormControl, InputLabel, MenuItem, Select, Stack, ToggleButton, ToggleButtonGroup, Typography } from '@mui/material';

const number = (value, digits = 1) => Number.isFinite(Number(value)) ? (Math.abs(Number(value)) < .5 * 10 ** -digits ? 0 : Number(value)).toFixed(digits) : '—';

function PosePlot({ pose, projection }) {
  const xy = projection === 'front';
  const point = p => [200 + (xy ? p.x : p.z) * 450, 130 - (xy ? p.y : p.x) * 450];
  const root = point(pose.root), tip = point(pose.tip), side = point(pose.side);
  const intersection = point(pose.intersection);
  return (
    <svg viewBox="0 0 400 260" role="img" aria-label={xy ? '孔口正视图：X/Y 偏移' : '侧视图：Z 深度与 X 偏移'} className="pose-plot">
      <defs><pattern id={`pose-grid-${projection}`} width="22.5" height="22.5" patternUnits="userSpaceOnUse"><path d="M22.5 0H0V22.5" fill="none" stroke="#dbe7f1" strokeWidth=".5" /></pattern></defs>
      <rect width="400" height="260" fill={`url(#pose-grid-${projection})`} />
      <path d="M0 130H400M200 0V260" stroke="#b1c5d6" strokeDasharray="4 4" />
      {xy ? <circle cx="200" cy="130" r="18" fill="#ddf8f0" stroke="#12a886" strokeWidth="2" /> : <><rect x="200" y="112" width="150" height="36" fill="#ddf8f0" opacity=".6" /><path d="M200 112V148" stroke="#12a886" strokeWidth="3" /></>}
      <text x="12" y="22" fontSize="12" fill="#526575">{xy ? '孔口平面 X / Y' : '侧视 Z / X · 向右为入孔'}</text>
      {pose.valid && <>
        <path d={`M${root}L${tip}`} stroke={pose.engaged ? '#14866d' : '#de9223'} strokeWidth="7" strokeLinecap="round" />
        <path d={`M${root}L${side}`} stroke="#8a67ca" strokeWidth="3" />
        {[[root, 'Root', '#167c9b'], [tip, 'Tip', '#ee8068'], [side, 'Side', '#8a67ca']].map(([position, label, color]) => <g key={label}><circle cx={position[0]} cy={position[1]} r="4" fill={color} /><text x={position[0] + 7} y={position[1] - 8} fontSize="11" fill={color}>{label}</text></g>)}
        <circle cx={intersection[0]} cy={intersection[1]} r="4" fill="white" stroke="#12a886" strokeWidth="2" />
      </>}
      {!pose.valid && <text x="200" y="140" textAnchor="middle" fontSize="14" fill="#65798a">等待有效的三点定位</text>}
      <text x="12" y="245" fontSize="11" fill="#65798a">每小格 5 cm · Socket 局部坐标</text>
    </svg>
  );
}

export default function PosePanel({ observations = [], activeKey, onUseRig }) {
  const [selected, setSelected] = useState('');
  const [projection, setProjection] = useState('side');
  const [showGuide, setShowGuide] = useState(false);
  const pose = observations.find(p => p.key === selected) || observations.find(p => p.key === activeKey) || observations[0];
  return (
    <Box className="dialog-panel pose-panel">
      <Stack direction="row" justifyContent="space-between" alignItems="center" useFlexGap flexWrap="wrap" gap={1}>
        <Box><Typography variant="subtitle1" fontWeight={700}>空间定位</Typography><Typography variant="caption" color="text.secondary">配套标记相对 Socket 的位置与姿态</Typography></Box>
        <Stack direction="row" gap={1}><Chip size="small" variant="outlined" label="Sensa Pose v1 · 实验性" /><Button size="small" onClick={() => setShowGuide(v => !v)}>{showGuide ? '收起说明' : '参数含义与安装'}</Button></Stack>
      </Stack>
      {showGuide && <Alert severity="info" sx={{ mt: 1 }}>
        PenOthers 是生成器定义的接近信号，不是 XYZ 坐标；球面等距离会把横向偏移和深度混在一起。当前 VRCFury 的 NewTip 实际测量以根部为中心的长度球，并非真实尖端，Root/Tip 仍不能确定偏移与姿态。只在自己一侧安装时，可使用下方的 SPS 根部定位诊断。
        精确方案需双方配套：Unity 中放置 Spatial Pose Socket / Plug 预制件，使用相同通道，将 Root、Tip、Side 对齐实际骨骼，Socket 的 +Z 指向孔内。24 路采样共同定位三个标记。只支持单个匹配目标和均匀缩放；拟合残差不是实际定位精度，也不能排除所有多目标混入。
      </Alert>}
      {!pose ? <Box className="pose-empty"><Typography variant="h6">等待配套定位阵列</Typography><Typography color="text.secondary">普通 OGB 参数会继续显示在下方。安装配套预制件后，这里会显示深度、横向偏移、倾角和扭转。</Typography><Typography variant="caption">路径：Sensa/Pose/v1/实例名/Self 或 Others/标记/A0…A7</Typography></Box> : <>
        <Stack direction="row" alignItems="center" gap={1.5} sx={{ my: 1.5 }} useFlexGap flexWrap="wrap">
          <FormControl size="small" sx={{ minWidth: 230 }}><InputLabel id="pose-rig-label">观测对象</InputLabel><Select labelId="pose-rig-label" label="观测对象" value={pose.key} onChange={e => setSelected(e.target.value)}>{observations.map(p => <MenuItem key={p.key} value={p.key}>{p.instance} · {p.party} · {p.sourceLabel}</MenuItem>)}</Select></FormControl>
          <Chip size="small" color={pose.engaged ? 'success' : pose.valid ? 'warning' : 'default'} label={pose.reason} />
          <Chip size="small" variant="outlined" label={`${pose.sampleCount}/24 采样`} />
          {activeKey === pose.key && <Chip size="small" color="primary" label="当前控制对象" />}
          <Button size="small" variant="outlined" onClick={() => onUseRig(pose)}>生成深度映射</Button>
          <Button size="small" onClick={() => onUseRig(pose, true)}>六轴映射（需校准）</Button>
        </Stack>
        <Box className="pose-dashboard">
          <Box><ToggleButtonGroup exclusive size="small" value={projection} onChange={(_, value) => value && setProjection(value)} aria-label="空间投影"><ToggleButton value="side">侧视深度</ToggleButton><ToggleButton value="front">正视偏移</ToggleButton></ToggleButtonGroup><PosePlot pose={pose} projection={projection} /></Box>
          <Box className="pose-metrics">
            {[
              ['插入比例', pose.valid ? `${number(pose.depth * 100)}%` : '—'],
              ['沿 Pen 已入长度', pose.valid ? `${number(pose.depth * pose.penLength * 100)} cm` : '—'],
              ['孔口横偏 X / Y', pose.valid ? `${number(pose.intersection.x * 100)} / ${number(pose.intersection.y * 100)} cm` : '—'],
              ['偏航 / 俯仰', pose.valid ? `${number(pose.yaw)}° / ${number(pose.pitch)}°` : '—'],
              ['扭转', pose.valid ? `${number(pose.roll)}°` : '—'],
              ['最大拟合残差', pose.valid || pose.residual > 0 ? `${number(pose.residual * 1000, 2)} mm` : '—'],
            ].map(([label, value]) => <Box className="pose-metric" key={label}><Typography variant="caption" color="text.secondary">{label}</Typography><Typography fontWeight={700}>{value}</Typography></Box>)}
          </Box>
        </Box>
        {pose.valid && <Typography variant="caption" display="block" color="text.secondary">Socket 轴向深度 {number(pose.axialDepth * 100)} cm · 标记轴长 {number(pose.penLength * 100)} cm · 残差只表示拟合一致性，不是实际误差。</Typography>}
        <Typography variant="caption" color="text.secondary">观测对象是标记/骨骼，不是 GPU 形变后的网格。尺寸为 Socket 局部单位。位于虚拟孔口之外、角度过大或定位无效时停止输出，不自动回退 OGB。最近参数变化：{new Date(pose.timestampMs).toLocaleTimeString()}；静止值不代表断线。</Typography>
      </>}
    </Box>
  );
}
