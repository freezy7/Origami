import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';
const team=process.env.IOS_DEVELOPMENT_TEAM;
if(!team){console.error('Set IOS_DEVELOPMENT_TEAM to your Apple development team ID. Existing local signing profiles are used; this script does not register devices or publish builds.');process.exit(1);}
const creator=process.env.COCOS_CREATOR??'/Applications/CocosCreator-3.8.8.app/Contents/MacOS/CocosCreator';
const cmake=resolve(creator,'../../Resources/tools/cmake/bin/cmake');
for(const [program,args] of [
 [cmake,['-S','native/engine/ios','-B','build/ios-device/proj','-G','Xcode','-T','buildsystem=12','-DCMAKE_SYSTEM_NAME=iOS','-DCMAKE_OSX_SYSROOT=iphoneos','-DCMAKE_OSX_ARCHITECTURES=arm64',`-DRES_DIR=${resolve('build/ios')}`,'-DAPP_NAME=Origami','-DLAUNCH_TYPE=Debug']],
 ['xcodebuild',['-project','build/ios-device/proj/Origami.xcodeproj','-scheme','Origami-mobile','-configuration','Debug','-sdk','iphoneos','-destination','generic/platform=iOS','-derivedDataPath','build/DeviceDerivedData','CODE_SIGN_STYLE=Automatic',`DEVELOPMENT_TEAM=${team}`,'CODE_SIGN_IDENTITY=Apple Development','PRODUCT_BUNDLE_IDENTIFIER=com.freezy7.origami','ARCHS=arm64','build']],
]){const r=spawnSync(program,args,{stdio:'inherit'});if(r.status!==0)process.exit(r.status??1);}
console.log('Signed development app: build/ios-device/proj/Debug-iphoneos/Origami-mobile.app');
