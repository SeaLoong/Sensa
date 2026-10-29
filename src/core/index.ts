// The shared engine depends only on host-provided clocks and output transports.
export { SensaEngine, OutputLane } from './engine.ts';
export { AXES, isAxis, normalized, parseFunscript, scriptValue, tcodeFrame } from './funscript.ts';
export type {
  Axis, AxisValues, SignalValues, InputMode, Awaitable, SignalFrame, FunscriptAction,
  Script, ParsedScript, OutputTransport, NamedOutputTransport, OutputDetails,
  OutputSummary, EngineError, EngineClock, Clock, EngineSnapshot,
} from './types.ts';
