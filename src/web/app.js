import { editConfiguration } from './configuration.js';
import { manualCommandPayload } from './input-workflows.js';
import { attachPageLifecycle, createInitialSnapshotLoader, createRealtimeSession } from './realtime-session.js';
import { loadStudio, saveStudio, sanitizeStudio } from './preferences.js';
import { DEFAULT_SCRIPT_SETTINGS, DEFAULT_STUDIO_STATE, EMPTY_MANUAL, INPUT_MODES, MANUAL_AXES, MANUAL_DEFAULT_INTERVAL_MS, MANUAL_DEFAULT_SPEED, MANUAL_INTERVAL_MAX_MS, MANUAL_MOTION_MODE_OPTIONS, SCRIPT_SEEK_ACTIONS, SCRIPT_SHORTCUT_GROUPS, SCRIPT_SPEED_MAX, SCRIPT_SPEED_MIN, SCRIPT_SPEED_PRESETS, SCRIPT_SPEED_STEP, clampScriptPositionMs, clampScriptSpeed, formatDuration, formatMode, formatScriptSpeedLabel, getScriptShortcutAvailability, getScriptStateMeta, normalizeManualCommand, normalizeManualMotionMode, normalizeManualMotionValueByMode, normalizeScriptLoopRange, normalizeScriptSettingsState, normalizeStoredScriptDefaults, parseScriptTimecodeInput, shouldIgnoreScriptShortcutTarget } from './input-workflows.js';
import { AXIS_LIMIT_MAX_SPEED, AXIS_LIMIT_MIN_SPEED, AXIS_PROFILE_DEFS, AXIS_PROFILE_PRESETS, DEFAULT_OSC_HUB_RATE, OSC_HUB_MODE_OPTIONS, OUTPUT_SLOPE_MODE_OPTIONS, OUTPUT_TYPES, OUTPUT_TYPE_BY_VALUE, SIGNAL_ROLE_OPTIONS, SPEED_UNIT_BASE_OPTIONS, buildAxisProfileAxisRows, buildNewProfileDialogDraft, buildOscDraftFromConfig, buildOscHubTargetConflictLookup, buildOutputDialogDraft, buildOutputSummary, buildPresetDialogDraft, buildProfileDialogDraft, buildSignalDrafts, buildSignalOverlapWarnings, cloneMotionProfile, computeSignalHash, createAxisProfilePresetMotion, createOutputConfig, flattenOscHubConflictMessages, formatAxisPositionFromNormalized, formatOutputTargetConflictMessage, formatSlopeModeLabel, formatSpeedUnitBaseLabel, getAxisProfile, getAxisProfiles, getDefaultAxisProfile, getDefaultAxisProfileId, getNextAvailableOscHubPort, getOscMappingPreset, getOscMappingPresets, getOutputConfig, getOutputDisplayName, getOutputOverview, getOutputTargetConflicts, getOutputTypeLabel, getOutputs, isTCodeOutputType, makeOscHubTargetDraft, makeSignalDraft, normalizeOscHubMode, normalizeOscHubRate, normalizeOutputSlopeMode, normalizeSerialPorts, normalizeSpeedUnitBase, stripSignalDraft } from './configuration.js';
import { LOG_LEVEL_ORDER, formatAxisTraceAction, formatRealtimeStatus, normalizeLogs } from './diagnostics.js';
import { buildOscSourceSelectionOptions, formatOscSourceLabel, formatPreviewTimestamp } from './osc-workspace.js';
import { AxisSlider, HelpLabel, ScriptActionButtonLabel, ScriptHotkeyItem, SelectField, SliderControl, TabPanel, ValueSliderField } from './controls.jsx';
import { ScriptTimelineDensity } from './script-timeline.jsx';
import { MotionAxisEditor, OscHubTargetRow, SignalMappingRow } from './configuration-views.jsx';
import { AxisTraceLogEntry, PlainLogEntry, TCodeDeviceInfoCard } from './diagnostic-views.jsx';

import { t, getLocale, subscribeLocale, setLocale, docUrl, diagnostic } from './i18n.js';
import { zhCN, enUS } from '@mui/material/locale';
import React from 'react';
import PosePanel from './PosePanel.jsx';
import SpsRootPanel from './SpsRootPanel.jsx';
import OutputPositionPanel from './OutputPositionPanel.jsx';
import HelpDialog from './HelpDialog.jsx';
import OscFlowStatus from './OscFlowStatus.jsx';

import * as ReactDOM from 'react-dom/client';
import * as MaterialUI from '@mui/material';
import { probePresentation, pointPreviewEntry, posePreviewEntry, parameterMeaning, readPinnedPaths, rankPreview, getLatestOscPreviewEntry, buildOscPathSuggestions, filterOscPreviewEntriesBySource } from './osc-preview.js';
import BUILT_IN_OSC_MAPPING_PRESETS from './data/osc-presets.json';
const {
  Alert,
  Autocomplete,
  AppBar,
  Box,
  Button,
  Card,
  CardContent,
  CardHeader,
  Chip,
  CssBaseline,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Divider,
  FormControl,
  FormControlLabel,
  InputLabel,
  LinearProgress,
  MenuItem,
  Select,
  Slider,
  Snackbar,
  Stack,
  Switch,
  Tab,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Tabs,
  TextField,
  Tooltip,
  Toolbar,
  Typography,
  createTheme,
  ThemeProvider,
} = MaterialUI;

const { useEffect, useMemo, useRef, useState } = React;

const WS_URL = `${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/api/ws`;

function buildInitialAppState() {
  const studio = sanitizeStudio(loadStudio() || DEFAULT_STUDIO_STATE);
  const config = null;
  const overview = null;
  const logs = [];
  const serialPorts = [];
  const oscDraft = buildOscDraftFromConfig(config);
  const signalDrafts = [];
  const manualDraft = EMPTY_MANUAL;
  const manualMotionMode = 'Default';
  const manualMotionValue = MANUAL_DEFAULT_SPEED;
  const scriptSettings = normalizeScriptSettingsState(null, studio.scriptDefaults);

  return {
    config,
    overview,
    logs,
    studio,
    serialPorts,
    oscDraft,
    signalDrafts,
    manualDraft,
    manualMotionMode,
    manualMotionValue,
    scriptSettings,
    loading: true,
    scriptSettingsInitialized: false,
  };
}

