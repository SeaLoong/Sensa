using System;
using System.IO;
using System.Linq;
using UnityEditor;
using UnityEngine;
using UdonSharp;
using UdonSharpEditor;

namespace SensaLab
{
    // SessionState survives the Play Mode domain reload. Check both in-memory
    // material values and the asset file; neither may retain test frame data.
    public static class LabMaterialValidation
    {
        const string Key="SensaLab.MaterialValidation";
        [Serializable] class Row { public string path,values,file,valuesAfter;public bool memoryUnchanged,fileUnchanged; }
        [Serializable] class Values { public string shader;public float sequence,corrupt,valid,autoSequence,cameraOnly;public Vector4 sample; }
        static string Snapshot(Material m)=>JsonUtility.ToJson(new Values{shader=AssetDatabase.GetAssetPath(m.shader),
            sequence=m.GetFloat("_Sequence"),corrupt=m.GetFloat("_CorruptCrc"),valid=m.GetFloat("_Valid"),
            autoSequence=m.GetFloat("_AutoSequence"),cameraOnly=m.GetFloat("_CameraOnly"),sample=m.GetVector("_Sample")});
        [Serializable] class Report { public bool passed,runtimeInstances;public string checkedUtc;public Row[] sources; }
        public static void Capture(string directory)
        {
            var materials=UnityEngine.Object.FindObjectsOfType<CapabilityStation>().Select(s=>s.encoder)
                .Concat(UnityEngine.Object.FindObjectsOfType<LabController>().Select(s=>s.telemetry)).Where(m=>m!=null).Distinct();
            var report=new Report{sources=materials.Select(m=>new Row{path=AssetDatabase.GetAssetPath(m),values=Snapshot(m),file=File.ReadAllText(AssetDatabase.GetAssetPath(m))}).ToArray()};
            if(report.sources.Length==0)throw new InvalidOperationException(LabEditorLocalization.Text("No encoder materials to validate."));
            SessionState.SetString(Key,JsonUtility.ToJson(report));SessionState.SetString(Key+"Directory",directory);
        }
        public static void CheckRuntime()
        {
            var instances=new System.Collections.Generic.HashSet<Material>();
            foreach(var station in UnityEngine.Object.FindObjectsOfType<CapabilityStation>())
                if(station.encoder!=null)Check(station,station.encoder,"runtimeEncoder",instances);
            foreach(var station in UnityEngine.Object.FindObjectsOfType<LabController>())
                if(station.telemetry!=null)Check(station,station.telemetry,"runtimeTelemetry",instances);
            if(instances.Count==0)throw new InvalidOperationException(LabEditorLocalization.Text("No runtime encoder instances found."));
            var report=JsonUtility.FromJson<Report>(SessionState.GetString(Key,""));report.runtimeInstances=true;
            SessionState.SetString(Key,JsonUtility.ToJson(report));
        }
        static void Check(UdonSharpBehaviour station,Material source,string field,System.Collections.Generic.HashSet<Material> instances)
        {
            var runtime=UdonSharpEditorUtility.GetBackingUdonBehaviour(station).GetProgramVariable(field) as Material;
            if(runtime==null || runtime==source || EditorUtility.IsPersistent(runtime) || !instances.Add(runtime))
                throw new InvalidOperationException(station.name+" must own a distinct runtime encoder material.");
        }
        public static bool Finish(bool requireRuntime=true)
        {
            var report=JsonUtility.FromJson<Report>(SessionState.GetString(Key,""));
            foreach(var row in report.sources){
                var material=AssetDatabase.LoadAssetAtPath<Material>(row.path);
                // Unity may materialize previously implicit shader defaults on
                // domain reload. Compare effective values, not property-list shape.
                row.valuesAfter=material==null?"missing":Snapshot(material);
                row.memoryUnchanged=row.valuesAfter==row.values;row.fileUnchanged=File.ReadAllText(row.path)==row.file;
            }
            report.passed=(!requireRuntime||report.runtimeInstances) && report.sources.All(row=>row.memoryUnchanged&&row.fileUnchanged);
            report.checkedUtc=DateTime.UtcNow.ToString("O");
            var directory=SessionState.GetString(Key+"Directory","");Directory.CreateDirectory(directory);
            File.WriteAllText(directory+"/material-isolation.json",JsonUtility.ToJson(report,true));
            if(!report.passed)Debug.LogError(LabEditorLocalization.Text("Sensa encoder material isolation failed."));
            return report.passed;
        }
    }
}
