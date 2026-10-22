# Computed signals: combine inputs before mapping

[简体中文](computed-signals.md) | **English**

A computed signal combines several parameters or tracking metrics into a reusable number. You can blend two touch intensities at a 1:3 ratio, calculate the gap between two roots, or multiply a reading by a constant. Map the result to an axis, then calibrate its range and curve. [Workbench guide](guide.en.md) · [Positioning and coordinate units](positioning.en.md)

## From inputs to motion

```text
OSC parameters ─────────────┐
Solved position / velocity ─┼→ Computed signal → Input range, inversion, curve → Axis → Output
Constant / computed signal ─┘
```

SPS four-anchor tracking first reconstructs a root position from P0–P3 and Sample. A tracking input reads the validated X, Y, Z or distance result. Contact direct tracking also provides velocity metrics. Each P0–P3 reading describes proximity; the dedicated geometry solver derives coordinates. Select the solved metrics when combining positions.

Each computed signal has a stable identifier and a readable name. Other computations and axis mappings refer to its identifier, allowing several axes to reuse the result. Computation retains the raw numeric result; each mapping then converts it to its own motion range.

## Create a computation in the workbench

1. Open **OSC → Mappings** and choose Add computed signal in the Computed signals area.
2. Enter a readable name of up to 80 characters, choose an operation, then configure its inputs. The workbench assigns a stable identifier such as `Signal1`, which other computations use to refer to this result.
3. Choose OSC parameter, Tracked position and velocity, Three-point pose metric, Computed signal or Constant value as the input type. A tracking input selects both the actual instance path and a metric. Prefer a path that uniquely identifies its target.
4. Select Computed signal as an axis mapping's source, choose the new computation, then set its destination, input range, curve and output interval.
5. Save computations and mappings together. Live results come from the backend's saved configuration; drafts keep their unsaved state. Check the result, source and axis preview before enabling the current input.

Saving configuration disables input. Computations containing tracking metrics retain experimental spatial-input permission and the selected route's validity conditions. A constant-only computation also needs an axis mapping and enabled input to participate in motion.

## Weighted average: choose each input's influence

For inputs A=0.2 and B=0.8, with weights 1 and 3:

```text
result = (0.2 × 1 + 0.8 × 3) ÷ (1 + 3) = 0.65
```

B has 75% of the influence and A has 25%. Weights may be any finite nonnegative numbers with a positive total. Multiplying every weight by the same number preserves the result. A zero-weight input does not participate and needs no sample.

When both inputs express the same kind of intensity from 0 to 1, the result can keep a 0–1 input range. Use constants and operations to bring different ranges into a comparable meaning before combining them. A mapping's range applies to the final computed result.

## Supported operations

| Operation | Configuration value | Calculation and use |
| --- | --- | --- |
| Weighted average | `WeightedAverage` | `Σ(value×weight) ÷ Σweight`; blend inputs in chosen proportions |
| Average | `Average` | Arithmetic mean, giving every input equal influence |
| Sum | `Sum` | Add all inputs; add a constant for an offset |
| Difference | `Difference` | First input minus second; exactly two inputs |
| Product | `Product` | Multiply all inputs; use a constant for scaling |
| Ratio | `Ratio` | First input divided by second; exactly two inputs, invalid with a zero denominator |
| Minimum | `Minimum` | Smallest input; useful for the degree jointly reached by all inputs |
| Maximum | `Maximum` | Largest input; use the strongest current reading |
| Magnitude | `Magnitude` | `√Σ(value²)`; combine coordinate components or velocity components with matching units |

Each computation accepts 1–16 inputs; Difference and Ratio require exactly two. Only Weighted average uses weights. Computations run in dependency order and each result is evaluated once per evaluation. A configuration holds at most 64 computations with at most 16 reference levels. Saving checks duplicate identifiers, missing references and cycles. Update dependent computations and mappings before deleting a referenced definition.

## Combine root coordinates

The existing single-point `Distance` metric measures distance from that point's coordinate origin. To calculate the distance between points A and B, create:

