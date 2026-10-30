import type { MidiFactory, MidiPortHandle } from '../../core/outputs/types.ts';
import { nodeMidiFactory } from './transports.ts';

interface Entry { opening: Promise<MidiPortHandle>; owners: Set<symbol>; mappings: Map<string, symbol> }
function address(bytes: readonly number[]): string {
  if (bytes.some(value => !Number.isInteger(value) || value < 0 || value > 255) || bytes.length !== 3 || bytes[0] === undefined || bytes[1] === undefined || bytes[2] === undefined || bytes[0] < 0xb0 || bytes[0] > 0xbf || bytes[1] < 0 || bytes[1] > 127 || bytes[2] < 0 || bytes[2] > 127) throw new TypeError('MIDI output requires one control-change message.');
  return `${bytes[0] & 15}:${bytes[1]}`;
}
/** One OS port handle, with separate channel/controller ownership per output. */
export class SharedMidiFactory implements MidiFactory {
  #entries = new Map<string, Entry>();
  readonly factory: MidiFactory;
  constructor(factory: MidiFactory = nodeMidiFactory) { this.factory = factory; }
  list(): Promise<readonly string[]> { return this.factory.list(); }
  async open(name: string): Promise<MidiPortHandle> {
    const ports = await this.factory.list(), numeric = /^[0-9]+$/u.test(name) ? Number(name) : -1;
    const matches = numeric >= 0 && numeric < ports.length ? [numeric] : ports.flatMap((value, index) => value === name ? [index] : []);
    const index = matches[0]; if (matches.length !== 1 || index === undefined) throw new Error('Choose a unique MIDI port ID.');
    const key = `${index}\0${ports[index] ?? ''}`, owner = Symbol('MIDI owner');
    let entry = this.#entries.get(key);
    if (!entry) { entry = { opening: this.factory.open(String(index)), owners: new Set(), mappings: new Map() }; this.#entries.set(key, entry); }
    entry.owners.add(owner);
    let handle: MidiPortHandle;
    try { handle = await entry.opening; }
    catch (error) { entry.owners.delete(owner); if (!entry.owners.size) this.#entries.delete(key); throw error; }
    let closed = false; const selected = entry;
    const claim = (messages: readonly Uint8Array[]): void => {
      if (closed) throw new Error('MIDI output is closed.');
      const keys = messages.map(bytes => address([...bytes]));
      for (const mapping of keys) { const previous = selected.mappings.get(mapping); if (previous && previous !== owner) throw new Error('This MIDI port/channel/controller is already owned by another output.'); }
      for (const mapping of keys) selected.mappings.set(mapping, owner);
    };
    return {
      claim,
      async send(bytes) { claim([Uint8Array.from(bytes)]); await handle.send(bytes); },
      close: async () => {
        if (closed) return; closed = true;
        for (const [mapping, value] of selected.mappings) if (value === owner) selected.mappings.delete(mapping);
        selected.owners.delete(owner); if (!selected.owners.size) { this.#entries.delete(key); await handle.close(); }
      },
    };
  }
}
