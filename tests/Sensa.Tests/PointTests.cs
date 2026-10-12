using Sensa.Configuration;
using Sensa.Input.Osc;
using Sensa.Runtime;
using Sensa.Signals;
using Xunit;
using System.Text.Json;
using UnityBox.Sensa;

namespace Sensa.Tests;
public class PointTests
{
    [Fact] public void FourKnownRadiusRangesReconstructAcrossTheLocalVolume()
    {
        var random=new Random(9271);
        for(int trial=0;trial<300;trial++) {
            var expected=new PosePoint((random.NextDouble()-.5)*.2,(random.NextDouble()-.5)*.2,(random.NextDouble()-.5)*.2);
            var values=Enumerable.Range(0,4).Select(i=>(float)(1-((expected-PoseReconstruction.Anchors[SensaPoseProtocol.PointAnchorIndex(i)]).Length-SensaPoseProtocol.MarkerRadius)/SensaPoseProtocol.ReceiverRadius)).ToArray();
            var fit=PoseReconstruction.FitLocalTetrahedron(values);Assert.True(fit.Valid,fit.Reason);Assert.InRange((fit.Position-expected).Length,0,.000001);
        }
        Assert.False(PoseReconstruction.FitLocalTetrahedron([.5f,.5f,.5f]).Valid);
        Assert.False(PoseReconstruction.FitLocalTetrahedron([1,.5f,.5f,.5f]).Valid);
        Assert.False(PoseReconstruction.FitLocalTetrahedron([float.NaN,.5f,.5f,.5f]).Valid);
    }
    [Fact] public void PointProtocolRejectsWrongIndicesAndDoesNotInventExtraReceivers()
    {
        const string prefix="Sensa/Point/v1/Bone/Self";var store=new OscParameterStore();var values=PoseTests.Samples(new(.02,-.03,.1));
        for(int i=0;i<4;i++)store.Set(prefix+"/Root/A"+i,OscValue.FromFloat(values[SensaPoseProtocol.PointAnchorIndex(i)]));
        var point=Assert.Single(SpsPositionTracking.Observe(store.SnapshotEntries()));Assert.True(point.Valid);Assert.False(point.Matches(prefix+"/Root/A7"));
        store.Set(prefix+"/Root/A7",OscValue.FromFloat(.5f));Assert.False(Assert.Single(SpsPositionTracking.Observe(store.SnapshotEntries())).Valid);
    }
    [Fact] public void CapturedWorldSdkSamplesDecodeToObservedPoint()
    {
        var assembly=typeof(PointTests).Assembly;
        using var stream=assembly.GetManifestResourceStream(assembly.GetManifestResourceNames().Single(n=>n.EndsWith("unity-point.json")))!;
        using var document=JsonDocument.Parse(stream);var root=document.RootElement;
        Assert.Equal("sensa.point-lab.v1",root.GetProperty("schema").GetString());
        var values=root.GetProperty("samples").EnumerateArray().Select(v=>v.GetSingle()).ToArray();
        var observed=root.GetProperty("position");var expected=new PosePoint(observed.GetProperty("x").GetDouble(),observed.GetProperty("y").GetDouble(),observed.GetProperty("z").GetDouble());
        Assert.Equal(4,values.Length);
        var fit=PoseReconstruction.FitLocalTetrahedron(values);Assert.True(fit.Valid,fit.Reason);Assert.InRange((fit.Position-expected).Length,0,.0001);
    }
    private static void Put(OscParameterStore store,string prefix,PosePoint p,OscSource? source=null)
    {var values=PoseTests.Samples(p);for(int i=0;i<(prefix.StartsWith("Sensa/Point/")||prefix.StartsWith("Sensa/Handle/")?4:8);i++)store.Set(prefix+"/Root/A"+i,OscValue.FromFloat(values[prefix.StartsWith("Sensa/Point/")||prefix.StartsWith("Sensa/Handle/")?SensaPoseProtocol.PointAnchorIndex(i):i]),source??OscSource.Unknown);}
    [Fact] public void SharedArrayRejectsOldSamplesAfterSwitch()
    {
        var store=new OscParameterStore();const string prefix="Sensa/SharedRoot/v1/Pool/Others";
        Put(store,prefix,new(.02,0,.1));
        store.Set(prefix+"/Slot",OscValue.FromFloat(2));store.Set(prefix+"/Ready",OscValue.FromFloat(1));
        Assert.False(Assert.Single(SpsPositionTracking.Observe(store.SnapshotEntries())).Valid);
        Put(store,prefix,new(.03,0,.1));var point=Assert.Single(SpsPositionTracking.Observe(store.SnapshotEntries()));Assert.True(point.Valid);Assert.False(point.IsLocalPoint);Assert.Equal(2,point.Slot);
        store.Set(prefix+"/Ready",OscValue.FromFloat(0));Assert.False(Assert.Single(SpsPositionTracking.Observe(store.SnapshotEntries())).Valid);
    }
    [Fact] public async Task HandleReleaseStopsEvenWithRootOnlyMappingPattern()
    {
        const string prefix="Sensa/Handle/v1/Grip/Self";
        var config=new AppConfig{Signals=[new(){OscPath=prefix+"/Root/**",SourceMode="SensaPoint",PointMetric=PointMetric.Z,VrchatMin=0,VrchatMax=.2f}]};config.NormalizeForRuntime();
        var store=new OscParameterStore();
        Put(store,prefix,new(.02,0,.1));
        store.Set(prefix+"/Handle_IsGrabbed",OscValue.FromFloat(1));
        using var receiver=new OscInputReceiver(store);var frame=new TaskCompletionSource<Sensa.Motion.MotionFrame>();var stop=new TaskCompletionSource();
        using var runtime=new MotionRuntime(config,store,receiver,sendOutputsAsync:f=>{frame.TrySetResult(f);return Task.CompletedTask;},emergencyStopAsync:()=>{stop.TrySetResult();return Task.CompletedTask;});
        runtime.SetInputMode(RuntimeInputMode.Osc);runtime.SetInputActive(true);
        Assert.InRange((await frame.Task.WaitAsync(TimeSpan.FromSeconds(3))).L0,.499f,.501f);
        store.Set(prefix+"/Handle_IsGrabbed",OscValue.FromFloat(0));await stop.Task.WaitAsync(TimeSpan.FromSeconds(3));Assert.False(runtime.CanSend);
    }
    [Fact] public void LocalPointAndRemoteRootRemainDistinct()
    {
        var store=new OscParameterStore();Put(store,"Sensa/Point/v1/Bone/Self",new(.02,-.03,.1));Put(store,"Sensa/SpsRoot/v1/Remote/Others",new(0,0,.1));
        var points=SpsPositionTracking.Observe(store.SnapshotEntries());Assert.Single(points,p=>p.IsLocalPoint);
        Assert.InRange(points.Single(p=>p.IsLocalPoint).Metric(PointMetric.Y),-.0301f,-.0299f);
    }
    [Fact] public void PointMetricSurvivesNormalizationAndMixedFramesAreRejected()
    {
        var config=new AppConfig{Signals=[new(){OscPath="Sensa/Point/v1/A/Self/**",SourceMode="SensaPoint",PointMetric=PointMetric.X}]};config.NormalizeForRuntime();Assert.Equal(PointMetric.X,config.Signals[0].PointMetric);
        config.Signals.Add(new(){OscPath="Sensa/Pose/v1/**",SourceMode="SensaPose"});Assert.Throws<InvalidOperationException>(()=>config.NormalizeForRuntime());
    }
}
