import { parseFunscript, neutralValues, type FunscriptAction, type OutputDetails, type OutputTransport,
  type RuntimeEngine, type RuntimeInputMode, type RuntimeMotionFrame, type SignalFrame } from '../../src/core/index.ts';

// Compile-only boundaries for the one shared runtime used by all three hosts.
// An unused expect-error fails typecheck if a future edit erases a contract.
export function coreTypeContracts(engine: RuntimeEngine, output: OutputTransport): void {
  engine.setManual({ L0: .5, V2: .4, A2: .7 });
  engine.setInputMode('Manual');
  const motion: RuntimeMotionFrame = { values: neutralValues(), deltaMs: 40, activeAxes: ['L0', 'A2'] };
  engine.setManual(motion);
  const frame: SignalFrame = { values: { L0: .5, V1: .2, A2: .8 }, durationMs: 40, timeMs: 100 };
  void output.send(frame);
  // @ts-expect-error Only canonical supported motion axes enter the shared runtime.
  engine.setManual({ Q0: .5 });
  // @ts-expect-error UI strings must be converted before invoking numeric controls.
  engine.setManual({ L0: '0.5' });
  // @ts-expect-error Transport names do not silently become runtime input modes.
  const mode: RuntimeInputMode = 'udp';
  void mode;
  // @ts-expect-error Selected axes obey the same twelve-axis domain as frame values.
  engine.setManual({ values: neutralValues(), deltaMs: 10, activeAxes: ['V3'] });
  // @ts-expect-error Script routing cannot acquire a thirteenth axis.
  engine.configureScript({ axis: 'A3' });
  // @ts-expect-error Routed signal frames cannot carry an undeclared motion axis.
  void output.send({ values: { Q0: .5 }, durationMs: 0, timeMs: 1 });
  // @ts-expect-error Output duration is numeric even when settings came from a form.
  void output.send({ values: { L0: .5 }, durationMs: '40', timeMs: 1 });
  const script = parseFunscript({ actions: [{ at: 0, pos: 80 }, { at: 1000, pos: 20 }] });
  // @ts-expect-error Parsed scripts remain immutable across UI and runtime consumers.
  script.actions.push({ at: 2000, pos: 30 });
  // @ts-expect-error Indexed reads stay optional until an action is known to exist.
  const unchecked: FunscriptAction = script.actions[50];
  void unchecked;
  // @ts-expect-error Exact optional properties distinguish absence from undefined.
  const details: OutputDetails = { axis: undefined };
  void details;
  // @ts-expect-error A transport cannot mutate a frame queued for another destination.
  frame.values.L0 = .1;
  // @ts-expect-error Newer standard-library APIs need a tested compatibility adapter.
  void Promise.withResolvers<number>();
}
