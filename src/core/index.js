// Shared signal engine for browser and desktop hosts. Hosts provide clocks,
// timers and output transports; UI and device APIs remain in their adapters.
export { SensaEngine, OutputLane } from './engine.js';
export { AXES, normalized, parseFunscript, scriptValue, tcodeFrame } from './funscript.js';
