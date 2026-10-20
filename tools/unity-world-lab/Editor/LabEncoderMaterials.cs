using System.IO;
using UnityEditor;
using UnityEditor.SceneManagement;
using UnityEngine;
using UdonSharpEditor;

namespace SensaLab
{
    public static class LabEncoderMaterials
    {
        // Udon does not expose Material's copy constructor. Renderer.material
        // supplies the runtime instance; this disabled, meshless host draws nothing.
        public static void Prepare()
        {
            foreach(var station in Object.FindObjectsOfType<CapabilityStation>())
                if(station.encoder!=null){station.encoderInstanceHost=Host(station.transform,station.encoder);UdonSharpEditorUtility.CopyProxyToUdon(station);}
            foreach(var station in Object.FindObjectsOfType<LabController>())
                if(station.telemetry!=null){station.encoderInstanceHost=Host(station.transform,station.telemetry);UdonSharpEditorUtility.CopyProxyToUdon(station);}
        }
        static Renderer Host(Transform parent,Material material)
        {
            var child=parent.Find("Runtime encoder material");
            if(child==null){child=new GameObject("Runtime encoder material").transform;child.SetParent(parent,false);}
            var renderer=child.GetComponent<MeshRenderer>();if(renderer==null)renderer=child.gameObject.AddComponent<MeshRenderer>();
            renderer.enabled=false;renderer.sharedMaterial=material;return renderer;
        }
        [MenuItem("Tools/Sensa Lab/Upgrade isolated encoder materials")]
        public static void Upgrade()
        {
            foreach(var path in new[]{FunctionalLab.Scene,"Assets/SensaLab/Generated/SensaLab.unity"})
                if(File.Exists(path)){var scene=LabEditorLocalization.OpenScene(path);Prepare();LabEditorLocalization.SaveScene(scene);}
            AssetDatabase.SaveAssets();
        }
    }
}
