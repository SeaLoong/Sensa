import { t } from './i18n.js';
// Reuse compiled patterns across live snapshots. Neither
// cache stores incoming values, so data freshness always comes from the caller.
const comparePaths = (left, right) => left < right ? -1 : left > right ? 1 : 0;
const sourceCollator = new Intl.Collator();
const compiledPatterns = new Map();
const MAX_COMPILED_PATTERNS = 256;

function matchSegments(patterns, segments) {
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

export function globMatch(pattern, path) {
  return matchSegments(pattern.split('/'), path.split('/'));
}

export function compileOscPathPattern(pattern) {
  const text = (pattern || '').trim();
  if (compiledPatterns.has(text)) {
    const existing = compiledPatterns.get(text);
    compiledPatterns.delete(text); compiledPatterns.set(text, existing);
    return existing;
  }
  const alternatives = (/[;\n]/.test(text) ? text.split(/[;\n]/).filter(Boolean).slice(0, 32) : [text])
    .map(value => value.trim()).filter(Boolean).map(value => {
      const segments = value.split('/');
      return { exact: !value.includes('*'), text: value, segments,
        required: segments.filter(segment => segment && segment !== '*' && segment !== '**').map(segment => '/' + segment + '/') };
    });
  const matcher = actualPath => {
    const actual = (actualPath || '').trim();
    if (!actual) return false;
    let segments;
    const framed = '/' + actual + '/';
    return alternatives.some(value => value.exact ? value.text === actual
      : value.required.every(segment => framed.includes(segment))
        && matchSegments(value.segments, segments || (segments = actual.split('/'))));
  };
  compiledPatterns.set(text, matcher);
  if (compiledPatterns.size > MAX_COMPILED_PATTERNS) compiledPatterns.delete(compiledPatterns.keys().next().value);
  return matcher;
}

function mappingIndex(signals) {
  const exact = new Map(), wildcard = [];
  signals.forEach((signal, index) => {
    const pattern = (signal.oscPath || '').trim();
    if (!pattern) return;
    if (!/[*;\n]/.test(pattern)) {
      const matches = exact.get(pattern) || [];
      matches.push(index); exact.set(pattern, matches);
    } else wildcard.push({ index, matches: compileOscPathPattern(pattern) });
  });
  return path => {
    const result = [...(exact.get(path.trim()) || [])];
    for (const mapping of wildcard) if (mapping.matches(path)) result.push(mapping.index);
    return result.sort((a, b) => a - b);
  };
}

// Hide explicit namespaces, including controls unknown to the server classifier.
// 按明确命名空间前缀隐藏，也覆盖服务端尚未识别的控制参数。
export function isFaceTrackingPath(path) {
  const normalized = String(path || '').replace(/^\/+|\/+$/g, '').replace(/^avatar\/parameters\//, '');
  return /^(?:FT|v2)\//i.test(normalized);
}

function selectPreview(entries, signals, { showFaceTracking = false, search = '', pinned = [], category = 'all' } = {}) {
  const term = search.trim().toLowerCase(), pinnedSet = new Set(pinned), matchPath = mappingIndex(signals);
  const pathMatches = new Map();
  const selected = [];
  entries.forEach((entry, index) => {
    const path = entry.path;
    if (term && !path.toLowerCase().includes(term)) return;
    if (category === 'pose' && !/^Sensa\/(?:(?:SPS|Shader|Contact)\/|(?:Pose|Point|Handle)\/v1\/)/.test(path)) return;
    if (!pathMatches.has(path)) pathMatches.set(path, matchPath(path));
    const matches = pathMatches.get(path), mapped = matches.length > 0, isPinned = pinnedSet.has(path);
    if (!showFaceTracking && isFaceTrackingPath(path) && !mapped && !isPinned) return;
    if (category === 'mapped' && !mapped) return;
    if (category === 'related' && !mapped && !isPinned && !(entry.classification?.relevance >= 40)) return;
    if (!['all', 'mapped', 'related', 'pose'].includes(category)) return;
    selected.push({ index, path, sourceKey: entry.sourceKey || '', matches, mapped, pinned: isPinned,
      relevance: entry.classification?.relevance || 0 });
  });
  return selected.sort((a, b) => Number(b.pinned) - Number(a.pinned) || Number(b.mapped) - Number(a.mapped)
    || b.relevance - a.relevance || comparePaths(a.path, b.path) || sourceCollator.compare(a.sourceKey, b.sourceKey));
}

function previewRows(entries, signals, selected) {
  return selected.map(row => ({ ...entries[row.index], _matches: row.mapped ? row.matches.map(index => signals[index]) : null }));
}

export function rankPreview(entries, signals = [], options = {}) {
  return previewRows(entries, signals, selectPreview(entries, signals, options));
}

// Ranking depends on identities, relevance and filter settings, not on the live
// numeric values or timestamps. Keep only the latest catalog's structure and
// matched mapping indices; rebuild when even an in-place configuration changes.
export function createOscPreviewRanker() {
  let previousEntries = [], previousPatterns = [], previousPinned = [], previousOptions = {}, selected;
  return (entries, signals = [], options = {}) => {
    const showFaceTracking = options.showFaceTracking || false, search = (options.search || '').trim().toLowerCase();
    const category = options.category || 'all', pinned = options.pinned || [];
    const same = selected && previousEntries.length === entries.length && previousPatterns.length === signals.length
      && previousPinned.length === pinned.length && previousPinned.every((path, index) => path === pinned[index])
      && previousOptions.showFaceTracking === showFaceTracking && previousOptions.search === search && previousOptions.category === category
      && previousPatterns.every((pattern, index) => pattern === signals[index].oscPath)
      && previousEntries.every((entry, index) => entry.path === entries[index].path && entry.sourceKey === entries[index].sourceKey
        && entry.relevance === (entries[index].classification?.relevance || 0));
    if (!same) {
      selected = selectPreview(entries, signals, options);
      previousEntries = entries.map(entry => ({ path: entry.path, sourceKey: entry.sourceKey, relevance: entry.classification?.relevance || 0 }));
      previousPatterns = signals.map(signal => signal.oscPath);
      previousPinned = [...pinned];
      previousOptions = { showFaceTracking, search, category };
    }
    return previewRows(entries, signals, selected);
  };
}

export function probePresentation(path) {
  const normalized = String(path || '').replace(/^\/avatar\/parameters\//, '');
  const fixed = /^Sensa\/SPS\/[^/]+\/P([0-3])$/.exec(normalized);
  if (fixed) {
    const index = Number(fixed[1]);
    return { label: t('固定接收器 P{0}', [index]), color: ['#E85D75', '#54B7FF', '#77D970', '#FFC857'][index], index,
      marker: 'Root', hint: t('此接收器测量根部标记离它有多近。需要 P0–P3 四路距离和 Sample 更新信号，才能计算位置。') };
  }
  const match = normalized.match(/^Sensa\/(Pose|Point|Handle)\/v1\/.+\/(Root|Tip|Side)\/A([0-7])$/);
  if (!match) return null;
  const index = Number(match[3]);
  if ((match[1] === 'Point' || match[1] === 'Handle') && index >= 4) return null;
  const colors = ['#E85D75','#54B7FF','#77D970','#FFC857','#C792EA','#54DED2','#FF975C','#E6E6E6'];
  const prefix = match[1] === 'Point' || match[1] === 'Handle' ? 'P' : 'C';
  return { label: t("定位探针 {0}{1}", [prefix, index + 1]), color: colors[index], index, marker: match[2],
    hint: t("{0}{1} 测量 {3} 标记的接近程度，属于{2}测量组，对应路径末尾 A{4} 和场景中的同色标记。请用整组读数计算位置，再校准设备行程。", [prefix, index + 1, prefix === 'P' ? t("四点") : t("八点"), match[2], index]) };
}

export function parameterMeaning(path) {
  const normalized = String(path || '').replace(/^\/avatar\/parameters\//, '');
  const probe = probePresentation(normalized);
  return (probe ? `${probe.hint} ` : '') + baseParameterMeaning(normalized);
}

function baseParameterMeaning(path) {
  const leaf = path.split('/').at(-1);
  if (/^Sensa\/Contact\/[^/]+\//.test(path)) {
    if (leaf === 'Sample') return t('Sample=0 表示 Contact 测量已停止或失效；1/32…1 循环变化表示生产端仍在更新。Sensa 同时检查自身发送器、接近值和完整参数。');
    if (leaf === 'Radius') return t('Radius 是接收器当前的世界覆盖半径，单位为米。它随 Avatar 缩放更新，用于检查接收范围。');
    if (leaf === 'Proximity') return t('Contact 接近值在 0–1 之间。大于 0 表示选中了匹配的发送器；多个发送器同时进入时，SDK 选择接近值最大的一个。');
    if (leaf === 'Proximity_SenderType') return t('发送器类型：0 无目标，1 自身 Avatar，2 其他 Avatar，3 世界。Sensa 专用根点使用自身发送器，并用独立碰撞通道配对。');
    if (/^Proximity_SenderLocalPosition[XYZ]$/.test(leaf)) return t('SDK 直接报告发送器形状中心相对接收器中心的坐标，单位为米。Sensa 接收器采用 Avatar 根的原点和旋转轴；坐标保留实际米制距离。');
    if (/^Proximity_SenderVelocity[XYZ]$/.test(leaf)) return t('SDK 报告接触点处发送器相对接收器的速度分量，单位为 m/s，方向采用接收器坐标轴。速度包含旋转产生的运动。');
    if (leaf === 'Proximity_SenderVelocityMagnitude') return t('SDK 报告接触点处的相对速率，单位为 m/s。可校准为振动强度，并通过空间输入检查控制有效性。');
    if (leaf === 'Proximity_ProximitySpeed') return t('接近值每秒的变化率，单位为 /s。正值表示接近值增加，负值表示接近值减少；可单独校准为动作强度。');
  }
  if (path.startsWith('Sensa/Pose/v1/')) return t('这是一个接收器的距离读数。Sensa 使用同一对象的完整测量组计算位置与朝向，再通过空间映射转换为设备动作。');
  if (/^Sensa\/SPS\/[^/]+\//.test(path)) {
    if (leaf === 'Sample') return t('Sample=0 表示测量已停用或失效；1/32…1 循环变化表示 Avatar 正在发送更新。超时后 Sensa 会停用这组位置。四路距离分别接收，Sample 用于检查更新是否持续。');
    return t('P0–P3 的值在 0–1 之间，越大表示根部标记越靠近接收器。Sensa 用四路读数计算根部相对 Avatar 的位置；朝向需使用三点定位。距离换算：d=R×(1−p)+r。');
  }
  if (path.startsWith('Sensa/Shader/')) {
    if (leaf === 'Frame') return t('Frame 是编码画面的 16 位循环序号。Sensa 用它检测画面是否持续更新；序号冻结后会超时停用位置。画面延迟和模型更新情况需另外检查。');
    if (leaf === 'Valid') return t('Valid=1 标记一组完整坐标已发送，Sensa 随后使用这次更新；Valid=0 立即停用位置。恢复时需重新发送完整坐标和更新后的 Frame。');
    return t('X/Y/Z 是 Avatar 根局部坐标，分别表示相对 Avatar 的左右、上下和前后位置。桥接程序按 Frame、X、Y、Z、Valid 的顺序发送一组完整更新。');
  }
  if (path.startsWith('Sensa/Diagnostics/Shader/')) return t('此测试画面用于检查捕获与传输。完成后，请在真实客户端捕获原生编码画面，验证坐标变化后再创建映射。');
  if (/^Sensa\/(Point|Handle)\/v1\//.test(path)) return t('使用四路距离，测量本地骨骼或 PhysBone（PB）把手相对参考对象的位置。PB 把手在抓取时提供有效位置。');
  if (/^VFH\/Zone\/Touch\/.+\/(Self|Others)$/.test(path)) return t('独立触摸区的接触强度，用于振动映射；Self 表示自身，Others 表示他人。触摸区按自身半径检测，接触时即可生效。');
  if (/^(VFH\/Version\/\d+|OGB\/(Pen|Orf)\/.+\/Version\/\d+)$/.test(path)) return t('Haptics 功能标记，帮助软件识别当前 Avatar 支持的接触参数。');
  if (/^OGB\/(Orf|Pen)\//.test(path)) {
    if (/^Pen(Self|Others)NewRoot$/.test(leaf)) return t("SPS2 · {0}：测量根部表面与接收器的接近程度。与同一对象的 NewTip 配对后，Sensa 估算长度并计算插入比例。", [leaf]);
    if (/^Pen(Self|Others)NewTip$/.test(leaf)) return t("SPS2 · {0}：测量以根部为球心、半径等于长度的球体接近程度。与 NewRoot 配对估算长度；实际插入比例也会受到横向偏移和角度影响。", [leaf]);
    if (/^Pen(Others|Self)$/.test(leaf)) return path.startsWith('OGB/Orf/')
      ? t("SPS1 · {0}：接收器的接近程度，数值越大表示接触越近。使用同一对象的 Close 判断是否进入接触范围，再校准动作行程。", [leaf])
      : t('Plug · {0}：感知 Socket 入口到 Plug 根部的接近程度。对齐时可作为进入深度参考，再将两端读数校准为设备行程。', [leaf]);
    if (/^Pen(Self|Others)Close$/.test(leaf)) return t("SPS1 · {0}：进入近距离接触范围时打开，离开时关闭。配合同一对象的 PenOthers 或 PenSelf 控制动作何时生效。", [leaf]);
    if (/Close$/.test(leaf)) return t('{0}：接触范围开关，进入对应的触摸或摩擦范围时打开，离开时关闭。与同一对象的接触强度配对，控制振动何时生效。', [leaf]);
    if (/^Touch/.test(leaf)) return t("身体触碰信号，通常用于振动强度；具体数值取决于 Contact 的设置。");
    if (/^Frot/.test(leaf)) return t("摩擦接触强度，可映射为振动；数值含义由接收器的位置和半径决定。");
  }
  return t("自定义参数。请确认生成它的组件、量程和方向后再映射。名称相近仅作为查找提示。");
}

export function readPinnedPaths(storage) {
  try {
    const values = JSON.parse((storage || globalThis.localStorage).getItem('sensa.osc.pins.v1') || '[]');
    return Array.isArray(values) ? values.filter(value => typeof value === 'string' && value.length <= 512).slice(0, 64) : [];
  } catch { return []; }
}

export function matchesOscPathPattern(pattern, actualPath) {
  return compileOscPathPattern(pattern)(actualPath);
}

export function getLatestOscPreviewEntry(previewEntries, pattern, preferredSourceKey = '') {
  const match = compileOscPathPattern(pattern);
  let latest = null, matchCount = 0;
  for (const entry of Array.isArray(previewEntries) ? previewEntries : []) {
    if ((preferredSourceKey && entry?.sourceKey !== preferredSourceKey) || !match(entry?.path)) continue;
    matchCount++;
    if (!latest || Number(entry?.timestampMs || 0) > Number(latest?.timestampMs || 0)) latest = entry;
  }
  return latest ? { ...latest, matchCount } : null;
}

// One immutable incoming snapshot, indexed once for all mapping-row previews.
// Exact paths avoid catalog scans; wildcard aliases share bounded candidate lists.
export function createOscPreviewLookup(previewEntries) {
  const entries = Array.isArray(previewEntries) ? previewEntries : [], byPath = new Map(), byRoot = new Map();
  const add = (map, key, index) => { const values = map.get(key) || []; values.push(index); map.set(key, values); };
  entries.forEach((entry, index) => {
    const path = (entry?.path || '').trim();
    if (!path) return;
    add(byPath, path, index); add(byRoot, path.split('/', 1)[0], index);
  });
  const candidatesByPattern = new Map();
  return (pattern, preferredSourceKey = '') => {
    const text = (pattern || '').trim();
    let candidates = candidatesByPattern.get(text);
    if (!candidates) {
      const alternatives = (/[;\n]/.test(text) ? text.split(/[;\n]/).filter(Boolean).slice(0, 32) : [text])
        .map(value => value.trim()).filter(Boolean);
      const indices = new Set();
      for (const alternative of alternatives) {
        if (!alternative.includes('*')) {
          for (const index of byPath.get(alternative) || []) indices.add(index);
        } else {
          const first = alternative.split('/', 1)[0], match = compileOscPathPattern(alternative);
          const possible = first === '*' || first === '**' ? entries.keys() : byRoot.get(first) || [];
          for (const index of possible) if (match(entries[index]?.path)) indices.add(index);
        }
      }
      candidates = [...indices].sort((a, b) => a - b);
      candidatesByPattern.set(text, candidates);
      if (candidatesByPattern.size > MAX_COMPILED_PATTERNS) candidatesByPattern.delete(candidatesByPattern.keys().next().value);
    }
    let latest = null, matchCount = 0;
    for (const index of candidates) {
      const entry = entries[index];
      if (preferredSourceKey && entry.sourceKey !== preferredSourceKey) continue;
      matchCount++;
      if (!latest || Number(entry?.timestampMs || 0) > Number(latest?.timestampMs || 0)) latest = entry;
    }
    return latest ? { ...latest, matchCount } : null;
  };
}

export function posePreviewEntry(observations, signal, preferredSourceKey = '', activeKey = null) {
  const candidates = observations.filter(pose => (!preferredSourceKey || pose.sourceKey === preferredSourceKey)
    && ['Root', 'Tip', 'Side'].some(marker => Array.from({length:8}, (_, i) => `${pose.prefix}/${marker}/A${i}`).some(path => matchesOscPathPattern(signal.oscPath, path))));
  if (!preferredSourceKey && new Set(candidates.map(p => p.sourceKey)).size > 1)
    return { path: signal.oscPath, value: t("请固定使用来源"), matchCount: 0 };
  const pose = candidates.find(p => p.key === activeKey && p.valid && p.engaged)
    || [...candidates].sort((a, b) => Number(b.valid && b.engaged) - Number(a.valid && a.engaged) || b.depth - a.depth || a.key.localeCompare(b.key))[0];
  if (!pose) return null;
  const numericValue = pose.valid && pose.engaged ? ({Depth:pose.depth,OffsetX:pose.intersection.x,OffsetY:pose.intersection.y,Yaw:pose.yaw,Pitch:pose.pitch,Roll:pose.roll}[signal.poseMetric || 'Depth']) : undefined;
  return { path: pose.prefix, value: numericValue === undefined ? pose.reason : Number(numericValue.toFixed(4)).toString(), numericValue, timestampMs:pose.timestampMs, sourceKey:pose.sourceKey, sourceLabel:pose.sourceLabel, matchCount:pose.sampleCount };
}

function canMapPoint(point) {
  return ['Point', 'Handle'].includes(point?.kind) || ['SpsRoot', 'ShaderRoot', 'ContactRoot'].includes(point?.kind) && point.party === 'Self' && point.isMappablePoint === true;
}

const positionMetrics = ['X', 'Y', 'Z', 'Distance'];
const velocityMetrics = ['VelocityX', 'VelocityY', 'VelocityZ', 'Speed', 'ProximitySpeed'];

export function pointMetricOptions(point) {
  const metrics = point?.kind === 'ContactRoot'
    ? [...positionMetrics, ...velocityMetrics.filter(metric => point.supportedMetrics?.includes(metric) || point.supportsVelocity)]
    : positionMetrics;
  const labels = { X: 'X', Y: 'Y', Z: 'Z', Distance: t('距参考原点'),
    VelocityX: t('X 相对速度（m/s）'), VelocityY: t('Y 相对速度（m/s）'), VelocityZ: t('Z 相对速度（m/s）'),
    Speed: t('相对速率（m/s）'), ProximitySpeed: t('接近值变化率（/s）') };
  return metrics.map(value => ({ value, label: labels[value] }));
}

export function pointMetricValue(point, metric) {
  if (!pointMetricOptions(point).some(option => option.value === metric)) return undefined;
  const { x, y, z } = point?.position || {};
  const value = { X: x, Y: y, Z: z, Distance: Math.hypot(x, y, z),
    VelocityX: point?.velocity?.x, VelocityY: point?.velocity?.y, VelocityZ: point?.velocity?.z,
    Speed: point?.speed, ProximitySpeed: point?.proximitySpeed }[metric];
  return Number.isFinite(value) ? value : undefined;
}

export function pointTrackingLabel(point) {
  if (point?.kind === 'ContactRoot') return t('Contact 直接定位（SDK Beta）');
  if (point?.kind === 'SpsRoot') return t('四点定位');
  return point?.kind || '';
}

export function pointPreviewEntry(observations, signal, preferredSourceKey = '') {
  const points = observations.filter(p => canMapPoint(p) && (!preferredSourceKey || p.sourceKey === preferredSourceKey)
    && (p.measurementPaths?.length ? p.measurementPaths : p.kind === 'ShaderRoot' ? ['X', 'Y', 'Z'].map(axis => `${p.prefix}/${axis}`)
      : Array.from({length:p.expectedSampleCount || 4}, (_,i) => p.kind === 'SpsRoot' ? `${p.prefix}/P${i}` : `${p.prefix}/Root/A${i}`)).some(path => matchesOscPathPattern(signal.oscPath,path)));
  if (points.length !== 1) return {path:signal.oscPath,value:points.length ? t("请限定唯一测量点与来源") : t("等待本地点采样")};
  const p = points[0];
  const value = p.valid ? pointMetricValue(p, signal.pointMetric || 'Z') : undefined;
  return {path:p.prefix,value:value === undefined ? p.reason : Number(value.toFixed(4)).toString(),numericValue:value,sourceKey:p.sourceKey,matchCount:p.sampleCount};
}

export function capturePointEndpoint(point, metric) {
  if (!point?.valid || !canMapPoint(point) || !point.key || !point.position) return null;
  const {x,y,z} = point.position;
  const value = pointMetricValue(point, metric);
  if (![x,y,z,value].every(Number.isFinite)) return null;
  return {key:point.key,prefix:point.prefix,sourceKey:point.sourceKey,metric,value};
}

export function calibratedPointDraft(point, metric, zero, full) {
  if (!point || !canMapPoint(point) || !pointMetricOptions(point).some(option => option.value === metric)) return {error:t("请选择可映射的测量点与轴")};
  if (!zero || !full) return {error:t("请分别采集 0% 和 100% 位置")};
  if ([zero,full].some(sample=>sample.key!==point.key || sample.prefix!==point.prefix || sample.sourceKey!==point.sourceKey || sample.metric!==metric || !Number.isFinite(sample.value)))
    return {error:t("测量对象、来源或轴已改变，请重新采集")};
  if (Math.abs(full.value-zero.value)<.001) return {error:velocityMetrics.includes(metric) ? t('两个采样值过于接近，请扩大变化范围') : t("两个位置相距不足 1 mm，请扩大校准范围")};
  return {draft:{oscPath:`${point.prefix}/**`,sourceMode:'SensaPoint',pointMetric:metric,role:velocityMetrics.includes(metric) ? 'V0' : 'Depth',
    vrchatMin:Math.min(zero.value,full.value),vrchatMax:Math.max(zero.value,full.value),invertDirection:full.value<zero.value}};
}

export function pointCalibrationProgress(point, metric, zero, full) {
  const endpoint=capturePointEndpoint(point,metric);
  if (!endpoint || !calibratedPointDraft(point,metric,zero,full).draft) return null;
  const raw=(endpoint.value-zero.value)/(full.value-zero.value);
  return {percent:Math.max(0,Math.min(100,raw*100)),outside:raw<0 || raw>1};
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
  return comparePaths(leftPath, rightPath);
}

export function buildOscPathSuggestions(previewEntries, queryNodes = []) {
  const preview = Array.isArray(previewEntries) ? previewEntries : [], nodes = Array.isArray(queryNodes) ? queryNodes : [];
  const previewPaths = preview.map(entry => (entry?.path || '').trim());
  const queryPaths = nodes.map(node => (node?.path || '').trim());
  const hints = new Map(preview.map(e => [e.path, e.classification]));
  return Array.from(new Set([...previewPaths, ...queryPaths].filter(Boolean))).sort((a, b) =>
    (hints.get(b)?.relevance || 0) - (hints.get(a)?.relevance || 0) || compareOscPathSuggestions(a, b));
}

export function createOscPathSuggester() {
  let previousPreview = [], previousQuery = [], suggestions;
  return (previewEntries, queryNodes = []) => {
    const preview = Array.isArray(previewEntries) ? previewEntries : [], nodes = Array.isArray(queryNodes) ? queryNodes : [];
    if (!suggestions || previousPreview.length !== preview.length || previousQuery.length !== nodes.length
      || !previousPreview.every((entry, index) => entry.path === preview[index].path && entry.relevance === (preview[index].classification?.relevance || 0))
      || !previousQuery.every((path, index) => path === nodes[index].path)) {
      suggestions = buildOscPathSuggestions(preview, nodes);
      previousPreview = preview.map(entry => ({ path: entry.path, relevance: entry.classification?.relevance || 0 }));
      previousQuery = nodes.map(node => node.path);
    }
    return suggestions;
  };
}

export function filterOscPreviewEntriesBySource(previewEntries, sourceKey = '') {
  if (!sourceKey) return Array.isArray(previewEntries) ? previewEntries : [];
  return (Array.isArray(previewEntries) ? previewEntries : []).filter(entry => entry?.sourceKey === sourceKey);
}

