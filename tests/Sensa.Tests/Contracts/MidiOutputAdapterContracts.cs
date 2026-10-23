using Sensa.Outputs.Adapters;
using Xunit;

namespace Sensa.Tests.Contracts;

public sealed class MidiOutputAdapterContracts
{
    [Theory]
    [InlineData("CC/1/0", 0, "B00000")]
    [InlineData("CC/16/127", 127, "BF7F7F")]
    [InlineData("cc/2/7", 64.5, "B10741")]
    public void Cc_addresses_encode_channel_controller_and_seven_bit_values(string address, double value, string message)
    {
        Assert.Equal(message, Convert.ToHexString(MidiCcOutputCodec.Encode(new(address, value, SignalOutputValueType.Int)).Data.Span));
    }

    [Fact]
    public void Cc_only_output_rejects_other_messages_invalid_channels_and_out_of_range_values()
    {
        foreach (var address in new[] { "CC/0/7", "CC/17/7", "CC/1/128", "CC/1/-1", "CC/1", "Note/1/60", "CC/+1/7", "/CC/1/7" })
            Assert.Throws<ArgumentException>(() => MidiCcOutputCodec.Encode(new(address, 64)));
        foreach (var value in new[] { -1d, 128d, double.NaN, double.PositiveInfinity })
            Assert.Throws<ArgumentException>(() => MidiCcOutputCodec.Encode(new("CC/1/7", value)));
        Assert.Throws<ArgumentException>(() => MidiCcOutputCodec.Encode(new("CC/1/7", 1, SignalOutputValueType.Bool)));
    }

    [Fact]
    public async Task Port_access_is_explicit_and_stop_preserves_connection_without_inventing_controller_messages()
    {
        var driver = new Driver();
        var transport = new MidiOutputTransport("mock:1", driver);
        await using var adapter = new EncodedSignalOutputAdapter(transport, MidiCcOutputCodec.Encode);
        Assert.Equal(0, driver.OpenCount); Assert.Equal(0, driver.ListCount);
        await Assert.ThrowsAsync<InvalidOperationException>(() => adapter.SendAsync(new("CC/1/7", 100)).AsTask());
        Assert.Equal(0, driver.OpenCount);
        await adapter.ConnectAsync(); Assert.True(adapter.IsConnected);
        await adapter.SendAsync(new("CC/2/7", 100, SignalOutputValueType.Int));
        await adapter.StopAsync();
        Assert.Equal([(2, 7, 100)], driver.Connection.Messages);
        Assert.True(adapter.IsConnected); Assert.False(driver.Connection.Disposed);
        await adapter.DisposeAsync();
        Assert.False(adapter.IsConnected); Assert.True(driver.Connection.Disposed);
    }

    [Fact]
    public async Task Ambiguous_friendly_names_require_an_explicit_port_id()
    {
        var driver = new Driver { Ports = [new("mock:1", "Same"), new("mock:2", "Same")] };
        await using var ambiguous = new MidiOutputTransport("Same", driver);
        await Assert.ThrowsAsync<InvalidOperationException>(() => ambiguous.ConnectAsync());
        Assert.Equal(0, driver.OpenCount);
        await using var exact = new MidiOutputTransport("mock:2", driver);
        await exact.ConnectAsync(); Assert.Equal("mock:2", driver.Opened);
    }

    [Fact]
    public async Task Cancelled_native_open_is_retired_if_it_finishes_after_the_connection_deadline()
    {
        var driver = new Driver { BlockOpen = true };
        await using var transport = new MidiOutputTransport("mock:1", driver);
        using var cancellation = new CancellationTokenSource();
        var connecting = transport.ConnectAsync(cancellation.Token);
        await driver.OpenEntered.Task.WaitAsync(TimeSpan.FromSeconds(2));
        try
        {
            cancellation.Cancel();
            await Assert.ThrowsAnyAsync<OperationCanceledException>(() => connecting);
            Assert.False(transport.IsConnected);
        }
        finally { driver.ReleaseOpen.TrySetResult(); }
        await driver.Connection.Closed.Task.WaitAsync(TimeSpan.FromSeconds(2));
        Assert.False(transport.IsConnected); Assert.Empty(driver.Connection.Messages);
    }

    [Fact]
    public void Empty_port_configuration_is_rejected_before_native_access()
    {
        Assert.Throws<ArgumentException>(() => new MidiOutputTransport("", new Driver()));
    }

    private sealed class Driver : IMidiOutputDriver
    {
        public IReadOnlyList<MidiOutputPort> Ports = [new("mock:1", "Mock MIDI")];
        public int OpenCount, ListCount;
        public string? Opened;
        public bool BlockOpen;
        public readonly Connection Connection = new();
        public readonly TaskCompletionSource OpenEntered = new(TaskCreationOptions.RunContinuationsAsynchronously);
        public readonly TaskCompletionSource ReleaseOpen = new(TaskCreationOptions.RunContinuationsAsynchronously);
        public IReadOnlyList<MidiOutputPort> ListPorts() { ListCount++; return Ports; }
        public IMidiOutputConnection Open(string portId)
        {
            OpenCount++; Opened = portId; OpenEntered.TrySetResult();
            if (BlockOpen) ReleaseOpen.Task.GetAwaiter().GetResult();
            return Connection;
        }
    }

    private sealed class Connection : IMidiOutputConnection
    {
        public bool Disposed;
        public List<(int, int, int)> Messages = [];
        public readonly TaskCompletionSource Closed = new(TaskCreationOptions.RunContinuationsAsynchronously);
        public void SendControlChange(byte channel, byte controller, byte value)
        {
            ObjectDisposedException.ThrowIf(Disposed, this);
            Messages.Add((channel, controller, value));
        }
        public void Dispose() { Disposed = true; Closed.TrySetResult(); }
    }
}
