using Buttplug.Client;
using Buttplug.Core.Messages;
using Sensa.Motion;

namespace Sensa.Outputs.Intiface;

/// <summary>A mapping to an advertised Buttplug output capability, independently of its transport.</summary>
public sealed class IntifaceFeatureRoute
{
    public string DeviceName { get; set; } = "";
    public uint? FeatureIndex { get; set; }
    public string OutputType { get; set; } = "Rotate";
    public string SourceAxis { get; set; } = "V0";
    public string DirectionAxis { get; set; } = "";
    public bool Clockwise { get; set; } = true;
    public bool Invert { get; set; }

    public static readonly string[] SupportedTypes = ["Vibrate", "Oscillate", "Rotate", "Position", "HwPositionWithDuration", "Led", "Temperature", "Constrict", "Spray"];

    public static List<IntifaceFeatureRoute> CloneAndValidate(IEnumerable<IntifaceFeatureRoute>? source)
    {
        var routes = new List<IntifaceFeatureRoute>();
        foreach (var item in source ?? [])
        {
            if (item is null || routes.Count >= 32) throw new ArgumentException("At most 32 Intiface feature mappings are supported.");
            if (!SupportedTypes.Contains(item.OutputType)) throw new ArgumentException("Choose an advertised Intiface output type.");
            if (!Enum.TryParse<MotionAxis>(item.SourceAxis, out var axis) || !Enum.IsDefined(axis)) throw new ArgumentException("Choose an Intiface source axis.");
            var direction = item.DirectionAxis?.Trim() ?? "";
            if (direction.Length > 0 && (item.OutputType != "Rotate" || !Enum.TryParse<MotionAxis>(direction, out var directionAxis) || !Enum.IsDefined(directionAxis)))
                throw new ArgumentException("A rotation direction can use a supported source axis; other output types do not use a direction axis.");
            var name = item.DeviceName?.Trim() ?? "";
            if (name.Length > 256 || name.Any(char.IsControl)) throw new ArgumentException("Intiface device name is invalid.");
            var next = new IntifaceFeatureRoute { DeviceName = name, FeatureIndex = item.FeatureIndex, OutputType = item.OutputType,
                SourceAxis = item.SourceAxis, DirectionAxis = direction, Clockwise = item.Clockwise, Invert = item.Invert };
            if (routes.Any(previous => SameCapability(previous.OutputType, next.OutputType)
                && (previous.DeviceName.Length == 0 || next.DeviceName.Length == 0 || previous.DeviceName == next.DeviceName)
                && (!previous.FeatureIndex.HasValue || !next.FeatureIndex.HasValue || previous.FeatureIndex == next.FeatureIndex)))
                throw new ArgumentException("Intiface feature mappings overlap. Select a distinct device, feature or output capability.");
            routes.Add(next);
        }
        return routes;
    }

    internal static bool SameCapability(string first, string second) => first == second
        || first is "Position" or "HwPositionWithDuration" && second is "Position" or "HwPositionWithDuration";

    internal bool Matches(string deviceName, uint featureIndex) => (DeviceName.Length == 0 || DeviceName == deviceName)
        && (!FeatureIndex.HasValue || FeatureIndex == featureIndex);

    internal bool UsesActiveAxes(MotionFrame frame) => frame.ActiveAxes is null
        || frame.ActiveAxes.Contains(Enum.Parse<MotionAxis>(SourceAxis))
        || DirectionAxis.Length > 0 && frame.ActiveAxes.Contains(Enum.Parse<MotionAxis>(DirectionAxis));

    internal DeviceOutputCommand CreateCommand(DeviceFeature feature, MotionFrame frame)
    {
        var type = Enum.Parse<OutputType>(OutputType);
        var definition = feature.GetOutput(type);
        if (definition?.Value is not [var minimum, var maximum] || minimum > maximum)
            throw new ArgumentException("The selected Intiface feature has no valid advertised value range.");
        var source = MotionAxisHelper.Get(frame, Enum.Parse<MotionAxis>(SourceAxis));
        if (!float.IsFinite(source)) throw new ArgumentException("Intiface source values must be finite.");
        var normalized = Math.Clamp((double)source, 0, 1);
        if (Invert) normalized = 1 - normalized;
        int value;
        if (type == Buttplug.Core.Messages.OutputType.Rotate)
        {
            if (minimum > 0 || maximum < 0) throw new ArgumentException("Rotation requires an advertised range containing zero.");
            var clockwise = Clockwise;
            if (DirectionAxis.Length > 0)
            {
                var direction = MotionAxisHelper.Get(frame, Enum.Parse<MotionAxis>(DirectionAxis));
                if (!float.IsFinite(direction)) throw new ArgumentException("Rotation direction must be finite.");
                clockwise = direction >= .5f;
            }
            if (!clockwise && minimum == 0 && normalized > 0) throw new ArgumentException("This Intiface feature does not advertise reverse rotation.");
            value = (int)Math.Round(normalized * (clockwise ? maximum : minimum), MidpointRounding.AwayFromZero);
        }
        else value = checked((int)Math.Round(minimum + normalized * ((double)maximum - minimum), MidpointRounding.AwayFromZero));
        uint? duration = null;
        if (type == Buttplug.Core.Messages.OutputType.HwPositionWithDuration)
        {
            if (!double.IsFinite(frame.DeltaMs) || frame.DeltaMs is < 0 or > uint.MaxValue)
                throw new ArgumentException("Position duration must be a finite unsigned millisecond value.");
            var requested = (uint)Math.Round(frame.DeltaMs, MidpointRounding.AwayFromZero);
            if (definition.Duration is not [var minimumDuration, var maximumDuration] || minimumDuration < 0 || maximumDuration < minimumDuration
                || requested < minimumDuration || requested > maximumDuration)
                throw new ArgumentException("Position duration is outside the Intiface feature's advertised range.");
            duration = requested;
        }
        return new(type, PercentOrSteps.FromSteps(value), duration);
    }
}
