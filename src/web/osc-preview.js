export function globMatch(pattern, path) {
  const patterns = pattern.split('/'), segments = path.split('/');
  if (patterns.length > 64 || segments.length > 64) return false;
  let row = new Array(segments.length + 1).fill(false); row[0] = true;
  for (const segment of patterns) {
    const next = new Array(segments.length + 1).fill(false);
    if (segment === '**') next[0] = row[0];
    for (let j = 1; j <= segments.length; j++)
      next[j] = segment === '**' ? row[j] || next[j - 1] : row[j - 1] && (segment === '*' || segment === segments[j - 1]);
    row = next;
  }
  return row[segments.length];
}

export function rankPreview(entries, signals = [], { showFaceTracking = false, search = '', pinned = [], category = 'all' } = {}) {
  const term = search.trim().toLowerCase();
  return entries.map(entry => {
    const matches = signals.filter(s => matchesOscPathPattern(s.oscPath, entry.path));
    return { ...entry, _matches: matches.length ? matches : null };
  }).filter(entry => (showFaceTracking || !entry.classification?.isFaceTracking || entry._matches || pinned.includes(entry.path))
    && (category === 'all' || category === 'mapped' && entry._matches || category === 'pose' && /^Sensa\/(?:(Pose|SpsRoot|SharedRoot)\/v1|(Point|Handle)\/v[12])\//.test(entry.path)
      || category === 'related' && (entry._matches || pinned.includes(entry.path) || entry.classification?.relevance >= 40))
    && (!term || entry.path.toLowerCase().includes(term)))
    .sort((a, b) => Number(pinned.includes(b.path)) - Number(pinned.includes(a.path)) || Number(Boolean(b._matches)) - Number(Boolean(a._matches))
      || (b.classification?.relevance || 0) - (a.classification?.relevance || 0)
      || a.path.localeCompare(b.path, 'en', { numeric: true, sensitivity: 'base' })
      || (a.sourceKey || '').localeCompare(b.sourceKey || ''));
}

