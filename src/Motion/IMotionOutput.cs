namespace Sensa.Motion;

/// <summary>Motion targets and stop requests; adapters never imply hardware position feedback.</summary>
public interface IMotionOutput
{
    Task SendAsync(MotionFrame frame);
    Task EmergencyStopAsync();
}
