using System.Net;
using Sensa.Input.Protocols;

namespace Sensa.Configuration;

public sealed partial class AppConfig
{
    private void ValidateProtocolInputTargets()
    {
        foreach (var input in ProtocolInputs.Where(input => input.Enabled))
        {
            if (input.Type == "IntifaceDevice")
            {
                if (!Uri.TryCreate(input.Address, UriKind.Absolute, out var address) || address.Scheme is not ("ws" or "wss")
                    || address.UserInfo.Length != 0 || address.Query.Length != 0 || address.Fragment.Length != 0) throw new ArgumentException("Intiface device input needs a ws/wss address without credentials.");
                if (Outputs.Any(output => output.Enabled && output.Type == OutputDeviceType.Intiface
                    && Uri.TryCreate(output.WebsocketAddress, UriKind.Absolute, out var central) && HostsOverlap(address.Host, central.Host)))
                    throw new ArgumentException("WSDM input and Intiface output on the same host can rediscover the virtual device. Use the independent Buttplug input for this topology.");
            }
            else if (input.Type == "TCodeSerial")
            {
                if (string.IsNullOrWhiteSpace(input.ComPort)) throw new ArgumentException("Choose an input serial port.");
                if (Outputs.Any(output => output.Type == OutputDeviceType.TCodeSerial && output.ComPort.Equals(input.ComPort, StringComparison.OrdinalIgnoreCase)))
                    throw new ArgumentException("Input and output cannot own the same serial port. Use a virtual pair with distinct endpoints.");
            }
            else
            {
                if (input.Type != "TCodeUdp" && input.Port == WebUi.Port && HostsOverlap(input.Host, WebUi.Host))
                    throw new ArgumentException("Protocol input must use a separate port from the management UI.");
                foreach (var output in Outputs)
                {
                    if (input.Type == "TCodeTcp" && output.Type == OutputDeviceType.TCodeTcp
                        || input.Type == "TCodeUdp" && output.Type == OutputDeviceType.TCodeUdp)
                        if (output.Port == input.Port && HostsOverlap(input.Host, output.Host))
                            throw new ArgumentException("A TCode output cannot connect back to its own input.");
                    if (input.Type == "Buttplug" && output.Type == OutputDeviceType.Intiface
                        && Uri.TryCreate(output.WebsocketAddress, UriKind.Absolute, out var destination)
                        && destination.Port == input.Port && HostsOverlap(input.Host, destination.Host))
                        throw new ArgumentException("An Intiface output cannot connect back to the Sensa Buttplug input.");
                }
            }
        }
    }

    private static bool HostsOverlap(string first, string second)
    {
        static bool Local(string host) => host.Equals("localhost", StringComparison.OrdinalIgnoreCase)
            || IPAddress.TryParse(host, out var ip) && IPAddress.IsLoopback(ip);
        return first is "0.0.0.0" or "::" || first.Equals(second, StringComparison.OrdinalIgnoreCase) || Local(first) && Local(second);
    }
}
