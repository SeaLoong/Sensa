/**
 * Observes RFC6455 frame boundaries on a public Duplex data event. Payload bytes
 * remain owned and validated by ws. Remembering when the first frame arrived
 * prevents a pre-stop fragmented message being accepted in a later generation.
 */
export class WebSocketMessageEpochs {
  #header: number[] = [];
  #headerBytes = 2;
  #frameRemaining = -1;
  #frameOpcode = 0;
  #frameFinal = false;
  #frameEpoch = 0;
  #messageEpoch: number | null = null;
  #messageBytes = 0;
  #epochs: number[] = [];
  #broken = false;
  readonly current: () => number;
  readonly maximum: number;
  constructor(current: () => number, maximum = 65536) { this.current = current; this.maximum = maximum; }
  take(): number | undefined { return this.#epochs.shift(); }
  push(bytes: Uint8Array): boolean {
    if (this.#broken) return false;
    let at = 0;
    while (at < bytes.length) {
      if (this.#frameRemaining >= 0) {
        const consumed = Math.min(this.#frameRemaining, bytes.length - at); at += consumed; this.#frameRemaining -= consumed;
        if (this.#frameRemaining === 0) this.#finish();
        continue;
      }
      if (!this.#header.length) this.#frameEpoch = this.current();
      const byte = bytes[at++]; if (byte === undefined) break; this.#header.push(byte);
      if (this.#header.length === 2) {
        const length = (this.#header[1] ?? 0) & 127;
        this.#headerBytes = 2 + (length === 126 ? 2 : length === 127 ? 8 : 0) + (((this.#header[1] ?? 0) & 128) !== 0 ? 4 : 0);
      }
      if (this.#header.length !== this.#headerBytes) continue;
      const first = this.#header[0] ?? 0, second = this.#header[1] ?? 0;
      this.#frameOpcode = first & 15; this.#frameFinal = (first & 128) !== 0;
      let length = second & 127;
      if (length === 126) length = ((this.#header[2] ?? 0) << 8) | (this.#header[3] ?? 0);
      if (length === 127) {
        length = 0; for (let index = 2; index < 10; index++) length = length * 256 + (this.#header[index] ?? 0);
      }
      if (!Number.isSafeInteger(length) || length > this.maximum) return this.#break();
      if (this.#frameOpcode === 1 || this.#frameOpcode === 2) { this.#messageEpoch = this.#frameEpoch; this.#messageBytes = 0; }
      if (this.#frameOpcode <= 2) {
        this.#messageBytes += length;
        if (this.#messageBytes > this.maximum || this.#epochs.length >= 1024) return this.#break();
      }
      this.#frameRemaining = length;
      if (length === 0) this.#finish();
    }
    return true;
  }
  #finish(): void {
    if (this.#frameFinal && this.#frameOpcode <= 2) { this.#epochs.push(this.#messageEpoch ?? this.#frameEpoch); this.#messageEpoch = null; this.#messageBytes = 0; }
    this.#header = []; this.#headerBytes = 2; this.#frameRemaining = -1;
  }
  #break(): false { this.#broken = true; this.#header = []; this.#epochs = []; return false; }
}
