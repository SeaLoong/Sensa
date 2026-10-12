Shader "SensaLab/TextureOutput"
{
    Properties { _MainTex("Data",2D)="black"{} _DesktopOnly("Reject stereo/mirror",Float)=1 }
    SubShader { Tags { "Queue"="Overlay+100" "VRCFallback"="Hidden" } Pass {
        Cull Off ZWrite Off ZTest Always Blend Off
        CGPROGRAM
        #pragma vertex vert
        #pragma fragment frag
        #pragma multi_compile_instancing
        #include "UnityCG.cginc"
        sampler2D _MainTex; float _DesktopOnly, _VRChatMirrorMode;
        struct app { float4 vertex:POSITION; float2 uv:TEXCOORD0; UNITY_VERTEX_INPUT_INSTANCE_ID };
        struct output {float4 vertex:SV_POSITION; float2 uv:TEXCOORD0; UNITY_VERTEX_OUTPUT_STEREO};
        output vert(app v) {
            output o; UNITY_SETUP_INSTANCE_ID(v); UNITY_INITIALIZE_VERTEX_OUTPUT_STEREO(o);
            o.vertex=float4(v.uv*2-1,0,1); o.uv=v.uv; return o;
        }
        float4 frag(output i):SV_Target {
            UNITY_SETUP_STEREO_EYE_INDEX_POST_VERTEX(i);
            // Explicit test-camera signature; not a general VRChat camera identity API.
            if(unity_OrthoParams.w<.5 || abs(_ProjectionParams.z-.731)>.0001) discard;
            if(_DesktopOnly>.5) {
                if(_VRChatMirrorMode!=0) discard;
                #if defined(USING_STEREO_MATRICES)
                    discard;
                #endif
            }
            return tex2D(_MainTex,i.uv);
        }
        ENDCG
    }}
    Fallback Off
}
