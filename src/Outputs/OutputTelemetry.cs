using System.Globalization;
using System.Text.RegularExpressions;

namespace Sensa.Outputs;

public sealed record OutputTarget(string Key, string Label, double Value, double Maximum);
public sealed record OutputTelemetrySnapshot(string State, DateTimeOffset? LastSentAtUtc, OutputTarget[] Targets);

/// <summary>Commands accepted by the local transport/API; never sensor feedback.</summary>
public sealed class OutputTelemetry
{
    private readonly object _sync = new();
    private readonly Dictionary<string, OutputTarget> _targets = new(StringComparer.Ordinal);
    private string _state = "idle";
    private DateTimeOffset? _lastSent;
    public OutputTelemetrySnapshot Snapshot { get { lock(_sync)return new(_state,_lastSent,_targets.Values.OrderBy(t=>t.Key,StringComparer.Ordinal).ToArray()); } }
    public void RecordTCode(string line)
    {
        lock(_sync){
            bool changed=false;
            foreach(var token in line.Split(' ',StringSplitOptions.RemoveEmptyEntries)){
                var match=Regex.Match(token,@"^([LRVA][0-2])(\d{3,4})(?:[IS]\d+)?$",RegexOptions.CultureInvariant);
                if(!match.Success || !int.TryParse(match.Groups[2].Value,NumberStyles.None,CultureInfo.InvariantCulture,out var value) || value>999)continue;
                string key=match.Groups[1].Value;_targets[key]=new(key,key,value,999);changed=true;
            }
            if(changed){_state="sent";_lastSent=DateTimeOffset.UtcNow;}
        }
    }
    public void RecordTarget(string key,string label,double value)
    {
        if(!double.IsFinite(value))return;
        lock(_sync){_targets[key]=new(key,label,Math.Clamp(value,0,100),100);_state="sent";_lastSent=DateTimeOffset.UtcNow;}
    }
    public void SetState(string state,bool clear=false){lock(_sync){_state=state;if(clear){_targets.Clear();_lastSent=null;}}}
    public void RemovePrefix(string prefix){lock(_sync){foreach(var key in _targets.Keys.Where(k=>k.StartsWith(prefix,StringComparison.Ordinal)).ToArray())_targets.Remove(key);if(_targets.Count==0){_state="idle";_lastSent=null;}}}
}
