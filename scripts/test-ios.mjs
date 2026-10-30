import { spawnSync } from 'node:child_process';
import { existsSync, readdirSync } from 'node:fs';
const run=(program,args,capture=false)=>{
  const r=spawnSync(program,args,{stdio:capture?'pipe':'inherit',encoding:'utf8'});
  if(r.status!==0){if(capture)console.error(r.stderr);process.exit(r.status??1);}return r.stdout;
};
const devices=JSON.parse(run('xcrun',['simctl','list','devices','booted','-j'],true));
const booted=Object.values(devices.devices).flat().filter(d=>d.state==='Booted');
const udid=process.env.SIMULATOR_UDID??(booted.length===1?booted[0].udid:null);
if(!udid){console.error('Boot one iOS simulator, or set SIMULATOR_UDID.');process.exit(1);}
const app='build/ios-simulator/proj/Debug-iphonesimulator/Origami-mobile.app';
if(!existsSync(app)){console.error('Run npm run build:ios:simulator first.');process.exit(1);}
run('ruby',['scripts/prepare-ios.rb']);
run('xcodebuild',['-project','build/OrigamiSmoke.xcodeproj','-scheme','OrigamiSmoke','-sdk','iphonesimulator','-destination',`id=${udid}`,'-derivedDataPath','build/UITestData','CODE_SIGNING_ALLOWED=NO','build-for-testing']);
console.log('UI tests reset ONLY the local com.freezy7.origami prototype data.');
spawnSync('xcrun',['simctl','uninstall',udid,'com.freezy7.origami'],{stdio:'ignore'});
run('xcrun',['simctl','install',udid,app]);
const files=readdirSync('build/UITestData/Build/Products').filter(f=>f.startsWith('OrigamiSmoke_')&&f.endsWith('.xctestrun')).sort();
const result=`build/OrigamiSmoke-${Date.now()}.xcresult`;
run('xcodebuild',['test-without-building','-xctestrun',`build/UITestData/Build/Products/${files.at(-1)}`,'-destination',`id=${udid}`,'-resultBundlePath',result]);
console.log(`Passed. Results and screenshot attachments: ${result}`);
