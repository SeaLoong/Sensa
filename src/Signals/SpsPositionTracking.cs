using Sensa.Input.Osc;
using UnityBox.Sensa;

namespace Sensa.Signals;

/// <summary>Standard/shared SPS roots remain diagnostic-only. Explicit local point/handle
/// protocols may be used by SensaPoint mappings. No single sphere supplies orientation or roll.</summary>
public static class SpsPositionTracking
{
    public sealed record Observation(string Key, string Instance, string Party, string SourceLabel,
        int SampleCount, bool Valid, PosePoint Position, double Radius, double Residual, string Reason,
        string Prefix, string SourceKey, string Kind, int Slot, long TimestampMs)
    {
        public bool IsLocalPoint => Kind is "Point" or "Handle";
        public int ExpectedSampleCount => IsLocalPoint ? 4 : 8;
        public bool Matches(string pattern) => Enumerable.Range(0,ExpectedSampleCount).Any(i=>OscParameterStore.MatchesPathPattern(pattern,$"{Prefix}/Root/A{i}"));
        public float Metric(PointMetric metric) => (float)(metric switch { PointMetric.X=>Position.X,PointMetric.Y=>Position.Y,PointMetric.Distance=>Position.Length,_=>Position.Z });
    }

    public static Observation[] Observe(IEnumerable<OscParameterStore.SnapshotEntry> entries, string? sourceKey = null, int maxAgeMs = 0, TimeProvider? timeProvider = null)
    {
        var snapshot=entries.ToArray();
        var lookup=snapshot.ToDictionary(e=>(e.Entry.Source.Key,e.Path),e=>e.Entry);
        return snapshot.Where(e => (string.IsNullOrEmpty(sourceKey) || sourceKey == e.Entry.Source.Key)
                && new[]{SensaPoseProtocol.SpsRootPrefix,SensaPoseProtocol.PointPrefix,SensaPoseProtocol.HandlePrefix,SensaPoseProtocol.SharedRootPrefix}.Any(p=>e.Path.StartsWith(p+"/",StringComparison.Ordinal)))
            .Select(e => (Sample: e, Parts: e.Path.Split('/')))
            .Where(e => e.Parts.Length == 7 && e.Parts[4] is "Self" or "Others" && e.Parts[5] == "Root"
                && e.Parts[6].Length == 2 && e.Parts[6][0] == 'A' && e.Parts[6][1] is >= '0' and <= '7')
            .GroupBy(e => (Source: e.Sample.Entry.Source.Key, Prefix: string.Join('/', e.Parts.Take(5))))
            .OrderBy(g => g.Key.Source, StringComparer.Ordinal).ThenBy(g => g.Key.Prefix, StringComparer.Ordinal).Take(64)
            .Select(group =>
            {
                var first = group.First();
                var samples = group.OrderBy(e => e.Parts[6], StringComparer.Ordinal).ToArray();
                bool local=first.Parts[1] is "Point" or "Handle";
                var values=samples.Select(e=>e.Sample.Entry.Value.AsFloat()).ToArray();
                var fit = local && samples.Select((s,i)=>s.Parts[6]=="A"+i).All(v=>v)
                    ? PoseReconstruction.FitLocalTetrahedron(values)
                    : local ? new MarkerFit(false,default,0,0,"四面体采样编号不完整") : PoseReconstruction.FitMarker(values);
                // A radius at the search boundary cannot confirm compatibility with this probe's scale.
                var valid = fit.Valid && fit.Radius < .0199;
                string kind=first.Parts[1] switch {"Point"=>"Point","Handle"=>"Handle","SharedRoot"=>"SharedRoot",_=>"SpsRoot"};
                var reason=valid ? (kind is "Point" or "Handle" ? "本地点位置有效" : "根部位置有效 · 朝向不可观测")
                    : fit.Valid ? "球半径达到拟合上限；检查相对缩放" : fit.Reason;
                int slot=0;
                if(kind=="Handle" && (!lookup.TryGetValue((group.Key.Source,group.Key.Prefix+"/Handle_IsGrabbed"),out var grab) || grab.Value.AsFloat()!=1f)) {valid=false;reason="等待抓取 PB 把手";}
                if(kind=="SharedRoot") {
                    bool selected=lookup.TryGetValue((group.Key.Source,group.Key.Prefix+"/Slot"),out var selection);
                    var value=selected?selection!.Value.AsFloat():0;
                    slot=float.IsFinite(value)&&value==MathF.Truncate(value)&&value>=1&&value<=16?(int)value:0;
                    if(slot==0 || !lookup.TryGetValue((group.Key.Source,group.Key.Prefix+"/Ready"),out var ready) || ready.Value.AsFloat()!=1f
                        || ready.Sequence<=selection.Sequence || samples.Any(s=>s.Sample.Entry.Sequence<=selection.Sequence)) {valid=false;reason="共享阵列停用、切换中或等待新槽位采样";}
                }
                long timestamp=group.Max(s=>s.Sample.Entry.TimestampMs);
                if(maxAgeMs>0 && (timeProvider ?? TimeProvider.System).GetUtcNow().ToUnixTimeMilliseconds()-timestamp>maxAgeMs){valid=false;reason="坐标数据已超时，等待新的几何采样";}
                return new Observation(group.Key.Source + "|" + group.Key.Prefix, first.Parts[3], first.Parts[4],
                    first.Sample.Entry.Source.Label, samples.Length, valid, valid ? fit.Position : default,
                    fit.Radius, fit.Residual, reason,group.Key.Prefix,group.Key.Source,kind,slot,timestamp);
            }).ToArray();
    }
}

public enum PointMetric { X, Y, Z, Distance }
