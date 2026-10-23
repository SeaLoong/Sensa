import React, { useEffect, useMemo, useRef, useState } from 'react';
import * as ReactDOM from 'react-dom/client';
import {
  editConfiguration,
  AXIS_LIMIT_MAX_SPEED,
  AXIS_LIMIT_MIN_SPEED,
  AXIS_PROFILE_DEFS,
  AXIS_PROFILE_PRESETS,
  OSC_HUB_MODE_OPTIONS,
  OUTPUT_SLOPE_MODE_OPTIONS,
  OUTPUT_TYPES,
  OUTPUT_TYPE_BY_VALUE,
  SPEED_UNIT_BASE_OPTIONS,
  buildAxisProfileAxisRows,
  buildNewProfileDialogDraft,
  buildOscDraftFromConfig,
  buildOscHubTargetConflictLookup,
  buildOutputDialogDraft,
  buildOutputSummary,
  buildPresetDialogDraft,
  buildProfileDialogDraft,
  buildSignalDrafts,
  buildSignalOverlapWarnings,
  cloneMotionProfile,
  computeSignalHash,
  createAxisProfilePresetMotion,
  createOutputConfig,
  flattenOscHubConflictMessages,
  formatOutputTargetConflictMessage,
  getAxisProfile,
  getAxisProfiles,
  getDefaultAxisProfile,
  getDefaultAxisProfileId,
  getNextAvailableOscHubPort,
  getOscMappingPreset,
  getOscMappingPresets,
  getOutputConfig,
  getOutputOverview,
  getOutputTargetConflicts,
  getOutputs,
  isTCodeOutputType,
  makeOscHubTargetDraft,
  makeSignalDraft,
  normalizeOscHubMode,
  normalizeOutputSlopeMode,
  normalizeSerialPorts,
  normalizeSpeedUnitBase,
  stripSignalDraft,
} from './configuration.js';
import {
  manualCommandPayload,
  DEFAULT_SCRIPT_SETTINGS,
  DEFAULT_STUDIO_STATE,
  EMPTY_MANUAL,
  INPUT_MODES,
  MANUAL_AXES,
  MANUAL_DEFAULT_INTERVAL_MS,
  MANUAL_DEFAULT_SPEED,
  MANUAL_INTERVAL_MAX_MS,
  MANUAL_MOTION_MODE_OPTIONS,
  SCRIPT_SEEK_ACTIONS,
  SCRIPT_SHORTCUT_GROUPS,
  SCRIPT_SPEED_MAX,
  SCRIPT_SPEED_MIN,
  SCRIPT_SPEED_PRESETS,
  SCRIPT_SPEED_STEP,
  clampScriptPositionMs,
  clampScriptSpeed,
  formatDuration,
  formatMode,
  formatScriptSpeedLabel,
  getScriptStateMeta,
  normalizeManualCommand,
  normalizeManualMotionMode,
  normalizeManualMotionValueByMode,
  normalizeScriptLoopRange,
  normalizeScriptSettingsState,
  normalizeStoredScriptDefaults,
  parseScriptTimecodeInput,
  shouldIgnoreScriptShortcutTarget,
} from './input-workflows.js';
import { attachPageLifecycle, createInitialSnapshotLoader, createBrowserRealtimeSession } from './realtime-session.js';
import { loadStudio, saveStudio, sanitizeStudio } from './preferences.js';
import { LOG_LEVEL_ORDER, createLogNormalizer, formatAxisTraceAction, formatRealtimeStatus } from './diagnostics.js';
import { buildOscSourceSelectionOptions, formatOscParameterDetailStatus, formatPreviewTimestamp, oscCatalogVisibility, resolveOscParameterDetail } from './osc-workspace.js';
import { AxisSlider, SelectField, SliderControl, ValueSliderField } from './controls.jsx';
import { Badge, Button, Field, Modal, Notice, Section, Tabs, Toggle } from './ui.jsx';
import { ScriptTimelineDensity } from './script-timeline.jsx';
import { MotionAxisEditor, OscHubTargetRow, SignalMappingRow } from './configuration-views.jsx';
import { AxisTraceLogEntry, PlainLogEntry, TCodeDeviceInfoCard } from './diagnostic-views.jsx';
import { t, getLocale, subscribeLocale, setLocale, diagnostic, docUrl } from './i18n.js';
import {
  pointPreviewEntry,
  posePreviewEntry,
  readPinnedPaths,
  createOscPreviewRanker,
  createOscPreviewLookup,
  createOscPathSuggester,
  filterOscPreviewEntriesBySource,
} from './osc-preview.js';
import PosePanel from './PosePanel.jsx';
import SpsRootPanel from './SpsRootPanel.jsx';
import OutputPositionPanel from './OutputPositionPanel.jsx';
import HelpDialog from './HelpDialog.jsx';
import OscFlowStatus from './OscFlowStatus.jsx';
import OscParameterTable from './OscParameterTable.jsx';
import ControlFlowStatus from './ControlFlowStatus.jsx';
import { outputRoutingScope } from './control-workflow.js';
import ComputedSignalsPanel from './ComputedSignalsPanel.jsx';
import OscParameterReference from './OscParameterReference.jsx';
import OutputBindings, { OutputSignalStatus, RecordingReplayControls } from './OutputBindings.jsx';
import SignalPlanPanel from './SignalPlanPanel.jsx';
import { isSignalOutputType } from './signal-outputs.js';
import { buildComputedDrafts, computeComputedHash, computedDraftIncomplete, computedMappingPreviews, expandMappingSources } from './computed-signals.js';

