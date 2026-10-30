# Domain parity reference

`domain-parity.json` records results from the desktop C# domain implementation at
[`941febb7`](https://github.com/SeaLoong/Sensa/tree/941febb7b760cab37000d3bf54e7ccf756201b22).
The normal TypeScript test run reads this file directly; it does not install,
compile, launch or depend on .NET.

The reference exporter called pure domain classes in an isolated unit harness.
It did not start Sensa, an HTTP listener, a device, a real timer or a Unity client.
The original `ManualTimeProvider` advanced script time. The PE CodeView GUID and
stamp matched the portable PDB identity; each of the 24 domain documents in that
PDB matched both the compiled source bytes and the Git bytes at the stated commit.
Assembly, PDB, exporter and individual source digests are included in the fixture.
The deterministic generation seed is `7302026`.

The data contains:

- 232 calculation timelines with 12 independently recorded steps each, including
  source/frame changes, invalidity, age limits, arithmetic, geometry and temporal
  processing;
- 784 calibration, inversion, curve, role and mapped-range cases;
- 150 multi-input role-fusion cases;
- four script import, seek, loop-window and fractional-clock timelines;
- six complete normalized configuration objects, checked by the old configuration
  validators before recording.

The TypeScript tests compare validity, values, timestamps, frames and provenance.
Finite values allow a small tolerance for C# float32 versus JavaScript number
arithmetic. Script state, action density and existing configuration fields are
compared directly. The two new Intiface device-scope fields have explicit default
assertions and separate ownership tests; they did not exist in the C# schema.

For an independent reference review, build the historical commit using its pinned
SDK and apply each stored definition, sample, script operation and configuration
to its corresponding C# class. Recompute the source/PDB pairing before replacing
expected values. Keep the reference provenance when adding cases; do not generate
expected outputs from the TypeScript implementation being tested.
