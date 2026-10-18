#if UNITY_INCLUDE_TESTS
using System;
using System.Collections.Generic;
using System.Linq;
using NUnit.Framework;
using UnityEditor;
using UnityEngine;
using UnityEditor.Animations;
using nadena.dev.modular_avatar.core;
using VRC.SDK3.Avatars.Components;
using Object = UnityEngine.Object;

namespace UnityBox.Sensa.Tests
{
    /// <summary>
    /// Owns disposable avatar inputs and builds SPS authoring inputs through their public fields.
    /// 管理可销毁的 Avatar 输入，并通过公开字段建立 SPS 创作输入。
    /// </summary>
    public abstract class AvatarBuildFixture
    {
        protected GameObject avatar;
        private readonly List<GameObject> owned = new List<GameObject>();

        [SetUp]
        public void CreateAvatar()
        {
            avatar = Own(new GameObject("Sensa contract avatar"));
            avatar.AddComponent<Animator>();
            avatar.AddComponent<VRCAvatarDescriptor>();
        }

        [TearDown]
        public void DestroyOwnedObjects()
        {
            foreach (var item in owned.Where(item => item != null))
                Object.DestroyImmediate(item);
            owned.Clear();
        }

        protected GameObject Own(GameObject item)
        {
            owned.Add(item);
            return item;
        }

        protected GameObject Prefab(string name)
        {
            var prefab = AssetDatabase.LoadAssetAtPath<GameObject>("Packages/top.sealoong.sensa/Prefabs/" + name + ".prefab");
            Assert.That(prefab, Is.Not.Null, "缺少包内预制件。 / Missing package prefab: " + name);
            return Own(Object.Instantiate(prefab));
        }

        protected GameObject Child(string name, Vector3 position)
        {
            var child = new GameObject(name);
            child.transform.SetParent(avatar.transform, false);
            child.transform.localPosition = position;
            return child;
        }

        protected GameObject Socket(string name, Vector3 position)
        {
            var node = Child(name, position);
            node.AddComponent(OptionalSpsType(SensaSpsAdapter.SocketType));
            return node;
        }

        protected GameObject Plug(string name, Vector3 position)
        {
            var node = Child(name, position);
            var type = OptionalSpsType(SensaSpsAdapter.PlugType);
            var plug = node.AddComponent(type);
            foreach (var field in new[] { "autoRenderer", "autoPosition", "autoLength", "autoRadius" })
                type.GetField(field).SetValue(plug, false);
            type.GetField("unitsInMeters").SetValue(plug, true);
            type.GetField("length").SetValue(plug, .16f);
            type.GetField("radius").SetValue(plug, .015f);
            return node;
        }

        protected AnimatorState[] States()
        {
            var merge = avatar.GetComponentInChildren<ModularAvatarMergeAnimator>();
            Assert.That(merge, Is.Not.Null);
            return ((AnimatorController)merge.animator).layers[0].stateMachine.states.Select(item => item.state).ToArray();
        }

        protected void SampleState(string name)
        {
            var state = States().Single(item => item.name == name);
            Assert.That(state.motion, Is.TypeOf<AnimationClip>());
            ((AnimationClip)state.motion).SampleAnimation(avatar, 0);
        }

        private static Type OptionalSpsType(string name)
        {
            var type = AppDomain.CurrentDomain.GetAssemblies().Select(assembly => assembly.GetType(name)).FirstOrDefault(item => item != null);
            if (type == null)
                Assert.Ignore("未安装可选 VRCFury。 / Optional VRCFury is not installed.");
            return type;
        }
    }
}
#endif
