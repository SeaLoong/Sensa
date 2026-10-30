import type { AppConfig } from './model.ts';
import { record, type RuntimeApplicationPort, type JsonRecord, type ApplicationOutputPort } from './application.ts';

export interface PresentationServices {
  outputs: ApplicationOutputPort;
  oscSnapshot?: () => JsonRecord;
  protocolSnapshot?: () => unknown[];
  connectionCount?: () => number;
  capabilities?: () => unknown;
}
function primary(config: AppConfig, type: string): string { return config.outputs.find(item => item.type === type)?.id ?? ''; }
function entries(value: unknown): unknown[] { return Array.isArray(value) ? value : []; }
/** Preserve the established WebUI overview while adapters add their real telemetry. */
export function buildOverview(runtime: RuntimeApplicationPort, services: PresentationServices): JsonRecord {
  const config = runtime.getConfig(), state = record(runtime.getSnapshot());
  const script = runtime.getScriptSnapshot();
  const osc = services.oscSnapshot?.() ?? {};
  const preview = entries(osc['preview']), sources = entries(osc['sources']);
  const defaultQuery = { enabled: config.osc.oscQueryEnabled, url: config.osc.oscQueryUrl, name: '', oscIp: '', oscPort: 0,
    oscTransport: '', supportsListen: false, wsIp: '', wsPort: 0, webSocketUrl: '', listenConnected: false,
    listeningPathCount: 0, streamSourceLabel: '', streamSourcePersistentId: '', refreshedAtUtc: null, error: null,
    polling: { enabled: config.osc.oscQueryPolling.enabled, running: false, rateHz: config.osc.oscQueryPolling.rateHz,
      startedAtUtc: null, lastPolledAtUtc: null, lastAppliedValueCount: 0, error: null }, nodes: [] };
  const defaultReceiver = { enabled: config.osc.oscQueryReceiver.enabled, running: false,
    serviceName: config.osc.oscQueryReceiver.serviceName, httpPort: config.osc.oscQueryReceiver.httpPort, httpUrl: '',
    oscPort: config.osc.receiverPort, startedAtUtc: null, advertisedPaths: 0, receivedSinceStarted: false,
    lastReceivedAtUtc: null, lastAvatarParameterAtUtc: null, lastRawPacketAtUtc: null, lastSourceKey: '',
    lastSourceLabel: '', lastSourcePersistentId: '', lastSourceAddress: '', lastSourcePort: 0, receivedEventCount: 0, error: null };
  const hub = { enabled: config.osc.hub.enabled, mode: config.osc.hub.mode, fixedRateHz: config.osc.hub.fixedRateHz,
    forwardAvatarChange: config.osc.hub.forwardAvatarChange, targetCount: config.osc.hub.targets.length,
    activeTargetCount: 0, pendingPacketCount: 0, pendingAvatarChange: false, forwardedPacketCount: 0, droppedPacketCount: 0,
    lastForwardedAtUtc: null, lastDroppedAtUtc: null, lastDropReason: '', blockedBySourceSelection: false,
    effectiveSourceKey: '', effectiveSourceLabel: '', effectiveSourceParameterCount: 0, canForward: false, targets: [] };
  const outputs = services.outputs.snapshot();
  const computed = runtime.getComputedSignals();
  const computedMap = computed instanceof Map ? computed : new Map(Object.entries(record(computed ?? {})));
  const computedSignals = config.computedSignals.map(signal => ({ id: signal.id, name: signal.name, operation: signal.operation,
    value: null, valid: false, reason: 'Waiting for saved calculation definitions / 等待已保存的计算定义', sourceKey: null,
    timestampMs: 0, coordinateFrame: null, ...(computedMap.get(signal.id) as JsonRecord | undefined) }));
  const runtimeState = { isEmergency: false, gateClosed: false, poseBlocked: false, computedInputBlocked: false,
    computedInputBlockedReason: '', spatialInputBlockedReason: '', spatialInputStatus: '', spatialSampleMaxAgeMs: 500,
    manualOverrideEnabled: false, inputActive: false, inputMode: 'Manual', command: '', manualCommand: '', ...state };
  return { webUiConnections: services.connectionCount?.() ?? 0, protocolInputs: services.protocolSnapshot?.() ?? [], capabilities: services.capabilities?.(),
    runtime: runtimeState, loop: runtimeState, input: { mode: String(runtimeState.inputMode).toLowerCase(), script },
    osc: { enabled: config.osc.enabled, receiverHost: config.osc.receiverHost, receiverPort: config.osc.receiverPort,
      listening: false, listenerError: null, ogbControl: { enabled: config.osc.ogbControl.enabled, host: config.osc.ogbControl.host, port: config.osc.ogbControl.port, running: false },
      preview, sources, selectedSourceKey: '', preferredSourcePersistentId: config.osc.preferredSourcePersistentId,
      query: defaultQuery, queryReceiver: defaultReceiver, trackingPreview: [], rawPreview: [], hub, ...osc },
    tcode: { connected: services.outputs.isConnected(primary(config, 'TCodeSerial')), config: config.tCode },
    udpTCode: { connected: services.outputs.isConnected(primary(config, 'TCodeUdp')), config: config.udpTCode },
    tcpTCode: { connected: services.outputs.isConnected(primary(config, 'TCodeTcp')), config: config.tcpTCode },
    intiface: { connected: services.outputs.isConnected(primary(config, 'Intiface')), config: config.intiface,
      devices: services.outputs.devices(primary(config, 'Intiface')) }, outputs,
    poseTracking: state['poseTracking'] ?? { observations: [], activeKey: '', spsRoots: [] }, recording: runtime.getRecordingSnapshot(), computedSignals,
    signals: config.signals.map((signal, index) => ({ index, signal, latest: preview.find(value => record(value)['path'] === signal.oscPath) ?? null })) };
}
