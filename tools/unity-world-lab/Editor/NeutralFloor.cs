using System;
using UnityEditor;
using UnityEngine;

namespace SensaLab
{
    public static class NeutralFloor
    {
        [MenuItem("Tools/Sensa Lab/Use neutral grey-white floors")]
        public static void Apply()
        {
            // Edit only the owned materials: preserve scene edits, colliders and layouts.
            foreach (var path in new[] { "Assets/SensaLab/Functional/Floor.mat", "Assets/SensaLab/Generated/Walkway.mat" })
            {
                var material = AssetDatabase.LoadAssetAtPath<Material>(path);
                if (material == null) throw new InvalidOperationException("Generate the test worlds first: " + path);
                material.shader = Shader.Find("Unlit/Color");
                material.color = new Color(.78f, .78f, .78f);
                EditorUtility.SetDirty(material);
            }
            AssetDatabase.SaveAssets();
        }
    }
}
