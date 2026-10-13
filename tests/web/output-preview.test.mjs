import {test} from 'node:test';
import assert from 'node:assert/strict';
import {outputPreview} from '../../src/web/output-preview.js';
test('output preview uses per-output targets, keeps unknown empty and labels stopped state',()=>{
 assert.deepEqual(outputPreview({enabled:true,connected:true}).targets,[]);
 const state={enabled:true,connected:true,telemetry:{state:'sent',targets:[{key:'R0',label:'R0',value:250,maximum:999},{key:'L0',label:'L0',value:600,maximum:999},{key:'V0',label:'bad',value:NaN,maximum:999}]}};
 const preview=outputPreview(state);assert.equal(preview.targets[0].key,'L0');assert.ok(Math.abs(preview.targets[0].percent-60.06)<.01);assert.equal(preview.targets.length,2);
 assert.equal(outputPreview({...state,connected:false}).label,'未连接');assert.equal(outputPreview({...state,enabled:false}).label,'已禁用');
 assert.equal(outputPreview({enabled:true,connected:true,telemetry:{state:'stopped',targets:[]}}).label,'已请求停止');
});
