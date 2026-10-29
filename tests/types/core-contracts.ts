import { parseFunscript, type FunscriptAction, type OutputDetails, type OutputTransport, type SensaEngine, type SignalFrame } from '../../src/core/index.ts';

// These compile-only calls lock down public boundaries for all three hosts.
// An unused expect-error makes typecheck fail if a future change erases a contract.
export function coreTypeContracts(engine: SensaEngine, output: OutputTransport): void {
  engine.setManual('L0', .5);
  void engine.setAxes(['L0', 'V0']);
  void engine.setMode('manual');
  const frame: SignalFrame = { values: { L0: .5 }, durationMs: 40, timeMs: 100 };
  void output.send(frame);
  // @ts-expect-error Only canonical supported motion axes enter the shared engine.
  engine.setManual('Q0', .5);
  // @ts-expect-error UI strings must be converted before invoking numeric controls.
  engine.setManual('L0', '0.5');
  // @ts-expect-error A transport name cannot silently become a new input mode.
  void engine.setMode('udp');
  // @ts-expect-error Routed signal frames cannot carry an undeclared motion axis.
  void output.send({ values: { Q0: .5 }, durationMs: 0, timeMs: 1 });
  // @ts-expect-error Output duration is numeric even when settings came from a form.
  void output.send({ values: { L0: .5 }, durationMs: '40', timeMs: 1 });
  const script = parseFunscript({ actions: [{ at: 0, pos: 80 }, { at: 1000, pos: 20 }] });
  // @ts-expect-error A parsed shared script remains immutable across UI and engine consumers.
  script.actions.push({ at: 2000, pos: 30 });
  // @ts-expect-error Indexed reads stay optional until the caller checks that an action exists.
  const unchecked: FunscriptAction = script.actions[50];
  void unchecked;
  // @ts-expect-error Exact optional properties distinguish an omitted axis from an undefined value.
  const details: OutputDetails = { axis: undefined };
  void details;
  // @ts-expect-error An output cannot mutate a frame already queued for another destination.
  frame.values.L0 = .1;
  // @ts-expect-error Newer standard-library APIs need a tested compatibility adapter before use.
  void Promise.withResolvers<number>();
}
