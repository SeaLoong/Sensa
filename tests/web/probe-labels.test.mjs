import {test} from 'node:test';
import assert from 'node:assert/strict';
import {probePresentation,parameterMeaning} from '../../src/web/osc-preview.js';

test('probe labels distinguish spatial samples from TCode auxiliary outputs',()=>{
  const probe=probePresentation('Sensa/Handle/v1/LabHandle/Self/Root/A0');
  assert.equal(probe.label,'定位探针 P1'); assert.equal(probe.color,'#E85D75');
  assert.match(parameterMeaning('Sensa/Handle/v1/LabHandle/Self/Root/A0'),/不是 TCode/);
  assert.equal(probePresentation('Sensa/Pose/v1/Socket/Others/Tip/A7').label,'定位探针 C8');
  assert.equal(probePresentation('Sensa/Point/v1/Point/Self/Root/A4'),null);
  for(const path of ['A0','TCode/A0','OGB/Orf/Test/A0','Custom/Root/A0'])assert.equal(probePresentation(path),null);
  assert.equal(probePresentation('/avatar/parameters/Sensa/Point/v1/Point/Self/Root/A3').label,'定位探针 P4');
});