function App() {
  const [realtime] = useState(() => createRealtimeSession({ url: WS_URL }));
  const apiRequest = (path, options) => realtime.request(path, options);
  const locale = React.useSyncExternalStore(subscribeLocale, getLocale);
  const initialState = useMemo(() => buildInitialAppState(), [getLocale()]);
  const [config, setConfig] = useState(initialState.config);
  const [overview, setOverview] = useState(initialState.overview);
  const [logs, setLogs] = useState(initialState.logs);
  const [studio, setStudio] = useState(initialState.studio);
  const [serialPorts, setSerialPorts] = useState(initialState.serialPorts);
  const [oscDraft, setOscDraft] = useState(initialState.oscDraft);
  const [signalDrafts, setSignalDrafts] = useState(initialState.signalDrafts);
  const [selectedOscPreset, setSelectedOscPreset] = useState('');
  const [previewLimit, setPreviewLimit] = useState(100);
  const [showFaceTracking, setShowFaceTracking] = useState(false);
  const [previewCategory, setPreviewCategory] = useState('all');
  const [frozenPreview, setFrozenPreview] = useState(null);
  const [pinnedPaths, setPinnedPaths] = useState(() => readPinnedPaths());
  const [parameterDetail, setParameterDetail] = useState(null);
  const [oscPreviewSearch, setOscPreviewSearch] = useState('');
  const [oscSettingsTab, setOscSettingsTab] = useState('basic');
  const [oscWorkspaceTab,setOscWorkspaceTab]=useState('setup');
  const [helpOpen,setHelpOpen]=useState(false);
  const [previewSourceTab, setPreviewSourceTab] = useState('all');
  const [presetDialog, setPresetDialog] = useState(null);
  const [profileDialog, setProfileDialog] = useState(null);
  const [dialog, setDialog] = useState(null);
  const [manualDraft, setManualDraft] = useState(initialState.manualDraft);
  const [manualMotionMode, setManualMotionMode] = useState(initialState.manualMotionMode);
  const [manualMotionValue, setManualMotionValue] = useState(initialState.manualMotionValue);
  const [manualContinuous, setManualContinuous] = useState(false);
  const [scriptSettings, setScriptSettings] = useState(initialState.scriptSettings);
  const [scriptSeekDraft, setScriptSeekDraft] = useState(0);
  const [scriptSeekDragging, setScriptSeekDragging] = useState(false);
  const [scriptJumpInput, setScriptJumpInput] = useState('');
  const [scriptHelperTab, setScriptHelperTab] = useState('help');
  const [selectedScriptFile, setSelectedScriptFile] = useState(null);
  const [scriptFileInputKey, setScriptFileInputKey] = useState(0);
  const [loading, setLoading] = useState(initialState.loading);
  const [busyKey, setBusyKey] = useState('');
  const [wsState, setWsState] = useState('connecting');
  const [snackbar, setSnackbar] = useState({ open: false, message: '', severity: 'info' });
  const [logFilterLevel, setLogFilterLevel] = useState('info');
  const [logCategoryFilter, setLogCategoryFilter] = useState('');
  const [logSearchText, setLogSearchText] = useState('');
  const [logOnlyAxis, setLogOnlyAxis] = useState(false);
  const [logAxisFilter, setLogAxisFilter] = useState('');
  const [logActionFilter, setLogActionFilter] = useState('');
  const [confirmClearMappings, setConfirmClearMappings] = useState(false);
  const manualDraftRef = useRef(initialState.manualDraft);
  const manualMotionModeRef = useRef(initialState.manualMotionMode);
  const manualMotionValueRef = useRef(initialState.manualMotionValue);
  const savedSignalsHashRef = useRef(computeSignalHash(initialState.signalDrafts));
  const scriptSettingsInitializedRef = useRef(initialState.scriptSettingsInitialized);

  const studioState = studio || DEFAULT_STUDIO_STATE;
  const outputs = getOutputs(config);
  const axisProfiles = getAxisProfiles(config);
  const actualInputMode = overview?.input?.mode || studioState.preferredInputTab || 'manual';
  const runtimeOverview = overview?.runtime || overview?.loop || null;
  const selectedInputTab = INPUT_MODES().some(item => item.value === studioState.preferredInputTab) ? studioState.preferredInputTab : actualInputMode;
  const hasPendingInputMode = selectedInputTab !== actualInputMode;

  const scriptState = overview?.input?.script || null;
  const scriptLoaded = Boolean(scriptState?.loaded);
  const scriptDurationMs = Math.max(0, Number(scriptState?.durationMs || 0));
  const scriptPositionMs = Math.max(0, Math.min(Number(scriptState?.positionMs || 0), scriptDurationMs || 0));
  const scriptRemainingMs = Math.max(0, scriptDurationMs - scriptPositionMs);
  const scriptProgressPercent = scriptDurationMs > 0 ? Math.min(100, (scriptPositionMs / scriptDurationMs) * 100) : 0;
  const scriptSliderMax = Math.max(scriptDurationMs, 1);
  const scriptSeekValue = scriptSeekDragging ? clampScriptPositionMs(scriptSeekDraft, scriptDurationMs) : scriptPositionMs;
  const scriptSeekBasePosition = clampScriptPositionMs(scriptSeekValue, scriptDurationMs);
  const scriptLoopRange = useMemo(() => normalizeScriptLoopRange(scriptSettings.loopStartMs, scriptSettings.loopEndMs, scriptDurationMs), [scriptSettings.loopStartMs, scriptSettings.loopEndMs, scriptDurationMs, getLocale()]);
  const scriptHasLoopMarkers = scriptLoopRange.startMs !== null || scriptLoopRange.endMs !== null;
  const scriptActivityBins = Array.isArray(scriptState?.activityBins) ? scriptState.activityBins : [];
  const scriptStateMeta = getScriptStateMeta(scriptState?.state);
  const scriptPrimaryActionLabel = !scriptLoaded ? t("播放") : scriptState?.playing ? t("播放中") : scriptState?.paused ? t("继续播放") : scriptState?.state === 'finished' ? t("重新播放") : t("播放");
  const scriptCurrentL0Value = formatAxisPositionFromNormalized(scriptState?.currentL0 || 0);
  const scriptSpeedLabel = formatScriptSpeedLabel(scriptSettings.speed);
  const scriptLoopStartLabel = scriptLoopRange.startMs === null ? t("A 未设") : `A ${formatDuration(scriptLoopRange.startMs)}`;
  const scriptLoopEndLabel = scriptLoopRange.endMs === null ? t("B 未设") : `B ${formatDuration(scriptLoopRange.endMs)}`;
  const scriptLoopModeLabel = scriptSettings.loop ? t("循环播放已开启") : t("循环播放已关闭");
  const scriptLoopRangeSummary = scriptLoopRange.active ? `${formatDuration(scriptLoopRange.startMs)} → ${formatDuration(scriptLoopRange.endMs)}` : '';
  const scriptLoopLengthMs = scriptLoopRange.active ? Math.max(0, scriptLoopRange.endMs - scriptLoopRange.startMs) : 0;
  const scriptLoopCoveragePercent = scriptLoopRange.active && scriptDurationMs > 0 ? (scriptLoopLengthMs / scriptDurationMs) * 100 : 0;
  const scriptCurrentInLoopRange = scriptLoopRange.active ? scriptPositionMs >= scriptLoopRange.startMs && scriptPositionMs < scriptLoopRange.endMs : null;
  const scriptLoopModeHelpText = !scriptLoaded
    ? t("先设好速度和循环偏好，加载脚本后会自动沿用；这些偏好会记住到当前浏览器。")
    : scriptSettings.loop
      ? scriptLoopRange.active
        ? t("已开启。当前存在完整 A-B 区间，播放时会只在 A-B 区间内循环。")
        : t("已开启。当前还没有完整 A-B 区间，播放时会按整段脚本循环。")
      : t("已关闭。当前会从当前位置播放到结尾一次。");
  const scriptFileLabel = selectedScriptFile?.name || scriptState?.fileName || t("未载入脚本");
  const scriptHeroStatusText = selectedScriptFile
    ? t("正在读取并导入脚本…导入完成后会自动同步到时间轴工作区。")
    : scriptLoaded
      ? t("当前脚本按 {0} 播放；{1}。", [scriptSpeedLabel, scriptSettings.loop ? (scriptLoopRange.active ? t("循环区间为 {0}", [scriptLoopRangeSummary]) : t("已开启整段循环")) : t("当前为单次播放模式")])
      : t("选择一个 .funscript / .json 文件后即可进入时间轴工作区，后续可直接拖动时间轴、设置 A-B 和按关键帧步进。");
  const scriptOutputBehaviorText = t("当前脚本模式固定按脚本内容直接发送位置。常规 funscript 只有位置关键帧，因此现在不会再按轴配置或输出配置自动补算 S / I。");
  const scriptPlaybackRateHelpText = t("这里调整的是脚本时间倍率，不是 TCode S 速度；只影响脚本在时间轴上的推进快慢。");
  const scriptPrimaryTransportBusy = busyKey === 'script-play' || busyKey === 'script-pause';
  const scriptTransportPrimaryLabel = scriptState?.playing ? t("暂停") : scriptPrimaryActionLabel;
  const scriptLoopAnchorModeLabel = scriptSeekDragging ? t("拖拽预览") : t("当前播放位置");
  const scriptLoopAnchorValueLabel = scriptLoaded ? formatDuration(scriptSeekBasePosition) : t("未载入");
  const scriptShortcutScopeText = t("快捷键只在脚本页空白区域生效；输入框、按钮和滑条获得焦点时会自动让出键盘，长按按键也不会重复连发。");
  const scriptTimelineSupportText = t("时间码支持 90、1:30、01:23.45 这类格式。");
  const scriptTimelinePreviewLabel = !scriptLoaded ? t("载入脚本后可拖动定位") : scriptSeekDragging ? t("预览 {0}", [formatDuration(scriptSeekBasePosition)]) : t("当前 {0}", [formatDuration(scriptPositionMs)]);
  const scriptWorkspaceEmptyTitle = selectedScriptFile ? t("正在导入脚本…") : t("还没有载入脚本");
  const scriptWorkspaceEmptyDescription = selectedScriptFile
    ? t("脚本文件内容正在读取并同步到 Companion；导入完成后，这里会自动切换成完整时间轴工作区。")
    : t("先选择一个脚本文件，随后就可以在这里拖动时间轴、框选 A-B、用快捷键对点和按关键帧步进。");
  const scriptShortcutGroups = SCRIPT_SHORTCUT_GROUPS().map(group => ({
    ...group,
    items: group.items.map(item => ({
      ...item,
      availability: getScriptShortcutAvailability(item.requirement, {
        scriptLoaded,
        hasLoopStart: scriptLoopRange.startMs !== null,
        hasLoopEnd: scriptLoopRange.endMs !== null,
        hasLoopMarkers: scriptHasLoopMarkers,
      }),
    })),
  }));

  useEffect(() => {
    const initial = createInitialSnapshotLoader(realtime, {
      onLoad: ({ config: configResponse, overview: overviewResponse, logs: logsResponse, serialPorts: serialPortResponse }) => {
        const persistedStudio = sanitizeStudio(loadStudio() || DEFAULT_STUDIO_STATE, configResponse);

        setConfig(configResponse);
        setOverview(overviewResponse);
        setLogs(normalizeLogs(logsResponse));
        setSerialPorts(normalizeSerialPorts(serialPortResponse));
        setOscDraft(buildOscDraftFromConfig(configResponse));
        setSignalDrafts(buildSignalDrafts(configResponse?.signals));
        savedSignalsHashRef.current = computeSignalHash(buildSignalDrafts(configResponse?.signals));
        setStudio(persistedStudio);
        const initialManualDraft = normalizeManualCommand(overviewResponse?.runtime?.manualCommand);
        setManualDraft(initialManualDraft);
        manualDraftRef.current = initialManualDraft;
        const initialManualMode = normalizeManualMotionMode(overviewResponse?.runtime?.manualCommand?.requestedCommandMode);
        const initialManualMotionValue = normalizeManualMotionValueByMode(
          initialManualMode,
          overviewResponse?.runtime?.manualCommand?.requestedMotionValue ?? (initialManualMode === 'Interval' ? MANUAL_DEFAULT_INTERVAL_MS : MANUAL_DEFAULT_SPEED),
        );
        setManualMotionMode(initialManualMode);
        manualMotionModeRef.current = initialManualMode;
        setManualMotionValue(initialManualMotionValue);
        manualMotionValueRef.current = initialManualMotionValue;
        setScriptSettings(normalizeScriptSettingsState(overviewResponse?.input?.script, persistedStudio.scriptDefaults));
        scriptSettingsInitializedRef.current = true;
      },
      onLoading: setLoading,
      onError: error => notify(error.message || t("初始化失败"), 'error'),
    });
    const detach = attachPageLifecycle(realtime, window, {
      onStatus: status => { setWsState(status); void initial.connection(status); },
      onSnapshot: (snapshot, entries) => { setOverview(snapshot); setLogs(normalizeLogs(entries)); },
    });
    return () => { initial.dispose(); detach(); };
  }, [realtime]);

  useEffect(() => {
    if (!config) return;
    setStudio(previous => sanitizeStudio(previous, config));
    setOscDraft(buildOscDraftFromConfig(config));
    setSignalDrafts(buildSignalDrafts(config?.signals));
    savedSignalsHashRef.current = computeSignalHash(buildSignalDrafts(config?.signals));
  }, [config]);

  useEffect(() => {
    const presets = getOscMappingPresets(config);
    if (presets.length === 0) {
      setSelectedOscPreset('');
      return;
    }

    setSelectedOscPreset(previous => (presets.some(preset => preset.id === previous) ? previous : presets[0].id));
  }, [config]);

  useEffect(() => {
    if (!studio) return;
    saveStudio(studio);
  }, [studio]);

  useEffect(() => {
    if (scriptSettingsInitializedRef.current === false) return;

    setStudio(previous => {
      const base = sanitizeStudio(previous || DEFAULT_STUDIO_STATE, config);
      const nextScriptDefaults = normalizeStoredScriptDefaults(scriptSettings);

      if (base.scriptDefaults.loop === nextScriptDefaults.loop && Math.abs(base.scriptDefaults.speed - nextScriptDefaults.speed) < 0.0001) {
        return previous || base;
      }

      return {
        ...base,
        scriptDefaults: nextScriptDefaults,
      };
    });
  }, [scriptSettings.loop, scriptSettings.speed, config]);

  useEffect(() => {
    if (!overview?.input?.script || scriptSettingsInitializedRef.current === false) return;
    if (busyKey.startsWith('script-')) return;

    setScriptSettings(previous => normalizeScriptSettingsState(overview.input.script, previous));
  }, [overview?.input?.script, busyKey]);

  useEffect(() => {
    if (scriptSeekDragging) return;
    setScriptSeekDraft(Number(overview?.input?.script?.positionMs || 0));
  }, [overview?.input?.script?.positionMs, scriptSeekDragging]);

  useEffect(() => {
    if (selectedInputTab !== 'script') return undefined;

    function handleScriptHotkeys(event) {
      if (busyKey.startsWith('script-')) return;
      if (event.defaultPrevented || event.altKey || event.ctrlKey || event.metaKey) return;
      if (event.repeat) return;
      if (shouldIgnoreScriptShortcutTarget(event.target)) return;

      switch (event.code) {
        case 'Space':
        case 'KeyK': {
          if (!scriptLoaded) return;
          event.preventDefault();
          if (scriptState?.playing) {
            void pauseScript();
          } else {
            void playScript(false);
          }
          return;
        }

        case 'KeyR': {
          if (!scriptLoaded) return;
          event.preventDefault();
          void playScript(true);
          return;
        }

        case 'KeyJ': {
          if (!scriptLoaded) return;
          event.preventDefault();
          void stepScriptAction(-1);
          return;
        }

        case 'KeyL': {
          if (!scriptLoaded) return;
          event.preventDefault();
          void stepScriptAction(1);
          return;
        }

        case 'BracketLeft': {
          if (!scriptLoaded || scriptLoopRange.startMs === null) return;
          event.preventDefault();
          void jumpToScriptLoopBoundary('start');
          return;
        }

        case 'BracketRight': {
          if (!scriptLoaded || scriptLoopRange.endMs === null) return;
          event.preventDefault();
          void jumpToScriptLoopBoundary('end');
          return;
        }

        case 'KeyA': {
          if (!scriptLoaded || !event.shiftKey) break;
          event.preventDefault();
          setScriptLoopBoundary('start');
          return;
        }

        case 'KeyB': {
          if (!scriptLoaded || !event.shiftKey) break;
          event.preventDefault();
          setScriptLoopBoundary('end');
          return;
        }

        case 'KeyC': {
          if (!scriptLoaded || !event.shiftKey || (scriptLoopRange.startMs === null && scriptLoopRange.endMs === null)) break;
          event.preventDefault();
          clearScriptLoopRange();
          return;
        }

        case 'Home': {
          if (!scriptLoaded) return;
          event.preventDefault();
          void seekScript(0);
          return;
        }

        case 'End': {
          if (!scriptLoaded) return;
          event.preventDefault();
          void seekScript(scriptDurationMs);
          return;
        }

        case 'ArrowLeft':
        case 'ArrowRight': {
          if (!scriptLoaded) return;
          event.preventDefault();
          const direction = event.code === 'ArrowLeft' ? -1 : 1;
          const deltaMs = direction * (event.shiftKey ? 10000 : 5000);
          void seekScriptRelative(deltaMs);
          return;
        }

        case 'Minus':
        case 'NumpadSubtract':
        case 'Equal':
        case 'NumpadAdd': {
          if (!scriptLoaded) return;
          event.preventDefault();
          const delta = event.code === 'Minus' || event.code === 'NumpadSubtract' ? -0.1 : 0.1;
          updateScriptSettingsDraft({ speed: clampScriptSpeed(scriptSettings.speed + delta) }, { commit: true });
          return;
        }

        default:
          break;
      }
    }

    window.addEventListener('keydown', handleScriptHotkeys);
    return () => window.removeEventListener('keydown', handleScriptHotkeys);
  }, [selectedInputTab, scriptLoaded, scriptState?.playing, scriptDurationMs, scriptPositionMs, scriptSeekDragging, scriptSeekDraft, scriptSettings.loop, scriptSettings.speed, scriptSettings.loopStartMs, scriptSettings.loopEndMs, busyKey]);

  useEffect(() => {
    if (!selectedScriptFile) return;
    let cancelled = false;

    (async () => {
      try {
        const result = await uploadScriptFile(selectedScriptFile);

        if (cancelled) return;

        setSelectedScriptFile(null);
        setScriptFileInputKey(previous => previous + 1);
        setStudio(previous => (previous ? { ...previous, preferredInputTab: 'script' } : previous));
        if (result?.script) {
          setScriptSettings(previous => normalizeScriptSettingsState(result.script, previous));
        }
        setScriptJumpInput('');
        await refreshOverview();
        notify(t("脚本已加载，输入已关闭；检查时间轴后再打开输入。"), 'success');
      } catch (error) {
        if (!cancelled) {
          notify(error.message || t("脚本加载失败"), 'error');
          setSelectedScriptFile(null);
          setScriptFileInputKey(previous => previous + 1);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [selectedScriptFile]);

  async function recordingAction(action) {
    try {
      const result = await apiRequest(`/api/recording/${action}`, { method: 'POST' });
      if (action === 'export') {
        if (!result.content) { notify(t("录制为空"), 'info'); return; }
        const url = URL.createObjectURL(new Blob([result.content], { type: 'application/json' }));
        const link = document.createElement('a'); link.href = url; link.download = result.fileName; link.click();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
      }
    } catch (error) { notify(error.message, 'error'); }
  }

  function togglePinned(path) {
    setPinnedPaths(previous => {
      const next = previous.includes(path) ? previous.filter(p => p !== path) : [path, ...previous].slice(0, 64);
      try { localStorage.setItem('sensa.osc.pins.v1', JSON.stringify(next)); } catch { /* preference storage may be full */ }
      return next;
    });
  }

  function usePoseRig(pose, full = false) {
    setSelectedOscPreset('');
    const preset = BUILT_IN_OSC_MAPPING_PRESETS.find(p => p.id === (full ? 'sensa-pose-full' : 'sensa-pose-depth'));
    const next = preset.mappings.map(mapping => makeSignalDraft({ ...mapping, oscPath: `${pose.prefix}/**` }));
    setSignalDrafts(next);
    setOscWorkspaceTab('setup');
    notify(t("已用此对象替换整套映射草稿，旧门控已移除；固定来源后保存，保存后需重新打开输入。"), 'info');
  }

  function mapPreviewParameter(entry) {
    if (/^Sensa\/(Point|Handle)\/v1\//.test(entry.path)) {
      usePointRig({prefix:entry.path.split('/').slice(0,5).join('/')});
    } else if (/^Sensa\/(SpsRoot|SharedRoot)\/v1\//.test(entry.path)) {
      notify(t("这是根部阵列诊断样本，不能直接映射行程。请查看单侧 SPS 根部定位面板。"), 'info');
    } else if (entry.path.startsWith('Sensa/Pose/v1/')) {
      usePoseRig({ prefix: entry.path.split('/').slice(0, 5).join('/') });
    } else if (/New(Root|Tip)$/.test(entry.path)) {
      const prefix = entry.path.replace(/New(Root|Tip)$/, '');
      setSignalDrafts(previous => [...previous, makeSignalDraft({ oscPath: `${prefix}NewRoot;${prefix}NewTip`, sourceMode: 'SpsSocketDepth', role: 'Depth' })]);
      notify(t("已添加 Root/Tip 配对草稿，请检查后保存。"), 'info');
    } else {
      setSignalDrafts(previous => [...previous, makeSignalDraft({ oscPath: entry.path, role: /\/(Touch|Frot)/.test(entry.path) ? 'V0' : 'Depth' })]);
      notify(t("已添加映射草稿，请确认参数含义、目标轴和范围后保存。"), 'info');
    }
  }

  function usePointRig(point, calibrated = null) {
    setSelectedOscPreset('');
    setOscWorkspaceTab('setup');
    setSignalDrafts([makeSignalDraft(calibrated || {oscPath:`${point.prefix}/**`,sourceMode:'SensaPoint',pointMetric:'Z',role:'Depth',vrchatMin:0,vrchatMax:.2})]);
    notify(calibrated?t("已用校准结果替换整套映射草稿，旧门控已移除；确认来源后保存，再手动打开输入。"):t("已用本地 Z 位移替换整套草稿，旧门控已移除；请先校准量程再保存。"),'info');
  }

  function notify(message, severity = 'info') {
    setSnackbar({ open: true, message, severity });
  }

  function syncScriptSettingsFromSnapshot(snapshot, fallback = DEFAULT_SCRIPT_SETTINGS) {
    if (!snapshot) return;
    setScriptSettings(previous => normalizeScriptSettingsState(snapshot, previous || fallback));
  }

  function updateScriptSettingsDraft(patch, options = {}) {
    const effectiveScriptDurationMs = Math.max(0, Number(overview?.input?.script?.durationMs || 0));
    const nextSettings = normalizeScriptSettingsState({ ...scriptSettings, ...patch }, scriptSettings, effectiveScriptDurationMs);
    setScriptSettings(nextSettings);

    if (options.commit && scriptLoaded) {
      void applyScriptSettings(nextSettings, options.applyOptions);
    }

    return nextSettings;
  }

  async function withBusy(key, action) {
    setBusyKey(key);
    try {
      return await action();
    } finally {
      setBusyKey('');
    }
  }

  async function refreshOverview() {
    const nextOverview = await apiRequest('/api/state/overview');
    setOverview(nextOverview);
    return nextOverview;
  }

  async function refreshSerialPorts() {
    const nextPorts = await apiRequest('/api/meta/serial-ports');
    const normalizedPorts = normalizeSerialPorts(nextPorts);
    setSerialPorts(normalizedPorts);
    return normalizedPorts;
  }

  async function uploadScriptFile(file) {
    if (!file) throw new Error(t("请先选择一个 .funscript 文件"));

    const content = await file.text();
    return apiRequest('/api/input/script/load', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        fileName: file.name,
        content,
        loop: scriptSettings.loop,
        speed: scriptSettings.speed,
      }),
    });
  }

  async function persistConfig(nextConfig) {
    nextConfig.schemaVersion = 5;
    const saved = await apiRequest('/api/config', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(nextConfig),
    });
    setConfig(saved);
    return saved;
  }

  async function saveOscConfig() {
    if (!config) return;

    const hubConflictLookup = buildOscHubTargetConflictLookup(oscDraft);
    const hubConflictMessages = flattenOscHubConflictMessages(hubConflictLookup);
    if (hubConflictMessages.length > 0) {
      notify(hubConflictMessages.join('；'), 'error');
      return;
    }

    await withBusy('osc-save', async () => {
      const nextConfig = editConfiguration(config, { kind: 'osc', draft: oscDraft });

      const savedConfig = await persistConfig(nextConfig);
      await refreshOverview();
      setOscDraft(buildOscDraftFromConfig(savedConfig));
      notify(t("OSC / Hub 配置已保存"), 'success');
    }).catch(error => notify(error.message || t("保存 OSC 配置失败"), 'error'));
  }

  async function applyOscSourceSelection(nextSourceKey) {
    const normalizedSourceKey = nextSourceKey || '';
    const currentSourceKey = overview?.osc?.selectedSourceKey || '';
    if (normalizedSourceKey === currentSourceKey) return;

    await withBusy('osc-source', async () => {
      await apiRequest('/api/input/osc/source', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sourceKey: normalizedSourceKey || null }),
      });
      await refreshOverview();
      notify(normalizedSourceKey ? t("已切换参数来源") : t("已恢复自动选择参数来源"), 'success');
    }).catch(error => notify(error.message || t("切换参数来源失败"), 'error'));
  }

  function updateOscHubTargetDraft(draftId, patch) {
    setOscDraft(previous => ({
      ...previous,
      hubTargets: (Array.isArray(previous.hubTargets) ? previous.hubTargets : []).map(target => (target._draftId === draftId ? { ...target, ...patch } : target)),
    }));
  }

  function addOscHubTargetDraft() {
    setOscDraft(previous => {
      const currentTargets = Array.isArray(previous.hubTargets) ? previous.hubTargets : [];
      const nextPort = getNextAvailableOscHubPort(currentTargets, previous.receiverPort);
      return {
        ...previous,
        hubTargets: [...currentTargets, makeOscHubTargetDraft({}, { index: currentTargets.length + 1, port: nextPort })],
      };
    });
  }

  function removeOscHubTargetDraft(draftId) {
    setOscDraft(previous => ({
      ...previous,
      hubTargets: (Array.isArray(previous.hubTargets) ? previous.hubTargets : []).filter(target => target._draftId !== draftId),
    }));
  }

  function updateSignalDraft(draftId, patch) {
    setSignalDrafts(previous => previous.map(signal => (signal._draftId === draftId ? { ...signal, ...patch } : signal)));
  }

  function addSignalDraft(prefillPath = '') {
    setSignalDrafts(previous => [...previous, makeSignalDraft({ oscPath: prefillPath })]);
  }

  function removeSignalDraft(draftId) {
    setSignalDrafts(previous => previous.filter(signal => signal._draftId !== draftId));
  }

  function clearSignalDrafts() {
    setSignalDrafts([]);
    setConfirmClearMappings(false);
    notify(t("已在当前页面清空映射；如需放弃更改，可点“恢复映射”"), 'info');
  }

  function restoreSignalDrafts() {
    if (!config) return;
    setSignalDrafts(buildSignalDrafts(config?.signals));
    setConfirmClearMappings(false);
    notify(t("已恢复到已保存映射"), 'info');
  }

  async function saveOscMappings() {
    if (!config) return;

    await withBusy('osc-mappings-save', async () => {
      const nextConfig = editConfiguration(config, { kind: 'mappings', drafts: signalDrafts });

      await persistConfig(nextConfig);
      await refreshOverview();
      savedSignalsHashRef.current = computeSignalHash(signalDrafts);
      notify(t("OSC 映射已保存并应用，输入已关闭；检查接收值后再打开输入。"), 'success');
    }).catch(error => notify(error.message || t("保存 OSC 映射失败"), 'error'));
  }

  function applyOscPreset(mode = 'replace') {
    const preset = getOscMappingPreset(config, selectedOscPreset);
    if (!preset) {
      notify(t("请选择一个预设方案"), 'warning');
      return;
    }

    const nextDrafts = preset.mappings.map(mapping => makeSignalDraft(mapping));
    setSignalDrafts(previous => (mode === 'append' ? [...previous, ...nextDrafts] : nextDrafts));
    notify(mode === 'append' ? t("已在当前页面追加预设：{0}；保存后才会真正应用", [preset.name]) : t("已在当前页面应用预设：{0}；保存后才会真正应用", [preset.name]), 'success');
  }

  function openPresetDialog(presetId = null, options = {}) {
    if (!config) return;
    setPresetDialog(buildPresetDialogDraft(config, presetId, options));
  }

  function updatePresetDialogSignal(draftId, patch) {
    setPresetDialog(previous => {
      if (!previous) return previous;
      return {
        ...previous,
        mappings: previous.mappings.map(signal => (signal._draftId === draftId ? { ...signal, ...patch } : signal)),
      };
    });
  }

  function addPresetDialogSignal(prefillPath = '') {
    setPresetDialog(previous => {
      if (!previous) return previous;
      return {
        ...previous,
        mappings: [...previous.mappings, makeSignalDraft({ oscPath: prefillPath })],
      };
    });
  }

  function removePresetDialogSignal(draftId) {
    setPresetDialog(previous => {
      if (!previous) return previous;
      return {
        ...previous,
        mappings: previous.mappings.filter(signal => signal._draftId !== draftId),
      };
    });
  }

  async function savePresetDialog() {
    if (!config || !presetDialog) return;

    await withBusy(`preset-save-${presetDialog.presetId}`, async () => {
      const nextPreset = {
        id: presetDialog.presetId,
        name: (presetDialog.name || t("OSC 预设")).trim() || t("OSC 预设"),
        description: (presetDialog.description || '').trim(),
        mappings: presetDialog.mappings.map(stripSignalDraft).filter(signal => Boolean(signal.oscPath)),
      };

      const nextConfig = editConfiguration(config, { kind: 'preset-save', preset: nextPreset });

      const saved = await persistConfig(nextConfig);
      setSelectedOscPreset(nextPreset.id);
      setPresetDialog(null);
      notify(t("{0} 已保存", [nextPreset.name]), 'success');
      setConfig(saved);
    }).catch(error => notify(error.message || t("保存预设失败"), 'error'));
  }

  async function deleteSelectedPreset() {
    if (!config || !selectedOscPreset) return;

    const preset = getOscMappingPreset(config, selectedOscPreset);
    if (!preset) return;
    if (preset.isBuiltIn) {
      notify(t("内置预设不能删除；如需修改，请复制为自定义预设。"), 'warning');
      return;
    }

    await withBusy(`preset-delete-${selectedOscPreset}`, async () => {
      const nextConfig = editConfiguration(config, { kind: 'preset-remove', id: selectedOscPreset });

      const saved = await persistConfig(nextConfig);
      const nextPresets = getOscMappingPresets(saved);
      setSelectedOscPreset(nextPresets[0]?.id || '');
      notify(t("{0} 已删除", [preset.name]), 'info');
      setConfig(saved);
    }).catch(error => notify(error.message || t("删除预设失败"), 'error'));
  }

  function updateProfileAxis(axisKey, patch) {
    setProfileDialog(previous => {
      if (!previous) return previous;
      return {
        ...previous,
        profile: {
          ...previous.profile,
          [axisKey]: {
            ...previous.profile[axisKey],
            ...patch,
          },
        },
      };
    });
  }

  function applyAxisProfilePresetToDialog(presetId) {
    const preset = AXIS_PROFILE_PRESETS().find(item => item.id === presetId);
    if (!preset) return;

    setProfileDialog(previous => {
      if (!previous) return previous;
      return {
        ...previous,
        presetId,
        profile: cloneMotionProfile(createAxisProfilePresetMotion(presetId), false),
      };
    });
  }

  function openProfileDialog(profileId) {
    if (!config) return;
    setProfileDialog(buildProfileDialogDraft(profileId, config));
  }

  function openNewProfileDialog() {
    if (!config) return;
    setProfileDialog(buildNewProfileDialogDraft(config));
  }

  async function saveProfileDialog() {
    if (!profileDialog || !config) return;

    await withBusy(`profile-save-${profileDialog.profileId}`, async () => {
      const nextProfileName = (profileDialog.name || t("轴配置")).trim() || t("轴配置");
      const nextConfig = editConfiguration(config, { kind: 'profile-save', draft: profileDialog });

      await persistConfig(nextConfig);
      await refreshOverview();
      setProfileDialog(null);
      notify(t("{0} 已保存", [nextProfileName]), 'success');
    }).catch(error => notify(error.message || t("保存轴配置失败"), 'error'));
  }

  async function setDefaultAxisProfile(profileId) {
    if (!config) return;

    await withBusy(`profile-default-${profileId}`, async () => {
      const nextConfig = editConfiguration(config, { kind: 'profile-default', id: profileId });

      const saved = await persistConfig(nextConfig);
      await refreshOverview();
      notify(t("默认轴配置已切换为 {0}", [getAxisProfile(saved, profileId).name]), 'success');
    }).catch(error => notify(error.message || t("设置默认轴配置失败"), 'error'));
  }

  async function removeAxisProfile(profileId) {
    if (!config) return;

    const profile = getAxisProfile(config, profileId);
    if (!profile || profile.isDefault) {
      notify(t("默认轴配置不能移除"), 'warning');
      return;
    }

    await withBusy(`profile-remove-${profileId}`, async () => {
      const nextConfig = editConfiguration(config, { kind: 'profile-remove', id: profileId });

      const saved = await persistConfig(nextConfig);
      await refreshOverview();
      notify(t("{0} 已移除，相关输出已回退到默认轴配置", [profile.name]), 'info');
      setStudio(previous => sanitizeStudio(previous, saved));
    }).catch(error => notify(error.message || t("移除轴配置失败"), 'error'));
  }

  function selectInputTab(nextMode) {
    setStudio(previous => ({ ...(previous || {}), preferredInputTab: nextMode }));
  }

  async function applyInputMode(nextMode) {
    if (!nextMode) return;

    await withBusy(`mode-${nextMode}`, async () => {
      await apiRequest('/api/input/mode', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mode: nextMode }),
      });
      await refreshOverview();
      notify(t("已切换到 {0}，输入已关闭；检查目标后再打开输入。", [formatMode(nextMode)]), 'success');
    }).catch(error => notify(error.message || t("切换输入失败"), 'error'));
  }

  const manualRafRef = useRef(null);

  function scheduleManualContinuousUpdate() {
    if (!manualContinuous) return;
    if (manualRafRef.current) return;

    manualRafRef.current = requestAnimationFrame(() => {
      manualRafRef.current = null;
      apiRequest('/api/input/manual', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(manualCommandPayload(manualDraftRef.current, manualMotionModeRef.current, manualMotionValueRef.current)),
      }).catch(error => notify(error.message || t("手动输入更新失败"), 'error'));
    });
  }

  function handleManualSliderChange(patch) {
    const nextDraft = { ...manualDraft, ...patch };
    setManualDraft(nextDraft);
    manualDraftRef.current = nextDraft;
    scheduleManualContinuousUpdate();
  }

  function handleManualMotionModeChange(nextMode) {
    const normalizedMode = normalizeManualMotionMode(nextMode);
    setManualMotionMode(normalizedMode);
    manualMotionModeRef.current = normalizedMode;

    const normalizedValue = normalizeManualMotionValueByMode(normalizedMode, manualMotionValueRef.current);
    setManualMotionValue(normalizedValue);
    manualMotionValueRef.current = normalizedValue;
    scheduleManualContinuousUpdate();
  }

  function handleManualMotionValueChange(nextValue) {
    const normalizedValue = normalizeManualMotionValueByMode(manualMotionModeRef.current, nextValue);
    setManualMotionValue(normalizedValue);
    manualMotionValueRef.current = normalizedValue;
    scheduleManualContinuousUpdate();
  }

  async function applyManualOnce() {
    if (manualRafRef.current) {
      cancelAnimationFrame(manualRafRef.current);
      manualRafRef.current = null;
    }

    await withBusy('manual-once', async () => {
      await apiRequest('/api/input/manual', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(manualCommandPayload(manualDraft, manualMotionMode, manualMotionValue)),
      });
      notify(t("位置已更新"), 'success');
    }).catch(error => notify(error.message || t("更新位置失败"), 'error'));
  }

  async function disableManualInput() {
    if (manualRafRef.current) {
      cancelAnimationFrame(manualRafRef.current);
      manualRafRef.current = null;
    }

    await withBusy('manual-disable', async () => {
      await apiRequest('/api/input/manual', { method: 'DELETE' });
      await refreshOverview();
      notify(t("手动输入已停用"), 'success');
    }).catch(error => notify(error.message || t("停用手动输入失败"), 'error'));
  }

  async function playScript(restart = false) {
    await withBusy(restart ? 'script-restart' : 'script-play', async () => {
      const result = await apiRequest('/api/input/script/play', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          restart,
          loop: scriptSettings.loop,
          speed: scriptSettings.speed,
        }),
      });

      syncScriptSettingsFromSnapshot(result?.script, scriptSettings);
      setStudio(previous => (previous ? { ...previous, preferredInputTab: 'script' } : previous));
      await refreshOverview();
      notify(restart ? t("脚本已重新开始") : t("脚本播放中"), 'success');
    }).catch(error => notify(error.message || t("脚本播放失败"), 'error'));
  }

  async function pauseScript() {
    await withBusy('script-pause', async () => {
      await apiRequest('/api/input/script/pause', { method: 'POST' });
      await refreshOverview();
      notify(t("脚本已暂停，已请求停止输出"), 'info');
    }).catch(error => notify(error.message || t("脚本暂停失败"), 'error'));
  }

  async function stopScript() {
    await withBusy('script-stop', async () => {
      await apiRequest('/api/input/script/stop', { method: 'POST' });
      await refreshOverview();
      notify(t("脚本已停止，已请求停止输出"), 'info');
    }).catch(error => notify(error.message || t("脚本停止失败"), 'error'));
  }

  async function applyScriptSettings(nextSettings, options = {}) {
    if (!scriptState?.loaded) return;

    const effectiveScriptDurationMs = Math.max(0, Number(overview?.input?.script?.durationMs || 0));
    const payload = normalizeScriptSettingsState(nextSettings, scriptSettings, effectiveScriptDurationMs);

    await withBusy('script-configure', async () => {
      const result = await apiRequest('/api/input/script/configure', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...payload, updateLoopRange: true }),
      });

      syncScriptSettingsFromSnapshot(result?.script, payload);

      if (options.notify) notify(options.successMessage || t("脚本设置已应用"), 'success');
    }).catch(error => {
      setScriptSettings(previous => normalizeScriptSettingsState(scriptState, previous));
      notify(error.message || options.errorMessage || t("脚本设置更新失败"), 'error');
    });
  }

  async function seekScript(positionMs) {
    const durationMs = Math.max(0, Number(scriptState?.durationMs || 0));
    const fallbackPositionMs = clampScriptPositionMs(scriptState?.positionMs || 0, durationMs);
    const clampedPositionMs = clampScriptPositionMs(positionMs, durationMs);

    if (!scriptState?.loaded) {
      setScriptSeekDraft(fallbackPositionMs);
      setScriptSeekDragging(false);
      return;
    }

    await withBusy('script-seek', async () => {
      const result = await apiRequest('/api/input/script/seek', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ positionMs: clampedPositionMs }),
      });

      if (result?.script) {
        setScriptSeekDraft(Number(result.script.positionMs || clampedPositionMs));
      }
    }).catch(error => {
      setScriptSeekDraft(fallbackPositionMs);
      notify(error.message || t("脚本定位失败"), 'error');
    });

    setScriptSeekDragging(false);
  }

  async function seekScriptRelative(deltaMs) {
    const durationMs = Math.max(0, Number(scriptState?.durationMs || 0));
    const basePositionMs = clampScriptPositionMs(scriptSeekDragging ? scriptSeekDraft : scriptPositionMs, durationMs);
    await seekScript(basePositionMs + deltaMs);
  }

  async function submitScriptJump() {
    if (!scriptLoaded) return;

    const parsedPositionMs = parseScriptTimecodeInput(scriptJumpInput);
    if (parsedPositionMs === null) {
      notify(t("请输入有效时间码，例如 01:23.45、1:30 或 90"), 'warning');
      return;
    }

    const clampedPositionMs = clampScriptPositionMs(parsedPositionMs, scriptDurationMs);
    setScriptJumpInput(formatDuration(clampedPositionMs));
    await seekScript(clampedPositionMs);
  }

  async function jumpToScriptLoopBoundary(boundary) {
    if (!scriptLoaded) return;

    const targetPositionMs = boundary === 'start' ? scriptLoopRange.startMs : scriptLoopRange.endMs;
    if (targetPositionMs === null || targetPositionMs === undefined) return;

    const clampedPositionMs = clampScriptPositionMs(targetPositionMs, scriptDurationMs);
    setScriptJumpInput(formatDuration(clampedPositionMs));
    await seekScript(clampedPositionMs);
  }

  function applyScriptLoopRange(startMs, endMs) {
    if (!scriptLoaded) return;

    const nextRange = normalizeScriptLoopRange(startMs, endMs, scriptDurationMs);
    if (!nextRange.active) return;

    updateScriptSettingsDraft(
      { loopStartMs: nextRange.startMs, loopEndMs: nextRange.endMs },
      {
        commit: true,
        applyOptions: {
          notify: true,
          successMessage: t("A-B 区间已设为 {0} → {1}", [formatDuration(nextRange.startMs), formatDuration(nextRange.endMs)]),
          errorMessage: t("设置 A-B 区间失败"),
        },
      },
    );
  }

  function setScriptLoopBoundary(boundary, positionMs = scriptSeekBasePosition) {
    if (!scriptLoaded) return;

    const clampedPositionMs = clampScriptPositionMs(positionMs, scriptDurationMs);

    updateScriptSettingsDraft(
      boundary === 'start' ? { loopStartMs: clampedPositionMs } : { loopEndMs: clampedPositionMs },
      {
        commit: true,
        applyOptions: {
          notify: true,
          successMessage: boundary === 'start' ? t("A 点已设置为 {0}", [formatDuration(clampedPositionMs)]) : t("B 点已设置为 {0}", [formatDuration(clampedPositionMs)]),
          errorMessage: boundary === 'start' ? t("设置 A 点失败") : t("设置 B 点失败"),
        },
      },
    );
  }

  function clearScriptLoopRange() {
    if (!scriptLoaded) return;

    updateScriptSettingsDraft(
      { loopStartMs: null, loopEndMs: null },
      {
        commit: true,
        applyOptions: {
          notify: true,
          successMessage: t("A-B 区间已清除"),
          errorMessage: t("清除 A-B 区间失败"),
        },
      },
    );
  }

  async function stepScriptAction(direction) {
    if (!scriptState?.loaded) return;

    const route = direction >= 0 ? '/api/input/script/action-next' : '/api/input/script/action-prev';
    const busyToken = direction >= 0 ? 'script-step-next' : 'script-step-prev';

    await withBusy(busyToken, async () => {
      const result = await apiRequest(route, { method: 'POST' });
      if (result?.script) {
        setScriptSeekDraft(Number(result.script.positionMs || 0));
        syncScriptSettingsFromSnapshot(result.script, scriptSettings);
      }
    }).catch(error => notify(error.message || t("脚本动作跳转失败"), 'error'));

    setScriptSeekDragging(false);
  }

  async function clearScript() {
    await withBusy('script-clear', async () => {
      const result = await apiRequest('/api/input/script', { method: 'DELETE' });
      setSelectedScriptFile(null);
      setScriptFileInputKey(previous => previous + 1);
      setScriptSeekDraft(0);
      setScriptJumpInput('');

      syncScriptSettingsFromSnapshot(result?.script, scriptSettings);

      await refreshOverview();
      notify(t("脚本已卸载"), 'info');
    }).catch(error => notify(error.message || t("卸载脚本失败"), 'error'));
  }

  async function setOutputEnabled(type, enabled) {
    if (!config) return;

    await withBusy(`output-enable-${type}`, async () => {
      const nextConfig = editConfiguration(config, { kind: 'output-enabled', id: type, enabled });
      const saved = await persistConfig(nextConfig);
      await refreshOverview();
      notify(`${getOutputConfig(saved, type)?.name || t("输出")}${enabled ? t(" 已启用") : t(" 已禁用")}`, 'success');
    }).catch(error => notify(error.message || t("更新输出状态失败"), 'error'));
  }

  async function addOutputCard(type) {
    if (!studio || !config) return;

    await withBusy(`output-add-${type}`, async () => {
      let availableSerialPorts = serialPorts;
      if (type === 'TCodeSerial') {
        availableSerialPorts = (await refreshSerialPorts().catch(() => serialPorts)) || serialPorts;
      }

      const nextOutput = createOutputConfig(type, config, { serialPorts: availableSerialPorts });
      const nextConfig = editConfiguration(config, { kind: 'output-add', output: nextOutput });

      const saved = await persistConfig(nextConfig);
      setStudio(previous => sanitizeStudio(previous, saved));
      setDialog({ outputId: nextOutput.id, draft: buildOutputDialogDraft(nextOutput.id, saved, availableSerialPorts) });
      await refreshOverview();
      notify(t("已添加 {0}", [nextOutput.name]), 'success');
    }).catch(error => notify(error.message || t("添加输出失败"), 'error'));
  }

  async function removeOutputCard(type) {
    if (!studio || !config) return;

    await withBusy(`output-remove-${type}`, async () => {
      const removed = getOutputConfig(config, type);
      const nextStudio = { ...studio };

      const nextConfig = editConfiguration(config, { kind: 'output-remove', id: type });
      const saved = await persistConfig(nextConfig);
      setStudio(nextStudio);
      await refreshOverview();
      notify(t("{0} 已移除", [removed?.name || t("输出")]), 'info');
    }).catch(error => notify(error.message || t("移除输出失败"), 'error'));
  }

  async function openOutputDialog(type) {
    if (!config) return;
    const output = getOutputConfig(config, type);
    if (!output) return;

    let availableSerialPorts = serialPorts;
    if (output.type === 'TCodeSerial') {
      availableSerialPorts = (await refreshSerialPorts().catch(() => serialPorts)) || serialPorts;
    }
    setDialog({ outputId: type, draft: buildOutputDialogDraft(type, config, availableSerialPorts) });
  }

  async function saveOutputDialog() {
    if (!dialog || !config) return;

    const conflicts = getOutputTargetConflicts(config, dialog.outputId, dialog.draft);
    if (conflicts.length > 0) {
      notify(formatOutputTargetConflictMessage(conflicts), 'error');
      return;
    }

    await withBusy(`dialog-save-${dialog.outputId}`, async () => {
      const nextConfig = editConfiguration(config, { kind: 'output-save', id: dialog.outputId, draft: dialog.draft });
      const saved = await persistConfig(nextConfig);
      setDialog(null);
      await refreshOverview();
      notify(t("{0} 配置已保存", [getOutputConfig(saved, dialog.outputId)?.name || t("输出")]), 'success');
    }).catch(error => notify(error.message || t("保存配置失败"), 'error'));
  }

  async function emergencyStop() {
    await withBusy('emergency-stop', async () => {
      await apiRequest('/api/control/runtime/emergency-stop', { method: 'POST' });
      await refreshOverview();
      notify(t("已停止所有输出"), 'warning');
    }).catch(error => notify(error.message || t("急停失败"), 'error'));
  }

  async function clearEmergency() {
    await withBusy('emergency-clear', async () => {
      await apiRequest('/api/control/runtime/clear-emergency', { method: 'POST' });
      await refreshOverview();
      notify(t("输出已恢复"), 'success');
    }).catch(error => notify(error.message || t("解除急停失败"), 'error'));
  }

  async function toggleIntifaceScan(start, outputId) {
    const endpoint = start ? `/api/control/output/${encodeURIComponent(outputId)}/scan-start` : `/api/control/output/${encodeURIComponent(outputId)}/scan-stop`;
    await withBusy(start ? 'scan-start' : 'scan-stop', async () => {
      await apiRequest(endpoint, { method: 'POST' });
      notify(start ? t("已请求开始扫描") : t("已请求停止扫描"), 'info');
    }).catch(error => notify(error.message || t("扫描请求失败"), 'error'));
  }

  async function refreshTCodeDeviceInfo(outputId) {
    await withBusy(`tcode-device-refresh-${outputId}`, async () => {
      await apiRequest(`/api/control/output/${encodeURIComponent(outputId)}/device-info-refresh`, { method: 'POST' });
      await refreshOverview();
      notify(t("设备信息已刷新"), 'success');
    }).catch(error => notify(error.message || t("刷新设备信息失败"), 'error'));
  }

  const theme = useMemo(
    () =>
      createTheme({
        palette: {
          mode: 'light',
          primary: { main: '#2563eb' },
          secondary: { main: '#7c3aed' },
          success: { main: '#059669' },
          warning: { main: '#d97706' },
          error: { main: '#dc2626' },
          background: {
            default: '#f4f7fb',
            paper: '#ffffff',
          },
          text: {
            primary: '#0f172a',
            secondary: '#475569',
          },
          divider: 'rgba(15, 23, 42, 0.08)',
        },
        shape: { borderRadius: 18 },
      }, locale === 'zh-CN' ? zhCN : enUS),
    [getLocale()],
  );

  const oscMappingPresets = useMemo(() => getOscMappingPresets(config), [config, getLocale()]);
  const selectedOscPresetConfig = useMemo(() => getOscMappingPreset(config, selectedOscPreset), [config, selectedOscPreset, getLocale()]);
  const selectedOscPresetDescription = selectedOscPresetConfig
    ? selectedOscPresetConfig.description || t("这套预设暂未提供说明。")
    : oscMappingPresets.length > 0
      ? t("选中预设后可在这里查看说明。")
      : t("当前没有可用预设，可先新建一套。");

  function renderScriptPlayer() {
    const scriptLoopChipLabel = scriptSettings.loop
      ? scriptLoopRange.active
        ? t("A-B 循环")
        : t("整段循环")
      : t("单次播放");
    const scriptConsoleStatusText = selectedScriptFile
      ? t("脚本正在导入，完成后会自动切入时间轴。")
      : scriptLoaded
        ? scriptState?.playing
          ? t("正在播放，可随时定位、步进或调整 A-B。")
          : scriptState?.paused
            ? t("已暂停，可继续对点或调整 A-B。")
            : scriptState?.state === 'finished'
              ? t("已到结尾，可重播或重新设定区间。")
              : t("已载入，可直接定位、步进或调整 A-B。")
        : t("选择一个 .funscript / .json 文件后，就可以像播放器一样直接拖时间轴、框选 A-B 和按关键帧步进。");
    const scriptLoopAssistText = !scriptLoaded
      ? t("载入后可在这里查看 A / B 状态、跳到边界或清除区间。")
      : scriptLoopRange.active
        ? t("当前区间长度 {0}，约占全段 {1}%。", [formatDuration(scriptLoopLengthMs), Math.round(scriptLoopCoveragePercent)])
        : scriptHasLoopMarkers
          ? t("已设置单侧标记；补齐另一侧后就会形成完整 A-B 区间。")
          : t("还没有完整 A-B 区间。");
    const scriptProgressNote = scriptLoaded
      ? scriptLoopRange.active
        ? t("已播放 {0}%，当前循环 {1}。", [Math.round(scriptProgressPercent), scriptLoopRangeSummary])
        : t("已播放 {0}%。", [Math.round(scriptProgressPercent)])
      : t("载入脚本后这里会显示当前进度。");
    const scriptSeekDockText = scriptLoaded
      ? t("当前取点基准是「{0}」。", [scriptLoopAnchorModeLabel])
      : t("载入后这里会显示当前取点基准。");
    const scriptSpeedDockText = t("只改脚本推进节奏，不改硬件 S 速度。");
    const scriptEmptyHintLabels = selectedScriptFile
      ? [t("正在同步到 Companion"), t("导入完成后可直接拖时间轴")]
      : [t("支持 .funscript / .json"), t("记住倍率与循环偏好")];
    const scriptSupportItems = [
      {
        title: t("输出方式"),
        text: t("脚本模式会按位置关键帧直接输出；倍率只改时间推进，不代表硬件 S 速度。"),
      },
      {
          title: t("时间码"),
        text: scriptTimelineSupportText,
      },
      {
        title: t("键盘范围"),
        text: scriptShortcutScopeText,
      },
    ];
    return (
      <Stack spacing={2} className="script-player-shell">
        <Box className="dialog-panel script-player-console">
          <Stack spacing={2} className="script-player-console__stack">
            <Stack direction="row" spacing={1.5} useFlexGap flexWrap="wrap" justifyContent="space-between" alignItems="flex-start" className="script-player-console__header">
              <Stack spacing={0.45} className="script-player-console__title">
                <Stack direction="row" spacing={1} useFlexGap flexWrap="wrap" alignItems="center">
                  <Typography variant="subtitle1" className="script-player-console__headline">{t("脚本播放器")}</Typography>
                  <Chip size="small" color={scriptStateMeta.color} variant={scriptLoaded ? 'filled' : 'outlined'} label={scriptStateMeta.label} />
                </Stack>
                <Typography variant="body2" className="script-player-console__file">
                  {scriptFileLabel}
                </Typography>
                <Typography variant="caption" color="text.secondary" className="script-player-console__summary">
                  {scriptConsoleStatusText}
                </Typography>
              </Stack>

              <Stack spacing={1} className="script-player-console__header-actions">
                <Stack direction="row" spacing={0.75} useFlexGap flexWrap="wrap" className="script-player-console__chips">
                  <Chip size="small" variant="outlined" label={t("倍率 {0}", [scriptSpeedLabel])} />
                  <Chip size="small" variant="outlined" label={scriptLoopChipLabel} />
                  {scriptSeekDragging && <Chip size="small" color="info" variant="outlined" label={t("预览 {0}", [formatDuration(scriptSeekBasePosition)])} />}
                </Stack>

                <Stack direction="row" spacing={1} useFlexGap flexWrap="wrap" className="script-player-console__file-actions">
                  <Button component="label" variant="contained" disabled={!!selectedScriptFile}>
                    {selectedScriptFile ? t("导入中…") : scriptLoaded ? t("更换脚本") : t("选择脚本")}
                    <input key={scriptFileInputKey} hidden type="file" accept=".funscript,.json" onChange={event => setSelectedScriptFile(event.target.files?.[0] || null)} />
                  </Button>
                  <Button variant="text" color="error" onClick={() => void clearScript()} disabled={!scriptLoaded || busyKey === 'script-clear'}>{t("卸载")}</Button>
                </Stack>
              </Stack>
            </Stack>

            {selectedScriptFile && <LinearProgress className="script-player-console__loader" />}

            <Box className="script-player-console__stage">
              <Stack spacing={1.25} className="script-player-console__timeline">
                <Box className="script-player-console__timebar">
                  <Box className="script-player-console__clock">
                    <Typography variant="caption" color="text.secondary">{t("当前时间")}</Typography>
                    <Typography variant="h4" className="script-player-console__clock-value">
                      {formatDuration(scriptSeekBasePosition)}
                    </Typography>
                    <Typography variant="caption" color="text.secondary">
                      {scriptSeekDragging ? t("拖拽预览中") : t("播放位置")}
                    </Typography>
                  </Box>

                  <Box className="script-player-console__summary-panel">
                    <Typography variant="body2" color="text.secondary" className="script-player-console__summary-note">
                      {scriptProgressNote}
                    </Typography>

                    <Box className="script-player-console__stats-grid">
                      <Box className="script-player-console__stat">
                        <Typography variant="caption" color="text.secondary">{t("总时长")}</Typography>
                        <Typography variant="body2">{formatDuration(scriptDurationMs)}</Typography>
                      </Box>
                      <Box className="script-player-console__stat">
                        <Typography variant="caption" color="text.secondary">{t("剩余")}</Typography>
                        <Typography variant="body2">{formatDuration(scriptRemainingMs)}</Typography>
                      </Box>
                      <Box className="script-player-console__stat">
                        <Typography variant="caption" color="text.secondary">{t("动作")}</Typography>
                        <Typography variant="body2">{scriptState?.actionCount ?? 0}</Typography>
                      </Box>
                      <Box className="script-player-console__stat">
                        <Typography variant="caption" color="text.secondary">{t("当前 L0")}</Typography>
                        <Typography variant="body2">{scriptCurrentL0Value}</Typography>
                      </Box>
                    </Box>
                  </Box>
                </Box>

                <SliderControl
                  min={0}
                  max={scriptSliderMax}
                  step={50}
                  disabled={!scriptLoaded || busyKey === 'script-seek'}
                  value={scriptSeekValue}
                  className="script-player-console__slider"
                  valueFormatter={value => formatDuration(value)}
                  onChange={next => {
                    setScriptSeekDragging(true);
                    setScriptSeekDraft(Number(Array.isArray(next) ? next[0] : next));
                  }}
                  onChangeCommitted={next => {
                    const nextValue = Number(Array.isArray(next) ? next[0] : next);
                    void seekScript(nextValue);
                  }}
                />

                <Box className="script-player-console__timeline-meta">
                  <Typography variant="caption" color="text.secondary" className="script-player-console__time script-player-console__time--edge">
                    {formatDuration(0)}
                  </Typography>
                  <Typography variant="caption" className="script-player-console__time script-player-console__time--current">
                    {scriptTimelinePreviewLabel}
                  </Typography>
                  <Typography variant="caption" color="text.secondary" className="script-player-console__time script-player-console__time--edge">
                    {formatDuration(scriptDurationMs)}
                  </Typography>
                </Box>

                <ScriptTimelineDensity
                  bins={scriptActivityBins}
                  durationMs={scriptDurationMs}
                  currentPositionMs={scriptSeekBasePosition}
                  loopStartMs={scriptLoopRange.startMs}
                  loopEndMs={scriptLoopRange.endMs}
                  disabled={!scriptLoaded || busyKey === 'script-seek'}
                  onSeek={positionMs => {
                    void seekScript(positionMs);
                  }}
                  onSetLoopBoundary={(boundary, positionMs) => {
                    setScriptLoopBoundary(boundary, positionMs);
                  }}
                  onSelectLoopRange={(startMs, endMs) => {
                    applyScriptLoopRange(startMs, endMs);
                  }}
                />

                {!scriptLoaded && (
                  <Box className="script-player-console__empty">
                    <Box className="script-player-console__empty-callout">
                      <Typography variant="body2" className="script-player-console__empty-text">
                        <strong>{scriptWorkspaceEmptyTitle}</strong>：{scriptWorkspaceEmptyDescription}
                      </Typography>

                      <Stack direction="row" spacing={0.75} useFlexGap flexWrap="wrap" className="script-player-console__empty-chips">
                        {scriptEmptyHintLabels.map(label => (
                          <Chip key={label} size="small" variant="outlined" label={label} />
                        ))}
                      </Stack>
                    </Box>
                  </Box>
                )}
              </Stack>

              <Box className="script-player-console__transport">
                <Button size="small" variant="outlined" onClick={() => void stepScriptAction(-1)} disabled={!scriptLoaded || scriptPositionMs <= 0 || busyKey === 'script-step-prev'}>
                  <ScriptActionButtonLabel label={t("上一动作")} shortcut="J" />
                </Button>
                <Button size="small" variant="outlined" onClick={() => void playScript(true)} disabled={!scriptLoaded || busyKey === 'script-restart'}>
                  <ScriptActionButtonLabel label={t("重播")} shortcut="R" />
                </Button>
                <Button
                  variant="contained"
                  color={scriptState?.playing ? 'warning' : 'primary'}
                  className="script-player-console__transport-primary"
                  onClick={() => {
                    if (scriptState?.playing) {
                      void pauseScript();
                      return;
                    }

                    void playScript(false);
                  }}
                  disabled={!scriptLoaded || scriptPrimaryTransportBusy}
                >
                  <ScriptActionButtonLabel label={scriptTransportPrimaryLabel} shortcut="Space / K" />
                </Button>
                <Button size="small" variant="outlined" color="error" onClick={() => void stopScript()} disabled={!scriptLoaded || busyKey === 'script-stop'}>{t("停止")}</Button>
                <Button size="small" variant="outlined" onClick={() => void stepScriptAction(1)} disabled={!scriptLoaded || scriptPositionMs >= scriptDurationMs || busyKey === 'script-step-next'}>
                  <ScriptActionButtonLabel label={t("下一动作")} shortcut="L" />
                </Button>
              </Box>
            </Box>

            <Box className="script-player-console__dock">
              <Box className="script-player-dock script-player-dock--seek">
                <Box className="script-player-dock__header">
                  <Typography variant="subtitle2">{t("定位")}</Typography>
                </Box>

                <Typography variant="caption" color="text.secondary" className="script-player-dock__note">
                  {scriptSeekDockText}
                </Typography>

                <Box className="script-seek-actions">
                  {SCRIPT_SEEK_ACTIONS().map(action => {
                    const targetPositionMs = action.mode === 'relative'
                      ? clampScriptPositionMs(scriptSeekBasePosition + Number(action.value), scriptDurationMs)
                      : clampScriptPositionMs(action.value === 'end' ? scriptDurationMs : action.value, scriptDurationMs);
                    const disabled = !scriptLoaded || busyKey === 'script-seek' || targetPositionMs === scriptSeekBasePosition;

                    return (
                      <Button
                        key={action.key}
                        size="small"
                        variant="outlined"
                        disabled={disabled}
                        onClick={() => {
                          if (action.mode === 'relative') {
                            void seekScriptRelative(Number(action.value));
                            return;
                          }

                          void seekScript(targetPositionMs);
                        }}
                      >
                        <ScriptActionButtonLabel label={action.label} shortcut={action.shortcut} />
                      </Button>
                    );
                  })}
                </Box>

                <Stack direction="row" spacing={1} useFlexGap flexWrap="wrap" alignItems="center" className="script-jump-row">
                  <TextField
                    size="small"
                    label={t("时间码跳转")}
                    placeholder={t("例如 01:23.45 / 90")}
                    value={scriptJumpInput}
                    disabled={!scriptLoaded || busyKey === 'script-seek'}
                    className="script-jump-row__input"
                    onChange={event => setScriptJumpInput(event.target.value)}
                    onKeyDown={event => {
                      if (event.key !== 'Enter') return;
                      event.preventDefault();
                      void submitScriptJump();
                    }}
                  />
                  <Button size="small" variant="contained" onClick={() => void submitScriptJump()} disabled={!scriptLoaded || busyKey === 'script-seek'}>{t("跳转")}</Button>
                </Stack>
              </Box>

              <Box className="script-player-dock script-player-dock--loop">
                <Box className="script-player-dock__header script-player-dock__header--split">
                  <Typography variant="subtitle2">{t("循环与 A-B")}</Typography>
                  <FormControlLabel
                    control={
                      <Switch
                        checked={scriptSettings.loop}
                        disabled={busyKey === 'script-configure'}
                        onChange={(_, checked) => {
                          updateScriptSettingsDraft({ loop: checked }, { commit: true });
                        }}
                      />
                    }
                    label={<Typography variant="body2" sx={{ fontWeight: 600 }}>{t("循环播放")}</Typography>}
                  />
                </Box>

                <Stack direction="row" spacing={1} useFlexGap flexWrap="wrap" className="script-loop-markers">
                  <Chip size="small" color={scriptLoopRange.startMs === null ? 'default' : 'primary'} variant={scriptLoopRange.startMs === null ? 'outlined' : 'filled'} label={scriptLoopStartLabel} />
                  <Chip size="small" color={scriptLoopRange.endMs === null ? 'default' : 'secondary'} variant={scriptLoopRange.endMs === null ? 'outlined' : 'filled'} label={scriptLoopEndLabel} />
                  <Chip size="small" variant="outlined" label={scriptLoopRange.active ? t("长度 {0}", [formatDuration(scriptLoopLengthMs)]) : t("可先设置 A / B 标记")} />
                  {scriptLoopRange.active && <Chip size="small" color={scriptCurrentInLoopRange ? 'success' : 'warning'} variant="outlined" label={scriptCurrentInLoopRange ? t("当前位置在 A-B 内") : t("当前位置在 A-B 外")} />}
                </Stack>

                <Typography variant="caption" color="text.secondary" className="script-player-dock__note">
                  {scriptLoopAssistText}
                </Typography>

                <Stack direction="row" spacing={1} useFlexGap flexWrap="wrap" className="script-loop-panel__actions">
                  <Button size="small" variant="outlined" onClick={() => setScriptLoopBoundary('start')} disabled={!scriptLoaded || busyKey === 'script-configure'}>
                    <ScriptActionButtonLabel label={t("A 点 = 当前")} shortcut="Shift + A" />
                  </Button>
                  <Button size="small" variant="outlined" onClick={() => setScriptLoopBoundary('end')} disabled={!scriptLoaded || busyKey === 'script-configure'}>
                    <ScriptActionButtonLabel label={t("B 点 = 当前")} shortcut="Shift + B" />
                  </Button>
                  <Button size="small" variant="outlined" onClick={() => void jumpToScriptLoopBoundary('start')} disabled={!scriptLoaded || scriptLoopRange.startMs === null || busyKey === 'script-seek'}>
                    <ScriptActionButtonLabel label={t("跳到 A")} shortcut="[" />
                  </Button>
                  <Button size="small" variant="outlined" onClick={() => void jumpToScriptLoopBoundary('end')} disabled={!scriptLoaded || scriptLoopRange.endMs === null || busyKey === 'script-seek'}>
                    <ScriptActionButtonLabel label={t("跳到 B")} shortcut="]" />
                  </Button>
                  <Button size="small" variant="text" color="warning" onClick={clearScriptLoopRange} disabled={!scriptLoaded || !scriptHasLoopMarkers || busyKey === 'script-configure'}>
                    <ScriptActionButtonLabel label={t("清除区间")} shortcut="Shift + C" />
                  </Button>
                </Stack>
              </Box>

              <Box className="script-player-dock script-player-dock--speed">
                <Box className="script-player-dock__header">
                  <Typography variant="subtitle2">{t("时间倍率")}</Typography>
                  <Chip size="small" variant="outlined" label={scriptSpeedLabel} />
                </Box>

                <SliderControl
                  min={SCRIPT_SPEED_MIN}
                  max={SCRIPT_SPEED_MAX}
                  step={SCRIPT_SPEED_STEP}
                  disabled={busyKey === 'script-configure'}
                  value={clampScriptSpeed(scriptSettings.speed)}
                  valueFormatter={value => formatScriptSpeedLabel(value)}
                  onChange={next => {
                    const nextSpeed = Number(Array.isArray(next) ? next[0] : next);
                    updateScriptSettingsDraft({ speed: nextSpeed });
                  }}
                  onChangeCommitted={next => {
                    const nextSpeed = Number(Array.isArray(next) ? next[0] : next);
                    updateScriptSettingsDraft({ speed: nextSpeed }, { commit: true });
                  }}
                />

                <Box className="script-speed-presets">
                  {SCRIPT_SPEED_PRESETS.map(speed => {
                    const normalizedSpeed = clampScriptSpeed(speed);
                    const active = Math.abs(clampScriptSpeed(scriptSettings.speed) - normalizedSpeed) < 0.001;

                    return (
                      <Button
                        key={`script-speed-${speed}`}
                        size="small"
                        variant={active ? 'contained' : 'outlined'}
                        disabled={busyKey === 'script-configure'}
                        onClick={() => updateScriptSettingsDraft({ speed: normalizedSpeed }, { commit: true })}
                      >
                        {formatScriptSpeedLabel(normalizedSpeed)}
                      </Button>
                    );
                  })}
                </Box>

                <Typography variant="caption" color="text.secondary" className="script-player-dock__note">
                  {scriptSpeedDockText}
                </Typography>
              </Box>
            </Box>
          </Stack>
        </Box>

        <Box className="dialog-panel script-helper-panel script-player-assist">
          <Box className="dialog-panel__header">
            <Typography variant="subtitle2">{t("补充信息")}</Typography>
          </Box>

          <Tabs value={scriptHelperTab} onChange={(_, next) => setScriptHelperTab(next)} variant="fullWidth" className="script-helper-panel__tabs">
            <Tab value="help" label={t("说明")} />
            <Tab value="hotkeys" label={t("快捷键")} />
          </Tabs>

          {scriptHelperTab === 'help' ? (
            <Box className="script-helper-panel__body">
              <Box className="script-helper-panel__list">
                {scriptSupportItems.map(item => (
                  <Box key={item.title} className="script-helper-panel__item">
                    <Typography variant="caption" className="script-helper-panel__item-title">
                      {item.title}
                    </Typography>
                    <Typography variant="body2" color="text.secondary" className="script-helper-panel__item-text">
                      {item.text}
                    </Typography>
                  </Box>
                ))}
              </Box>
            </Box>
          ) : (
            <Box className="script-helper-panel__body script-helper-panel__body--hotkeys script-player-assist__body--hotkeys">
              <Box className="script-hotkey-sections script-hotkey-sections--compact">
                {scriptShortcutGroups.map(group => (
                  <Box key={group.key} className="script-hotkey-section script-hotkey-section--compact">
                    <Box className="script-hotkey-section__header script-hotkey-section__header--compact">
                      <Typography variant="subtitle2">{group.title}</Typography>
                      <Typography variant="caption" color="text.secondary" className="script-hotkey-section__caption">
                        {group.caption}
                      </Typography>
                    </Box>

                    <Box className="script-hotkey-grid script-hotkey-grid--compact">
                      {group.items.map(item => (
                        <ScriptHotkeyItem
                          key={`${group.key}-${item.shortcut}`}
                          shortcut={item.shortcut}
                          label={item.label}
                          description={item.description}
                          statusLabel={item.availability.label}
                          statusColor={item.availability.color}
                        />
                      ))}
                    </Box>
                  </Box>
                ))}
              </Box>
            </Box>
          )}
        </Box>
      </Stack>
    );
  }

  const oscListening = Boolean(overview?.osc?.listening);
  const oscListenerError = typeof overview?.osc?.listenerError === 'string' ? overview.osc.listenerError.trim() : '';
  const oscModeActive = actualInputMode === 'osc';
  const oscConfigEnabled = typeof overview?.osc?.enabled === 'boolean' ? overview.osc.enabled : config?.osc?.enabled !== false;
  const oscPreview = overview?.osc?.preview || [];
  const visibleCatalog = frozenPreview || oscPreview;
  const oscSources = Array.isArray(overview?.osc?.sources) ? overview.osc.sources : [];
  const selectedOscSourceKey = overview?.osc?.selectedSourceKey || '';
  const hasMultipleOscSources = oscSources.length > 1;
  const selectedOscSource = selectedOscSourceKey ? oscSources.find(source => source.key === selectedOscSourceKey) || null : null;
  const selectedOscSourceLabel = selectedOscSource ? formatOscSourceLabel(selectedOscSource) : t("自动选择");
  const oscQuery = overview?.osc?.query || null;
  const oscQueryPolling = oscQuery?.polling || null;
  const oscQueryReceiver = overview?.osc?.queryReceiver || null;
  const oscHub = overview?.osc?.hub || null;
  const oscHubTargetsDraft = Array.isArray(oscDraft?.hubTargets) ? oscDraft.hubTargets : [];
  const oscHubRuntimeTargets = Array.isArray(oscHub?.targets) ? oscHub.targets : [];
  const oscHubRuntimeTargetsById = useMemo(() => new Map(oscHubRuntimeTargets.map(target => [target.id, target])), [oscHubRuntimeTargets, getLocale()]);
  const oscHubTargetConflictLookup = useMemo(() => buildOscHubTargetConflictLookup(oscDraft), [oscDraft, getLocale()]);
  const oscHubConflictMessages = useMemo(() => flattenOscHubConflictMessages(oscHubTargetConflictLookup), [oscHubTargetConflictLookup, getLocale()]);
  const oscHubEnabledTargetCount = oscHubTargetsDraft.filter(target => target?.enabled !== false).length;
  const oscQueryNodes = Array.isArray(oscQuery?.nodes) ? oscQuery.nodes : [];
  const oscSourceSelectionOptions = useMemo(() => buildOscSourceSelectionOptions(oscSources), [oscSources, getLocale()]);
  const mappingPreviewEntries = useMemo(() => filterOscPreviewEntriesBySource(oscPreview, hasMultipleOscSources ? selectedOscSourceKey : ''), [oscPreview, hasMultipleOscSources, selectedOscSourceKey, getLocale()]);
  const previewEntriesForSuggestions = useMemo(() => (hasMultipleOscSources && selectedOscSourceKey ? mappingPreviewEntries : oscPreview), [hasMultipleOscSources, selectedOscSourceKey, mappingPreviewEntries, oscPreview, getLocale()]);
  const oscPathSuggestions = useMemo(() => buildOscPathSuggestions(previewEntriesForSuggestions, oscQueryNodes), [previewEntriesForSuggestions, oscQueryNodes, getLocale()]);
  const previewEntriesForTab = useMemo(() => {
    if (!hasMultipleOscSources || previewSourceTab === 'all') return visibleCatalog;
    return filterOscPreviewEntriesBySource(visibleCatalog, previewSourceTab);
  }, [hasMultipleOscSources, visibleCatalog, previewSourceTab, getLocale()]);
  const rankedOscPreview = useMemo(() => rankPreview(previewEntriesForTab, signalDrafts, { showFaceTracking, search: oscPreviewSearch, pinned: pinnedPaths, category: previewCategory }), [previewEntriesForTab, signalDrafts, showFaceTracking, oscPreviewSearch, pinnedPaths, previewCategory, getLocale()]);
  const sortedOscPreview = rankedOscPreview.slice(0, previewLimit);
  const oscListenerStatus = useMemo(() => {
    if (!oscConfigEnabled) {
      return {
        color: 'default',
        compactLabel: t("已关闭"),
        toolbarLabel: t("OSC 已关闭"),
      };
    }

    if (actualInputMode !== 'osc') {
      return {
        color: 'default',
        compactLabel: t("待启用"),
        toolbarLabel: t("OSC 待启用"),
      };
    }

    if (oscListening) {
      return {
        color: 'success',
        compactLabel: t("监听中"),
        toolbarLabel: t("OSC 监听中 · {0} 项", [oscPreview.length]),
      };
    }

    if (oscListenerError) {
      return {
        color: 'error',
        compactLabel: t("监听失败"),
        toolbarLabel: t("OSC 监听失败"),
      };
    }

    return {
      color: 'warning',
      compactLabel: t("未监听"),
      toolbarLabel: t("OSC 未监听"),
    };
  }, [actualInputMode, oscConfigEnabled, oscListening, oscPreview.length, oscListenerError, getLocale()]);
  const effectiveOscQueryUrl = useMemo(() => {
    const overviewUrl = typeof oscQuery?.url === 'string' ? oscQuery.url.trim() : '';
    if (overviewUrl) return overviewUrl;
    return (oscDraft.oscQueryUrl || '').trim();
  }, [oscQuery?.url, oscDraft.oscQueryUrl, getLocale()]);
  const oscQuerySummary = useMemo(() => {
    if (!oscDraft.oscQueryEnabled) return t("OSCQuery 已关闭");
    if (!effectiveOscQueryUrl) return t("OSCQuery 已开启，待填写地址");
    if (oscQuery?.error) return t("OSCQuery 同步失败");
    if (oscQuery?.listenConnected) return t("LISTEN 已连接 · {0} 条路径", [oscQuery?.listeningPathCount || oscQueryNodes.length]);
    if (oscQueryPolling?.running) return t("轮询回退 {0}Hz", [oscQueryPolling?.rateHz || oscDraft.oscQueryPollingRateHz]);
    if (oscQueryNodes.length > 0) return t("已同步 {0} 条路径", [oscQueryNodes.length]);
    return t("OSCQuery 已开启");
  }, [oscDraft.oscQueryEnabled, effectiveOscQueryUrl, oscDraft.oscQueryPollingRateHz, oscQuery, oscQueryNodes, oscQueryPolling?.rateHz, oscQueryPolling?.running, getLocale()]);
  const oscQueryPollingSummary = useMemo(() => {
    if (!oscDraft.oscQueryEnabled) return t("OSCQuery 客户端未启用");
    if (!oscDraft.oscQueryPollingEnabled) return t("轮询回退已关闭");
    if (oscQuery?.supportsListen) return t("对端支持 LISTEN，无需轮询");
    if (oscQueryPolling?.error) return t("轮询出错");
    if (oscQueryPolling?.running) return t("轮询 {0}Hz", [oscQueryPolling?.rateHz || oscDraft.oscQueryPollingRateHz]);
    return t("等待首次轮询");
  }, [oscDraft.oscQueryEnabled, oscDraft.oscQueryPollingEnabled, oscDraft.oscQueryPollingRateHz, oscQuery?.supportsListen, oscQueryPolling?.error, oscQueryPolling?.rateHz, oscQueryPolling?.running, getLocale()]);
  const oscQueryPanelSummary = useMemo(() => {
    const summary = oscQueryPolling?.running ? oscQueryPollingSummary : oscQuerySummary;
    return summary === t("OSCQuery 已开启") || summary === t("OSCQuery 同步失败") ? '' : summary;
  }, [oscQueryPolling?.running, oscQueryPollingSummary, oscQuerySummary, getLocale()]);
  const oscHubSummary = useMemo(() => {
    if (!oscDraft.hubEnabled) return t("Hub 已关闭");
    if (oscHub?.blockedBySourceSelection) return t("等待固定来源");
    if (oscHubEnabledTargetCount === 0) return t("暂无启用目标");
    if (oscHub?.activeTargetCount === 0) return t("目标未就绪");
    return normalizeOscHubMode(oscDraft.hubMode) === 'FixedRate'
      ? t("固定 {0}Hz", [normalizeOscHubRate(oscDraft.hubFixedRateHz, DEFAULT_OSC_HUB_RATE)])
      : t("事件驱动");
  }, [oscDraft.hubEnabled, oscDraft.hubMode, oscDraft.hubFixedRateHz, oscHub?.activeTargetCount, oscHub?.blockedBySourceSelection, oscHubEnabledTargetCount, getLocale()]);
  const oscHubSourceSummary = useMemo(() => {
    if (!oscDraft.hubEnabled) return t("Hub 未启用");
    if (oscHub?.blockedBySourceSelection) return t("检测到多个来源，请先固定“使用来源”");
    if (oscHub?.effectiveSourceLabel) return t("当前来源 · {0}", [oscHub.effectiveSourceLabel]);
    if (hasMultipleOscSources) return t("将跟随已固定来源");
    return oscSources[0] ? t("当前来源 · {0}", [formatOscSourceLabel(oscSources[0])]) : t("等待实时参数");
  }, [oscDraft.hubEnabled, oscHub?.blockedBySourceSelection, oscHub?.effectiveSourceLabel, hasMultipleOscSources, oscSources, getLocale()]);
  const oscHubIsFixedRate = normalizeOscHubMode(oscDraft.hubMode) === 'FixedRate';
  const oscSettingsSummary = useMemo(() => {
    if (oscSettingsTab === 'query') {
      const summary = oscQueryPolling?.running ? oscQueryPollingSummary : oscQuerySummary;
      return summary === t("OSCQuery 同步失败") ? '' : summary;
    }
    if (oscSettingsTab === 'hub') return oscHub?.blockedBySourceSelection ? oscHubSourceSummary : oscHubSummary;
    return `${oscDraft.receiverHost || '0.0.0.0'}:${oscDraft.receiverPort || 9001} · ${oscListenerStatus.compactLabel}`;
  }, [oscDraft.receiverHost, oscDraft.receiverPort, oscHub?.blockedBySourceSelection, oscHubSourceSummary, oscHubSummary, oscListenerStatus.compactLabel, oscQueryPolling?.running, oscQueryPollingSummary, oscQuerySummary, oscSettingsTab, getLocale()]);

  useEffect(() => {
    if (!hasMultipleOscSources) {
      setPreviewSourceTab(oscSources[0]?.key || 'all');
      return;
    }

    setPreviewSourceTab(previous => {
      if (previous === 'all' || oscSources.some(source => source.key === previous)) return previous;
      if (selectedOscSourceKey && oscSources.some(source => source.key === selectedOscSourceKey)) return selectedOscSourceKey;
      return 'all';
    });
  }, [hasMultipleOscSources, oscSources, selectedOscSourceKey]);
  const visibleOutputs = outputs;
  const effectiveOutputCount = visibleOutputs.filter(output => Boolean(output.enabled)).length;
  const inputSwitchDisabled = runtimeOverview?.inputActive === false;
  const outputWarningMessage = visibleOutputs.length === 0 ? t("当前还没有任何输出设备。添加并启用至少一个输出后，输入数据才会真正发送到硬件。") : effectiveOutputCount === 0 ? t("当前所有输出都处于禁用状态。即使输入在变化，也不会真正发到任何设备；请先启用至少一个输出。") : '';
  const outputDialogConflicts = useMemo(() => {
    if (!dialog || !config) return [];
    return getOutputTargetConflicts(config, dialog.outputId, dialog.draft);
  }, [config, dialog, getLocale()]);
  const outputDialogOverview = useMemo(() => {
    if (!dialog) return null;
    return getOutputOverview(overview, dialog.outputId);
  }, [overview, dialog, getLocale()]);
  const outputDialogConflictMessage = useMemo(() => formatOutputTargetConflictMessage(outputDialogConflicts), [outputDialogConflicts, getLocale()]);
  const hasSerialTargetConflict = outputDialogConflicts.some(conflict => conflict.binding.key.startsWith('serial:'));
  const hasNetworkTargetConflict = outputDialogConflicts.some(conflict => conflict.binding.key.startsWith('net:'));
  const hasIntifaceTargetConflict = outputDialogConflicts.some(conflict => conflict.binding.key.startsWith('intiface-'));
  const serialPortOwners = useMemo(() => {
    const owners = new Map();
    if (!dialog || !config || dialog.draft.type !== 'TCodeSerial') return owners;

    serialPorts.forEach(port => {
      const conflict = getOutputTargetConflicts(config, dialog.outputId, { ...dialog.draft, comPort: port.portName });
      if (conflict[0]?.owner) owners.set(port.portName, conflict[0].owner);
    });

    return owners;
  }, [config, dialog, serialPorts, getLocale()]);
  const hasUnsavedMappings = useMemo(() => savedSignalsHashRef.current && computeSignalHash(signalDrafts) !== savedSignalsHashRef.current, [signalDrafts, getLocale()]);
  const signalOverlapWarnings = useMemo(() => buildSignalOverlapWarnings(signalDrafts), [signalDrafts, getLocale()]);
  const LOG_MAX_VISIBLE = 300;
  const axisLogCatalog = useMemo(() => {
    const axes = new Set();
    const actions = new Set();

    logs.forEach(log => {
      if (!log.axisTrace) return;
      if (log.axisTrace.axis) axes.add(log.axisTrace.axis);
      if (log.axisTrace.action) actions.add(log.axisTrace.action);
    });

    return {
      axes: ['', ...Array.from(axes).sort((left, right) => left.localeCompare(right, 'en', { numeric: true }))],
      actions: ['', ...Array.from(actions).sort((left, right) => left.localeCompare(right, 'en', { numeric: true }))],
    };
  }, [logs, getLocale()]);
  const filteredLogResult = useMemo(() => {
    const levelIdx = Math.max(LOG_LEVEL_ORDER.indexOf(logFilterLevel), 0);
    const keyword = (logSearchText || '').trim().toLowerCase();

    const matched = logs.filter(log => {
      if (!logOnlyAxis && log.level && LOG_LEVEL_ORDER.indexOf(log.level) < levelIdx) return false;
      if (logOnlyAxis && !log.axisTrace) return false;
      if (logCategoryFilter && log.category !== logCategoryFilter) return false;
      if (logAxisFilter && log.axisTrace?.axis !== logAxisFilter) return false;
      if (logActionFilter && log.axisTrace?.action !== logActionFilter) return false;

      if (keyword) {
        const trace = log.axisTrace;
        const haystack = [log.message, log.category, trace?.axis, trace?.action, trace?.term, trace?.note, trace?.mode].filter(Boolean).join(' ').toLowerCase();

        if (!haystack.includes(keyword)) return false;
      }

      return true;
    });

    return {
      totalMatched: matched.length,
      truncated: matched.length > LOG_MAX_VISIBLE,
      visible: matched.length > LOG_MAX_VISIBLE ? matched.slice(matched.length - LOG_MAX_VISIBLE) : matched,
    };
  }, [logs, logFilterLevel, logCategoryFilter, logSearchText, logOnlyAxis, logAxisFilter, logActionFilter, getLocale()]);
  const filteredLogs = filteredLogResult.visible;
  const logCategories = useMemo(() => {
    const cats = new Set(logs.map(l => l.category).filter(Boolean));
    return ['', ...cats].sort();
  }, [logs, getLocale()]);
  const visibleAxisLogStats = useMemo(() => {
    return filteredLogs.reduce(
      (acc, log) => {
        if (!log.axisTrace) return acc;
        acc.total += 1;
        const stage = (log.axisTrace.action || '').toLowerCase();
        if (stage === 'emit') acc.emit += 1;
        if (stage === 'hold') acc.hold += 1;
        if (stage === 'ignored') acc.ignored += 1;
        return acc;
      },
      { total: 0, emit: 0, hold: 0, ignored: 0 },
    );
  }, [filteredLogs, getLocale()]);
  const manualMotionField = useMemo(() => {
    const mode = normalizeManualMotionMode(manualMotionMode);
    if (mode === 'Interval') {
      return {
        label: t("指定时长"),
        title: t("手动模式固定使用 I 指令，滑条值表示到达目标位置所需时长（毫秒），当前上限为 1000ms。"),
        min: 1,
        max: MANUAL_INTERVAL_MAX_MS,
        step: 1,
        valueFormatter: next => `${Math.round(Number(next || 0))}ms`,
      };
    }

    if (mode === 'Speed') {
      return {
        label: t("指定速度"),
        title: t("手动模式固定使用 S 指令；这里填写的是逻辑速度，真正发给设备的 S 数值会在每个输出设备里再按轴上限与速度单位基准换算。若设备对 S 支持不稳定，建议优先改用时间 (I) 或跟随轴配置。"),
        min: AXIS_LIMIT_MIN_SPEED,
        max: AXIS_LIMIT_MAX_SPEED,
        step: 1,
        valueFormatter: next => `${Math.round(Number(next || 0))}`,
      };
    }

    return {
      label: t("指定速度"),
      title: t("跟随轴配置：每个轴按各自轴配置决定使用时间、速度或无。这里填写的是逻辑速度上限；若轴配置为 I，会自动换算成对应时长，若轴配置为 S，则会在对应输出设备里再换算成最终发出的 S 数值。"),
      min: AXIS_LIMIT_MIN_SPEED,
      max: AXIS_LIMIT_MAX_SPEED,
      step: 1,
      valueFormatter: next => `${Math.round(Number(next || 0))}`,
    };
  }, [manualMotionMode, getLocale()]);

  if (loading) {
    return (
      <ThemeProvider theme={theme}>
        <CssBaseline />
        <Box className="loading-shell">
          <Card className="loading-card">
            <CardContent>
              <Stack spacing={2}>
                <Typography variant="h5">Sensa WebUI</Typography>
                <Typography color="text.secondary">{t("正在同步服务状态与设备配置…")}</Typography>
                <LinearProgress />
              </Stack>
            </CardContent>
          </Card>
        </Box>
      </ThemeProvider>
    );
  }

  return (
    <ThemeProvider theme={theme}>
      <CssBaseline />

      <Box className="app-shell">
        <AppBar
          position="sticky"
          color="transparent"
          elevation={0}
          sx={{
            borderBottom: theme => `1px solid ${theme.palette.divider}`,
            backdropFilter: 'blur(18px)',
            backgroundColor: 'rgba(255,255,255,0.82)',
          }}
        >
          <Toolbar className="studio-toolbar" sx={{ gap: 1.5, flexWrap: 'wrap', alignItems: 'center' }}>
            <Box sx={{ mr: 'auto' }}>
              <Typography variant="h6" sx={{ fontWeight: 800 }}>
                Sensa WebUI
              </Typography>
            </Box>

            <select className="language-select" aria-label="Language / 语言" value={locale} onChange={event => setLocale(event.target.value)}>
              <option value="zh-CN">简体中文</option>
              <option value="en-US">English</option>
            </select>
            <Chip size="small" color={wsState === 'connected' ? 'success' : wsState === 'connecting' ? 'warning' : 'default'} title={formatRealtimeStatus(wsState)} label={wsState==='connected'?t("在线"):wsState==='connecting'?t("连接中"):t("离线")} />
            <Chip className="toolbar-secondary" size="small" color={oscListenerStatus.color} variant="outlined" label={oscListenerStatus.toolbarLabel} />
            <Chip className="toolbar-secondary" size="small" variant="outlined" label={t("输入方式 {0}", [formatMode(actualInputMode)])} />
            <Chip className="toolbar-secondary" size="small" variant="outlined" label={t("有效输出 {0}/{1}", [effectiveOutputCount, visibleOutputs.length])} />

            {runtimeOverview?.isEmergency ? (
              <Button variant="contained" color="success" size="small" onClick={clearEmergency} disabled={busyKey === 'emergency-clear'}>{t("恢复输出")}</Button>
            ) : (
              <Button variant="contained" color="error" size="small" onClick={emergencyStop} disabled={busyKey === 'emergency-stop'}>{t("停止输出")}</Button>
            )}
          </Toolbar>
        </AppBar>

        <HelpDialog open={helpOpen} onClose={()=>setHelpOpen(false)} />
        <Box className="page-main">
          {visibleOutputs.length === 0 && <Alert severity="info" sx={{mb:2}}>{t("第一次使用 OSR？先给 Avatar 添加 Quick Start World Receiver，在测试世界核对 OSC，再连接设备。")}<Button component="a" href={docUrl("docs/quick-start.md")} target="_blank" rel="noreferrer" size="small">{t("完整入门步骤")}</Button>
          </Alert>}
          <Box className="quick-start"><Typography variant="body2">{t("连接输出 → 设置输入 → 校准映射 → 启用输入")}</Typography><Button size="small" onClick={()=>setHelpOpen(true)}>{t("使用帮助")}</Button></Box>
          {runtimeOverview?.isEmergency && <Alert severity="warning">{t("当前已停止所有输出。")}</Alert>}

          <Card className="section-card" variant="outlined">
            <CardHeader title={t("输入")} />
            <Divider />
            <CardContent>
              {inputSwitchDisabled && (
                <Alert severity="warning" className="section-status-alert">{t("当前输入开关已关闭。你现在切换输入页签、拖动手动滑条或等待 OSC/脚本更新，都不会真正驱动输出；测试前请先打开右上角的“输入开关”。")}</Alert>
              )}

              <Box
                sx={{
                  mb: 2,
                  display: 'grid',
                  gap: 1.25,
                  border: theme => `1px solid ${theme.palette.divider}`,
                  borderRadius: '18px',
                  backgroundColor: 'rgba(248, 250, 252, 0.82)',
                  padding: '12px 14px',
                }}
              >
                <Stack direction="row" spacing={1} useFlexGap flexWrap="wrap" justifyContent="space-between" alignItems="center">
                  <Stack direction="row" spacing={1} useFlexGap flexWrap="wrap" alignItems="center">
                    <Chip size="small" variant="outlined" color="primary" label={t("当前生效：{0}", [formatMode(actualInputMode)])} />
                    {hasPendingInputMode && <Chip size="small" variant="filled" color="warning" label={t("待应用：{0}", [formatMode(selectedInputTab)])} />}
                  </Stack>

                  <Stack direction="row" spacing={1} useFlexGap flexWrap="wrap" alignItems="center">
                    <Button size="small" onClick={() => recordingAction(overview?.recording?.isActive ? 'stop' : 'start')}>{overview?.recording?.isActive ? t("停止录制") : t("录制 L0")}</Button>
                    <Button size="small" disabled={!overview?.recording?.frameCount} onClick={() => recordingAction('export')}>{t("导出录制 (")}{overview?.recording?.frameCount || 0})</Button>
                    {hasPendingInputMode && (
                      <Button size="small" variant="text" onClick={() => selectInputTab(actualInputMode)}>{t("恢复到当前输入")}</Button>
                    )}
                    <Button size="small" variant="contained" onClick={() => applyInputMode(selectedInputTab)} disabled={!hasPendingInputMode || busyKey === `mode-${selectedInputTab}`}>
                      {busyKey === `mode-${selectedInputTab}` ? t("切换中…") : t("应用输入方式")}
                    </Button>
                    <FormControlLabel
                      control={
                        <Switch
                          checked={runtimeOverview?.inputActive !== false}
                          onChange={async (_, checked) => {
                            await apiRequest('/api/input/active', {
                              method: 'PUT',
                              headers: { 'Content-Type': 'application/json' },
                              body: JSON.stringify({ active: checked }),
                            });
                            await refreshOverview();
                          }}
                        />
                      }
                      label={<Typography variant="body2">{t("输入开关（关闭停止设备）")}</Typography>}
                    />
                  </Stack>
                </Stack>

                <Typography variant="body2" color="text.secondary">{t("切页签只切界面；点“应用输入方式”后才会真正生效。")}</Typography>
              </Box>

              {runtimeOverview?.inputActive && runtimeOverview?.gateClosed && <Alert severity="info">{t("OSC 门控已关闭，输出已停止；所有门控信号开启后恢复。")}</Alert>}
              <Tabs value={selectedInputTab} onChange={(_, next) => selectInputTab(next)} variant="scrollable" allowScrollButtonsMobile>
                {INPUT_MODES().map(item => (
                  <Tab key={item.value} value={item.value} label={item.label} />
                ))}
              </Tabs>

              <TabPanel value="osc" current={selectedInputTab}>
                <Stack spacing={2}>
                  <OscFlowStatus mappings={config?.signals || []} drafts={signalDrafts} dirty={Boolean(hasUnsavedMappings)} runtime={runtimeOverview || {}} mode={actualInputMode} listening={Boolean(overview?.osc?.listening)} />
                  {runtimeOverview?.inputActive && runtimeOverview?.poseBlocked && <Alert severity="warning">{t("精确定位当前不可用或未进入孔口，输出已停止。请检查下方观测状态；多个来源时先固定使用来源。")}</Alert>}
                  <Tabs value={oscWorkspaceTab} onChange={(_,value)=>setOscWorkspaceTab(value)} variant="scrollable" allowScrollButtonsMobile aria-label={t("OSC 工作区")}>
                    <Tab value="setup" label={t("参数与映射")}/><Tab value="diagnostics" label={t("空间诊断")}/><Tab value="calibration" label={t("量程校准")}/>
                  </Tabs>
                  <Box hidden={oscWorkspaceTab!=='diagnostics'}><PosePanel observations={overview?.poseTracking?.observations || []} activeKey={overview?.poseTracking?.activeKey} onUseRig={usePoseRig} /></Box>
                  <Box hidden={oscWorkspaceTab==='setup'}><SpsRootPanel observations={overview?.poseTracking?.spsRoots || []} onUsePoint={usePointRig} mode={oscWorkspaceTab==='calibration'?'calibration':'diagnostics'} /></Box>
                  <Box hidden={oscWorkspaceTab!=='setup'}>
                  <Box className="osc-section-grid">
                    <Box className="dialog-panel osc-settings-panel">
                      <Box className="dialog-panel__header osc-settings-panel__header">
                        <Box className="osc-settings-panel__title">
                          <Typography variant="subtitle2">{t("OSC 设置")}</Typography>
                          <Typography variant="caption" color="text.secondary">{oscSettingsSummary}</Typography>
                        </Box>
                        <Button size="small" variant="contained" onClick={saveOscConfig} disabled={busyKey === 'osc-save'}>{t("保存")}</Button>
                      </Box>

                      <Tabs value={oscSettingsTab} onChange={(_, next) => setOscSettingsTab(next)} variant="fullWidth" className="osc-settings-panel__tabs">
                        <Tab value="basic" label={t("基础")} />
                        <Tab value="query" label="OSCQuery" />
                        <Tab value="hub" label="Hub" />
                      </Tabs>

                      <TabPanel value="basic" current={oscSettingsTab}>
                        <Box className="osc-settings-panel__body">
                          <FormControlLabel
                            className="osc-config-panel__switch"
                            sx={{ m: 0 }}
                            control={<Switch checked={Boolean(oscDraft.oscEnabled)} disabled={busyKey === 'osc-save'} onChange={(_, checked) => setOscDraft(previous => ({ ...previous, oscEnabled: checked }))} />}
                            label={<Typography variant="body2"><HelpLabel text={t("启用 OSC")} title={t("这是 OSC 接收器本身的配置开关。关闭后会停止本地 UDP OSC 监听；它不会负责切换上方的输入方式，输入方式仍由页面顶部控制。")} /></Typography>}
                          />

                          <Box className="osc-settings-panel__field-grid">
                            <TextField label={t("监听地址")} helperText={t("默认仅本机；局域网监听请设置允许来源")} size="small" value={oscDraft.receiverHost} onChange={event => setOscDraft(previous => ({ ...previous, receiverHost: event.target.value }))} />
                            <TextField size="small" label={t("允许来源 IP（留空不限）")} value={oscDraft.allowedSourceAddresses} onChange={e => setOscDraft(p => ({ ...p, allowedSourceAddresses: e.target.value }))} />
                            <TextField size="small" type="number" label={t("断流停止（毫秒；0 关闭）")} helperText={t("OSC 可能仅在值变化时发送；仅在持续发送的来源上启用。")} value={oscDraft.inputTimeoutMs} onChange={e => setOscDraft(p => ({ ...p, inputTimeoutMs: Number(e.target.value) }))} />
                            <TextField
                              label={<HelpLabel text={t("监听端口")} title={t("Sensa 本地 UDP OSC 监听端口。")} />}
                              type="number"
                              size="small"
                              value={oscDraft.receiverPort}
                              onChange={event => setOscDraft(previous => ({ ...previous, receiverPort: Number(event.target.value || 0) }))}
                            />
                          </Box>

                          {oscModeActive && !oscConfigEnabled && <Alert severity="warning" variant="outlined">{t("当前输入方式仍是 OSC，但 OSC 接收器已关闭，因此不会接收新的 OSC 数据。若要恢复接收，请重新开启“启用 OSC”并保存。")}</Alert>}
                          {oscModeActive && oscListenerError && <Alert severity="error" variant="outlined">{diagnostic(oscListenerError)}</Alert>}
                        </Box>
                      </TabPanel>

                      <TabPanel value="query" current={oscSettingsTab}>
                        <Box className="osc-settings-panel__body">
                          <FormControlLabel
                            className="osc-config-panel__switch"
                            sx={{ m: 0 }}
                            control={<Switch checked={Boolean(oscDraft.oscQueryEnabled)} onChange={(_, checked) => setOscDraft(previous => ({ ...previous, oscQueryEnabled: checked }))} />}
                            label={<Typography variant="body2"><HelpLabel text={t("启用 OSCQuery")} title={t("启用后，Sensa 会连接远端 OSCQuery 服务并同步参数树；如果对端支持 LISTEN，还会建立实时订阅。")} /></Typography>}
                          />

                          <TextField
                            label={<HelpLabel text={t("OSCQuery 地址")} title={t("远端 OSCQuery 服务的根地址，例如 http://127.0.0.1:9001/。")} />}
                            size="small"
                            placeholder={t("例如：http://127.0.0.1:9001/")}
                            value={oscDraft.oscQueryUrl || ''}
                            disabled={!oscDraft.oscQueryEnabled}
                            onChange={event => setOscDraft(previous => ({ ...previous, oscQueryUrl: event.target.value }))}
                          />

                          <Box className="osc-settings-panel__field-grid osc-settings-panel__field-grid--two">
                            <FormControlLabel
                              className="osc-config-panel__switch"
                              sx={{ m: 0 }}
                              control={<Switch checked={Boolean(oscDraft.oscQueryPollingEnabled)} disabled={!oscDraft.oscQueryEnabled} onChange={(_, checked) => setOscDraft(previous => ({ ...previous, oscQueryPollingEnabled: checked }))} />}
                              label={<Typography variant="body2"><HelpLabel text={t("轮询回退")} title={t("当对端不支持 LISTEN 时，按固定频率重新拉取可读节点的当前值。")} /></Typography>}
                            />

                            <TextField
                              label={<HelpLabel text={t("频率 (Hz)")} title={t("轮询回退的频率。只在启用轮询回退时生效。")} />}
                              type="number"
                              size="small"
                              disabled={!oscDraft.oscQueryEnabled || !oscDraft.oscQueryPollingEnabled}
                              value={oscDraft.oscQueryPollingRateHz}
                              onChange={event => setOscDraft(previous => ({ ...previous, oscQueryPollingRateHz: Number(event.target.value || 0) }))}
                            />
                          </Box>

                          <FormControlLabel
                            className="osc-config-panel__switch"
                            sx={{ m: 0 }}
                            control={<Switch checked={Boolean(oscDraft.oscQueryReceiverEnabled)} onChange={(_, checked) => setOscDraft(previous => ({ ...previous, oscQueryReceiverEnabled: checked }))} />}
                            label={<Typography variant="body2"><HelpLabel text={t("自动发现")} title={t("把 Sensa 广播成 OSCQuery receiver，方便 VRChat 自动发现并把 OSC 数据送到当前监听端口。")} /></Typography>}
                          />

                          {oscQueryPanelSummary ? <Typography variant="caption" color="text.secondary" className="osc-settings-panel__meta">{oscQueryPanelSummary}</Typography> : null}

                          {oscQuery?.error && <Alert severity="warning" variant="outlined">OSCQuery：{diagnostic(oscQuery.error)}</Alert>}
                          {oscQueryPolling?.error && <Alert severity="warning" variant="outlined">{t("轮询回退：")}{diagnostic(oscQueryPolling.error)}</Alert>}
                          {oscQueryReceiver?.error && <Alert severity="error" variant="outlined">{t("自动发现：")}{diagnostic(oscQueryReceiver.error)}</Alert>}
                        </Box>
                      </TabPanel>

                      <TabPanel value="hub" current={oscSettingsTab}>
                        <Box className="osc-settings-panel__body">
                          <FormControlLabel
                            className="osc-config-panel__switch"
                            sx={{ m: 0 }}
                            control={<Switch checked={Boolean(oscDraft.hubEnabled)} onChange={(_, checked) => setOscDraft(previous => ({ ...previous, hubEnabled: checked }))} />}
                            label={<Typography variant="body2"><HelpLabel text={t("启用 OSC Hub")} title={t("启用后，Sensa 会把当前实时 OSC 数据转发到下面配置的多个 UDP 目标。")} /></Typography>}
                          />

                          <Box className="osc-settings-panel__field-grid osc-settings-panel__field-grid--two">
                            <SelectField
                              label={t("模式")}
                              title={t("事件驱动表示参数一变化就立即转发；固定频率表示在每个周期里合并为最新值后再发送。")}
                              value={normalizeOscHubMode(oscDraft.hubMode)}
                              options={OSC_HUB_MODE_OPTIONS()}
                              variant="compact"
                              onChange={next => setOscDraft(previous => ({ ...previous, hubMode: next }))}
                            />

                            <TextField
                              label={<HelpLabel text={t("频率 (Hz)")} title={t("仅固定频率模式生效；事件驱动模式下会忽略。")} />}
                              type="number"
                              size="small"
                              disabled={!oscHubIsFixedRate}
                              value={oscDraft.hubFixedRateHz}
                              onChange={event => setOscDraft(previous => ({ ...previous, hubFixedRateHz: Number(event.target.value || 0) }))}
                              helperText={oscHubIsFixedRate ? t("仅固定频率模式生效") : undefined}
                            />
                          </Box>

                          <Typography variant="caption" color="text.secondary" className="osc-settings-panel__meta">{oscHub?.blockedBySourceSelection ? oscHubSourceSummary : oscHubSummary}</Typography>

                          {oscDraft.hubEnabled && oscHub?.blockedBySourceSelection && (
                            <Alert severity="warning" variant="outlined">{t("请先在右侧参数预览里固定“使用来源”。")}</Alert>
                          )}

                          {oscHubConflictMessages.length > 0 && <Alert severity="warning" variant="outlined">{oscHubConflictMessages.join('；')}</Alert>}
                          {oscHub?.lastDropReason && Number(oscHub?.droppedPacketCount || 0) > 0 && <Alert severity="error" variant="outlined">{t("最近一次转发失败：")}{oscHub.lastDropReason}</Alert>}

                          {oscHubTargetsDraft.length === 0 ? (
                            <Box className="empty-inline-state empty-inline-state--compact">
                              <Stack spacing={1} alignItems="center">
                                <Typography color="text.secondary">{t("还没有 Hub 目标")}</Typography>
                                <Tooltip title={t("新增一个 UDP Hub 转发目标")} arrow>
                                  <Button size="small" variant="outlined" onClick={addOscHubTargetDraft}>{t("新增目标")}</Button>
                                </Tooltip>
                              </Stack>
                            </Box>
                          ) : (
                            <Box className="osc-hub-target-list">
                              {oscHubTargetsDraft.map(target => (
                                <OscHubTargetRow
                                  key={target._draftId}
                                  target={target}
                                  runtimeTarget={oscHubRuntimeTargetsById.get(target.id) || null}
                                  conflictMessages={oscHubTargetConflictLookup.get(target._draftId) || []}
                                  onChange={patch => updateOscHubTargetDraft(target._draftId, patch)}
                                  onRemove={() => removeOscHubTargetDraft(target._draftId)}
                                />
                              ))}
                            </Box>
                          )}

                          {oscHubTargetsDraft.length > 0 && (
                            <Stack direction="row" spacing={1} useFlexGap flexWrap="wrap" className="osc-config-panel__actions">
                              <Tooltip title={t("新增一个 UDP Hub 转发目标")} arrow>
                                <Button size="small" variant="outlined" onClick={addOscHubTargetDraft}>{t("新增目标")}</Button>
                              </Tooltip>
                            </Stack>
                          )}
                        </Box>
                      </TabPanel>
                    </Box>

                    <Box className="dialog-panel osc-preview-panel">
                      <Box className="dialog-panel__header">
                        <Typography variant="subtitle2">{t("参数工作台")}</Typography>
                        <Button size="small" variant={frozenPreview ? 'contained' : 'text'} onClick={() => setFrozenPreview(previous => previous ? null : [...oscPreview])}>{frozenPreview ? t("恢复实时预览") : t("冻结预览")}</Button>
                        {rankedOscPreview.length > previewLimit && <Button size="small" onClick={() => setPreviewLimit(previous => previous + 100)}>{t("再显示 100 项")}</Button>}
                        <Stack direction="row" spacing={1} useFlexGap flexWrap="wrap" alignItems="center">
                          <Chip size="small" variant="outlined" label={t("{0} / {1} 项", [rankedOscPreview.length, previewEntriesForTab.length])} />
                          <FormControlLabel control={<Switch size="small" checked={showFaceTracking} onChange={e => setShowFaceTracking(e.target.checked)} />} label={t("显示 FT")} />
                          <TextField size="small" placeholder={t("搜索参数路径")} value={oscPreviewSearch} onChange={e => setOscPreviewSearch(e.target.value)} />
                          {hasMultipleOscSources && (
                            <SelectField
                              label={t("使用来源")}
                              title={t("这里决定 Sensa 在多来源同时存在时，OSC 映射预览与实时驱动默认使用哪个来源；下面的标签页只负责浏览。")}
                              value={selectedOscSourceKey}
                              options={oscSourceSelectionOptions}
                              variant="compact"
                              className="osc-preview__source-select"
                              formControlProps={{ sx: { minWidth: 180 } }}
                              onChange={applyOscSourceSelection}
                            />
                          )}
                        </Stack>
                      </Box>

                      <Stack direction="row" gap={.5} flexWrap="wrap" sx={{ mb: 1 }}>
                        {[['all', t("全部可见")], ['related', t("触觉候选")], ['mapped', t("已映射")], ['pose', t("定位阵列")]].map(([value, label]) => <Chip key={value} size="small" label={label} color={previewCategory === value ? 'primary' : 'default'} onClick={() => { setPreviewCategory(value); setPreviewLimit(100); }} />)}
                        <Typography variant="caption" color="text.secondary" sx={{ ml: 1 }}>{t("★ 置顶参数会保留显示；冻结仅暂停表格，不停止设备。")}</Typography>
                      </Stack>
                      {hasMultipleOscSources && <Typography variant="caption" color="text.secondary">{t("当前使用来源：")}{selectedOscSourceLabel}</Typography>}

                      {hasMultipleOscSources && (
                        <Tabs value={previewSourceTab} onChange={(_, next) => setPreviewSourceTab(next)} variant="scrollable" allowScrollButtonsMobile>
                          <Tab value="all" label={t("全部 ({0})", [oscPreview.length])} />
                          {oscSources.map(source => (
                            <Tab key={source.key} value={source.key} label={`${formatOscSourceLabel(source)} (${source.parameterCount || 0})`} />
                          ))}
                        </Tabs>
                      )}

                      <Box className="osc-preview-panel__body">
                        {previewEntriesForTab.length === 0 ? (
                          <Box className="empty-inline-state">
                            <Stack spacing={1} alignItems="center">
                              <Typography color="text.secondary">{t("暂无符合筛选条件的 OSC 参数（FT 默认隐藏，已映射参数始终显示）")}</Typography>
                              {oscQueryNodes.length > 0 && <Typography variant="caption" color="text.secondary">{t("已同步 ")}{oscQueryNodes.length}{t(" 条 OSCQuery 路径")}</Typography>}
                            </Stack>
                          </Box>
                        ) : (
                          <TableContainer className="osc-preview-table-wrap">
                            <Table size="small" className="osc-preview-table">
                              <TableHead>
                                <TableRow>
                                  <TableCell width="36">{t("置顶")}</TableCell>{hasMultipleOscSources && <TableCell width="170">{t("来源")}</TableCell>}<TableCell>{t("参数名称")}</TableCell>
                                  <TableCell width="110">{t("类型")}</TableCell>
                                  <TableCell width="120" align="right">{t("当前值")}</TableCell>
                                  <TableCell width="110" align="right">{t("更新时间")}</TableCell><TableCell width="60">{t("操作")}</TableCell>
                                </TableRow>
                              </TableHead>
                              <TableBody>
                                {sortedOscPreview.map(entry => {
                                  const matched = entry._matches;
                                  const probe = probePresentation(entry.path);
                                  const tooltipText = matched
                                    ? matched
                                        .map(s => {
                                          const roleLabel = SIGNAL_ROLE_OPTIONS().find(r => r.value === s.role)?.label || s.role || t("未分配");
                                          const invertNote = s.invertDirection ? t("（反向）") : '';
                                          return `${s.oscPath} → ${roleLabel}${invertNote}`;
                                        })
                                        .join('；')
                                    : '';

                                  return (
                                    <Tooltip key={`${entry.sourceKey}-${entry.path}`} title={tooltipText || parameterMeaning(entry.path)} arrow>
                                      <TableRow
                                        hover
                                        sx={{
                                          backgroundColor: matched ? 'rgba(25, 118, 210, 0.08)' : undefined,
                                          '&:hover': { backgroundColor: matched ? 'rgba(25, 118, 210, 0.16)' : undefined },
                                        }}
                                      >
                                        <TableCell padding="none"><Button size="small" sx={{ minWidth: 28 }} aria-label={`${pinnedPaths.includes(entry.path) ? t("取消置顶") : t("置顶")} ${entry.path}`} onClick={() => togglePinned(entry.path)}>{pinnedPaths.includes(entry.path) ? '★' : '☆'}</Button></TableCell>
                                        {hasMultipleOscSources && <TableCell>{entry.sourceLabel || '—'}</TableCell>}
                                        <TableCell className="osc-preview-path" sx={{ fontWeight: matched ? 600 : undefined, color: matched ? 'primary.main' : undefined }}>
                                          <Button variant="text" size="small" className="parameter-name-button" onClick={() => setParameterDetail(entry)}>{entry.path}</Button>
                                          {probe && <Typography variant="caption" display="block" title={probe.hint}><Box component="span" sx={{display:'inline-block',width:9,height:9,borderRadius:'50%',bgcolor:probe.color,border:'1px solid #586574',mr:.5}} />{probe.label} · {probe.marker}{t(" · 输入采样")}</Typography>}
                                          {!matched && entry.classification?.hint && <Typography variant="caption" display="block" color="text.secondary">{diagnostic(entry.classification.hint)}</Typography>}
                                        </TableCell>
                                        <TableCell>{entry.type || '—'}</TableCell>
                                        <TableCell align="right">{entry.value ?? '—'}</TableCell>
                                        <TableCell align="right" data-testid="osc-timestamp">{formatPreviewTimestamp(entry.timestampMs)}</TableCell>
                                        <TableCell><Button size="small" title={/^Sensa\/(Point|Handle|Pose)\//.test(entry.path)?t("用此定位对象替换整套草稿，包括旧门控；保存前可恢复。"):t("添加映射草稿；请检查含义后保存。")} onClick={() => mapPreviewParameter(entry)}>{/^Sensa\/(Point|Handle|Pose)\//.test(entry.path)?t("替换草稿"):t("映射")}</Button></TableCell>
                                      </TableRow>
                                    </Tooltip>
                                  );
                                })}
                              </TableBody>
                            </Table>
                          </TableContainer>
                        )}
                      </Box>
                    </Box>
                  </Box>

                  <Box className="dialog-panel">
                    <Box className="dialog-panel__header">
                      <Typography variant="subtitle2">{t("OSC 映射")}</Typography>
                      <Stack direction="row" spacing={0.5}>
                        {hasUnsavedMappings && <Chip size="small" color="warning" variant="filled" label={t("未保存（仅预览）")} />}
                        <Chip size="small" variant="outlined" label={t("{0} 条", [signalDrafts.length])} />
                      </Stack>
                    </Box>

                    <Stack className="osc-preset-toolbar" direction="row" spacing={2} useFlexGap flexWrap="wrap" alignItems="center" sx={{ py: 1 }}>
                      <SelectField
                        label={t("预设方案")}
                        value={selectedOscPreset}
                        options={oscMappingPresets.map(preset => ({ value: preset.id, label: preset.name }))}
                        variant="inline"
                        hintTitle={selectedOscPresetDescription}
                        className="osc-preset-toolbar__select"
                        onChange={next => setSelectedOscPreset(next)}
                      />

                      <Divider orientation="vertical" flexItem />

                      <Stack direction="row" spacing={1} useFlexGap flexWrap="wrap">
                        <Tooltip title={t("用选中预设的映射替换当前全部映射")} arrow>
                          <Button variant="contained" size="small" onClick={() => applyOscPreset('replace')} disabled={!selectedOscPresetConfig}>{t("替换草稿")}</Button>
                        </Tooltip>
                        <Tooltip title={t("将选中预设的映射追加到当前映射列表")} arrow>
                          <Button variant="outlined" size="small" onClick={() => applyOscPreset('append')} disabled={!selectedOscPresetConfig}>{t("追加草稿")}</Button>
                        </Tooltip>
                        {selectedOscPresetConfig && (
                          <Tooltip title={selectedOscPresetConfig.isBuiltIn ? t("将内置预设复制为自定义预设以便修改") : t("编辑当前预设的名称与映射")} arrow>
                            <Button variant="text" size="small" onClick={() => openPresetDialog(selectedOscPreset)}>
                              {selectedOscPresetConfig.isBuiltIn ? t("复制") : t("编辑")}
                            </Button>
                          </Tooltip>
                        )}
                        <Tooltip title={t("将当前映射列表保存为一套新的预设方案")} arrow>
                          <Button variant="text" size="small" onClick={() => openPresetDialog(null, { fromCurrent: true, currentMappings: signalDrafts })} disabled={signalDrafts.length === 0}>{t("另存为预设")}</Button>
                        </Tooltip>
                        <Tooltip title={t("创建一个不带任何映射的空白预设")} arrow>
                          <Button variant="text" size="small" onClick={() => openPresetDialog(null)}>{t("新建空预设")}</Button>
                        </Tooltip>
                        <Tooltip title={selectedOscPresetConfig?.isBuiltIn ? t("内置预设不可删除") : t("删除选中的自定义预设")} arrow>
                          <Button
                            color="error"
                            variant="text"
                            size="small"
                            onClick={deleteSelectedPreset}
                            disabled={!selectedOscPresetConfig || Boolean(selectedOscPresetConfig?.isBuiltIn) || busyKey?.startsWith('preset-delete-')}
                          >{t("删除")}</Button>
                        </Tooltip>
                      </Stack>
                    </Stack>

                    <Alert severity="info" className="mapping-guide-alert">
                      <Typography variant="body2">{t("调映射时按这个顺序看：")}<strong>{t("输入范围")}</strong> → <strong>{t("曲线")}</strong> → <strong>{t("映射范围")}</strong>。
                      </Typography>
                    </Alert>

                    {signalOverlapWarnings.length > 0 && (
                      <Alert severity="info" className="mapping-overlap-alert">
                        <Typography variant="body2" className="mapping-guide-alert__title">{t("多个参数共同驱动同一输出轴。")}</Typography>
                        <Typography variant="body2">
                          {signalOverlapWarnings.map(item => t("{0} 当前有 {1} 条规则的映射范围互相重叠，{2}。进入重叠区后，系统会按“谁更深谁接管”只保留一条输出，所以另一条在部分区间看起来可能像没生效。", [item.label, item.affectedCount, item.fusionSummary])).join('；')}
                        </Typography>
                        <Typography variant="caption" color="text.secondary" sx={{ mt: 0.5, display: 'block' }}>{t("多个孔位或协议别名可以映射到同一轴；按校准后的强度融合，不把数值相加。")}</Typography>
                      </Alert>
                    )}

                    {signalDrafts.length === 0 ? (
                      <Box className="empty-inline-state">
                        <Stack spacing={1.5} alignItems="center">
                          <Typography color="text.secondary">{t("还没有轴映射")}</Typography>
                          <Button variant="outlined" onClick={() => addSignalDraft()}>{t("新增映射")}</Button>
                        </Stack>
                      </Box>
                    ) : (
                      <Box className="signal-list">
                        {signalDrafts.map(draft => (
                          <SignalMappingRow
                            key={draft._draftId}
                            draft={draft}
                            latestEntry={draft.sourceMode === 'SensaPoint' ? pointPreviewEntry(overview?.poseTracking?.spsRoots || [], draft, selectedOscSourceKey) : draft.sourceMode === 'SensaPose' ? posePreviewEntry(overview?.poseTracking?.observations || [], draft, selectedOscSourceKey, overview?.poseTracking?.activeKey) : getLatestOscPreviewEntry(mappingPreviewEntries.length > 0 ? mappingPreviewEntries : oscPreview, draft.oscPath, selectedOscSourceKey)}
                            pathOptions={oscPathSuggestions}
                            onChange={patch => updateSignalDraft(draft._draftId, patch)}
                            onRemove={() => removeSignalDraft(draft._draftId)}
                          />
                        ))}
                      </Box>
                    )}

                    <Stack direction="row" spacing={1} useFlexGap flexWrap="wrap" sx={{ mt: 1.5 }}>
                      <Button variant="outlined" onClick={() => addSignalDraft()}>{t("新增映射")}</Button>
                      <Button variant="outlined" onClick={restoreSignalDrafts} disabled={!hasUnsavedMappings}>{t("恢复映射")}</Button>
                      <Button variant="contained" onClick={saveOscMappings} disabled={busyKey === 'osc-mappings-save'} color={hasUnsavedMappings ? 'warning' : 'primary'}>
                        {hasUnsavedMappings ? t("保存并应用映射 ●") : t("保存并应用映射")}
                      </Button>
                      <Button variant="outlined" color="error" onClick={() => setConfirmClearMappings(true)} disabled={signalDrafts.length === 0}>{t("清空映射")}</Button>
                    </Stack>

                    {hasUnsavedMappings && (
                      <Typography variant="caption" color="text.secondary" sx={{ mt: 1, display: 'block' }}>{t("当前未保存修改只影响此页预览；点击“保存并应用映射”后才会真正重建 Companion 运行时的 OSC 映射。")}</Typography>
                    )}
                  </Box>
                  </Box>
                </Stack>
              </TabPanel>

              <TabPanel value="manual" current={selectedInputTab}>
                <Stack spacing={2}>
                  <Box className="axis-grid">
                    {MANUAL_AXES().map(axis => (
                      <AxisSlider key={axis.key} axis={axis} value={manualDraft[axis.key]} onChange={next => handleManualSliderChange({ [axis.key]: next })} />
                    ))}
                  </Box>

                  <Box className="manual-toolbar">
                    <Stack direction="row" spacing={1.5} useFlexGap flexWrap="wrap" alignItems="center" className="manual-toolbar__actions">
                      <Tooltip title={t("使用当前所有滑条值驱动输出设备执行")} arrow>
                        <span>
                          <Button variant="contained" onClick={applyManualOnce} disabled={busyKey === 'manual-once'}>{t("更新位置")}</Button>
                        </span>
                      </Tooltip>
                      <Tooltip title={t("把所有滑条回到回正值；开启持续更新时会立即同步到后端。")} arrow>
                        <span>
                          <Button variant="outlined" onClick={() => handleManualSliderChange({ ...EMPTY_MANUAL })}>{t("回正")}</Button>
                        </span>
                      </Tooltip>
                      <FormControlLabel
                        control={
                          <Switch
                            checked={manualContinuous}
                            onChange={(_, checked) => {
                              setManualContinuous(checked);
                            }}
                          />
                        }
                        label={<HelpLabel text={t("持续更新")} title={t("开启后，每次拖动滑条都会立即更新后端；关闭后滑条仅本地预览，须点「更新位置」才会生效。")} />}
                      />
                      <Stack direction="row" spacing={1} useFlexGap flexWrap="wrap" alignItems="center" className="manual-toolbar__motion-controls">
                        <SelectField
                          label={t("斜率方式")}
                          title={t("跟随轴配置：每个轴按自己的配置决定走时间 / 速度 / 无；时间：全部按 I；速度：全部按 S。")}
                          value={manualMotionMode}
                          options={MANUAL_MOTION_MODE_OPTIONS()}
                          variant="compact"
                          className="manual-toolbar__motion-select"
                          formControlProps={{ sx: { minWidth: 180 } }}
                          onChange={next => handleManualMotionModeChange(next)}
                        />

                        <Box className="manual-toolbar__motion-slider">
                          <ValueSliderField
                            label={manualMotionField.label}
                            title={manualMotionField.title}
                            value={manualMotionValue}
                            min={manualMotionField.min}
                            max={manualMotionField.max}
                            step={manualMotionField.step}
                            valueFormatter={manualMotionField.valueFormatter}
                            onChange={next => handleManualMotionValueChange(next)}
                          />
                        </Box>
                      </Stack>
                    </Stack>
                  </Box>
                </Stack>
              </TabPanel>

              <TabPanel value="script" current={selectedInputTab}>
                {renderScriptPlayer()}
              </TabPanel>
            </CardContent>
          </Card>

          <Card className="section-card" variant="outlined">
            <CardHeader title={t("配置")} />
            <Divider />
            <CardContent>
              <Box className="config-cards-row">
                {axisProfiles.map(profile => {
                  const usedCount = outputs.filter(output => isTCodeOutputType(output.type) && output.motionProfileId === profile.id).length;
                  const axisRows = buildAxisProfileAxisRows(profile);

                  return (
                    <Card key={profile.id} className="config-card" variant="outlined">
                      <CardHeader
                        title={profile.name}
                        subheader={usedCount > 0 ? t("{0} 个输出在用", [usedCount]) : t("未分配输出")}
                        action={profile.isDefault ? <Chip size="small" color="primary" variant="outlined" label={t("默认")} /> : null}
                      />
                      <CardContent>
                        <Stack spacing={1.5} className="config-card__content-stack">
                          <Box className="axis-profile-detail-list config-card__axis-list">
                            {axisRows.map(item => (
                              <Box key={`${profile.id}-axis-${item.axis}`} className="axis-profile-detail-row">
                                <Typography variant="caption" className="axis-profile-detail-row__axis">
                                  {item.axis}
                                </Typography>
                                <Box className="axis-profile-detail-row__details">
                                  {item.details.map(detail => (
                                    <Box
                                      key={`${profile.id}-${item.axis}-${detail.label}`}
                                      component="span"
                                      className={`axis-profile-detail-pill${detail.changed ? ` axis-profile-detail-pill--changed axis-profile-detail-pill--${detail.tone}` : ''}`}
                                    >
                                      {detail.label}
                                    </Box>
                                  ))}
                                </Box>
                              </Box>
                            ))}
                          </Box>

                          <Stack direction="row" spacing={1} useFlexGap flexWrap="wrap" className="config-card__action-row">
                            <Button variant="contained" className="config-card__action-button" onClick={() => openProfileDialog(profile.id)}>{t("修改配置")}</Button>
                            {!profile.isDefault && (
                              <Button variant="outlined" className="config-card__action-button" onClick={() => setDefaultAxisProfile(profile.id)}>{t("设为默认")}</Button>
                            )}
                            {!profile.isDefault && (
                              <Button color="error" className="config-card__action-button" onClick={() => removeAxisProfile(profile.id)}>{t("移除")}</Button>
                            )}
                          </Stack>
                        </Stack>
                      </CardContent>
                    </Card>
                  );
                })}

                <Card className="config-card config-card--add" variant="outlined">
                  <CardContent>
                    <Stack spacing={1.5} alignItems="center" justifyContent="center" className="config-card__add-body" sx={{ textAlign: 'center' }}>
                      <Typography variant="subtitle1">{t("新增轴配置")}</Typography>
                      <Typography variant="body2" color="text.secondary">{t("新建一套可复用的轴限制。")}</Typography>
                      <Button variant="contained" className="config-card__add-button" onClick={openNewProfileDialog}>{t("+ 轴配置")}</Button>
                    </Stack>
                  </CardContent>
                </Card>
              </Box>
            </CardContent>
          </Card>

          <Card className="section-card" variant="outlined">
            <CardHeader title={t("输出")} />
            <Divider />
            <CardContent>
              {outputWarningMessage && (
                <Alert severity="warning" className="section-status-alert">
                  {outputWarningMessage}
                </Alert>
              )}

              <Stack spacing={2}>
                <Box className="output-toolbar">
                  <Stack direction="row" spacing={1} useFlexGap flexWrap="wrap">
                    {OUTPUT_TYPES().map(output => (
                      <Button key={output.value} size="small" variant="outlined" onClick={() => addOutputCard(output.value)}>
                        + {output.label}
                      </Button>
                    ))}
                  </Stack>
                </Box>

                {visibleOutputs.length === 0 ? (
                  <Box className="empty-state">
                    <Typography variant="h6">{t("暂无输出")}</Typography>
                    <Typography color="text.secondary">{t("添加一个输出设备")}</Typography>
                  </Box>
                ) : (
                  <Box className="outputs-row">
                    {visibleOutputs.map(output => {
                      const outputState = getOutputOverview(overview, output.id) || {};
                      const typeMeta = OUTPUT_TYPE_BY_VALUE()[output.type] || { label: output.type, shortLabel: output.type, scanSupported: false };
                      const isEnabled = Boolean(output.enabled);
                      const outputBusy = busyKey === `output-enable-${output.id}`;
                      const connectionLabel = isEnabled ? (outputState.connected ? t("已连接") : t("未连接")) : t("已禁用");
                      const summary = buildOutputSummary(output);
                      const profileName = isTCodeOutputType(output.type)
                        ? outputState.profileName || getAxisProfile(config, output.motionProfileId)?.name || getDefaultAxisProfile(config)?.name
                        : null;
                      const tcodeSettings = outputState.tcodeSettings || null;
                      const tcodeDeviceInfo = outputState.tcodeDeviceInfo || null;

                      return (
                        <Card key={output.id} className={`output-card${isEnabled ? ' output-card--enabled' : ' output-card--disabled'}`} variant="outlined">
                          <CardHeader
                            className="output-card__header"
                            title={output.name}
                            subheader={summary}
                            action={
                              <Button
                                className="output-card__toggle-button"
                                size="small"
                                variant={isEnabled ? 'contained' : 'outlined'}
                                color={isEnabled ? 'warning' : 'primary'}
                                onClick={() => setOutputEnabled(output.id, !isEnabled)}
                                disabled={outputBusy}
                              >
                                {outputBusy ? t("处理中…") : isEnabled ? t("禁用") : t("启用")}
                              </Button>
                            }
                          />
                          <CardContent className="output-card__content">
                            <Stack spacing={1.5} sx={{ flex: 1 }}>
                              <Stack direction="row" spacing={1} useFlexGap flexWrap="wrap" className="output-card-meta">
                                <Chip size="small" variant="outlined" label={typeMeta.shortLabel} />
                                <Chip size="small" color={!isEnabled ? 'default' : outputState.connected ? 'success' : 'warning'} variant="outlined" label={connectionLabel} />
                                {profileName && <Chip size="small" variant="outlined" label={t("轴配置 · {0}", [profileName])} />}
                                {isTCodeOutputType(output.type) && <Chip size="small" variant="outlined" label={t("输出斜率 · {0}", [formatSlopeModeLabel(tcodeSettings?.slopeMode || output.slopeMode)])} />}
                                {isTCodeOutputType(output.type) && <Chip size="small" variant="outlined" label={t("速度基准 · {0}", [formatSpeedUnitBaseLabel(tcodeSettings?.speedUnitBase || output.speedUnitBase)])} />}
                              </Stack>

                              <OutputPositionPanel state={outputState} />
                              {output.type === 'TCodeSerial' && (
                                <TCodeDeviceInfoCard
                                  deviceInfo={tcodeDeviceInfo}
                                  connected={Boolean(outputState.connected)}
                                  onRefresh={() => refreshTCodeDeviceInfo(output.id)}
                                  busy={busyKey === `tcode-device-refresh-${output.id}`}
                                  className="output-card__device-info"
                                />
                              )}

                              {output.type === 'Intiface' && Array.isArray(outputState.devices) && outputState.devices.length > 0 && (
                                <Box className="device-list">
                                  {outputState.devices.map(device => (
                                    <Chip key={`${device.name}-${device.index}`} size="small" variant="outlined" label={device.name} />
                                  ))}
                                </Box>
                              )}

                              {typeMeta.scanSupported && (
                                <Stack direction="row" spacing={1} useFlexGap flexWrap="wrap">
                                  <Button size="small" variant="text" onClick={() => toggleIntifaceScan(true, output.id)}>{t("开始扫描")}</Button>
                                  <Button size="small" variant="text" onClick={() => toggleIntifaceScan(false, output.id)}>{t("停止扫描")}</Button>
                                </Stack>
                              )}

                              <Box className="output-card-actions">
                                <Button size="small" variant="outlined" onClick={() => openOutputDialog(output.id)}>{t("配置")}</Button>
                                <Button size="small" color="error" onClick={() => removeOutputCard(output.id)}>{t("移除")}</Button>
                              </Box>
                            </Stack>
                          </CardContent>
                        </Card>
                      );
                    })}
                  </Box>
                )}
              </Stack>
            </CardContent>
          </Card>

          <Card className="section-card" variant="outlined">
            <CardHeader title={t("日志")} />
            <Divider />
            <CardContent>
              <Box className="log-toolbar">
                <Stack direction="row" spacing={1} useFlexGap flexWrap="wrap" alignItems="center">
                  <SelectField label={t("级别")} value={logFilterLevel} options={[{ value: 'debug', label: t("全部日志") }, { value: 'info', label: t("信息以上") }, { value: 'warning', label: t("警告以上") }, { value: 'error', label: t("仅错误") }]} variant="compact" formControlProps={{ sx: { minWidth: 112 } }} onChange={setLogFilterLevel} />

                  <SelectField label={t("分类")} value={logCategoryFilter} options={[{ value: '', label: t("全部分类") }, ...logCategories.filter(Boolean).map(cat => ({ value: cat, label: cat }))]} variant="compact" formControlProps={{ sx: { minWidth: 130 } }} onChange={setLogCategoryFilter} />

                  <SelectField label={t("轴")} value={logAxisFilter} options={[{ value: '', label: t("全部轴") }, ...axisLogCatalog.axes.filter(Boolean).map(axis => ({ value: axis, label: axis }))]} variant="compact" formControlProps={{ sx: { minWidth: 110 } }} onChange={setLogAxisFilter} />

                  <SelectField label={t("结果")} value={logActionFilter} options={[{ value: '', label: t("全部结果") }, ...axisLogCatalog.actions.filter(Boolean).map(action => ({ value: action, label: formatAxisTraceAction(action).label }))]} variant="compact" formControlProps={{ sx: { minWidth: 120 } }} onChange={setLogActionFilter} />

                  <TextField size="small" placeholder={t("搜索日志 / 轴 / 备注")} value={logSearchText} onChange={event => setLogSearchText(event.target.value)} sx={{ minWidth: 220, flex: '1 1 240px' }} />

                  <FormControlLabel
                    sx={{ m: 0, ml: 0.5 }}
                    control={<Switch size="small" checked={logOnlyAxis} onChange={(_, checked) => setLogOnlyAxis(checked)} />}
                    label={<Typography variant="caption">{t("仅看轴调试")}</Typography>}
                  />
                </Stack>

                <Stack direction="row" spacing={1} useFlexGap flexWrap="wrap" alignItems="center" className="log-summary">
                  <Chip size="small" variant="outlined" label={t("可见 {0} 条", [filteredLogs.length])} />
                  {filteredLogResult.truncated && <Chip size="small" color="warning" variant="outlined" label={t("最近 {0}/{1}", [LOG_MAX_VISIBLE, filteredLogResult.totalMatched])} />}
                  <Chip size="small" variant="outlined" label={t("轴调试 {0}", [visibleAxisLogStats.total])} />
                  <Chip size="small" color="primary" variant="outlined" label={t("输出更新 {0}", [visibleAxisLogStats.emit])} />
                  <Chip size="small" variant="outlined" label={t("输出保持 {0}", [visibleAxisLogStats.hold])} />
                  <Chip size="small" color="warning" variant="outlined" label={t("已忽略 {0}", [visibleAxisLogStats.ignored])} />
                  {logOnlyAxis && <Chip size="small" color="info" variant="outlined" label={t("已自动包含 debug")} />}
                </Stack>
              </Box>

              <Box className="log-list">
                {filteredLogs.length === 0 ? (
                  <Typography color="text.secondary">{t("暂时没有日志。")}</Typography>
                ) : (
                  filteredLogs.map((log, index) => {
                    const ts = log.timestamp ? new Date(log.timestamp) : null;
                    const timeStr = ts && !Number.isNaN(ts.getTime()) ? ts.toLocaleTimeString(getLocale()) : '';

                    if (log.axisTrace) {
                      return <AxisTraceLogEntry key={`${index}-${diagnostic(log.message)}`} log={log} timeStr={timeStr} />;
                    }

                    return <PlainLogEntry key={`${index}-${diagnostic(log.message)}`} log={log} timeStr={timeStr} />;
                  })
                )}
              </Box>
            </CardContent>
          </Card>
        </Box>
      </Box>

      <Dialog open={Boolean(presetDialog)} onClose={() => setPresetDialog(null)} fullWidth maxWidth="lg">
        <DialogTitle>{presetDialog ? t("{0} · 预设编辑", [presetDialog.name || t("OSC 预设")]) : t("OSC 预设")}</DialogTitle>
        <DialogContent dividers>
          {presetDialog && (
            <Stack spacing={2.5}>
              <TextField label={t("预设名称")} size="small" value={presetDialog.name || ''} onChange={event => setPresetDialog(previous => ({ ...previous, name: event.target.value }))} />
              <TextField
                label={t("说明")}
                size="small"
                multiline
                minRows={2}
                value={presetDialog.description || ''}
                onChange={event => setPresetDialog(previous => ({ ...previous, description: event.target.value }))}
              />

              {presetDialog.mappings.length === 0 ? (
                <Box className="empty-inline-state">
                  <Stack spacing={1.5} alignItems="center">
                    <Typography color="text.secondary">{t("这套预设还没有映射项")}</Typography>
                    <Button variant="outlined" onClick={() => addPresetDialogSignal()}>{t("新增预设映射")}</Button>
                  </Stack>
                </Box>
              ) : (
                <Box className="signal-list">
                  {presetDialog.mappings.map(draft => (
                    <SignalMappingRow
                      key={draft._draftId}
                      draft={draft}
                      latestEntry={draft.sourceMode === 'SensaPoint' ? pointPreviewEntry(overview?.poseTracking?.spsRoots || [], draft, selectedOscSourceKey) : draft.sourceMode === 'SensaPose' ? posePreviewEntry(overview?.poseTracking?.observations || [], draft, selectedOscSourceKey, overview?.poseTracking?.activeKey) : getLatestOscPreviewEntry(mappingPreviewEntries.length > 0 ? mappingPreviewEntries : oscPreview, draft.oscPath, selectedOscSourceKey)}
                      pathOptions={oscPathSuggestions}
                      onChange={patch => updatePresetDialogSignal(draft._draftId, patch)}
                      onRemove={() => removePresetDialogSignal(draft._draftId)}
                    />
                  ))}
                </Box>
              )}

              <Stack direction="row" spacing={1} useFlexGap flexWrap="wrap">
                <Button variant="outlined" onClick={() => addPresetDialogSignal()}>{t("新增预设映射")}</Button>
              </Stack>
            </Stack>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setPresetDialog(null)}>{t("取消")}</Button>
          <Button variant="contained" onClick={savePresetDialog} disabled={!presetDialog || busyKey.startsWith('preset-save-')}>{t("保存预设")}</Button>
        </DialogActions>
      </Dialog>

      <Dialog open={Boolean(dialog)} onClose={() => setDialog(null)} fullWidth maxWidth="md">
        <DialogTitle>{dialog ? t("{0} 配置", [getOutputTypeLabel(dialog.draft.type)]) : t("输出配置")}</DialogTitle>
        <DialogContent dividers>
          {dialog && (
            <Stack spacing={2}>
              {outputDialogConflictMessage && (
                <Alert severity="warning">
                  {outputDialogConflictMessage}
                </Alert>
              )}

              <TextField
                label={<HelpLabel text={t("名称")} title={t("仅用于在 WebUI 中区分这台输出设备。")} />}
                size="small"
                value={dialog.draft.name || ''}
                onChange={event => setDialog(previous => ({ ...previous, draft: { ...previous.draft, name: event.target.value } }))}
              />

              {isTCodeOutputType(dialog.draft.type) && (
                <>
                  <SelectField
                    label={t("轴配置")}
                    title={t("选择这台 TCode 输出使用的轴配置。")}
                    value={dialog.draft.motionProfileId || getDefaultAxisProfileId(config)}
                    options={axisProfiles.map(profile => ({ value: profile.id, label: profile.name }))}
                    variant="compact"
                    fullWidth
                    onChange={next => setDialog(previous => ({ ...previous, draft: { ...previous.draft, motionProfileId: next } }))}
                  />

                  <Box className="dialog-grid dialog-grid--two-cols">
                    <SelectField
                      label={t("输出斜率方式")}
                      title={t("跟随轴配置=每个轴按自己的配置决定走时间 / 速度 / 无；时间=强制全部使用 I；速度=强制全部使用 S；无=只发位置值。")}
                      value={normalizeOutputSlopeMode(dialog.draft.slopeMode)}
                      options={OUTPUT_SLOPE_MODE_OPTIONS()}
                      variant="compact"
                      fullWidth
                      onChange={next => setDialog(previous => ({ ...previous, draft: { ...previous.draft, slopeMode: next } }))}
                    />

                    <SelectField
                      label={t("速度单位基准")}
                      title={t("默认每 100ms。切到每秒后，发送给设备的 S 数值会按秒基准换算。")}
                      value={normalizeSpeedUnitBase(dialog.draft.speedUnitBase)}
                      options={SPEED_UNIT_BASE_OPTIONS()}
                      variant="compact"
                      fullWidth
                      onChange={next => setDialog(previous => ({ ...previous, draft: { ...previous.draft, speedUnitBase: next } }))}
                    />
                  </Box>

                  <Alert severity="info" variant="outlined">{t("速度单位基准默认是 ")}<strong>{t("每 100ms")}</strong>{t("。若你的设备/固件按“每秒”解释 S 值，可切到“每秒”。")}</Alert>
                </>
              )}

              {dialog.draft.type === 'TCodeSerial' && (
                <>
                  <Box className="dialog-panel">
                    <Box className="dialog-panel__header">
                      <Typography variant="subtitle2">{t("串口连接")}</Typography>
                      <Chip size="small" variant="outlined" label={dialog.draft.comPort || t("未选择串口")} />
                    </Box>

                    <SelectField
                      label={t("串口")}
                      title={t("选择目标 TCode 设备对应的 COM 端口。")}
                      value={dialog.draft.comPort || ''}
                      options={serialPorts.length === 0 ? [{ value: '', label: t("未检测到串口") }] : serialPorts.map(port => {
                        const owner = serialPortOwners.get(port.portName);
                        return {
                          value: port.portName,
                          label: port.portName,
                          disabled: Boolean(owner),
                          port,
                          owner,
                        };
                      })}
                      variant="compact"
                      fullWidth
                      formControlProps={{ error: hasSerialTargetConflict }}
                      renderOption={option => (
                        <Stack direction="row" spacing={1} alignItems="baseline">
                          <Typography variant="body2">{option.label}</Typography>
                          {option.port?.description && option.port.description !== option.port.portName && (
                            <Typography variant="caption" color="text.secondary">
                              {option.port.description}
                            </Typography>
                          )}
                          {option.owner && (
                            <Typography variant="caption" color="error.main">
                              {t("已被 {0} 使用", [getOutputDisplayName(option.owner)])}
                            </Typography>
                          )}
                        </Stack>
                      )}
                      onChange={next => setDialog(previous => ({ ...previous, draft: { ...previous.draft, comPort: next } }))}
                    />
                  </Box>

                  <TCodeDeviceInfoCard
                    deviceInfo={outputDialogOverview?.tcodeDeviceInfo}
                    connected={Boolean(outputDialogOverview?.connected)}
                    onRefresh={() => refreshTCodeDeviceInfo(dialog.outputId)}
                    busy={busyKey === `tcode-device-refresh-${dialog.outputId}`}
                  />
                </>
              )}

              {(dialog?.draft?.type === 'TCodeUdp' || dialog?.draft?.type === 'TCodeTcp') && (
                <>
                  <Box className="dialog-panel">
                    <Box className="dialog-panel__header">
                      <Typography variant="subtitle2">{t("网络目标")}</Typography>
                      <Chip size="small" variant="outlined" label={dialog.draft.type === 'TCodeUdp' ? 'UDP' : 'TCP'} />
                    </Box>

                    <Box className="dialog-grid">
                      <TextField
                        error={hasNetworkTargetConflict}
                        label={<HelpLabel text="Host" title={t("目标设备的主机名或 IP 地址。")} />}
                        size="small"
                        value={dialog.draft.host || ''}
                        onChange={event => setDialog(previous => ({ ...previous, draft: { ...previous.draft, host: event.target.value } }))}
                      />
                      <TextField
                        error={hasNetworkTargetConflict}
                        label={<HelpLabel text="Port" title={dialog.draft.type === 'TCodeUdp' ? t("目标设备监听 TCode UDP 的端口。") : t("目标设备监听 TCode TCP 的端口。")} />}
                        type="number"
                        size="small"
                        value={dialog.draft.port ?? ''}
                        onChange={event => setDialog(previous => ({ ...previous, draft: { ...previous.draft, port: Number(event.target.value || 0) } }))}
                      />
                    </Box>
                  </Box>
                </>
              )}

              {dialog?.draft?.type === 'Intiface' && (
                <>
                  <Box className="dialog-panel">
                    <Box className="dialog-panel__header">
                      <Typography variant="subtitle2">{t("Intiface 连接参数")}</Typography>
                      <Chip size="small" variant="outlined" label="Buttplug" />
                    </Box>

                    <Box className="dialog-grid">
                      <TextField
                        error={hasIntifaceTargetConflict}
                        label={<HelpLabel text={t("WebSocket 地址")} title={t("Intiface WebSocket 服务地址，通常指向 Intiface Central 或本地引擎。")} />}
                        size="small"
                        value={dialog.draft.websocketAddress || ''}
                        onChange={event => setDialog(previous => ({ ...previous, draft: { ...previous.draft, websocketAddress: event.target.value } }))}
                      />
                      <TextField
                        error={hasIntifaceTargetConflict}
                        label={<HelpLabel text={t("端口")} title={t("仅在托管本地 intiface-engine.exe 时使用的监听端口。")} />}
                        type="number"
                        size="small"
                        value={dialog.draft.port ?? 12345}
                        onChange={event => setDialog(previous => ({ ...previous, draft: { ...previous.draft, port: Number(event.target.value || 0) } }))}
                      />
                    </Box>

                    <FormControlLabel
                      control={
                        <Switch
                          checked={Boolean(dialog.draft.manageEngineProcess)}
                          onChange={(_, checked) => setDialog(previous => ({ ...previous, draft: { ...previous.draft, manageEngineProcess: checked } }))}
                        />
                      }
                      label={<HelpLabel text={t("由后台托管 intiface-engine.exe")} title={t("开启后，后台会尝试自动启动和停止本地 intiface-engine.exe。")} />}
                    />
                  </Box>
                </>
              )}
            </Stack>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDialog(null)}>{t("取消")}</Button>
          <Button variant="contained" onClick={saveOutputDialog} disabled={!dialog || busyKey.startsWith('dialog-save-') || outputDialogConflicts.length > 0}>{t("保存")}</Button>
        </DialogActions>
      </Dialog>

      <Dialog open={Boolean(profileDialog)} onClose={() => setProfileDialog(null)} fullWidth maxWidth="lg">
        <DialogTitle>{profileDialog ? t("{0} · 轴配置", [profileDialog.name || t("轴配置")]) : t("轴配置")}</DialogTitle>
        <DialogContent dividers>
          {profileDialog && (
            <Stack spacing={2}>
              <TextField
                label={t("配置名称")}
                size="small"
                value={profileDialog.name || ''}
                onChange={event => setProfileDialog(previous => ({ ...previous, name: event.target.value }))}
              />

              <Box className="dialog-panel">
                <Box className="dialog-panel__header">
                  <Typography variant="subtitle2">{t("快速预设")}</Typography>
                  {profileDialog.presetId && <Chip size="small" variant="outlined" label={AXIS_PROFILE_PRESETS().find(item => item.id === profileDialog.presetId)?.name || t("已选择预设")} />}
                </Box>

                <Box className="preset-apply-row">
                  <SelectField
                    label={t("轴配置预设")}
                    value={profileDialog.presetId || ''}
                    options={[{ value: '', label: t("不使用预设") }, ...AXIS_PROFILE_PRESETS().map(preset => ({ value: preset.id, label: preset.name }))]}
                    variant="inline"
                    hintTitle={
                      profileDialog.presetId
                        ? AXIS_PROFILE_PRESETS().find(item => item.id === profileDialog.presetId)?.description || t("应用后会覆盖当前草稿。")
                        : t("选择一套轴配置预设后，可一键覆盖当前草稿。")
                    }
                    className="preset-apply-row__select"
                    onChange={next => setProfileDialog(previous => ({ ...previous, presetId: next }))}
                  />

                  <Button className="preset-apply-row__button" variant="outlined" disabled={!profileDialog.presetId} onClick={() => applyAxisProfilePresetToDialog(profileDialog.presetId)}>{t("应用预设")}</Button>
                </Box>
              </Box>

              <Box className="motion-axis-grid">
                {AXIS_PROFILE_DEFS().map(axis => (
                  <MotionAxisEditor
                    key={`${profileDialog.profileId}-${axis.key}`}
                    axisDefinition={axis}
                    value={profileDialog.profile[axis.key]}
                    disabled={false}
                    onChange={patch => updateProfileAxis(axis.key, patch)}
                  />
                ))}
              </Box>
            </Stack>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setProfileDialog(null)}>{t("取消")}</Button>
          <Button variant="contained" onClick={saveProfileDialog} disabled={!profileDialog || busyKey.startsWith('profile-save-')}>{t("保存")}</Button>
        </DialogActions>
      </Dialog>

      <Dialog open={confirmClearMappings} onClose={() => setConfirmClearMappings(false)}>
        <DialogTitle>{t("确认清空映射")}</DialogTitle>
        <DialogContent>
          <Typography>{t("确定要清空当前页面里的 ")}{signalDrafts.length}{t(" 条 OSC 轴映射吗？若尚未保存，可直接点“恢复映射”回到已保存状态；一旦保存，将以当前清空结果为准。")}</Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setConfirmClearMappings(false)}>{t("取消")}</Button>
          <Button variant="contained" color="error" onClick={clearSignalDrafts}>{t("确认清空")}</Button>
        </DialogActions>
      </Dialog>

      <Dialog open={Boolean(parameterDetail)} onClose={() => setParameterDetail(null)} fullWidth maxWidth="sm">
        <DialogTitle>{t("参数含义")}</DialogTitle>
        <DialogContent><Typography sx={{ overflowWrap: 'anywhere', mb: 2 }} fontFamily="monospace">{parameterDetail?.path}</Typography><Typography>{parameterDetail ? parameterMeaning(parameterDetail.path) : ''}</Typography><Typography variant="caption" display="block" sx={{ mt: 2 }} color="text.secondary">{t("来源：")}{parameterDetail?.sourceLabel}{t(" · 当前值：")}{parameterDetail?.value}{t(" · 提示不等于自动映射。")}</Typography></DialogContent>
        <DialogActions><Button onClick={() => setParameterDetail(null)}>{t("关闭")}</Button><Button onClick={() => { mapPreviewParameter(parameterDetail); setParameterDetail(null); }}>{t("添加映射草稿")}</Button></DialogActions>
      </Dialog>
      <Snackbar open={snackbar.open} autoHideDuration={2600} onClose={() => setSnackbar(previous => ({ ...previous, open: false }))}>
        <Alert variant="filled" severity={snackbar.severity}>
          {diagnostic(snackbar.message)}
        </Alert>
      </Snackbar>
    </ThemeProvider>
  );
}

ReactDOM.createRoot(document.getElementById('app-root')).render(<App />);
