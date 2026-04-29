using System.Text.Json;
using System.Text.Json.Nodes;
using Sensa.Core;

namespace Sensa.ServiceRecording;

// ═══════════════════════════════════════════════════════════════════════
//  RecordingBuffer — ring-buffer of timestamped L0 samples
// ═══════════════════════════════════════════════════════════════════════

/// <summary>
/// Records (timestamp, L0) pairs from the main loop.  Only stores frames while
/// IsActive == true.  Thread-safe for Push() called from the loop thread and
/// FrameCount / Stop() called from the UI thread via the action queue.
/// </summary>
public sealed class RecordingBuffer
{
    private readonly List<(long Ms, float L0)> _frames = new();
    private long _startMs = 0;

    private volatile bool _active = false;

    public bool IsActive   => _active;
    public int  FrameCount { get { lock (_frames) return _frames.Count; } }

    public void Start()
    {
        lock (_frames) _frames.Clear();
        _startMs = Environment.TickCount64;
        _active  = true;
    }

    public void Stop() => _active = false;

    /// <summary>Called by the main loop every tick.  No-op if not recording.</summary>
    public void Push(DeviceCommand cmd)
    {
        if (!_active) return;
        long relMs = Environment.TickCount64 - _startMs;
        lock (_frames) _frames.Add((relMs, cmd.L0));
    }

    /// <summary>Returns a snapshot of all recorded frames (copy).</summary>
    public List<(long Ms, float L0)> TakeSnapshot()
    {
        lock (_frames) return new List<(long, float)>(_frames);
    }
}

// ═══════════════════════════════════════════════════════════════════════
//  FunscriptExporter — converts a RecordingBuffer into a .funscript file
// ═══════════════════════════════════════════════════════════════════════

/// <summary>
/// .funscript format (Handy/MultiFunPlayer spec):
/// { "version": "1.0", "inverted": false, "range": 100,
///   "actions": [ { "at": 215, "pos": 87 }, ... ] }
///
/// "at" = milliseconds from start
/// "pos" = 0–100 (0=bottom, 100=top)
/// </summary>
public static class FunscriptExporter
{
    /// <summary>
    /// Export the buffer to %USERPROFILE%\Documents\Sensa\recordings\.
    /// Applies Ramer-Douglas-Peucker decimation (ε=0.02) to remove redundant frames.
    /// </summary>
    public static string Export(RecordingBuffer buffer)
    {
        var frames = buffer.TakeSnapshot();
        if (frames.Count == 0) return "";

        // Decimate
        var simplified = RdpSimplify(frames, epsilon: 0.02f);

        // Build JSON using System.Text.Json.Nodes to avoid manual string escaping.
        var actionsArray = new JsonArray();
        foreach (var f in simplified)
            actionsArray.Add(new JsonObject
            {
                ["at"]  = f.Ms,
                ["pos"] = (int)Math.Round(f.L0 * 100),
            });

        var root = new JsonObject
        {
            ["version"]  = "1.0",
            ["inverted"] = false,
            ["range"]    = 100,
            ["actions"]  = actionsArray,
        };
        string json = root.ToJsonString(new JsonSerializerOptions { WriteIndented = true });

        var dir = Path.Combine(
            Environment.GetFolderPath(Environment.SpecialFolder.MyDocuments),
            "Sensa", "recordings");
        Directory.CreateDirectory(dir);

        string fileName = $"recording_{DateTime.Now:yyyyMMdd_HHmmss}.funscript";
        string path = Path.Combine(dir, fileName);
        File.WriteAllText(path, json);

        Console.WriteLine($"[Recording] Exported: {path}");
        return path;
    }

    // ── Ramer-Douglas-Peucker simplification (iterative — avoids stack overflow on long recordings) ──

    private static List<(long Ms, float L0)> RdpSimplify(
        List<(long Ms, float L0)> points, float epsilon)
    {
        if (points.Count <= 2) return points;

        // SortedSet<int> keeps the indices in ascending order for free.
        var keepSet = new SortedSet<int> { 0, points.Count - 1 };
        var stack   = new Stack<(int start, int end)>();
        stack.Push((0, points.Count - 1));

        while (stack.Count > 0)
        {
            var (start, end) = stack.Pop();
            var first = points[start];
            var last  = points[end];

            double maxDist = 0;
            int    maxIdx  = -1;

            for (int i = start + 1; i < end; i++)
            {
                double d = PerpendicularDistance(points[i], first, last);
                if (d > maxDist) { maxDist = d; maxIdx = i; }
            }

            if (maxDist > epsilon && maxIdx >= 0)
            {
                keepSet.Add(maxIdx);
                stack.Push((start, maxIdx));
                stack.Push((maxIdx, end));
            }
        }

        return keepSet.Select(i => points[i]).ToList();
    }

    private static double PerpendicularDistance(
        (long Ms, float L0) p,
        (long Ms, float L0) lineStart,
        (long Ms, float L0) lineEnd)
    {
        // Normalise time axis so ms and [0,1] float are somewhat comparable
        double x0 = lineStart.Ms / 1000.0, y0 = lineStart.L0;
        double x1 = lineEnd.Ms   / 1000.0, y1 = lineEnd.L0;
        double px = p.Ms         / 1000.0, py = p.L0;

        double dx = x1 - x0, dy = y1 - y0;
        double len2 = dx * dx + dy * dy;
        if (len2 < 1e-10) return Math.Sqrt((px - x0) * (px - x0) + (py - y0) * (py - y0));

        double t = Math.Clamp(((px - x0) * dx + (py - y0) * dy) / len2, 0, 1);
        double projX = x0 + t * dx, projY = y0 + t * dy;
        return Math.Sqrt((px - projX) * (px - projX) + (py - projY) * (py - projY));
    }
}
