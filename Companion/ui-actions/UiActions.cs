using System.Collections.Concurrent;

namespace Sensa.UiActions;

/// <summary>
/// Thread-safe action queue: the ImGui UI thread enqueues lambdas, the main
/// Routine loop drains and executes them on the next tick.
/// This avoids cross-thread mutation of shared state.
/// </summary>
public sealed class UiActionQueue
{
    private readonly ConcurrentQueue<Action> _queue = new();

    /// <summary>Enqueue an action from any thread (typically the UI thread).</summary>
    public void Enqueue(Action action) => _queue.Enqueue(action);

    /// <summary>Dequeue one action. Returns false when the queue is empty.
    /// Called by the main loop on the loop thread.</summary>
    public bool TryDequeue(out Action action) => _queue.TryDequeue(out action!);
}

// ═══════════════════════════════════════════════════════════════════════
//  UiNotification — events pushed from the loop → UI (thread-safe)
// ═══════════════════════════════════════════════════════════════════════

/// <summary>
/// Lightweight one-way channel from the main Routine loop to the UI layer.
/// UI calls TryPoll() each frame to consume pending notifications.
/// </summary>
public sealed class UiNotificationQueue<T>
{
    private readonly ConcurrentQueue<T> _queue = new();

    public void Push(T item) => _queue.Enqueue(item);
    public bool TryPoll(out T item) => _queue.TryDequeue(out item!);
    public IEnumerable<T> DrainAll()
    {
        while (_queue.TryDequeue(out var item))
            yield return item;
    }
}

/// <summary>Snapshot of the current loop state for display in the UI panel.</summary>
public sealed class LoopStateSnapshot
{
    public float L0         { get; set; }
    public float Vibrate    { get; set; }
    public bool  GateOpen   { get; set; }
    public float Bpm        { get; set; }
    public bool  Emergency  { get; set; }
    public bool  IntifaceOk { get; set; }
    public bool  TCodeOk    { get; set; }
    public long  TickMs     { get; set; }
}