export function parameterMeaning(path) {
  const leaf = (path || '').split('/').at(-1);
  if (path.startsWith('Sensa/Pose/v1/')) return '定位阵列的一个距离样本，必须与同一对象的其余采样一起解算；不能直接当作深度。';
  if (path.startsWith('Sensa/SpsRoot/v1/')) return '单侧 SPS 根部阵列的距离样本；8 路共同估计根部 XYZ，仅用于诊断。不能测尖端、朝向或行程，不应直接映射运动输出。';
  if (path.startsWith('Sensa/SharedRoot/v1/')) return '共享根部阵列；必须连同 Ready、Slot 与新槽位采样判定，仅用于诊断，不能直接映射行程。';
  if (/^Sensa\/(Point|Handle)\/v[12]\//.test(path)) return '本地骨骼/PB 测量。v1 八路 / v2 四路解算参考坐标系内的位置；PB 把手仅在抓取时有效。这不是远端 SPS 或 GPU 网格位置。';
  if (/NewRoot$/.test(leaf)) return '根部表面到接收器的近接值。与同孔位 NewTip 配对估算长度；单值不能区分偏移与深度。';
  if (/NewTip$/.test(leaf)) return '当前 VRCFury 中为根部同心长度球的近接值，并非真实尖端位置。饱和不等于准确轴向深度，Root/Tip 配对也无法消除角度歧义。';
  if (/^Pen(Others|Self)$/.test(leaf)) return '近接信号：Others 表示他人，Self 表示自身。含义取决于生成器的接收器位置和半径，不是通用的位置坐标。';
  if (/Close$/.test(leaf)) return '近距离接触开关，不是连续行程值。';
  if (/^Touch/.test(leaf)) return '身体触碰信号，通常用于振动强度；具体数值取决于 Contact 的设置。';
  if (/^Frot/.test(leaf)) return '摩擦近接信号，通常用于振动；不是轴向深度。';
  if (/^Angle.*Raw$/.test(leaf)) return '侧向接收器的原始近接值，不是角度（度）；受位移与方向共同影响。';
  return '自定义参数。请确认生成它的组件、量程和方向后再映射。名称相近仅作为查找提示。';
}

export function readPinnedPaths(storage) {
  try {
    const values = JSON.parse(storage.getItem('sensa.osc.pins.v1') || '[]');
    return Array.isArray(values) ? values.filter(value => typeof value === 'string' && value.length <= 512).slice(0, 64) : [];
  } catch { return []; }
}

export function matchesOscPathPattern(pattern, actualPath) {
  const p = (pattern || '').trim();
  const a = (actualPath || '').trim();
  if (!p || !a) return false;
  if (/[;\n]/.test(p)) return p.split(/[;\n]/).filter(Boolean).slice(0, 32).some(item => matchesOscPathPattern(item.trim(), a));
  if (!p.includes('*')) return p === a; // exact match fast path
  return globMatch(p, a);
}

export function getLatestOscPreviewEntry(previewEntries, pattern, preferredSourceKey = '') {
  const matches = Array.isArray(previewEntries) ? previewEntries.filter(entry => matchesOscPathPattern(pattern, entry?.path || '')) : [];
  const candidates = preferredSourceKey ? matches.filter(entry => entry?.sourceKey === preferredSourceKey) : matches;
  if (candidates.length === 0) return null;

  const latest = candidates.reduce((current, entry) => {
    if (!current) return entry;
    return Number(entry?.timestampMs || 0) > Number(current?.timestampMs || 0) ? entry : current;
  }, null);

  return latest ? { ...latest, matchCount: candidates.length } : null;
}

export function posePreviewEntry(observations, signal, preferredSourceKey = '', activeKey = null) {
  const candidates = observations.filter(pose => (!preferredSourceKey || pose.sourceKey === preferredSourceKey)
    && ['Root', 'Tip', 'Side'].some(marker => Array.from({length:8}, (_, i) => `${pose.prefix}/${marker}/A${i}`).some(path => matchesOscPathPattern(signal.oscPath, path))));
  if (!preferredSourceKey && new Set(candidates.map(p => p.sourceKey)).size > 1)
    return { path: signal.oscPath, value: '请固定使用来源', matchCount: 0 };
  const pose = candidates.find(p => p.key === activeKey && p.valid && p.engaged)
    || [...candidates].sort((a, b) => Number(b.valid && b.engaged) - Number(a.valid && a.engaged) || b.depth - a.depth || a.key.localeCompare(b.key))[0];
  if (!pose) return null;
  const numericValue = pose.valid && pose.engaged ? ({Depth:pose.depth,OffsetX:pose.intersection.x,OffsetY:pose.intersection.y,Yaw:pose.yaw,Pitch:pose.pitch,Roll:pose.roll}[signal.poseMetric || 'Depth']) : undefined;
  return { path: pose.prefix, value: numericValue === undefined ? pose.reason : Number(numericValue.toFixed(4)).toString(), numericValue, timestampMs:pose.timestampMs, sourceKey:pose.sourceKey, sourceLabel:pose.sourceLabel, matchCount:pose.sampleCount };
}

export function pointPreviewEntry(observations, signal, preferredSourceKey = '') {
  const points = observations.filter(p => ['Point', 'Handle'].includes(p.kind) && (!preferredSourceKey || p.sourceKey === preferredSourceKey)
    && Array.from({length:/^Sensa\/(Point|Handle)\/v2\//.test(p.prefix)?4:8}, (_,i) => `${p.prefix}/Root/A${i}`).some(path => matchesOscPathPattern(signal.oscPath,path)));
  if (points.length !== 1) return {path:signal.oscPath,value:points.length ? '请限定唯一测量点与来源' : '等待本地点采样'};
  const p = points[0];
  const value = p.valid ? ({X:p.position.x,Y:p.position.y,Z:p.position.z,Distance:Math.hypot(p.position.x,p.position.y,p.position.z)}[signal.pointMetric || 'Z']) : undefined;
  return {path:p.prefix,value:value === undefined ? p.reason : Number(value.toFixed(4)).toString(),numericValue:value,sourceKey:p.sourceKey,matchCount:p.sampleCount};
}

export function isOgbOscPath(path) {
  return (path || '').trim().toUpperCase().startsWith('OGB/');
}

export function compareOscPathSuggestions(left, right) {
  const leftPath = (left || '').trim();
  const rightPath = (right || '').trim();
  const leftPriority = isOgbOscPath(leftPath) ? 0 : 1;
  const rightPriority = isOgbOscPath(rightPath) ? 0 : 1;

  if (leftPriority !== rightPriority) return leftPriority - rightPriority;
  return leftPath.localeCompare(rightPath, 'en', { numeric: true, sensitivity: 'base' });
}

export function buildOscPathSuggestions(previewEntries, queryNodes = []) {
  const previewPaths = (Array.isArray(previewEntries) ? previewEntries : []).map(entry => (entry?.path || '').trim());
  const queryPaths = (Array.isArray(queryNodes) ? queryNodes : []).map(node => (node?.path || '').trim());
  const hints = new Map(previewEntries.map(e => [e.path, e.classification]));
  return Array.from(new Set([...previewPaths, ...queryPaths].filter(Boolean))).sort((a, b) =>
    (hints.get(b)?.relevance || 0) - (hints.get(a)?.relevance || 0) || compareOscPathSuggestions(a, b));
}

export function filterOscPreviewEntriesBySource(previewEntries, sourceKey = '') {
  if (!sourceKey) return Array.isArray(previewEntries) ? previewEntries : [];
  return (Array.isArray(previewEntries) ? previewEntries : []).filter(entry => entry?.sourceKey === sourceKey);
}

