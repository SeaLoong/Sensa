Shader "SensaLab/Telemetry"
{
    Properties { _Sequence("Sequence", Float)=0 _Sample("XYZ [-1,1]", Vector)=(0,0,0,0) _AutoSequence("Test clock (not source freshness)",Float)=0 _CameraOnly("Private test camera only",Float)=0 _Valid("Source valid",Float)=1 }
    SubShader { Tags { "Queue"="Overlay" } Pass {
        Cull Off ZWrite Off ZTest Always Blend Off
        CGPROGRAM
        #pragma target 4.5
        #pragma vertex vert_img
        #pragma fragment frag
        #include "UnityCG.cginc"
        float _Sequence, _AutoSequence, _CameraOnly, _Valid; float4 _Sample;
        float4 frag(v2f_img v):SV_Target {
            if(_CameraOnly>.5 && (unity_OrthoParams.w<.5 || abs(_ProjectionParams.z-.731)>.0001)) discard;
            uint bytes[16];
            uint seq=(uint)(_AutoSequence>.5 ? _Time.y*60 : _Sequence) & 65535u;
            uint3 p=(uint3)round(saturate(_Sample.xyz*.5+.5)*65535);
            bytes[0]=83; bytes[1]=78; bytes[2]=1; bytes[3]=_Valid>.5?1:0;
            bytes[4]=seq&255u; bytes[5]=seq>>8;
            bytes[6]=p.x&255u; bytes[7]=p.x>>8;
            bytes[8]=p.y&255u; bytes[9]=p.y>>8;
            bytes[10]=p.z&255u; bytes[11]=p.z>>8;
            bytes[12]=0; bytes[13]=0;
            uint crc=65535u;
            for(uint i=0;i<14;i++) {
                crc^=bytes[i]<<8;
                for(uint j=0;j<8;j++) crc=((crc<<1)^((crc&32768u)!=0?4129u:0u))&65535u;
            }
            bytes[14]=crc&255u; bytes[15]=crc>>8;
            uint col=min((uint)(v.uv.x*16),15u), row=min((uint)(v.uv.y*8),7u);
            return float4(((bytes[col]>>row)&1u).xxx,1);
        }
        ENDCG
    }}
    Fallback Off
}
