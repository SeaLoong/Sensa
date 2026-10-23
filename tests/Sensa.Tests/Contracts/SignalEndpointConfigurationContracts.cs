using Sensa.Configuration;
using Sensa.Outputs;
using Xunit;

namespace Sensa.Tests.Contracts;

public sealed class SignalEndpointConfigurationContracts
{
    [Theory]
    [InlineData(OutputDeviceType.HttpJson, "http://output.invalid/value")]
    [InlineData(OutputDeviceType.HttpJson, "https://output.invalid/value?channel=one")]
    [InlineData(OutputDeviceType.WebSocketJson, "ws://output.invalid/value")]
    [InlineData(OutputDeviceType.WebSocketJson, "wss://output.invalid/value")]
    public void Endpoint_validation_accepts_protocol_urls_without_opening_them(OutputDeviceType type, string address)
    {
        var output = Output(type);
        output.WebsocketAddress = address;
        SignalOutputConfiguration.Validate(Config(output));
    }

    [Theory]
    [InlineData(OutputDeviceType.HttpJson, "ws://output.invalid/value")]
    [InlineData(OutputDeviceType.WebSocketJson, "https://output.invalid/value")]
    [InlineData(OutputDeviceType.HttpJson, "http://fixture:fixture@output.invalid/value")]
    [InlineData(OutputDeviceType.WebSocketJson, "wss://output.invalid/value#fragment")]
    [InlineData(OutputDeviceType.HttpJson, "/relative")]
    public void Incompatible_or_ambiguous_endpoints_are_rejected_before_activation(OutputDeviceType type, string address)
    {
        var output = Output(type);
        output.WebsocketAddress = address;
        Assert.Throws<ArgumentException>(() => SignalOutputConfiguration.Validate(Config(output)));
    }

    [Theory]
    [InlineData(OutputDeviceType.HttpJson)]
    [InlineData(OutputDeviceType.WebSocketJson)]
    public void Empty_disabled_endpoint_can_be_saved_as_a_draft_but_cannot_be_enabled(OutputDeviceType type)
    {
        var output = Output(type);
        output.WebsocketAddress = "";
        SignalOutputConfiguration.Validate(Config(output));
        output.Enabled = true;
        Assert.Throws<ArgumentException>(() => SignalOutputConfiguration.Validate(Config(output)));
    }

    [Theory]
    [InlineData("http://output.invalid", 1883)]
    [InlineData("output.invalid", -1)]
    [InlineData("output.invalid", 65536)]
    public void Mqtt_rejects_an_invalid_host_or_port(string host, int port)
    {
        var output = Output(OutputDeviceType.Mqtt);
        output.Host = host; output.Port = port;
        Assert.Throws<ArgumentException>(() => SignalOutputConfiguration.Validate(Config(output)));
    }

    [Theory]
    [InlineData("sensa/", "value/#")]
    [InlineData("sensa/+", "value")]
    [InlineData("", "bad\0topic")]
    public void Mqtt_validates_the_effective_topic_including_its_prefix(string prefix, string address)
    {
        var output = Output(OutputDeviceType.Mqtt);
        output.Signal.MqttTopicPrefix = prefix;
        output.Signal.Bindings[0].Address = address;
        Assert.Throws<ArgumentException>(() => SignalOutputConfiguration.Validate(Config(output)));
    }

    [Fact]
    public void Mqtt_validates_client_id_and_combined_topic_length_without_connecting()
    {
        var output = Output(OutputDeviceType.Mqtt);
        output.Signal.MqttClientId = new string('x', 129);
        Assert.Throws<ArgumentException>(() => SignalOutputConfiguration.Validate(Config(output)));
        output.Signal.MqttClientId = "Sensa-fixture";
        output.Signal.MqttTopicPrefix = new string('x', 510);
        Assert.Throws<ArgumentException>(() => SignalOutputConfiguration.Validate(Config(output)));
        output.Signal.MqttTopicPrefix = "sensa/";
        SignalOutputConfiguration.Validate(Config(output));
    }

    [Theory]
    [InlineData(OutputDeviceType.HttpJson, "")]
    [InlineData(OutputDeviceType.WebSocketJson, "value\0name")]
    [InlineData(OutputDeviceType.OscParameter, "/")]
    [InlineData(OutputDeviceType.OscParameter, "/value\0name")]
    public void Named_output_bindings_use_the_same_validation_as_their_wire_codec(OutputDeviceType type, string address)
    {
        var output = Output(type);
        output.Signal.Bindings[0].Address = address;
        Assert.Throws<ArgumentException>(() => SignalOutputConfiguration.Validate(Config(output)));
    }

    private static AppConfig Config(OutputDeviceConfig output) => new() { Outputs = [output] };
    private static OutputDeviceConfig Output(OutputDeviceType type) => new()
    {
        Id = "fixture", Type = type, Enabled = false, Host = "output.invalid", Port = type == OutputDeviceType.Mqtt ? 1883 : 9000,
        WebsocketAddress = type == OutputDeviceType.WebSocketJson ? "ws://output.invalid/value" : "http://output.invalid/value",
        Signal = new() { Bindings = [new() { Id = "Value", Address = type == OutputDeviceType.OscParameter ? "/value" : "value" }] },
    };
}
