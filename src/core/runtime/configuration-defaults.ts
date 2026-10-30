/** Defaults mirror the desktop configuration contract; no host APIs are used. */

import type * as Model from './model.ts';

export function defaultTCodeConfig(): Model.TCodeConfig {
  return {
    comPort: "COM3",
    maxPos: 999,
    minPos: 0,
    maxVelocity: 999,
    l0Invert: false,
    preferSpeedMode: true,
    enabled: false
  };
}

export function defaultTCodeAxisConfig(): Model.TCodeAxisConfig {
  return {
    min: 0,
    max: 999,
    remapMin: 0,
    remapMax: 999,
    maxSpeed: 999,
    invert: false,
    mode: "Normal",
    commandMode: "Interval",
    rampType: "None",
    lockValue: 0.5
  };
}

export function defaultTCodeMotionProfile(): Model.TCodeMotionProfile {
  return {
    useGlobal: false,
    l0: defaultTCodeAxisConfig(),
    l1: defaultTCodeAxisConfig(),
    l2: defaultTCodeAxisConfig(),
    r0: defaultTCodeAxisConfig(),
    r1: defaultTCodeAxisConfig(),
    r2: defaultTCodeAxisConfig(),
    v0: defaultTCodeAxisConfig(),
    v1: defaultTCodeAxisConfig(),
    v2: defaultTCodeAxisConfig(),
    a0: defaultTCodeAxisConfig(),
    a1: defaultTCodeAxisConfig(),
    a2: defaultTCodeAxisConfig()
  };
}

export function defaultTCodeProfilesConfig(): Model.TCodeProfilesConfig {
  return {
    global: defaultTCodeMotionProfile(),
    serial: { ...defaultTCodeMotionProfile(), useGlobal: true },
    udp: { ...defaultTCodeMotionProfile(), useGlobal: true },
    tcp: { ...defaultTCodeMotionProfile(), useGlobal: true }
  };
}

export function defaultAxisProfileConfig(): Model.AxisProfileConfig {
  return {
    id: "global-default",
    name: "全局默认",
    isDefault: false,
    motion: defaultTCodeMotionProfile()
  };
}

export function defaultOscMappingPresetConfig(): Model.OscMappingPresetConfig {
  return {
    id: "",
    name: "",
    description: "",
    mappings: []
  };
}

export function defaultOutputDeviceConfig(): Model.OutputDeviceConfig {
  return {
    device: defaultDeviceProtocolOptions(),
    intifaceDeviceName: '',
    intifaceDeviceIndex: null,
    intifaceFeatures: [],
    signal: defaultSignalOutputOptions(),
    id: "",
    name: "",
    type: "TCodeSerial",
    enabled: false,
    motionProfileId: "global-default",
    comPort: "COM3",
    host: "127.0.0.1",
    port: 0,
    preferSpeedMode: true,
    speedUnitBase: "Per100ms",
    slopeMode: "None",
    manageEngineProcess: false,
    websocketAddress: "ws://localhost:12345",
    vibrationAxis: "V0"
  };
}

export function defaultUdpTCodeConfig(): Model.UdpTCodeConfig {
  return {
    enabled: false,
    host: "127.0.0.1",
    port: 9999
  };
}

export function defaultTcpTCodeConfig(): Model.TcpTCodeConfig {
  return {
    enabled: false,
    host: "127.0.0.1",
    port: 9998
  };
}

export function defaultIntifaceConfig(): Model.IntifaceConfig {
  return {
    featureRoutes: [],
    enabled: true,
    manageEngineProcess: false,
    websocketAddress: "ws://localhost:12345",
    port: 12345,
    vibrationAxis: "V0"
  };
}

export function defaultOscHubTargetConfig(): Model.OscHubTargetConfig {
  return {
    id: "",
    name: "",
    enabled: true,
    host: "127.0.0.1",
    port: 9002
  };
}

export function defaultOscHubConfig(): Model.OscHubConfig {
  return {
    enabled: false,
    mode: "EventDriven",
    fixedRateHz: 10,
    forwardAvatarChange: false,
    targets: []
  };
}

export function defaultOscQueryReceiverAdvertiseConfig(): Model.OscQueryReceiverAdvertiseConfig {
  return {
    enabled: false,
    serviceName: "Sensa",
    httpPort: 9010,
    advertiseAvatar: true,
    advertiseTracking: true
  };
}

export function defaultOscQueryPollingConfig(): Model.OscQueryPollingConfig {
  return {
    enabled: false,
    rateHz: 10
  };
}

export function defaultOgbControlConfig(): Model.OgbControlConfig {
  return {
    enabled: false,
    host: "127.0.0.1",
    port: 9000
  };
}