const EMPTY_OSC_CATALOG = Object.freeze([]);

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
  const [realtime] = useState(() => createBrowserRealtimeSession({ url: WS_URL }));
  const apiRequest = (path, options) => realtime.request(path, options);
  const locale = React.useSyncExternalStore(subscribeLocale, getLocale);
  const initialState = useMemo(() => buildInitialAppState(), []);
  const [config, setConfig] = useState(initialState.config);
  const [overview, setOverview] = useState(initialState.overview);
  const [logs, setLogs] = useState(initialState.logs);
  const [normalizeLogSnapshot] = useState(createLogNormalizer);
  const [logDetailsOpen, setLogDetailsOpen] = useState(false);
  const [studio, setStudio] = useState(initialState.studio);
  const [serialPorts, setSerialPorts] = useState(initialState.serialPorts);
  const [midiPorts, setMidiPorts] = useState([]);
  const [recordingFiles, setRecordingFiles] = useState([]);
  const [oscDraft, setOscDraft] = useState(initialState.oscDraft);
  const [signalDrafts, setSignalDrafts] = useState(initialState.signalDrafts);
  const [computedDrafts, setComputedDrafts] = useState([]);
  const [selectedOscPreset, setSelectedOscPreset] = useState('');
  const [showFaceTracking, setShowFaceTracking] = useState(false);
  const [previewCategory, setPreviewCategory] = useState('all');
  const [frozenPreview, setFrozenPreview] = useState(null);
  const [pinnedPaths, setPinnedPaths] = useState(() => readPinnedPaths());
  const [parameterDetail, setParameterDetail] = useState(null);
  const [oscPreviewSearch, setOscPreviewSearch] = useState('');
  const [workspace, setWorkspace] = useState('control');
  const [oscWorkspaceTab, setOscWorkspaceTab] = useState('setup');
  const [newOutputType, setNewOutputType] = useState('TCodeSerial');
  const [helpOpen, setHelpOpen] = useState(false);
  const [previewSourceTab, setPreviewSourceTab] = useState('all');
  const [presetDialog, setPresetDialog] = useState(null);
  const [profileDialog, setProfileDialog] = useState(null);
  const [dialog, setDialog] = useState(null);
  const [manualDraft, setManualDraft] = useState(initialState.manualDraft);
  const [manualMotionMode, setManualMotionMode] = useState(initialState.manualMotionMode);
  const [manualMotionValue, setManualMotionValue] = useState(initialState.manualMotionValue);
  const [manualContinuous, setManualContinuous] = useState(false);
  const [combinedScriptOpen, setCombinedScriptOpen] = useState(false);
  const [scriptSettings, setScriptSettings] = useState(initialState.scriptSettings);
  const [scriptSeekDraft, setScriptSeekDraft] = useState(0);
  const [scriptSeekDragging, setScriptSeekDragging] = useState(false);
  const [scriptJumpInput, setScriptJumpInput] = useState('');
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
  const [recordingRestartOpen, setRecordingRestartOpen] = useState(false);
  const [recordingBusy, setRecordingBusy] = useState(false);
  const [navigationTarget, setNavigationTarget] = useState(null);
  const recordingBusyRef = useRef(false);
  const configSaveRef = useRef(false);
  const manualDraftRef = useRef(initialState.manualDraft);
  const manualMotionModeRef = useRef(initialState.manualMotionMode);
  const manualMotionValueRef = useRef(initialState.manualMotionValue);
  const scriptSettingsInitializedRef = useRef(initialState.scriptSettingsInitialized);

  const studioState = studio || DEFAULT_STUDIO_STATE;
  const outputs = useMemo(() => getOutputs(config), [config]);
  const routingScope = useMemo(() => outputRoutingScope(outputs), [outputs]);
  const axisProfiles = useMemo(() => getAxisProfiles(config), [config, locale]);
  const actualInputMode = overview?.input?.mode || studioState.preferredInputTab || 'manual';
  const runtimeOverview = overview?.runtime || overview?.loop || null;
  const selectedInputTab = INPUT_MODES().some((item) => item.value === studioState.preferredInputTab)
    ? studioState.preferredInputTab
    : actualInputMode;
  const hasPendingInputMode = selectedInputTab !== actualInputMode;
  const savedSignalsHash = useMemo(() => computeSignalHash(buildSignalDrafts(config?.signals)), [config?.signals]);
  const savedComputedHash = useMemo(() => computeComputedHash(config?.computedSignals), [config?.computedSignals]);

  const scriptState = overview?.input?.script || null;
  const scriptLoaded = Boolean(scriptState?.loaded);
  const scriptDurationMs = Math.max(0, Number(scriptState?.durationMs || 0));
  const scriptPositionMs = Math.max(0, Math.min(Number(scriptState?.positionMs || 0), scriptDurationMs || 0));
  const scriptSliderMax = Math.max(scriptDurationMs, 1);
  const scriptSeekValue = scriptSeekDragging
    ? clampScriptPositionMs(scriptSeekDraft, scriptDurationMs)
    : scriptPositionMs;
  const scriptSeekBasePosition = clampScriptPositionMs(scriptSeekValue, scriptDurationMs);
  const scriptLoopRange = normalizeScriptLoopRange(
    scriptSettings.loopStartMs,
    scriptSettings.loopEndMs,
    scriptDurationMs,
  );
  const scriptLoadedState = getScriptStateMeta(scriptState?.state);
  const scriptFileLabel = selectedScriptFile?.name || scriptState?.fileName || t('未载入脚本');
  const scriptTransportPrimaryLabel = scriptState?.playing
    ? t('暂停')
    : scriptState?.paused
      ? t('继续播放')
      : t('播放');
  const scriptActivityBins = Array.isArray(scriptState?.activityBins) ? scriptState.activityBins : [];
  useEffect(() => {
    const initial = createInitialSnapshotLoader(realtime, {
      onLoad: ({
        config: configResponse,
        overview: overviewResponse,
        logs: logsResponse,
        serialPorts: serialPortResponse,
      }) => {
        const persistedStudio = sanitizeStudio(loadStudio() || DEFAULT_STUDIO_STATE, configResponse);

        setConfig(configResponse);
        setOverview(overviewResponse);
        setLogs(normalizeLogSnapshot(logsResponse));
        setSerialPorts(normalizeSerialPorts(serialPortResponse));
        setOscDraft(buildOscDraftFromConfig(configResponse));
        setSignalDrafts(buildSignalDrafts(configResponse?.signals));
        setComputedDrafts(buildComputedDrafts(configResponse?.computedSignals));
        setStudio(persistedStudio);
        const initialManualDraft = normalizeManualCommand(overviewResponse?.runtime?.manualCommand);
        setManualDraft(initialManualDraft);
        manualDraftRef.current = initialManualDraft;
        const initialManualMode = normalizeManualMotionMode(
          overviewResponse?.runtime?.manualCommand?.requestedCommandMode,
        );
        const initialManualMotionValue = normalizeManualMotionValueByMode(
          initialManualMode,
          overviewResponse?.runtime?.manualCommand?.requestedMotionValue ??
            (initialManualMode === 'Interval' ? MANUAL_DEFAULT_INTERVAL_MS : MANUAL_DEFAULT_SPEED),
        );
        setManualMotionMode(initialManualMode);
        manualMotionModeRef.current = initialManualMode;
        setManualMotionValue(initialManualMotionValue);
        manualMotionValueRef.current = initialManualMotionValue;
        setScriptSettings(
          normalizeScriptSettingsState(overviewResponse?.input?.script, persistedStudio.scriptDefaults),
        );
        scriptSettingsInitializedRef.current = true;
      },
      onLoading: setLoading,
      onError: (error) => notify(error.message || t('初始化失败'), 'error'),
    });
    const detach = attachPageLifecycle(realtime, window, {
      onStatus: (status) => {
        setWsState(status);
        void initial.connection(status);
      },
      onSnapshot: (snapshot, entries) => {
        setOverview(snapshot);
        setLogs(normalizeLogSnapshot(entries));
      },
    });
    return () => {
      initial.dispose();
      detach();
    };
  }, [realtime, normalizeLogSnapshot]);

  useEffect(() => {
    if (!config) return;
    setStudio((previous) => sanitizeStudio(previous, config));
  }, [config]);

  useEffect(() => {
    const presets = getOscMappingPresets(config);
    if (presets.length === 0) {
      setSelectedOscPreset('');
      return;
    }

    setSelectedOscPreset((previous) => (presets.some((preset) => preset.id === previous) ? previous : presets[0].id));
  }, [config]);

  useEffect(() => {
    if (!studio) return;
    saveStudio(studio);
  }, [studio]);

  useEffect(() => {
    if (scriptSettingsInitializedRef.current === false) return;

    setStudio((previous) => {
      const base = sanitizeStudio(previous || DEFAULT_STUDIO_STATE, config);
      const nextScriptDefaults = normalizeStoredScriptDefaults(scriptSettings);

      if (
        base.scriptDefaults.loop === nextScriptDefaults.loop &&
        Math.abs(base.scriptDefaults.speed - nextScriptDefaults.speed) < 0.0001
      ) {
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

    setScriptSettings((previous) => {
      const next = normalizeScriptSettingsState(overview.input.script, previous);
      return Object.keys(next).every(key => next[key] === previous[key]) ? previous : next;
    });
  }, [overview?.input?.script, busyKey]);

  useEffect(() => {
    if (scriptSeekDragging) return;
    setScriptSeekDraft(Number(overview?.input?.script?.positionMs || 0));
  }, [overview?.input?.script?.positionMs, scriptSeekDragging]);

  useEffect(() => {
    if (workspace !== 'control' || selectedInputTab !== 'script' && !(selectedInputTab === 'combined' && combinedScriptOpen)) return undefined;

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
          if (!scriptLoaded || !event.shiftKey || (scriptLoopRange.startMs === null && scriptLoopRange.endMs === null))
            break;
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
  }, [
    workspace,
    selectedInputTab,
    combinedScriptOpen,
    scriptLoaded,
    scriptState?.playing,
    scriptDurationMs,
    scriptPositionMs,
    scriptSeekDragging,
    scriptSeekDraft,
    scriptSettings.loop,
    scriptSettings.speed,
    scriptSettings.loopStartMs,
    scriptSettings.loopEndMs,
    busyKey,
  ]);

  useEffect(() => {
    if (!selectedScriptFile) return;
    let cancelled = false;

    (async () => {
      try {
        const result = await uploadScriptFile(selectedScriptFile);

        if (cancelled) return;

        setSelectedScriptFile(null);
        setScriptFileInputKey((previous) => previous + 1);
        setStudio((previous) => (previous ? { ...previous, preferredInputTab: previous.preferredInputTab === 'combined' ? 'combined' : 'script' } : previous));
        if (result?.script) {
          setScriptSettings((previous) => normalizeScriptSettingsState(result.script, previous));
        }
        setScriptJumpInput('');
        await refreshOverview();
        notify(t('脚本已加载，输入已关闭；检查时间轴后再打开输入。'), 'success');
      } catch (error) {
        if (!cancelled) {
          notify(error.message || t('脚本加载失败'), 'error');
          setSelectedScriptFile(null);
          setScriptFileInputKey((previous) => previous + 1);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [selectedScriptFile]);

  async function recordingAction(action) {
    if (recordingBusyRef.current) return;
    recordingBusyRef.current = true;
    setRecordingBusy(true);
    clearErrorNotification();
    try {
      const result = await apiRequest(`/api/recording/${action}`, { method: 'POST' });
      await refreshOverview();
      if (action === 'export') {
        if (!result.content) {
          notify(t('录制为空'), 'info');
          return;
        }
        const url = URL.createObjectURL(new Blob([result.content], { type: 'application/json' }));
        const link = document.createElement('a');
        link.href = url;
        link.download = result.fileName;
        link.click();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
      }
    } catch (error) {
      notify(error.message, 'error');
    } finally {
      recordingBusyRef.current = false;
      setRecordingBusy(false);
    }
  }

  function togglePinned(path) {
    setPinnedPaths((previous) => {
      const next = previous.includes(path) ? previous.filter((p) => p !== path) : [path, ...previous].slice(0, 64);
      try {
        localStorage.setItem('sensa.osc.pins.v1', JSON.stringify(next));
      } catch {
        /* preference storage may be full */
      }
      return next;
    });
  }

  function usePoseRig(pose, full = false) {
    setSelectedOscPreset('');
    const metrics = full
      ? [
          ['Depth', 'Depth', 0, 1],
          ['Yaw', 'AngleX', -65, 65],
          ['Pitch', 'AngleY', -65, 65],
          ['Roll', 'Twist', -180, 180],
          ['OffsetX', 'Sway', -0.04, 0.04],
          ['OffsetY', 'Surge', -0.04, 0.04],
        ]
      : [['Depth', 'Depth', 0, 1]];
    setSignalDrafts(
      metrics.map(([poseMetric, role, vrchatMin, vrchatMax]) =>
        makeSignalDraft({
          oscPath: `${pose.prefix}/**`,
          sourceMode: 'SensaPose',
          poseMetric,
          role,
          vrchatMin,
          vrchatMax,
        }),
      ),
    );
    setOscWorkspaceTab('setup');
    notify(t('已替换映射草稿；实验空间输入需单独允许。'), 'info');
  }

  function mapPreviewParameter(entry) {
    if (/^Sensa\/(Point|Handle)\/v1\//.test(entry.path)) {
      usePointRig({ prefix: entry.path.split('/').slice(0, 5).join('/') });
    } else if (/^Sensa\/Shader\/[^/]+\/(?:(?:Right|Forward)[XYZ]|AvatarScale)$/.test(entry.path)) {
      const pointMetric = entry.path.split('/').at(-1);
      setSignalDrafts(previous => [...previous, makeSignalDraft({ oscPath: entry.path.replace(/[^/]+$/, '**'),
        sourceMode: 'SensaPoint', pointMetric, role: 'Depth', vrchatMin: pointMetric === 'AvatarScale' ? 0 : -1, vrchatMax: 1 })]);
      notify(t('已添加映射草稿，请确认参数含义、目标轴和范围后保存。'), 'info');
    } else if (entry.path.startsWith('Sensa/SPS/') || entry.path.startsWith('Sensa/Shader/') || entry.path.startsWith('Sensa/Contact/')) {
      navigateWorkflow('sensa-sps');
      notify(t('请在根点面板选择目标并采集两个端点，再生成映射。'), 'info');
      return 'experimental';

    } else if (entry.path.startsWith('Sensa/Diagnostics/Shader/')) {
      notify(t('诊断参数仅用于传输检查，不生成坐标映射。'), 'info');
      return oscWorkspaceTab;
    } else if (entry.path.startsWith('Sensa/Pose/v1/')) {
      usePoseRig({ prefix: entry.path.split('/').slice(0, 5).join('/') });
    } else if (/^OGB\/(Orf|Pen)\/.+\/Pen(Self|Others)(NewRoot|NewTip|Close)?$/.test(entry.path)) {
      const prefix = entry.path.replace(/(NewRoot|NewTip|Close)$/, '');
      setSignalDrafts((previous) => [
        ...previous,
        makeSignalDraft({ oscPath: entry.path.startsWith('OGB/Orf/') ? `${prefix}NewRoot;${prefix}` : prefix, sourceMode: 'OgbDepth', role: 'Depth' }),
      ]);
      notify(t('已添加 OGB 自动识别草稿；新旧信号按同一对象配对，请检查范围后保存。'), 'info');
    } else {
      setSignalDrafts((previous) => [
        ...previous,
        makeSignalDraft({ oscPath: entry.path,
          sourceMode: /^(OGB\/(Orf|Pen)\/.+\/(Touch(Self|Others)|FrotOthers)|VFH\/Zone\/Touch\/.+\/(Self|Others))$/.test(entry.path) ? 'OgbTouch' : 'Direct',
          role: /Close$|_IsGrabbed$/.test(entry.path) ? 'GateEnable' : /\/(Touch|Frot)/.test(entry.path) ? 'V0' : 'Depth' }),
      ]);
      notify(t('已添加映射草稿，请确认参数含义、目标轴和范围后保存。'), 'info');
    }
  }

  function usePointRig(point, calibrated = null) {
    setSelectedOscPreset('');
    setOscWorkspaceTab('setup');
    setSignalDrafts([
      makeSignalDraft(
        calibrated || {
          oscPath: `${point.prefix}/**`,
          sourceMode: 'SensaPoint',
          pointMetric: 'Z',
          role: 'Depth',
          vrchatMin: 0,
          vrchatMax: 0.2,
        },
      ),
    ]);
    notify(
      calibrated
        ? t('已用校准结果替换整套映射草稿，旧门控已移除；确认来源后保存，再手动打开输入。')
        : t('已用本地 Z 位移替换整套草稿，旧门控已移除；请先校准量程再保存。'),
      'info',
    );
  }

  function clearErrorNotification() {
    setSnackbar((previous) => previous.severity === 'error' ? { ...previous, open: false } : previous);
  }

  function notify(message, severity = 'info') {
    setSnackbar({ open: true, message, severity });
  }

  function applyScriptSnapshot(snapshot, fallback = DEFAULT_SCRIPT_SETTINGS) {
    if (!snapshot) return;
    setOverview((previous) => previous ? {
      ...previous,
      input: { ...previous.input, script: snapshot },
    } : previous);
    setScriptSeekDraft(Number(snapshot.positionMs ?? 0));
    setScriptSettings((previous) => normalizeScriptSettingsState(snapshot, previous || fallback));
  }

  function updateScriptSettingsDraft(patch, options = {}) {
    const effectiveScriptDurationMs = Math.max(0, Number(overview?.input?.script?.durationMs || 0));
    const nextSettings = normalizeScriptSettingsState(
      { ...scriptSettings, ...patch },
      scriptSettings,
      effectiveScriptDurationMs,
    );
    setScriptSettings(nextSettings);

    if (options.commit && scriptLoaded) {
      void applyScriptSettings(nextSettings, options.applyOptions);
    }

    return nextSettings;
  }

  async function withBusy(key, action) {
    clearErrorNotification();
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

  async function refreshMidiPorts() {
    const response = await apiRequest('/api/meta/midi-ports');
    const ports = Array.isArray(response) ? response : response?.ports || [];
    setMidiPorts(ports);
    return ports;
  }

  async function refreshRecordingFiles() {
    return withBusy('recordings-refresh', async () => {
      const response = await apiRequest('/api/output/recordings');
      setRecordingFiles(Array.isArray(response) ? response.slice(0, 200) : []);
    }).catch(error => notify(error.message, 'error'));
  }

  async function replayOutput(action, payload) {
    return withBusy(`replay-${payload.outputId}`, async () => {
      await apiRequest(`/api/output/replay/${action}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
      await refreshOverview();
    }).catch(error => notify(error.message || t('回放操作失败'), 'error'));
  }

  async function loadRecordedScript(fileName) {
    return withBusy('recording-script-load', async () => {
      const result = await apiRequest('/api/input/script/load-recording', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ fileName }),
      });
      setSelectedScriptFile(null);
      setScriptFileInputKey(previous => previous + 1);
      setStudio(previous => previous ? { ...previous, preferredInputTab: previous.preferredInputTab === 'combined' ? 'combined' : 'script' } : previous);
      applyScriptSnapshot(result?.script, scriptSettings);
      setScriptJumpInput('');
      setWorkspace('control');
      if (actualInputMode === 'combined') setCombinedScriptOpen(true);
      await refreshOverview();
      notify(t('脚本已加载，输入已关闭；检查时间轴后再打开输入。'), 'success');
    }).catch(error => notify(error.message || t('脚本加载失败'), 'error'));
  }

  async function applySignalPlan(plan) {
    return withBusy('signal-plan-import', async () => {
      const saved = await persistConfig({ ...config, computedSignals: plan.computedSignals, signals: plan.signals, outputs: plan.outputs,
        ...(plan.axisProfiles ? { axisProfiles: plan.axisProfiles } : {}),
      });
      setComputedDrafts(buildComputedDrafts(saved.computedSignals));
      setSignalDrafts(buildSignalDrafts(saved.signals));
      await refreshOverview();
      notify(t('交互方案已应用，请检查目标并启用输出。'), 'success');
    });
  }

  async function uploadScriptFile(file) {
    if (!file) throw new Error(t('请先选择一个 .funscript 文件'));

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
    if (configSaveRef.current) throw new Error(t('已有配置正在保存，请稍后重试。'));
    configSaveRef.current = true;
    try {
      nextConfig.schemaVersion = 5;
      const saved = await apiRequest('/api/config', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(nextConfig),
      });
      setConfig(saved);
      return saved;
    } finally {
      configSaveRef.current = false;
    }
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
      const submittedDraft = oscDraft;
      const nextConfig = editConfiguration(config, { kind: 'osc', draft: submittedDraft });

      const savedConfig = await persistConfig(nextConfig);
      setOscDraft((current) => current === submittedDraft ? buildOscDraftFromConfig(savedConfig) : current);
      await refreshOverview();
      notify(t('OSC / Hub 配置已保存'), 'success');
    }).catch((error) => notify(error.message || t('保存 OSC 配置失败'), 'error'));
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
      notify(normalizedSourceKey ? t('已切换参数来源') : t('已恢复自动选择参数来源'), 'success');
    }).catch((error) => notify(error.message || t('切换参数来源失败'), 'error'));
  }

  function updateOscHubTargetDraft(draftId, patch) {
    setOscDraft((previous) => ({
      ...previous,
      hubTargets: (Array.isArray(previous.hubTargets) ? previous.hubTargets : []).map((target) =>
        target._draftId === draftId ? { ...target, ...patch } : target,
      ),
    }));
  }

  function addOscHubTargetDraft() {
    setOscDraft((previous) => {
      const currentTargets = Array.isArray(previous.hubTargets) ? previous.hubTargets : [];
      const nextPort = getNextAvailableOscHubPort(currentTargets, previous.receiverPort);
      return {
        ...previous,
        hubTargets: [
          ...currentTargets,
          makeOscHubTargetDraft({}, { index: currentTargets.length + 1, port: nextPort }),
        ],
      };
    });
  }

  function removeOscHubTargetDraft(draftId) {
    setOscDraft((previous) => ({
      ...previous,
      hubTargets: (Array.isArray(previous.hubTargets) ? previous.hubTargets : []).filter(
        (target) => target._draftId !== draftId,
      ),
    }));
  }

  function updateSignalDraft(draftId, patch) {
    setSignalDrafts((previous) =>
      previous.map((signal) => (signal._draftId === draftId ? { ...signal, ...patch } : signal)),
    );
  }

  function addSignalDraft(prefillPath = '') {
    setSignalDrafts((previous) => [...previous, makeSignalDraft({ oscPath: prefillPath })]);
  }

  function removeSignalDraft(draftId) {
    setSignalDrafts((previous) => previous.filter((signal) => signal._draftId !== draftId));
  }

  function clearSignalDrafts() {
    setSignalDrafts([]);
    setConfirmClearMappings(false);
    notify(t('已在当前页面清空映射；如需放弃更改，可点“恢复映射”'), 'info');
  }

  function restoreSignalDrafts() {
    if (!config) return;
    setSignalDrafts(buildSignalDrafts(config?.signals));
    setComputedDrafts(buildComputedDrafts(config?.computedSignals));
    setConfirmClearMappings(false);
    notify(t('已恢复到已保存映射'), 'info');
  }

  async function saveOscMappings() {
    if (!config) return;
    if (hasIncompleteMappings) {
      notify(t('填写映射与计算输入，完成后再保存。'), 'warning');
      return;
    }

    await withBusy('osc-mappings-save', async () => {
      const submittedDrafts = signalDrafts;
      const submittedComputed = computedDrafts;
      const nextConfig = editConfiguration(config, { kind: 'mappings', drafts: submittedDrafts, computedDrafts: submittedComputed });

      const savedConfig = await persistConfig(nextConfig);
      setSignalDrafts((current) => current === submittedDrafts ? buildSignalDrafts(savedConfig.signals) : current);
      setComputedDrafts(current => current === submittedComputed ? buildComputedDrafts(savedConfig.computedSignals) : current);
      await refreshOverview();
      notify(t('OSC 映射已保存并应用，输入已关闭；检查接收值后再打开输入。'), 'success');
    }).catch((error) => notify(error.message || t('保存 OSC 映射失败'), 'error'));
  }

  function applyOscPreset(mode = 'replace') {
    const preset = getOscMappingPreset(config, selectedOscPreset);
    if (!preset) {
      notify(t('请选择一个预设方案'), 'warning');
      return;
    }

    const nextDrafts = preset.mappings.map((mapping) => makeSignalDraft(mapping));
    setSignalDrafts((previous) => (mode === 'append' ? [...previous, ...nextDrafts] : nextDrafts));
    notify(
      mode === 'append'
        ? t('已在当前页面追加预设：{0}；保存后才会真正应用', [preset.name])
        : t('已在当前页面应用预设：{0}；保存后才会真正应用', [preset.name]),
      'success',
    );
  }

  function openPresetDialog(presetId = null, options = {}) {
    clearErrorNotification();
    if (!config) return;
    setPresetDialog(buildPresetDialogDraft(config, presetId, options));
  }

  function updatePresetDialogSignal(draftId, patch) {
    setPresetDialog((previous) => {
      if (!previous) return previous;
      return {
        ...previous,
        mappings: previous.mappings.map((signal) => (signal._draftId === draftId ? { ...signal, ...patch } : signal)),
      };
    });
  }

  function addPresetDialogSignal(prefillPath = '') {
    setPresetDialog((previous) => {
      if (!previous) return previous;
      return {
        ...previous,
        mappings: [...previous.mappings, makeSignalDraft({ oscPath: prefillPath })],
      };
    });
  }

  function removePresetDialogSignal(draftId) {
    setPresetDialog((previous) => {
      if (!previous) return previous;
      return {
        ...previous,
        mappings: previous.mappings.filter((signal) => signal._draftId !== draftId),
      };
    });
  }

  async function savePresetDialog() {
    if (!config || !presetDialog) return;

    await withBusy(`preset-save-${presetDialog.presetId}`, async () => {
      const nextPreset = {
        id: presetDialog.presetId,
        name: (presetDialog.name || t('OSC 预设')).trim() || t('OSC 预设'),
        description: (presetDialog.description || '').trim(),
        mappings: presetDialog.mappings.map(stripSignalDraft).filter((signal) => Boolean(signal.oscPath)),
      };

      const nextConfig = editConfiguration(config, { kind: 'preset-save', preset: nextPreset });

      const saved = await persistConfig(nextConfig);
      setSelectedOscPreset(nextPreset.id);
      setPresetDialog(null);
      notify(t('{0} 已保存', [nextPreset.name]), 'success');
      setConfig(saved);
    }).catch((error) => notify(error.message || t('保存预设失败'), 'error'));
  }

  async function deleteSelectedPreset() {
    if (!config || !selectedOscPreset) return;

    const preset = getOscMappingPreset(config, selectedOscPreset);
    if (!preset) return;
    if (preset.isBuiltIn) {
      notify(t('内置预设不能删除；如需修改，请复制为自定义预设。'), 'warning');
      return;
    }

    await withBusy(`preset-delete-${selectedOscPreset}`, async () => {
      const nextConfig = editConfiguration(config, { kind: 'preset-remove', id: selectedOscPreset });

      const saved = await persistConfig(nextConfig);
      const nextPresets = getOscMappingPresets(saved);
      setSelectedOscPreset(nextPresets[0]?.id || '');
      notify(t('{0} 已删除', [preset.name]), 'info');
      setConfig(saved);
    }).catch((error) => notify(error.message || t('删除预设失败'), 'error'));
  }

  function updateProfileAxis(axisKey, patch) {
    setProfileDialog((previous) => {
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
    const preset = AXIS_PROFILE_PRESETS().find((item) => item.id === presetId);
    if (!preset) return;

    setProfileDialog((previous) => {
      if (!previous) return previous;
      return {
        ...previous,
        presetId,
        profile: cloneMotionProfile(createAxisProfilePresetMotion(presetId), false),
      };
    });
  }

  function openProfileDialog(profileId) {
    clearErrorNotification();
    if (!config) return;
    setProfileDialog(buildProfileDialogDraft(profileId, config));
  }

  function openNewProfileDialog() {
    clearErrorNotification();
    if (!config) return;
    setProfileDialog(buildNewProfileDialogDraft(config));
  }

  async function saveProfileDialog() {
    if (!profileDialog || !config) return;

    await withBusy(`profile-save-${profileDialog.profileId}`, async () => {
      const nextProfileName = (profileDialog.name || t('轴配置')).trim() || t('轴配置');
      const nextConfig = editConfiguration(config, { kind: 'profile-save', draft: profileDialog });

      await persistConfig(nextConfig);
      await refreshOverview();
      setProfileDialog(null);
      notify(t('{0} 已保存', [nextProfileName]), 'success');
    }).catch((error) => notify(error.message || t('保存轴配置失败'), 'error'));
  }

  async function setDefaultAxisProfile(profileId) {
    if (!config) return;

    await withBusy(`profile-default-${profileId}`, async () => {
      const nextConfig = editConfiguration(config, { kind: 'profile-default', id: profileId });

      const saved = await persistConfig(nextConfig);
      await refreshOverview();
      notify(t('默认轴配置已切换为 {0}', [getAxisProfile(saved, profileId).name]), 'success');
    }).catch((error) => notify(error.message || t('设置默认轴配置失败'), 'error'));
  }

  async function removeAxisProfile(profileId) {
    if (!config) return;

    const profile = getAxisProfile(config, profileId);
    if (!profile || profile.isDefault) {
      notify(t('默认轴配置不能移除'), 'warning');
      return;
    }

    await withBusy(`profile-remove-${profileId}`, async () => {
      const nextConfig = editConfiguration(config, { kind: 'profile-remove', id: profileId });

      const saved = await persistConfig(nextConfig);
      await refreshOverview();
      notify(t('{0} 已移除，相关输出已回退到默认轴配置', [profile.name]), 'info');
      setStudio((previous) => sanitizeStudio(previous, saved));
    }).catch((error) => notify(error.message || t('移除轴配置失败'), 'error'));
  }

  function selectInputTab(nextMode) {
    setStudio((previous) => ({ ...(previous || {}), preferredInputTab: nextMode }));
  }

  async function applyInputMode(nextMode) {
    if (!nextMode) return;
    const focusOrigin = document.activeElement;

    await withBusy(`mode-${nextMode}`, async () => {
      await apiRequest('/api/input/mode', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mode: nextMode }),
      });
      await refreshOverview();
      const modeTab = document.getElementById(`input-tabs-${nextMode}`);
      if (modeTab?.getAttribute('aria-selected') === 'true'
        && (document.activeElement === focusOrigin || (!focusOrigin?.isConnected && document.activeElement === document.body))) {
        modeTab.focus({ preventScroll: true });
      }
      notify(t('已切换到 {0}，输入已关闭；检查目标后再打开输入。', [formatMode(nextMode)]), 'success');
    }).catch((error) => notify(error.message || t('切换输入失败'), 'error'));
  }

  const manualRafRef = useRef(null);

  function scheduleManualContinuousUpdate() {
    if (!manualContinuous || !['manual', 'combined'].includes(actualInputMode) || wsState !== 'connected' || workspace !== 'control') return;
    if (manualRafRef.current) return;

    manualRafRef.current = requestAnimationFrame(() => {
      manualRafRef.current = null;
      apiRequest('/api/input/manual', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(
          manualCommandPayload(manualDraftRef.current, manualMotionModeRef.current, manualMotionValueRef.current),
        ),
      }).catch((error) => notify(error.message || t('手动输入更新失败'), 'error'));
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
      notify(t('手动目标已更新'), 'success');
    }).catch((error) => notify(error.message || t('更新位置失败'), 'error'));
  }

  async function disableManualInput() {
    setManualContinuous(false);
    if (manualRafRef.current) {
      cancelAnimationFrame(manualRafRef.current);
      manualRafRef.current = null;
    }

    await withBusy('manual-disable', async () => {
      await apiRequest('/api/input/manual', { method: 'DELETE' });
      await refreshOverview();
      notify(t('手动输入已停用'), 'success');
    }).catch((error) => notify(error.message || t('停用手动输入失败'), 'error'));
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

      applyScriptSnapshot(result?.script, scriptSettings);
      setStudio((previous) => (previous ? { ...previous, preferredInputTab: previous.preferredInputTab === 'combined' ? 'combined' : 'script' } : previous));
      await refreshOverview();
      notify(restart ? t('脚本已重新开始') : t('脚本播放中'), 'success');
    }).catch((error) => notify(error.message || t('脚本播放失败'), 'error'));
  }

  async function pauseScript() {
    await withBusy('script-pause', async () => {
      await apiRequest('/api/input/script/pause', { method: 'POST' });
      await refreshOverview();
      notify(t('脚本已暂停，已请求停止输出'), 'info');
    }).catch((error) => notify(error.message || t('脚本暂停失败'), 'error'));
  }

  async function stopScript() {
    await withBusy('script-stop', async () => {
      await apiRequest('/api/input/script/stop', { method: 'POST' });
      await refreshOverview();
      notify(t('脚本已停止，已请求停止输出'), 'info');
    }).catch((error) => notify(error.message || t('脚本停止失败'), 'error'));
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

      applyScriptSnapshot(result?.script, payload);

      if (options.notify) notify(options.successMessage || t('脚本设置已应用'), 'success');
    }).catch((error) => {
      setScriptSettings((previous) => normalizeScriptSettingsState(scriptState, previous));
      notify(error.message || options.errorMessage || t('脚本设置更新失败'), 'error');
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

      applyScriptSnapshot(result?.script, scriptSettings);
    }).catch((error) => {
      setScriptSeekDraft(fallbackPositionMs);
      notify(error.message || t('脚本定位失败'), 'error');
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
      notify(t('请输入有效时间码，例如 01:23.45、1:30 或 90'), 'warning');
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
          successMessage: t('A-B 区间已设为 {0} → {1}', [
            formatDuration(nextRange.startMs),
            formatDuration(nextRange.endMs),
          ]),
          errorMessage: t('设置 A-B 区间失败'),
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
          successMessage:
            boundary === 'start'
              ? t('A 点已设置为 {0}', [formatDuration(clampedPositionMs)])
              : t('B 点已设置为 {0}', [formatDuration(clampedPositionMs)]),
          errorMessage: boundary === 'start' ? t('设置 A 点失败') : t('设置 B 点失败'),
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
          successMessage: t('A-B 区间已清除'),
          errorMessage: t('清除 A-B 区间失败'),
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
      applyScriptSnapshot(result?.script, scriptSettings);
    }).catch((error) => notify(error.message || t('脚本动作跳转失败'), 'error'));

    setScriptSeekDragging(false);
  }

  async function clearScript() {
    await withBusy('script-clear', async () => {
      const result = await apiRequest('/api/input/script', { method: 'DELETE' });
      setSelectedScriptFile(null);
      setScriptFileInputKey((previous) => previous + 1);
      setScriptSeekDraft(0);
      setScriptJumpInput('');

      applyScriptSnapshot(result?.script, scriptSettings);

      await refreshOverview();
      notify(t('脚本已卸载'), 'info');
    }).catch((error) => notify(error.message || t('卸载脚本失败'), 'error'));
  }

  async function setOutputEnabled(type, enabled) {
    if (!config) return;

    await withBusy(`output-enable-${type}`, async () => {
      const nextConfig = editConfiguration(config, { kind: 'output-enabled', id: type, enabled });
      const saved = await persistConfig(nextConfig);
      await refreshOverview();
      notify(`${getOutputConfig(saved, type)?.name || t('输出')}${enabled ? t(' 已启用') : t(' 已禁用')}`, 'success');
    }).catch((error) => notify(error.message || t('更新输出状态失败'), 'error'));
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
      setStudio((previous) => sanitizeStudio(previous, saved));
      setDialog({ outputId: nextOutput.id, draft: buildOutputDialogDraft(nextOutput.id, saved, availableSerialPorts) });
      await refreshOverview();
      notify(t('已添加 {0}', [nextOutput.name]), 'success');
    }).catch((error) => notify(error.message || t('添加输出失败'), 'error'));
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
      notify(t('{0} 已移除', [removed?.name || t('输出')]), 'info');
    }).catch((error) => notify(error.message || t('移除输出失败'), 'error'));
  }

  async function openOutputDialog(type) {
    clearErrorNotification();
    if (!config) return;
    const output = getOutputConfig(config, type);
    if (!output) return;

    let availableSerialPorts = serialPorts;
    if (output.type === 'TCodeSerial') {
      availableSerialPorts = (await refreshSerialPorts().catch(() => serialPorts)) || serialPorts;
    }
    if (output.type === 'Midi') await refreshMidiPorts().catch(error => notify(error.message, 'error'));
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
      notify(t('{0} 配置已保存', [getOutputConfig(saved, dialog.outputId)?.name || t('输出')]), 'success');
    }).catch((error) => notify(error.message || t('保存配置失败'), 'error'));
  }

  async function emergencyStop() {
    await withBusy('emergency-stop', async () => {
      await apiRequest('/api/control/runtime/emergency-stop', { method: 'POST' });
      await refreshOverview();
      notify(t('已停止所有输出'), 'warning');
    }).catch((error) => notify(error.message || t('急停失败'), 'error'));
  }

  async function clearEmergency() {
    await withBusy('emergency-clear', async () => {
      await apiRequest('/api/control/runtime/clear-emergency', { method: 'POST' });
      await refreshOverview();
      notify(t('急停已解除，请检查后重新启用输入。'), 'success');
    }).catch((error) => notify(error.message || t('解除急停失败'), 'error'));
  }

  async function toggleIntifaceScan(start, outputId) {
    const endpoint = start
      ? `/api/control/output/${encodeURIComponent(outputId)}/scan-start`
      : `/api/control/output/${encodeURIComponent(outputId)}/scan-stop`;
    await withBusy(start ? 'scan-start' : 'scan-stop', async () => {
      await apiRequest(endpoint, { method: 'POST' });
      notify(start ? t('已请求开始扫描') : t('已请求停止扫描'), 'info');
    }).catch((error) => notify(error.message || t('扫描请求失败'), 'error'));
  }

  async function refreshTCodeDeviceInfo(outputId) {
    await withBusy(`tcode-device-refresh-${outputId}`, async () => {
      await apiRequest(`/api/control/output/${encodeURIComponent(outputId)}/device-info-refresh`, { method: 'POST' });
      await refreshOverview();
      notify(t('设备信息已刷新'), 'success');
    }).catch((error) => notify(error.message || t('刷新设备信息失败'), 'error'));
  }

  const oscPreview = overview?.osc?.preview || EMPTY_OSC_CATALOG;
  const oscSources = Array.isArray(overview?.osc?.sources) ? overview.osc.sources : EMPTY_OSC_CATALOG;
  const selectedOscSourceKey = overview?.osc?.selectedSourceKey || '';
  const hasMultipleOscSources = oscSources.length > 1;
  const catalogVisibility = oscCatalogVisibility(workspace, oscWorkspaceTab, Boolean(presetDialog));
  const parameterBrowserVisible = catalogVisibility.parameterBrowserVisible;
  const mappingEditorVisible = catalogVisibility.mappingEditorVisible || workspace === 'pipeline' || Boolean(dialog);
  const mappingPreviewEntries = useMemo(() => mappingEditorVisible
    ? filterOscPreviewEntriesBySource(oscPreview, hasMultipleOscSources ? selectedOscSourceKey : '') : EMPTY_OSC_CATALOG,
  [mappingEditorVisible, oscPreview, hasMultipleOscSources, selectedOscSourceKey]);
  const lookupOscPreview = useMemo(() => createOscPreviewLookup(mappingPreviewEntries), [mappingPreviewEntries]);
  const oscQuery = overview?.osc?.query;
  const oscHub = overview?.osc?.hub;
  const oscHubTargetsDraft = Array.isArray(oscDraft.hubTargets) ? oscDraft.hubTargets : [];
  const oscHubConflicts = useMemo(() => buildOscHubTargetConflictLookup(oscDraft), [oscDraft, locale]);
  const suggestOscPaths = useMemo(() => createOscPathSuggester(), []);
  const oscPathSuggestions = useMemo(() => mappingEditorVisible
    ? suggestOscPaths(mappingPreviewEntries, oscQuery?.nodes || EMPTY_OSC_CATALOG) : EMPTY_OSC_CATALOG,
  [mappingEditorVisible, mappingPreviewEntries, oscQuery?.nodes, suggestOscPaths]);
  const visibleCatalog = frozenPreview || oscPreview;
  const visibleParameterDetail = useMemo(() => resolveOscParameterDetail(parameterDetail, visibleCatalog,
    { frozen: Boolean(frozenPreview), connected: wsState === 'connected' }), [parameterDetail, visibleCatalog, frozenPreview, wsState]);
  const sourceCatalog = useMemo(() => !parameterBrowserVisible ? EMPTY_OSC_CATALOG : previewSourceTab === 'all'
    ? visibleCatalog : visibleCatalog.filter(entry => entry.sourceKey === previewSourceTab),
  [parameterBrowserVisible, visibleCatalog, previewSourceTab]);
  const rankOscPreview = useMemo(() => createOscPreviewRanker(), []);
  const mappedParameterSources = useMemo(() => expandMappingSources(signalDrafts, computedDrafts), [signalDrafts, computedDrafts]);
  const rankedOscPreview = useMemo(() => parameterBrowserVisible ? rankOscPreview(sourceCatalog, mappedParameterSources, {
    showFaceTracking, search: oscPreviewSearch, pinned: pinnedPaths, category: previewCategory,
  }) : EMPTY_OSC_CATALOG,
  [parameterBrowserVisible, sourceCatalog, mappedParameterSources, showFaceTracking, oscPreviewSearch, pinnedPaths, previewCategory, rankOscPreview]);
  const oscMappingPresets = useMemo(() => getOscMappingPresets(config), [config, locale]);
  const selectedOscPresetConfig = useMemo(() => getOscMappingPreset(config, selectedOscPreset), [config, selectedOscPreset, locale]);
  const hasIncompleteMappings = useMemo(() => signalDrafts.some((draft) => !String(draft.oscPath || '').trim())
    || computedDrafts.some(computedDraftIncomplete), [signalDrafts, computedDrafts]);
  const signalDraftsHash = useMemo(() => computeSignalHash(signalDrafts), [signalDrafts]);
  const computedDraftsHash = useMemo(() => computeComputedHash(computedDrafts), [computedDrafts]);
  const computedGraphDirty = computedDraftsHash !== savedComputedHash;
  const computedPreviewById = useMemo(() => computedMappingPreviews(computedDrafts, config?.computedSignals,
    overview?.computedSignals || EMPTY_OSC_CATALOG, computedGraphDirty),
  [computedDrafts, config?.computedSignals, overview?.computedSignals, computedGraphDirty, locale]);
  const hasUnsavedMappings = Boolean(
    config && (signalDraftsHash !== savedSignalsHash || computedGraphDirty),
  );
  const signalOverlapWarnings = useMemo(() => buildSignalOverlapWarnings(signalDrafts), [signalDrafts, locale]);
  const outputDialogConflicts = useMemo(() => dialog && config ? getOutputTargetConflicts(config, dialog.outputId, dialog.draft) : [], [dialog, config, locale]);
  const outputDialogOverview = dialog ? getOutputOverview(overview, dialog.outputId) : null;
  const outputDialogConflictMessage = formatOutputTargetConflictMessage(outputDialogConflicts);
  const showLogs = workspace === 'settings' && logDetailsOpen;
  const logCategories = useMemo(() => showLogs ? [...new Set(logs.map((entry) => entry.category).filter(Boolean))].sort() : [], [logs, showLogs]);
  const logAxes = useMemo(() => showLogs ? [...new Set(logs.map((entry) => entry.axisTrace?.axis).filter(Boolean))].sort() : [], [logs, showLogs]);
  const logActions = useMemo(() => showLogs ? [...new Set(logs.map((entry) => entry.axisTrace?.action).filter(Boolean))].sort() : [], [logs, showLogs]);
  const filteredLogs = useMemo(() => {
    if (!showLogs) return [];
    const needle = logSearchText.trim().toLowerCase();
    return logs
    .filter((log) => {
      if (
        !logOnlyAxis &&
        log.level &&
        LOG_LEVEL_ORDER.indexOf(log.level) < Math.max(0, LOG_LEVEL_ORDER.indexOf(logFilterLevel))
      )
        return false;
      if (
        (logOnlyAxis && !log.axisTrace) ||
        (logCategoryFilter && log.category !== logCategoryFilter) ||
        (logAxisFilter && log.axisTrace?.axis !== logAxisFilter) ||
        (logActionFilter && log.axisTrace?.action !== logActionFilter)
      )
        return false;
      return (
        !needle ||
        [log.message, log.category, ...Object.values(log.axisTrace || {})].join(' ').toLowerCase().includes(needle)
      );
    })
    .slice(-300);
  }, [logs, showLogs, logOnlyAxis, logFilterLevel, logCategoryFilter, logAxisFilter, logActionFilter, logSearchText]);
  const manualMotionField =
    manualMotionMode === 'Interval'
      ? { label: t('指定时长'), min: 1, max: MANUAL_INTERVAL_MAX_MS, unit: 'ms', format: (value) => `${Math.round(Number(value))} ms` }
      : { label: manualMotionMode === 'Speed' ? t('指定速度') : t('速度上限'), min: AXIS_LIMIT_MIN_SPEED, max: AXIS_LIMIT_MAX_SPEED };
  const modeBusy = Boolean(busyKey.startsWith('mode-'));
  const scriptBusy = Boolean(busyKey.startsWith('script-'));
  const inputActive = runtimeOverview?.inputActive === true;
  const online = wsState === 'connected';
  const modalError = snackbar.open && snackbar.severity === 'error' ? diagnostic(snackbar.message) : '';
  const emergencyAction = (
    <Button
      tone={runtimeOverview?.isEmergency ? 'default' : 'danger-solid'}
      disabled={!online || busyKey === 'emergency-stop' || busyKey === 'emergency-clear'}
      onClick={runtimeOverview?.isEmergency ? clearEmergency : emergencyStop}
    >
      {runtimeOverview?.isEmergency ? t('解除急停') : t('紧急停止')}
    </Button>
  );
  const updateOsc = (patch) => setOscDraft((previous) => ({ ...previous, ...patch }));
  const updateOutput = (patch) => setDialog((previous) => ({ ...previous, draft: { ...previous.draft, ...patch } }));
  const latestForDraft = (draft) =>
    draft.sourceMode === 'Computed'
      ? computedPreviewById.get(draft.oscPath)
      : draft.sourceMode === 'SensaPoint'
      ? pointPreviewEntry(overview?.poseTracking?.spsRoots || [], draft, selectedOscSourceKey)
      : draft.sourceMode === 'SensaPose'
        ? posePreviewEntry(
            overview?.poseTracking?.observations || [],
            draft,
            selectedOscSourceKey,
            overview?.poseTracking?.activeKey,
          )
        : lookupOscPreview(draft.oscPath, selectedOscSourceKey);

  async function setInputActive(active) {
    await withBusy('input-active', async () => {
      await apiRequest('/api/input/active', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ active }),
      });
      await refreshOverview();
    }).catch((error) => notify(error.message || t('输入状态更新失败'), 'error'));
  }

  useEffect(() => {
    if (manualContinuous && online && ['manual', 'combined'].includes(actualInputMode) && workspace === 'control') return undefined;
    if (manualRafRef.current) {
      cancelAnimationFrame(manualRafRef.current);
      manualRafRef.current = null;
    }
    return undefined;
  }, [manualContinuous, online, actualInputMode, workspace]);

  useEffect(
    () => () => {
      if (manualRafRef.current) cancelAnimationFrame(manualRafRef.current);
    },
    [],
  );

  useEffect(() => {
    if (!snackbar.open || snackbar.severity === 'error') return undefined;
    const timer = window.setTimeout(() => setSnackbar((previous) => ({ ...previous, open: false })), 5000);
    return () => window.clearTimeout(timer);
  }, [snackbar.open, snackbar.message, snackbar.severity]);

  useEffect(() => {
    if (workspace !== 'settings') setLogDetailsOpen(false);
  }, [workspace]);

  function navigateWorkflow(destination) {
    setHelpOpen(false);
    if (['manual', 'script'].includes(destination)) {
      setWorkspace('control');
      selectInputTab(destination);
      setNavigationTarget(`#input-tabs-${destination}`);
    } else if (destination === 'outputs') {
      setWorkspace('control');
      setNavigationTarget('.outputs-section');
    } else {
      setWorkspace('osc');
      setOscWorkspaceTab(['osc-diagnostics', 'sensa-sps'].includes(destination) ? 'experimental' : 'setup');
      if (destination === 'osc') selectInputTab('osc');
      setNavigationTarget(destination === 'osc-settings' ? '.osc-receiver-settings'
        : destination === 'sensa-sps' ? '#sensa-spatial-root' : destination === 'osc-diagnostics' ? '#osc-tabs-experimental' : '.preset-strip');
    }
  }

  useEffect(() => {
    if (!navigationTarget || helpOpen) return;
    const region = document.querySelector('main.workspace-scroll')?.querySelector(navigationTarget);
    if (!region) return;
    for (let ancestor = region; ancestor; ancestor = ancestor.parentElement) {
      if (ancestor.tagName === 'DETAILS') ancestor.open = true;
    }
    const target = region.matches('button, input, select, summary, [tabindex]') ? region
      : region.querySelector('button:not(:disabled), input:not(:disabled), select:not(:disabled), summary');
    target?.focus({ preventScroll: true });
    (region.closest('.input-section') || region).scrollIntoView({ block: 'start', behavior: 'instant' });
    setNavigationTarget(null);
  }, [navigationTarget, workspace, oscWorkspaceTab, helpOpen]);

  function renderScriptPlayer() {
    return (
      <div className="stack script-player">
        <div className="stack script-player__controls">
          <div className="section__header">
            <div>
              <h3>{scriptFileLabel}</h3>
              <span className="muted">
                {scriptLoadedState.label}
                {scriptLoaded ? ` · ${scriptState.actionCount} ${t('动作')}` : ''}
              </span>
            </div>
            <div className="actions">
              <label className={`button button--size-medium file-button ${scriptLoaded ? 'button--default button--variant-outline' : 'button--primary button--variant-base'}`}>
                {selectedScriptFile ? t('导入中…') : scriptLoaded ? t('更换脚本') : t('选择脚本')}
                <input
                  key={scriptFileInputKey}
                  type="file"
                  accept=".funscript,.json"
                  disabled={Boolean(selectedScriptFile)}
                  onChange={(event) => setSelectedScriptFile(event.target.files?.[0] || null)}
                />
              </label>
              {scriptLoaded && (
                <Button disabled={scriptBusy} onClick={clearScript}>
                  {t('卸载')}
                </Button>
              )}
            </div>
          </div>
          {scriptLoaded && (
            <>
              <div className="script-clock">
                <output>{formatDuration(scriptSeekBasePosition)}</output>
                <span className="muted">/ {formatDuration(scriptDurationMs)}</span>
              </div>
              <SliderControl
                aria-label={t('时间轴')}
                min={0}
                max={scriptSliderMax}
                step={50}
                value={scriptSeekValue}
                disabled={!scriptLoaded || scriptBusy}
                valueFormatter={formatDuration}
                onChange={(next) => {
                  setScriptSeekDragging(true);
                  setScriptSeekDraft(next);
                }}
                onChangeCommitted={(next) => void seekScript(next)}
              />
              <ScriptTimelineDensity
                bins={scriptActivityBins}
                durationMs={scriptDurationMs}
                currentPositionMs={scriptSeekBasePosition}
                loopStartMs={scriptLoopRange.startMs}
                loopEndMs={scriptLoopRange.endMs}
                disabled={!scriptLoaded || scriptBusy}
                onSeek={seekScript}
                onSetLoopBoundary={setScriptLoopBoundary}
                onSelectLoopRange={applyScriptLoopRange}
              />
              <div className="actions transport">
                <div className="actions transport__primary">
                  <Button tone="primary" disabled={!scriptLoaded || scriptBusy}
                    onClick={() => (scriptState?.playing ? pauseScript() : playScript(false))}>
                    {scriptTransportPrimaryLabel}
                  </Button>
                  <Button disabled={!scriptLoaded || scriptBusy} onClick={stopScript}>{t('停止')}</Button>
                </div>
                <div className="actions transport__navigation">
                  <Button disabled={!scriptLoaded || scriptBusy} onClick={() => stepScriptAction(-1)}>{t('上一动作')}</Button>
                  <Button disabled={!scriptLoaded || scriptBusy} onClick={() => playScript(true)}>{t('重播')}</Button>
                  <Button disabled={!scriptLoaded || scriptBusy} onClick={() => stepScriptAction(1)}>{t('下一动作')}</Button>
                </div>
              </div>
            </>
          )}
        </div>
        {scriptLoaded && (
          <div className="stack script-player__options">
            <div className="form-grid">
              <SelectField
                label={t('播放倍率')}
                value={scriptSettings.speed}
                options={[...new Set([...SCRIPT_SPEED_PRESETS, scriptSettings.speed])]
                  .sort((a, b) => a - b)
                  .map((value) => ({ value, label: formatScriptSpeedLabel(value) }))}
                onChange={(speed) => updateScriptSettingsDraft({ speed }, { commit: true })}
              />
              <ValueSliderField
                label={t('自定义倍率')}
                value={scriptSettings.speed}
                min={SCRIPT_SPEED_MIN}
                max={SCRIPT_SPEED_MAX}
                step={SCRIPT_SPEED_STEP}
                valueFormatter={formatScriptSpeedLabel}
                unit="×"
                onChange={(speed) => updateScriptSettingsDraft({ speed })}
                onChangeCommitted={(speed) => updateScriptSettingsDraft({ speed }, { commit: true })}
              />
              <Toggle
                label={t('循环')}
                checked={scriptSettings.loop}
                onChange={(loop) => updateScriptSettingsDraft({ loop }, { commit: true })}
              />
            </div>
            <details>
              <summary>{t('定位与 A-B')}</summary>
              <div className="stack">
                <div className="actions">
                  <Field
                    label={t('跳转时间')}
                    value={scriptJumpInput}
                    placeholder="01:23.45"
                    onChange={(event) => setScriptJumpInput(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter') {
                        event.preventDefault();
                        void submitScriptJump();
                      }
                    }}
                  />
                  <Button disabled={!scriptLoaded || scriptBusy} onClick={submitScriptJump}>
                    {t('跳转')}
                  </Button>
                  {SCRIPT_SEEK_ACTIONS().map((action) => (
                    <Button
                      key={action.key}
                      disabled={!scriptLoaded || scriptBusy}
                      onClick={() =>
                        action.mode === 'relative'
                          ? seekScriptRelative(action.value)
                          : seekScript(action.value === 'end' ? scriptDurationMs : action.value)
                      }
                    >
                      {action.label}
                    </Button>
                  ))}
                </div>
                <div className="actions">
                  <Button disabled={!scriptLoaded || scriptBusy} onClick={() => setScriptLoopBoundary('start')}>
                    {t('设 A')}
                  </Button>
                  <Button disabled={!scriptLoaded || scriptBusy} onClick={() => setScriptLoopBoundary('end')}>
                    {t('设 B')}
                  </Button>
                  <Button
                    disabled={scriptLoopRange.startMs === null || scriptBusy}
                    onClick={() => jumpToScriptLoopBoundary('start')}
                  >
                    {t('跳至 A')}
                  </Button>
                  <Button
                    disabled={scriptLoopRange.endMs === null || scriptBusy}
                    onClick={() => jumpToScriptLoopBoundary('end')}
                  >
                    {t('跳至 B')}
                  </Button>
                  <Button disabled={!scriptLoaded || scriptBusy} onClick={clearScriptLoopRange}>
                    {t('清除 A-B')}
                  </Button>
                </div>
                <p className="muted">
                  A {scriptLoopRange.startMs === null ? '—' : formatDuration(scriptLoopRange.startMs)} · B{' '}
                  {scriptLoopRange.endMs === null ? '—' : formatDuration(scriptLoopRange.endMs)}
                </p>
              </div>
            </details>
            <details>
              <summary>{t('快捷键')}</summary>
              <div className="shortcut-list">
                {SCRIPT_SHORTCUT_GROUPS()
                  .flatMap((group) => group.items)
                  .map((item) => (
                    <div key={item.shortcut}>
                      <kbd>{item.shortcut}</kbd>
                      <span>{item.label}</span>
                    </div>
                  ))}
              </div>
              <p className="caption muted">{t('仅在脚本页空白处生效；输入框、按钮与滑条保留自己的键盘操作。')}</p>
            </details>
          </div>
        )}
      </div>
    );
  }

  function renderRecording() {
    const recording = overview?.recording || {};
    return (
      <details className="recording-panel">
        <summary>
          {t('录制 L0 目标')}{' '}
          <Badge tone={recording.isActive ? 'warning' : 'default'}>
            {recording.isActive ? t('录制中') : recording.frameCount ? t('已停止') : t('待录制')}
          </Badge>
        </summary>
        <div className="stack">
          <p className="caption muted">{t('记录输出分发前的 L0 动作目标，可导出为 funscript。')}</p>
          <div className="actions recording-toolbar">
            <span className="caption muted">{t('已录制 {0} 帧', [recording.frameCount || 0])}</span>
            <Button disabled={!online || recording.isActive || recordingBusy}
              onClick={() => { clearErrorNotification(); if (recording.frameCount) setRecordingRestartOpen(true); else void recordingAction('start'); }}>
              {recording.frameCount ? t('重新录制') : t('开始录制')}
            </Button>
            <Button disabled={!online || !recording.isActive || recordingBusy} onClick={() => recordingAction('stop')}>
              {t('停止录制')}
            </Button>
            <Button tone="primary" disabled={!online || !recording.frameCount || recordingBusy} onClick={() => recordingAction('export')}>
              {recording.isActive ? t('停止录制并导出') : t('导出录制')}
            </Button>
          </div>
        </div>
      </details>
    );
  }

  function renderOutputs() {
    return (
      <Section
        title={t('输出')}
        description={t('配置设备、应用和录制目标，把信号送到所需位置。')}
        className="outputs-section"
        actions={
          <>
            <SelectField
              data-testid="output-type"
              label={t('输出类型')}
              value={newOutputType}
              options={OUTPUT_TYPES()}
              onChange={setNewOutputType}
            />
            <Button data-testid="add-output" onClick={() => addOutputCard(newOutputType)} disabled={!online || Boolean(busyKey)}>
              {t('添加输出')}
            </Button>
          </>
        }
      >
        {outputs.length === 0 ? (
          <div className="empty-state">
            <strong>{t('暂无输出')}</strong>
            <p>{t('选择输出方式，再配置目标与信号来源。')}</p>
          </div>
        ) : (
          <div className="output-list">
            {outputs.map((output) => {
              const state = getOutputOverview(overview, output.id) || {};
              const type = OUTPUT_TYPE_BY_VALUE()[output.type] || { label: output.type };
              const profile = isTCodeOutputType(output.type)
                ? getAxisProfile(config, output.motionProfileId) || getDefaultAxisProfile(config)
                : null;
              return (
                <article key={output.id} className="output-card" data-output-id={output.id} data-output-type={output.type}>
                  <div className="output-identity">
                    <header className="section__header">
                      <h3>{output.name}</h3>
                      <Badge tone={!output.enabled ? 'default' : state.connected ? 'success' : 'warning'}>
                        {!output.enabled ? t('已禁用') : state.connected ? t('已连接') : t('未连接')}
                      </Badge>
                    </header>
                    <p className="mono caption wrap" data-testid={output.type === 'TCodeSerial' ? 'serial-target' : undefined}>{buildOutputSummary(output)}</p>
                    <p className="caption muted">
                      {type.label}
                      {profile ? ` · ${profile.name}` : ''}
                    </p>
                  </div>
                  <div className="output-telemetry stack">
                    {isSignalOutputType(output.type) ? <OutputSignalStatus status={state.signalStatus} onLoadScript={loadRecordedScript} busy={!online || Boolean(busyKey)} /> : <OutputPositionPanel state={state} />}
                    {!isSignalOutputType(output.type) && state.signalStatus && <OutputSignalStatus status={state.signalStatus} />}
                  </div>
                  <footer className="actions output-actions">
                    <Button
                      disabled={!online || Boolean(busyKey)}
                      onClick={() => setOutputEnabled(output.id, !output.enabled)}
                    >
                      {output.enabled ? t('禁用') : t('启用')}
                    </Button>
                    <Button disabled={!online} onClick={() => openOutputDialog(output.id)}>
                      {t('配置')}
                    </Button>
                    <Button
                      tone="danger"
                      disabled={!online || Boolean(busyKey)}
                      onClick={() => removeOutputCard(output.id)}
                    >
                      {t('移除')}
                    </Button>
                  </footer>
                  {output.type === 'Recording' && <RecordingReplayControls outputId={output.id} status={state.signalStatus} onAction={replayOutput}
                    files={recordingFiles} onRefreshFiles={refreshRecordingFiles} busy={!online || Boolean(busyKey)} />}
                  {state.lastError && <div className="output-detail"><Notice tone="error">{diagnostic(state.lastError)}</Notice></div>}
                  {output.type === 'TCodeSerial' && (
                    <div className="output-detail">
                      <TCodeDeviceInfoCard
                        deviceInfo={state.tcodeDeviceInfo}
                        connected={Boolean(state.connected)}
                        onRefresh={() => refreshTCodeDeviceInfo(output.id)}
                        busy={busyKey === `tcode-device-refresh-${output.id}`}
                      />
                    </div>
                  )}
                  {output.type === 'Intiface' && (
                    <details className="output-detail">
                      <summary>{t('设备扫描')}</summary>
                      <div className="actions">
                        <Button onClick={() => toggleIntifaceScan(true, output.id)}>{t('开始扫描')}</Button>
                        <Button onClick={() => toggleIntifaceScan(false, output.id)}>{t('停止扫描')}</Button>
                      </div>
                      <ul>
                        {(state.devices || []).map((device) => (
                          <li key={device.index}>{device.name}</li>
                        ))}
                      </ul>
                    </details>
                  )}
                </article>
              );
            })}
          </div>
        )}
      </Section>
    );
  }

  function renderMappings() {
    return (
      <div className="stack">
        <div className="preset-strip">
          <SelectField
            label={t('预设方案')}
            value={selectedOscPreset}
            options={oscMappingPresets.map((preset) => ({ value: preset.id, label: preset.name }))}
            onChange={setSelectedOscPreset}
          />
          <div className="actions">
            <Button onClick={() => applyOscPreset('replace')} disabled={!selectedOscPresetConfig}>
              {t('替换草稿')}
            </Button>
            <Button onClick={() => applyOscPreset('append')} disabled={!selectedOscPresetConfig}>
              {t('追加草稿')}
            </Button>
          </div>
        </div>
        <div className="mapping-toolbar" role="group" aria-label={t('映射保存')}>
          <div className="actions">
            <span className="caption muted">{t('{0} 条映射', [signalDrafts.length])}</span>
            <Badge tone={hasUnsavedMappings || hasIncompleteMappings ? 'warning' : 'default'}>{hasIncompleteMappings ? t('待填写') : hasUnsavedMappings ? t('未保存') : t('已保存')}</Badge>
            <Button disabled={(!hasUnsavedMappings && !hasIncompleteMappings) || Boolean(busyKey)} onClick={restoreSignalDrafts}>{t('恢复映射')}</Button>
          </div>
          <Button tone="primary" disabled={!online || Boolean(busyKey) || hasIncompleteMappings} onClick={saveOscMappings}>{t('保存映射')}</Button>
        </div>
        {hasIncompleteMappings && <p className="caption muted">{t('填写映射与计算输入，完成后再保存。')}</p>}
        <ComputedSignalsPanel drafts={computedDrafts} runtimeSignals={overview?.computedSignals || EMPTY_OSC_CATALOG}
          observations={overview?.poseTracking?.spsRoots || EMPTY_OSC_CATALOG} selectedSourceKey={selectedOscSourceKey}
          graphDirty={computedGraphDirty} pathOptions={oscPathSuggestions} onChange={setComputedDrafts}
          onMap={signal => { setSignalDrafts(previous => [...previous, makeSignalDraft({ sourceMode: 'Computed', oscPath: signal.id })]); notify(t('已添加计算信号的轴映射，请调整目标轴与量程后保存。'), 'info'); }} />
        <details className="inline-details">
          <summary>{t('管理预设')}</summary>
          <div className="actions">
            <Button disabled={!selectedOscPresetConfig} onClick={() => openPresetDialog(selectedOscPreset)}>
              {selectedOscPresetConfig?.isBuiltIn ? t('复制预设') : t('编辑预设')}
            </Button>
            <Button onClick={() => openPresetDialog(null, { fromCurrent: true, currentMappings: signalDrafts })}>
              {t('另存为预设')}
            </Button>
            <Button onClick={() => openPresetDialog(null)}>{t('新建空预设')}</Button>
            <Button
              tone="danger"
              disabled={!selectedOscPresetConfig || selectedOscPresetConfig.isBuiltIn}
              onClick={deleteSelectedPreset}
            >
              {t('删除预设')}
            </Button>
          </div>
        </details>
        {selectedOscPresetConfig?.description && <p className="caption muted">{selectedOscPresetConfig.description}</p>}
        <details className="workflow-details">
          <summary>{t('映射检查')}</summary>
          <OscFlowStatus mappings={config?.signals || []} drafts={signalDrafts} dirty={hasUnsavedMappings}
            runtime={runtimeOverview || {}} mode={actualInputMode} listening={Boolean(overview?.osc?.listening)} />
        </details>
        {signalOverlapWarnings.length > 0 && <Notice>{t('同一目标轴按归一化优先级选择输入；需要混合时可先建立计算信号。')}</Notice>}
        {signalDrafts.length === 0 ? (
          <p className="empty-state">{t('还没有轴映射')}</p>
        ) : (
          <div className="mapping-list">
            {signalDrafts.map((draft) => (
              <SignalMappingRow
                key={draft._draftId}
                draft={draft}
                latestEntry={latestForDraft(draft)}
                pathOptions={oscPathSuggestions}
                computedSignals={computedDrafts}
                onChange={(patch) => updateSignalDraft(draft._draftId, patch)}
                onRemove={() => removeSignalDraft(draft._draftId)}
              />
            ))}
          </div>
        )}
        <div className="actions mapping-actions">
          <Button onClick={() => addSignalDraft()}>{t('新增映射')}</Button>
          <Button tone="danger" disabled={!signalDrafts.length} onClick={() => { clearErrorNotification(); setConfirmClearMappings(true); }}>
            {t('清空映射')}
          </Button>
        </div>
      </div>
    );
  }

  function renderParameters() {
    return (
      <div className="stack">
        <div className="parameter-filters">
          <Field
            label={t('搜索参数')}
            type="search"
            value={oscPreviewSearch}
            onChange={(event) => setOscPreviewSearch(event.target.value)}
          />
          <SelectField
            label={t('浏览来源')}
            value={previewSourceTab}
            options={[
              { value: 'all', label: t('全部来源') },
              ...oscSources.map((source) => ({ value: source.key, label: source.label || source.key })),
            ]}
            onChange={setPreviewSourceTab}
          />
          <SelectField
            label={t('分类')}
            value={previewCategory}
            options={[
              { value: 'all', label: t('全部') },
              { value: 'mapped', label: t('已映射') },
              { value: 'related', label: t('相关参数') },
              { value: 'pose', label: t('空间采样') },
            ]}
            onChange={setPreviewCategory}
          />
        </div>
        <div className="actions">
          <Toggle label={t('显示 FT 参数')} checked={showFaceTracking} onChange={setShowFaceTracking} />
          <Button onClick={() => setFrozenPreview((previous) => (previous ? null : [...oscPreview]))}>
            {frozenPreview ? t('继续预览') : t('冻结预览')}
          </Button>
          <span className="muted">{t('{0} 项', [rankedOscPreview.length])}</span>
        </div>
        {frozenPreview && <Notice>{t('预览已冻结；这不会停止 OSC 接收或正在进行的设备动作。')}</Notice>}
        <OscParameterTable entries={rankedOscPreview} pinnedPaths={pinnedPaths}
          filterKey={JSON.stringify([oscPreviewSearch, previewSourceTab, previewCategory, showFaceTracking])}
          onTogglePinned={togglePinned}
          onInspect={entry => { clearErrorNotification(); setParameterDetail(entry); }}
          onMap={entry => setOscWorkspaceTab(mapPreviewParameter(entry) || 'setup')} />
      </div>
    );
  }

  function renderOscSettings() {
    return (
      <details className="advanced-settings">
        <summary>{t('接收与转发设置')}</summary>
        <div className="stack">
          <div className="stack osc-receiver-settings">
            <div className="actions">
              <Toggle
                label={t('启用 OSC')}
                checked={oscDraft.oscEnabled}
                onChange={(oscEnabled) => updateOsc({ oscEnabled })}
              />
              <Badge tone={overview?.osc?.listening ? 'success' : 'default'}>
                {overview?.osc?.listening ? t('监听中') : t('未监听')}
              </Badge>
            </div>
            <div className="form-grid">
              <Field
                label={t('监听地址')}
                value={oscDraft.receiverHost}
                onChange={(event) => updateOsc({ receiverHost: event.target.value })}
              />
              <Field
                label={t('监听端口')}
                type="number"
                min={1}
                max={65535}
                value={oscDraft.receiverPort}
                onChange={(event) => updateOsc({ receiverPort: Number(event.target.value) })}
              />
              <Field
                label={t('允许来源 IP')}
                value={oscDraft.allowedSourceAddresses}
                onChange={(event) => updateOsc({ allowedSourceAddresses: event.target.value })}
              />
              <Field
                label={t('断流停止（毫秒；0 关闭）')}
                hint={t('仅值变化时发送的 OSC 来源不适合设置超时。')}
                type="number"
                min={0}
                value={oscDraft.inputTimeoutMs}
                onChange={(event) => updateOsc({ inputTimeoutMs: Number(event.target.value) })}
              />
            </div>
            {overview?.osc?.listenerError && <Notice tone="error">{diagnostic(overview.osc.listenerError)}</Notice>}
          </div>
          <details className="ogb-control-settings">
            <summary>{t('OGB 参数启用')}</summary>
            <div className="stack">
              <Toggle label={t('向 VRChat 启用 OGB 参数')} checked={oscDraft.ogbControlEnabled}
                onChange={(ogbControlEnabled) => updateOsc({ ogbControlEnabled })} />
              <p className="caption muted">{t('每 5 秒发送 OGB_ENABLED；停止 OSC 时撤销。与设备输入许可独立，UDP 没有接收确认。')}</p>
              <div className="form-grid">
                <Field label={t('VRChat 控制 IP')} value={oscDraft.ogbControlHost} disabled={!oscDraft.ogbControlEnabled}
                  onChange={(event) => updateOsc({ ogbControlHost: event.target.value })} />
                <Field label={t('VRChat 控制端口')} type="number" min={1} max={65535} value={oscDraft.ogbControlPort} disabled={!oscDraft.ogbControlEnabled}
                  onChange={(event) => updateOsc({ ogbControlPort: Number(event.target.value) })} />
              </div>
              <Badge tone={overview?.osc?.ogbControl?.active ? 'info' : 'default'}>
                {overview?.osc?.ogbControl?.active ? t('正在发送启用心跳') : t('启用心跳已停止')}
              </Badge>
              {overview?.osc?.ogbControl?.lastError && <Notice tone="error">{diagnostic(overview.osc.ogbControl.lastError)}</Notice>}
            </div>
          </details>
          <details>
            <summary>OSCQuery</summary>
            <div className="stack">
              <Toggle
                label={t('启用 OSCQuery')}
                checked={oscDraft.oscQueryEnabled}
                onChange={(oscQueryEnabled) => updateOsc({ oscQueryEnabled })}
              />
              <Field
                label={t('OSCQuery 地址')}
                value={oscDraft.oscQueryUrl}
                disabled={!oscDraft.oscQueryEnabled}
                onChange={(event) => updateOsc({ oscQueryUrl: event.target.value })}
              />
              <div className="form-grid form-grid--rate">
                <Toggle
                  label={t('轮询回退')}
                  checked={oscDraft.oscQueryPollingEnabled}
                  disabled={!oscDraft.oscQueryEnabled}
                  onChange={(oscQueryPollingEnabled) => updateOsc({ oscQueryPollingEnabled })}
                />
                <Field
                  label={t('轮询频率 (Hz)')}
                  type="number"
                  min={1}
                  max={30}
                  value={oscDraft.oscQueryPollingRateHz}
                  disabled={!oscDraft.oscQueryEnabled || !oscDraft.oscQueryPollingEnabled}
                  onChange={(event) => updateOsc({ oscQueryPollingRateHz: Number(event.target.value) })}
                />
              </div>
              <Toggle
                label={t('自动发现')}
                checked={oscDraft.oscQueryReceiverEnabled}
                onChange={(oscQueryReceiverEnabled) => updateOsc({ oscQueryReceiverEnabled })}
              />
              <div className="form-grid form-grid--endpoint">
                <Field
                  label={t('服务名称')}
                  value={oscDraft.oscQueryReceiverServiceName}
                  onChange={(event) => updateOsc({ oscQueryReceiverServiceName: event.target.value })}
                />
                <Field
                  label={t('服务 HTTP 端口')}
                  type="number"
                  min={1}
                  max={65535}
                  value={oscDraft.oscQueryReceiverHttpPort}
                  onChange={(event) => updateOsc({ oscQueryReceiverHttpPort: Number(event.target.value) })}
                />
              </div>
              {[oscQuery?.error, oscQuery?.polling?.error, overview?.osc?.queryReceiver?.error]
                .filter(Boolean)
                .map((error, index) => (
                  <Notice tone="warning" key={index}>
                    {diagnostic(error)}
                  </Notice>
                ))}
            </div>
          </details>
          <div className="stack osc-forwarding-settings">
            <details>
              <summary>OSC Hub</summary>
              <div className="stack">
                <Toggle
                  label={t('启用 OSC Hub')}
                  checked={oscDraft.hubEnabled}
                  onChange={(hubEnabled) => updateOsc({ hubEnabled })}
                />
                <div className="form-grid form-grid--rate">
                  <SelectField
                    label={t('转发模式')}
                    value={normalizeOscHubMode(oscDraft.hubMode)}
                    options={OSC_HUB_MODE_OPTIONS()}
                    onChange={(hubMode) => updateOsc({ hubMode })}
                  />
                  <Field
                    label={t('转发频率 (Hz)')}
                    type="number"
                    min={1}
                    max={240}
                    value={oscDraft.hubFixedRateHz}
                    disabled={normalizeOscHubMode(oscDraft.hubMode) !== 'FixedRate'}
                    onChange={(event) => updateOsc({ hubFixedRateHz: Number(event.target.value) })}
                  />
                </div>
                {oscHub?.blockedBySourceSelection && <Notice tone="warning">{t('多个来源时需固定使用来源。')}</Notice>}
                {oscHubTargetsDraft.map((target) => (
                  <OscHubTargetRow
                    key={target._draftId}
                    target={target}
                    runtimeTarget={oscHub?.targets?.find((item) => item.id === target.id)}
                    conflictMessages={oscHubConflicts.get(target._draftId) || []}
                    onChange={(patch) => updateOscHubTargetDraft(target._draftId, patch)}
                    onRemove={() => removeOscHubTargetDraft(target._draftId)}
                  />
                ))}
                <Button onClick={addOscHubTargetDraft}>{t('新增目标')}</Button>
                {oscHub?.lastDropReason && <Notice tone="warning">{diagnostic(oscHub.lastDropReason)}</Notice>}
              </div>
            </details>
            <div className="actions">
              <Button tone="primary" disabled={!online || Boolean(busyKey)} onClick={saveOscConfig}>
                {t('保存 OSC 设置')}
              </Button>
            </div>
          </div>
        </div>
      </details>
    );
  }

  if (loading)
    return (
      <main className="loading-shell">
        <h1>Sensa</h1>
        <p role="status">{t('正在连接…')}</p>
        <progress />
      </main>
    );

  return (
    <div className="app-shell">
      <a className="skip-link" href="#main">{t('跳到主要内容')}</a>
      <header className="app-header">
        <div className="app-header__inner">
          <h1 className="brand"><a href="#main">Sensa</a></h1>
          <nav className="workspace-nav">
            <Tabs
              id="workspace-tabs"
              label={t('主导航')}
              value={workspace}
              onChange={setWorkspace}
              options={[
                { value: 'control', label: t('控制') },
                { value: 'osc', label: 'OSC' },
                { value: 'pipeline', label: t('流程') },
                { value: 'settings', label: t('设置') },
              ]}
            />
          </nav>
          <div className="header-status">
            <Badge tone={online ? 'success' : 'warning'}>
              <span title={formatRealtimeStatus(wsState)}>
                {online ? t('在线') : wsState === 'connecting' ? t('连接中') : t('离线')}
              </span>
            </Badge>
            <span className="caption muted">{formatMode(actualInputMode)}</span>
          </div>
          <div className="header-actions">
            <Toggle
              role="switch"
              label={t('输入启用')}
              checked={inputActive}
              disabled={!online || runtimeOverview?.isEmergency || Boolean(busyKey)}
              onChange={setInputActive}
            />
            {emergencyAction}
            <select
              className="language-select"
              aria-label="Language / 语言"
              value={locale}
              onChange={(event) => setLocale(event.target.value)}
            >
              <option value="zh-CN">简体中文</option>
              <option value="en-US">English</option>
            </select>
            <Button variant="text" onClick={() => { clearErrorNotification(); setHelpOpen(true); }}>{t('帮助')}</Button>
          </div>
        </div>
      </header>
      <main key={workspace} id="main" className="workspace-scroll" tabIndex={-1}>
        <div className="workspace-shell workspace">
          <div
            id="workspace-tabs-panel"
            role="tabpanel"
            aria-labelledby={`workspace-tabs-${workspace}`}
            className={`workspace-panel workspace-panel--${workspace}`}
          >
            {!online && workspace !== 'control' && (
              <Notice tone="warning" role="status">
                {t('连接已断开，命令不会自动重发。')}
              </Notice>
            )}
            {workspace !== 'control' && runtimeOverview?.isEmergency && <Notice tone="error">{t('急停已锁定；解除后仍需重新启用输入。')}</Notice>}
            {workspace !== 'control' && !routingScope.onlyIndependentBindings && inputActive && runtimeOverview?.gateClosed && <Notice>{routingScope.mixed
              ? t('动作轴映射门控关闭；独立输出连接按各自来源和有效状态更新。') : t('门控关闭，输出已停止。')}</Notice>}
            {workspace !== 'control' && !routingScope.onlyIndependentBindings && runtimeOverview?.poseBlocked && runtimeOverview?.spatialInputBlockedReason && (
              <Notice>{routingScope.mixed && <>{t('动作轴映射等待定位')}： </>}{diagnostic(runtimeOverview.spatialInputBlockedReason)}
                {routingScope.mixed && <> {t('独立输出连接按各自来源和有效状态更新。')}</>}</Notice>
            )}
            {workspace !== 'control' && routingScope.mixed && runtimeOverview?.computedInputBlocked && <Notice>
              {t('动作轴映射等待计算输入')}：{diagnostic(runtimeOverview.computedInputBlockedReason) || t('计算正在等待完整、有效的输入。')}{' '}
              {t('独立输出连接按各自来源和有效状态更新。')}</Notice>}
            {workspace === 'control' && (
              <>
                <Section
                  title={t('输入')}
                  className="input-section"
                  actions={<Badge>{t('当前 {0}', [formatMode(actualInputMode)])}</Badge>}
                >
                  <ControlFlowStatus online={online} runtime={runtimeOverview || {}} mode={actualInputMode}
                    selectedMode={selectedInputTab} script={scriptState || {}} outputs={outputs}
                    outputStates={overview?.outputs || []} mappings={config?.signals || []}
                    mappingDirty={hasUnsavedMappings} listening={Boolean(overview?.osc?.listening)} onNavigate={navigateWorkflow} />
                  <div className="input-toolbar">
                    <Tabs
                      id="input-tabs"
                      label={t('输入方式')}
                      variant="segmented"
                      value={selectedInputTab}
                      onChange={selectInputTab}
                      options={INPUT_MODES()}
                    />
                    {hasPendingInputMode && <Button
                      tone="primary" disabled={modeBusy || !online}
                      onClick={() => applyInputMode(selectedInputTab)}>
                      {t('应用输入方式')}
                    </Button>}
                  </div>
                  {hasPendingInputMode && <p className="caption muted">{t('选择仅用于浏览，应用后才切换输入。')}</p>}
                  <div id="input-tabs-panel" className="input-panel" role="tabpanel" aria-labelledby={`input-tabs-${selectedInputTab}`}>
                    {selectedInputTab === 'manual' && (
                      <div className="stack manual-workspace">
                        <div className="manual-primary">
                          {MANUAL_AXES().slice(0, 3).map((axis) => (
                            <AxisSlider key={axis.key} axis={axis} value={manualDraft[axis.key]} onChange={(next) => handleManualSliderChange({ [axis.key]: next })} />
                          ))}
                        </div>
                        <div className="actions manual-actions">
                          <Button tone="primary" onClick={applyManualOnce} disabled={!online || actualInputMode !== 'manual' || busyKey === 'manual-once'}>{t('发送一次')}</Button>
                          <Toggle label={t('连续发送')} checked={manualContinuous} onChange={setManualContinuous} />
                          <Button onClick={disableManualInput} disabled={!online}>{t('停用手动')}</Button>
                        </div>
                        <div className="manual-options">
                          <details className="manual-settings">
                            <summary>{t('发送设置')}</summary>
                            <div className="form-grid">
                              <SelectField label={t('斜率方式')} value={manualMotionMode} options={MANUAL_MOTION_MODE_OPTIONS()} onChange={handleManualMotionModeChange} />
                              <ValueSliderField label={manualMotionField.label} value={manualMotionValue} min={manualMotionField.min} max={manualMotionField.max} valueFormatter={manualMotionField.format} unit={manualMotionField.unit} onChange={handleManualMotionValueChange} />
                            </div>
                          </details>
                          <details>
                            <summary>{t('旋转、震动与辅助轴')}</summary>
                            <div className="manual-grid">
                              {MANUAL_AXES().slice(3).map((axis) => (
                                <AxisSlider key={axis.key} axis={axis} value={manualDraft[axis.key]} onChange={(next) => handleManualSliderChange({ [axis.key]: next })} />
                              ))}
                            </div>
                          </details>
                        </div>
                      </div>
                    )}
                    {selectedInputTab === 'osc' && (
                      <div className="stack">
                        <div className="actions">
                          <Badge tone={overview?.osc?.listening ? 'success' : 'default'}>
                            {overview?.osc?.listening ? t('监听中') : t('未监听')}
                          </Badge>
                          <span className="muted">{t('{0} 条映射', [config?.signals?.length || 0])}</span>
                          <Button onClick={() => setWorkspace('osc')}>{t('编辑 OSC')}</Button>
                        </div>
                      </div>
                    )}
                    {selectedInputTab === 'script' && renderScriptPlayer()}
                    {selectedInputTab === 'combined' && <div className="stack" data-testid="combined-inputs">
                      <p>{t('同时使用 OSC、手动、脚本和设备反馈，在计算或输出连接中分别选择来源。')}</p>
                      <div className="actions"><Badge tone={overview?.osc?.listening ? 'success' : 'default'}>{overview?.osc?.listening ? t('OSC 监听中') : t('OSC 未监听')}</Badge>
                        <Button onClick={() => setWorkspace('pipeline')}>{t('编辑信号流程')}</Button></div>
                      <details><summary>{t('手动来源')}</summary><div className="stack">
                        <div className="manual-grid">{MANUAL_AXES().map(axis => <AxisSlider key={axis.key} axis={axis} value={manualDraft[axis.key]} onChange={next => handleManualSliderChange({ [axis.key]: next })} />)}</div>
                        <div className="actions"><Button onClick={applyManualOnce} disabled={!online || actualInputMode !== 'combined' || Boolean(busyKey)}>{t('更新手动来源')}</Button>
                          <Toggle label={t('连续更新')} checked={manualContinuous} onChange={setManualContinuous} disabled={!online || actualInputMode !== 'combined'} /></div>
                        <p className="caption muted">{t('滑条的 0–999 在信号流程中转换为 0–1。')}</p>
                      </div></details>
                      <details open={combinedScriptOpen} onToggle={event => setCombinedScriptOpen(event.currentTarget.open)}><summary>{t('脚本来源')}</summary>{renderScriptPlayer()}</details>
                    </div>}

                  </div>
                  {renderRecording()}
                </Section>
                {renderOutputs()}

              </>
            )}
            {workspace === 'osc' && (
              <Section
                title="OSC"
                actions={
                  <SelectField
                    label={t('使用来源')}
                    value={selectedOscSourceKey}
                    options={buildOscSourceSelectionOptions(oscSources)}
                    disabled={!online || busyKey === 'osc-source'}
                    onChange={applyOscSourceSelection}
                  />
                }
              >
                <Tabs
                  id="osc-tabs"
                  label={t('OSC 工作区')}
                  value={oscWorkspaceTab}
                  onChange={setOscWorkspaceTab}
                  options={[
                    { value: 'setup', label: t('映射') },
                    { value: 'parameters', label: t('参数') },
                    { value: 'experimental', label: t('实验诊断') },
                  ]}
                />
                <div
                  id="osc-tabs-panel"
                  role="tabpanel"
                  aria-labelledby={`osc-tabs-${oscWorkspaceTab}`}
                  className="stack osc-workspace"
                >
                  {oscWorkspaceTab === 'setup' && renderMappings()}
                  {oscWorkspaceTab === 'parameters' && renderParameters()}
                  {oscWorkspaceTab === 'experimental' && (
                    <>
                      <Notice>{t('局部估计 · 实验')}</Notice>
                      <Toggle
                        label={t('允许实验空间输入')}
                        checked={oscDraft.allowExperimentalSpatialInput}
                        onChange={(allowExperimentalSpatialInput) => updateOsc({ allowExperimentalSpatialInput })}
                      />
                      <p className="caption muted">{t('实验局部估计；全部通道需持续刷新。')}</p>
                      <p className="caption muted">{diagnostic(runtimeOverview?.spatialInputStatus || '')}</p>
                      <div className="actions">
                        <Badge>
                          {config?.osc?.allowExperimentalSpatialInput
                            ? t('实验空间输入已允许')
                            : t('实验空间输入未允许')}
                        </Badge>
                        <Button tone="primary" onClick={saveOscConfig} disabled={!online || Boolean(busyKey)}>
                          {t('保存实验设置')}
                        </Button>
                      </div>
                      <details>
                        <summary>{t('本地点与根部')}</summary>
                        <SpsRootPanel observations={overview?.poseTracking?.spsRoots || []} onUsePoint={usePointRig}
                          onInspectShaderParameters={root => { setOscPreviewSearch(`${root.prefix}/`); setPreviewSourceTab(root.sourceKey || 'all'); setPreviewCategory('all'); setOscWorkspaceTab('parameters'); }} />
                      </details>
                      <details>
                        <summary>{t('配对三点姿态')}</summary>
                        <PosePanel
                          observations={overview?.poseTracking?.observations || []}
                          activeKey={overview?.poseTracking?.activeKey}
                          onUseRig={usePoseRig}
                        />
                      </details>
                    </>
                  )}
                  {renderOscSettings()}
                </div>
              </Section>
            )}
            {workspace === 'pipeline' && <>
              <Section title={t('信号流程')} description={t('选择来源、处理数值，再连接到设备、应用或录制。')} actions={<Button onClick={() => { setWorkspace('control'); selectInputTab('combined'); }}>{t('设置组合输入')}</Button>}>
                <div className="signal-pipeline-steps" aria-label={t('输入、计算与输出')}>
                  <div><strong>{t('输入')}</strong><span>{t('OSC · 手动 · 脚本 · 设备反馈 · 回放')}</span></div>
                  <div><strong>{t('计算转换')}</strong><span>{t('{0} 个计算信号', [computedDrafts.length])}</span></div>
                  <div><strong>{t('输出')}</strong><span>{t('{0} 个目标', [outputs.length])}</span></div>
                </div>
                <div className="mapping-toolbar"><Badge tone={hasUnsavedMappings ? 'warning' : 'default'}>{hasUnsavedMappings ? t('未保存') : t('已保存')}</Badge>
                  <div className="actions"><Button disabled={!hasUnsavedMappings || Boolean(busyKey)} onClick={restoreSignalDrafts}>{t('恢复计算与映射')}</Button>
                    <Button tone="primary" disabled={!online || Boolean(busyKey) || hasIncompleteMappings} onClick={saveOscMappings}>{t('保存计算与映射')}</Button></div></div>
                <ComputedSignalsPanel drafts={computedDrafts} runtimeSignals={overview?.computedSignals || EMPTY_OSC_CATALOG}
                  observations={overview?.poseTracking?.spsRoots || EMPTY_OSC_CATALOG} selectedSourceKey={selectedOscSourceKey}
                  graphDirty={computedGraphDirty} pathOptions={oscPathSuggestions} onChange={setComputedDrafts}
                  onMap={signal => { setSignalDrafts(previous => [...previous, makeSignalDraft({ sourceMode: 'Computed', oscPath: signal.id })]); notify(t('已添加计算信号的轴映射，请调整目标轴与量程后保存。'), 'info'); setWorkspace('osc'); setOscWorkspaceTab('setup'); }} />
                <SignalPlanPanel config={config} onApply={applySignalPlan} disabled={!online || Boolean(busyKey)} emergencyAction={emergencyAction} />
              </Section>
              {renderOutputs()}
            </>}
            {workspace === 'settings' && (
              <>
                <Section
                  title={t('轴配置')}
                  actions={
                    <Button onClick={openNewProfileDialog} disabled={!online}>
                      {t('新增轴配置')}
                    </Button>
                  }
                >
                  <div className="profile-list">
                    {axisProfiles.map((profile) => (
                      <article key={profile.id} className="profile-row">
                        <div>
                          <h3>
                            {profile.name} {profile.isDefault && <Badge>{t('默认')}</Badge>}
                          </h3>
                          <p className="caption muted">
                            {buildAxisProfileAxisRows(profile)
                              .map((axis) => `${axis.axis}: ${axis.details.map((detail) => detail.label).join(' ')}`)
                              .join(' · ')}
                          </p>
                        </div>
                        <div className="actions">
                          <Button onClick={() => openProfileDialog(profile.id)}>{t('修改配置')}</Button>
                          {!profile.isDefault && (
                            <>
                              <Button onClick={() => setDefaultAxisProfile(profile.id)}>{t('设为默认')}</Button>
                              <Button tone="danger" onClick={() => removeAxisProfile(profile.id)}>
                                {t('移除')}
                              </Button>
                            </>
                          )}
                        </div>
                      </article>
                    ))}
                  </div>
                </Section>
                <Section title={t('日志')}>
                  <details open={logDetailsOpen} onToggle={(event) => setLogDetailsOpen(event.currentTarget.open)}>
                    <summary>{t('查看日志')}</summary>
                    {logDetailsOpen && <div className="stack">
                      <div className="form-grid">
                        <SelectField
                          label={t('级别')}
                          value={logFilterLevel}
                          options={[
                            { value: 'debug', label: t('全部') },
                            { value: 'info', label: t('信息以上') },
                            { value: 'warning', label: t('警告以上') },
                            { value: 'error', label: t('仅错误') },
                          ]}
                          onChange={setLogFilterLevel}
                        />
                        <SelectField
                          label={t('日志分类')}
                          value={logCategoryFilter}
                          options={[
                            { value: '', label: t('全部') },
                            ...logCategories.map((value) => ({ value, label: value })),
                          ]}
                          onChange={setLogCategoryFilter}
                        />
                        <SelectField
                          label={t('轴')}
                          value={logAxisFilter}
                          options={[
                            { value: '', label: t('全部') },
                            ...logAxes.map((value) => ({ value, label: value })),
                          ]}
                          onChange={setLogAxisFilter}
                        />
                        <SelectField
                          label={t('结果')}
                          value={logActionFilter}
                          options={[
                            { value: '', label: t('全部') },
                            ...logActions.map((value) => ({ value, label: formatAxisTraceAction(value).label })),
                          ]}
                          onChange={setLogActionFilter}
                        />
                        <Field
                          label={t('搜索日志')}
                          value={logSearchText}
                          onChange={(event) => setLogSearchText(event.target.value)}
                        />
                        <Toggle label={t('仅看轴调试')} checked={logOnlyAxis} onChange={setLogOnlyAxis} />
                      </div>
                      <div className="log-list" tabIndex={0} role="region" aria-label={t('日志')}>
                        {filteredLogs.length ? (
                          filteredLogs.map((log, index) => {
                            const timeStr = log.timestamp
                              ? new Date(log.timestamp).toLocaleTimeString(getLocale())
                              : '';
                            return log.axisTrace ? (
                              <AxisTraceLogEntry key={index} log={log} timeStr={timeStr} />
                            ) : (
                              <PlainLogEntry key={index} log={log} timeStr={timeStr} />
                            );
                          })
                        ) : (
                          <p className="muted">{t('暂时没有日志。')}</p>
                        )}
                      </div>
                    </div>}
                  </details>
                </Section>
              </>
            )}
          </div>
        </div>
      </main>
      <Modal
        emergencyAction={emergencyAction}
        open={Boolean(dialog)}
        error={modalError}
        title={t('输出设置')}
        onClose={() => setDialog(null)}
        actions={
          <>
            <Button onClick={() => setDialog(null)}>{t('取消')}</Button>
            <Button
              tone="primary"
              disabled={!online || Boolean(busyKey) || outputDialogConflicts.length > 0}
              onClick={saveOutputDialog}
            >
              {t('保存输出')}
            </Button>
          </>
        }
      >
        {dialog && (
          <div className="stack">
            {outputDialogConflictMessage && <Notice tone="warning">{outputDialogConflictMessage}</Notice>}
            <Field
              label={t('名称')}
              value={dialog.draft.name || ''}
              onChange={(event) => updateOutput({ name: event.target.value })}
            />
            {isTCodeOutputType(dialog.draft.type) && (
              <>
                <SelectField
                  label={t('轴配置')}
                  value={dialog.draft.motionProfileId || getDefaultAxisProfileId(config)}
                  options={axisProfiles.map((profile) => ({ value: profile.id, label: profile.name }))}
                  onChange={(motionProfileId) => updateOutput({ motionProfileId })}
                />
                <div className="form-grid">
                  <SelectField
                    label={t('输出斜率方式')}
                    value={normalizeOutputSlopeMode(dialog.draft.slopeMode)}
                    options={OUTPUT_SLOPE_MODE_OPTIONS()}
                    onChange={(slopeMode) => updateOutput({ slopeMode })}
                  />
                  <SelectField
                    label={t('速度单位基准')}
                    value={normalizeSpeedUnitBase(dialog.draft.speedUnitBase)}
                    options={SPEED_UNIT_BASE_OPTIONS()}
                    onChange={(speedUnitBase) => updateOutput({ speedUnitBase })}
                  />
                </div>
              </>
            )}
            {dialog.draft.type === 'TCodeSerial' && (
              <>
                <div className="actions">
                  <SelectField
                    label={t('串口')}
                    value={dialog.draft.comPort || ''}
                    options={
                      serialPorts.length
                        ? serialPorts.map((port) => ({
                            value: port.portName,
                            label: `${port.portName}${port.description && port.description !== port.portName ? ' · ' + port.description : ''}`,
                            disabled:
                              getOutputTargetConflicts(config, dialog.outputId, {
                                ...dialog.draft,
                                comPort: port.portName,
                              }).length > 0,
                          }))
                        : [{ value: '', label: t('未检测到串口') }]
                    }
                    onChange={(comPort) => updateOutput({ comPort })}
                  />
                  <Button onClick={() => void refreshSerialPorts().catch((error) => notify(error.message, 'error'))}>
                    {t('刷新串口')}
                  </Button>
                </div>
                <TCodeDeviceInfoCard
                  deviceInfo={outputDialogOverview?.tcodeDeviceInfo}
                  connected={Boolean(outputDialogOverview?.connected)}
                  onRefresh={() => refreshTCodeDeviceInfo(dialog.outputId)}
                  busy={busyKey === `tcode-device-refresh-${dialog.outputId}`}
                />
              </>
            )}
            {['TCodeUdp', 'TCodeTcp'].includes(dialog.draft.type) && (
              <div className="form-grid form-grid--endpoint">
                <Field
                  label={t('目标地址')}
                  value={dialog.draft.host || ''}
                  onChange={(event) => updateOutput({ host: event.target.value })}
                />
                <Field
                  label={t('目标端口')}
                  type="number"
                  min={1}
                  max={65535}
                  value={dialog.draft.port ?? ''}
                  onChange={(event) => updateOutput({ port: Number(event.target.value) })}
                />
              </div>
            )}
            {dialog.draft.type === 'Intiface' && (
              <>
                <Field
                  label={t('WebSocket 地址')}
                  value={dialog.draft.websocketAddress || ''}
                  onChange={(event) => updateOutput({ websocketAddress: event.target.value })}
                />
                <SelectField
                  label={t('连接方式')}
                  value={dialog.draft.manageEngineProcess ? 'managed' : 'central'}
                  options={[{ value: 'central', label: t('连接现有 Intiface Central') }, { value: 'managed', label: t('由 Sensa 启动引擎') }]}
                  onChange={(value) => updateOutput({ manageEngineProcess: value === 'managed' })}
                />
                {dialog.draft.manageEngineProcess && <Field
                  label={t('引擎端口')} type="number" min={1} max={65535}
                  value={dialog.draft.port ?? 12345} onChange={(event) => updateOutput({ port: Number(event.target.value) })}
                />}
                <p className="caption muted">{dialog.draft.manageEngineProcess
                  ? t('Sensa 不附带引擎；自管需另行安装。')
                  : t('先在 Intiface Central 启动服务并扫描设备。')}</p>
                <SelectField label={t('振动来源')} value={dialog.draft.vibrationAxis || 'V0'}
                  options={[{ value: 'V0', label: t('V0 · 主振动') }, { value: 'V1', label: t('V1 · 振动 2') },
                    { value: 'V2', label: t('V2 · 振动 3') }, { value: 'L0', label: t('L0 · 深度转振动') }]}
                  onChange={(vibrationAxis) => updateOutput({ vibrationAxis })}
                />
              </>
            )}
            {isSignalOutputType(dialog.draft.type) ? <OutputBindings output={dialog.draft} signals={config?.computedSignals || []} pathOptions={oscPathSuggestions}
              status={outputDialogOverview?.signalStatus} onChange={updateOutput} midiPorts={midiPorts} onRefreshMidi={() => refreshMidiPorts().catch(error => notify(error.message, 'error'))} busy={!online || Boolean(busyKey)} />
              : <details><summary>{t('独立信号连接')}</summary><OutputBindings output={dialog.draft} signals={config?.computedSignals || []} pathOptions={oscPathSuggestions}
                status={outputDialogOverview?.signalStatus} onChange={updateOutput} /></details>}

          </div>
        )}
      </Modal>
      <Modal
        emergencyAction={emergencyAction}
        open={Boolean(profileDialog)}
        error={modalError}
        title={t('轴配置')}
        wide
        onClose={() => setProfileDialog(null)}
        actions={
          <>
            <Button onClick={() => setProfileDialog(null)}>{t('取消')}</Button>
            <Button
              tone="primary"
              disabled={!online || Boolean(busyKey)}
              onClick={saveProfileDialog}
            >
              {t('保存轴配置')}
            </Button>
          </>
        }
      >
        {profileDialog && (
          <div className="stack">
            <Field
              label={t('配置名称')}
              value={profileDialog.name || ''}
              onChange={(event) => setProfileDialog((previous) => ({ ...previous, name: event.target.value }))}
            />
            <details>
              <summary>{t('应用轴预设')}</summary>
              <div className="actions">
                <SelectField
                  label={t('轴配置预设')}
                  value={profileDialog.presetId || ''}
                  options={[
                    { value: '', label: t('不使用预设') },
                    ...AXIS_PROFILE_PRESETS().map((preset) => ({ value: preset.id, label: preset.name })),
                  ]}
                  onChange={(presetId) => setProfileDialog((previous) => ({ ...previous, presetId }))}
                />
                <Button
                  disabled={!profileDialog.presetId}
                  onClick={() => applyAxisProfilePresetToDialog(profileDialog.presetId)}
                >
                  {t('应用预设')}
                </Button>
              </div>
            </details>
            {AXIS_PROFILE_DEFS().map((axis) => (
              <MotionAxisEditor
                key={axis.key}
                axisDefinition={axis}
                value={profileDialog.profile[axis.key]}
                onChange={(patch) => updateProfileAxis(axis.key, patch)}
              />
            ))}
          </div>
        )}
      </Modal>
      <Modal
        emergencyAction={emergencyAction}
        open={Boolean(presetDialog)}
        error={modalError}
        title={t('编辑预设')}
        wide
        onClose={() => setPresetDialog(null)}
        actions={
          <>
            <Button onClick={() => setPresetDialog(null)}>{t('取消')}</Button>
            <Button tone="primary" disabled={!online || Boolean(busyKey)} onClick={savePresetDialog}>
              {t('保存预设')}
            </Button>
          </>
        }
      >
        {presetDialog && (
          <div className="stack">
            <Field
              label={t('预设名称')}
              value={presetDialog.name || ''}
              onChange={(event) => setPresetDialog((previous) => ({ ...previous, name: event.target.value }))}
            />
            <Field
              label={t('说明')}
              multiline
              rows={2}
              value={presetDialog.description || ''}
              onChange={(event) => setPresetDialog((previous) => ({ ...previous, description: event.target.value }))}
            />
            {presetDialog.mappings.map((draft) => (
              <SignalMappingRow
                key={draft._draftId}
                draft={draft}
                latestEntry={latestForDraft(draft)}
                pathOptions={oscPathSuggestions}
                allowComputed={false}
                onChange={(patch) => updatePresetDialogSignal(draft._draftId, patch)}
                onRemove={() => removePresetDialogSignal(draft._draftId)}
              />
            ))}
            <Button onClick={() => addPresetDialogSignal()}>{t('新增预设映射')}</Button>
          </div>
        )}
      </Modal>
      <Modal
        emergencyAction={emergencyAction}
        open={confirmClearMappings}
        error={modalError}
        title={t('清空映射')}
        onClose={() => setConfirmClearMappings(false)}
        actions={
          <>
            <Button onClick={() => setConfirmClearMappings(false)}>{t('取消')}</Button>
            <Button tone="danger-solid" onClick={clearSignalDrafts}>
              {t('确认清空')}
            </Button>
          </>
        }
      >
        <p>{t('清空当前草稿；保存前可恢复。')}</p>
      </Modal>
      <Modal
        emergencyAction={emergencyAction}
        open={Boolean(parameterDetail)}
        error={modalError}
        title={t('参数含义')}
        onClose={() => setParameterDetail(null)}
        actions={
          <>
            <Button onClick={() => setParameterDetail(null)}>{t('关闭')}</Button>
            <Button
              onClick={() => {
                const tab = mapPreviewParameter(visibleParameterDetail.entry);
                setParameterDetail(null);
                setOscWorkspaceTab(tab || 'setup');
              }}
            >
              {t('添加映射草稿')}
            </Button>
          </>
        }
      >
        <p className="mono wrap">{parameterDetail?.path}</p>
        {parameterDetail && <OscParameterReference path={parameterDetail.path} />}
        <p><a href={docUrl('docs/parameter-geometry.html')} target="_blank" rel="noreferrer">{t('交互参数图解')}</a></p>
        <p className="muted">
          {visibleParameterDetail?.entry.sourceLabel || t('未知来源')} · <span data-testid="parameter-detail-value">{visibleParameterDetail?.entry.value ?? '—'}</span>
        </p>
        {visibleParameterDetail && <>
          <p className="caption muted" data-testid="parameter-detail-status">{formatOscParameterDetailStatus(visibleParameterDetail.mode)}</p>
          <p className="caption muted" data-testid="parameter-detail-time">{t('接收时间：{0}', [formatPreviewTimestamp(visibleParameterDetail.entry.timestampMs)])}</p>
        </>}
      </Modal>
      <Modal open={recordingRestartOpen} title={t('重新录制')} emergencyAction={emergencyAction} error={modalError}
        onClose={() => setRecordingRestartOpen(false)}
        actions={<><Button onClick={() => setRecordingRestartOpen(false)}>{t('取消')}</Button>
          <Button tone="primary" disabled={!online || recordingBusy} onClick={() => { setRecordingRestartOpen(false); void recordingAction('start'); }}>{t('重新录制')}</Button></>}>
        <p>{t('将清空当前录制的 {0} 帧。可先取消并导出。', [overview?.recording?.frameCount || 0])}</p>
      </Modal>
      <HelpDialog open={helpOpen} onClose={() => setHelpOpen(false)} onNavigate={navigateWorkflow} emergencyAction={emergencyAction} error={modalError} />
      {snackbar.open && (
        <div className={`toast toast--${snackbar.severity}`} role={snackbar.severity === 'error' ? 'alert' : 'status'}>
          <span>{diagnostic(snackbar.message)}</span>
          <Button variant="text" aria-label={t('关闭通知')} onClick={() => setSnackbar((previous) => ({ ...previous, open: false }))}>
            ×
          </Button>
        </div>
      )}
    </div>
  );
}

ReactDOM.createRoot(document.getElementById('app-root')).render(<App />);
