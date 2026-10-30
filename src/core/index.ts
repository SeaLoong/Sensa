// One host-ticked runtime and output coordinator serve browsers, Node and Electron.
export * from './runtime/index.ts';
export { ApplicationFacade } from './runtime/application.ts';
export type { ApplicationServices, ApplicationOutputPort, RuntimeApplicationPort, CommandResult } from './runtime/application.ts';
export { buildOverview } from './runtime/presentation.ts';
export type { PresentationServices } from './runtime/presentation.ts';
export { OutputCoordinator } from './outputs/coordinator.ts';
export type { OutputCoordinatorOptions, AdapterContext } from './outputs/coordinator.ts';
export { OutputLane } from './outputs/lifecycle.ts';
export type { OutputAdapter, OutputStatus, SignalOutputValue, ResolveInput } from './outputs/types.ts';
export { AXES, isAxis, normalized, parseFunscript, scriptValue, tcodeFrame } from './funscript.ts';
export type { FunscriptParseOptions } from './funscript.ts';
export type {
  Axis, AxisValues, SignalValues, Awaitable, SignalFrame, FunscriptAction,
  Script, ParsedScript, OutputTransport, NamedOutputTransport, OutputDetails,
} from './types.ts';