export function defaultOscReceiverConfig(): Model.OscReceiverConfig {
  return {
    enabled: true,
    receiverHost: "127.0.0.1",
    receiverPort: 9001,
    inputTimeoutMs: 0,
    ogbControl: defaultOgbControlConfig(),
    allowExperimentalSpatialInput: false,
    allowedSourceAddresses: [],
    oscQueryEnabled: true,
    oscQueryUrl: "http://127.0.0.1:9001/",
    oscQueryPolling: defaultOscQueryPollingConfig(),
    oscQueryReceiver: defaultOscQueryReceiverAdvertiseConfig(),
    preferredSourcePersistentId: "",
    hub: defaultOscHubConfig()
  };
}

export function defaultWebUiConfig(): Model.WebUiConfig {
  return {
    host: "127.0.0.1",
    port: 5086,
    title: "Sensa WebUI"
  };
}

export function defaultDeviceRouteEntry(): Model.DeviceRouteEntry {
  return {
    deviceName: "",
    sendL0: true,
    sendV0: true,
    enabled: true
  };
}

export function defaultAppConfig(): Model.AppConfig {
  return {
    schemaVersion: 5,
    osc: defaultOscReceiverConfig(),
    webUi: defaultWebUiConfig(),
    intiface: defaultIntifaceConfig(),
    tCode: defaultTCodeConfig(),
    tCodeProfiles: defaultTCodeProfilesConfig(),
    axisProfiles: [],
    outputs: [],
    udpTCode: defaultUdpTCodeConfig(),
    tcpTCode: defaultTcpTCodeConfig(),
    signals: [],
    computedSignals: [],
    protocolInputs: [],
    oscMappingPresets: [],
    deviceRoutes: []
  };
}

export function defaultComputedSignalConfig(): Model.ComputedSignalConfig {
  return {
    id: "",
    name: "",
    operation: "WeightedAverage",
    inputs: [],
    maxAgeMs: 0,
    timeMs: 250,
    threshold: .5,
    releaseThreshold: .4,
    frequencyHz: 1,
    amplitude: 1,
    offset: 0
  };
}

export function defaultComputedSignalInputConfig(): Model.ComputedSignalInputConfig {
  return {
    sourceMode: "Direct",
    oscPath: "",
    pointMetric: "Z",
    poseMetric: "Depth",
    weight: 1,
    value: 0
  };
}

export function defaultSignalMapping(): Model.SignalMapping {
  return {
    sourceMode: "Direct",
    poseMetric: "Depth",
    pointMetric: "Z",
    oscPath: "",
    invertDirection: false,
    vrchatMin: 0,
    vrchatMax: 1,
    curve: "Linear",
    role: "Depth",
    mappedMin: null,
    mappedMax: null,
    isOgbSocket: false,
    isOgbPlug: false
  };
}

export function defaultSignalOutputOptions(): Model.SignalOutputOptions {
  return {
    bindings: [],
    vrChat: false,
    serverUrl: "",
    clientId: "",
    slotId: "",
    channel: 0,
    maxIntensity: 0,
    taskDurationMs: 250,
    waveformFrames: [],
    recordingFormat: "Funscript",
    recordingName: "",
    midiPortName: "",
    mqttTopicPrefix: "",
    mqttClientId: "",
    mqttUseTls: false
  };
}

export function defaultSignalOutputBinding(): Model.SignalOutputBinding {
  return {
    id: "",
    name: "",
    source: { ...defaultComputedSignalInputConfig(), sourceMode: "Manual", oscPath: "L0" },
    address: "",
    valueType: "Float",
    channel: null,
    inputMin: 0,
    inputMax: 1,
    outputMin: 0,
    outputMax: 1,
    stopValue: 0,
    rateHz: 20,
    epsilon: .001,
    sendMode: "OnChange",
    curve: "Linear"
  };
}

export function defaultDeviceProtocolOptions(): Model.DeviceProtocolOptions {
  return {
    endpoint: "",
    connectionKey: "",
    deviceId: "",
    axis: "L0",
    apiVersion: 2,
    apiKey: "",
    authToken: "",
    function: "Vibrate",
    speed: 50,
    offsetMs: 0,
    trustedClusterHost: "",
    scriptUrl: "",
    scriptFormat: "Csv",
    scriptTimeoutMs: 90000,
    requestTimeoutMs: 3000,
    minIntervalMs: 100
  };
}

export function defaultIntifaceFeatureRoute(): Model.IntifaceFeatureRoute {
  return {
    deviceName: "",
    featureIndex: null,
    outputType: "Rotate",
    sourceAxis: "V0",
    directionAxis: "",
    clockwise: true,
    invert: false
  };
}