| Example identifier | Operation | Inputs |
| --- | --- | --- |
| `delta_x` | Difference | A's X, B's X |
| `delta_y` | Difference | A's Y, B's Y |
| `delta_z` | Difference | A's Z, B's Z |
| `point_gap` | Magnitude | `delta_x`, `delta_y`, `delta_z` |

Both points need the same OSC source, reference object, axis directions and units. SPS four-anchor tracking and Shader use **AvatarRootLocal**, expressed in authored Avatar-root local units. Contact direct tracking uses **AvatarRootMeters**, retaining physical metres. Select a shared coordinate frame before calculating a gap; see [positioning](positioning.en.md) for scaling. Independent Point/Handle/Pose keep their ReferenceLocal frame separate by instance, and computations retain that reference restriction.

Numeric operations need meaningful units. Combining three velocity components from one coordinate frame into a speed is useful. The system distinguishes position, velocity and proximity rate; keep position and velocity in their own computations and calibration ranges. After a product or ratio, choose the result's range and unit according to the actual calculation.

Three-point pose angles participate as their reported numeric values; Roll, for example, uses the raw −180° to 180° angle. Crossing the ±180° boundary causes a numeric jump, so choose a mapping range within a continuous interval. Average uses the ordinary arithmetic mean.

## Validity and sample age

Every required input must uniquely match one parameter or tracking object. Use source fixes the OSC source to read. When several parameters or sources match, the UI reports the waiting or invalidity reason. Complete the path and source selection, then check again.

A computation retains the oldest contributing sample time, including through references to other computations. Input validity (ms) defaults to **0**, following OSC receiver settings without an additional computation-specific age limit. Ordinary OSC receive timeout defaults off, allowing parameters that publish only when their value changes to remain useful while stationary.

To require periodic updates from every input, set computation validity to **100–60000 ms**. At 1000, any contributing sample older than one second invalidates the result; another input's updates do not renew it. Constant-only results remain valid at the current evaluation. Tracking inputs always retain their own Sample/Frame, geometry and age checks.

Missing or expired inputs, invalid tracking, division by zero and nonfinite results invalidate the computation and its dependents. Motion outputs stop when an active computation becomes invalid, while input remains enabled. New valid samples can automatically resume linkage. Disable input or use emergency stop to keep motion stopped; explicitly enable input again after saving configuration or clearing emergency stop.

When several mappings target the same role, existing fusion selects by normalized priority. For a proportional blend, first create a weighted average and map its result to that role. [Features](features.en.md) · [Parameter dictionary](osc-parameters.en.md)

Ordinary SensaPoint/SensaPose mappings have priority on their destination axes; other direct mappings, computed mappings and DepthOverride retain that priority relationship. To combine or weight tracking results first, map the computed signal to the axis and replace its original single-point/pose mapping.

## Configuration example

These are the relevant configuration fields. Replace `TouchA` and `TouchB` with actual parameter names and retain the configuration's other settings. In a hand-written configuration, identifiers start with an English letter and may contain letters, digits, underscores and hyphens, up to 48 characters.

```json
{
  "computedSignals": [
    {
      "id": "touch_mix",
      "name": "Two-zone touch",
      "operation": "WeightedAverage",
      "maxAgeMs": 0,
      "inputs": [
        { "sourceMode": "Direct", "oscPath": "TouchA", "weight": 1 },
        { "sourceMode": "Direct", "oscPath": "TouchB", "weight": 3 }
      ]
    }
  ],
  "signals": [
    {
      "sourceMode": "Computed",
      "oscPath": "touch_mix",
      "role": "V0",
      "vrchatMin": 0,
      "vrchatMax": 1,
      "curve": "Linear"
    }
  ]
}
```

Computed signals live in Sensa's configuration while the Avatar continues publishing its existing OSC parameters. Their identifiers are internal Sensa references. Custom presets store OSC parameter and tracking mappings; save computations and their axis mappings together on the mappings page, retaining them in the full configuration. [Presets](presets.en.md)
