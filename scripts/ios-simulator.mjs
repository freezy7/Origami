import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';
const creator=process.env.COCOS_CREATOR ?? '/Applications/CocosCreator-3.8.8.app/Contents/MacOS/CocosCreator';
const cmake=resolve(creator,'../../Resources/tools/cmake/bin/cmake');
for(const [program,args] of [
  [cmake,['-S','native/engine/ios','-B','build/ios-simulator/proj','-G','Xcode','-T','buildsystem=12','-DCMAKE_SYSTEM_NAME=iOS','-DCMAKE_OSX_SYSROOT=iphonesimulator','-DCMAKE_OSX_ARCHITECTURES=arm64','-DORIGAMI_SIMULATOR=ON',`-DRES_DIR=${resolve('build/ios')}`,'-DAPP_NAME=Origami','-DLAUNCH_TYPE=Debug']],
  ['ruby',['scripts/prepare-ios.rb']],
  ['xcodebuild',['-project','build/ios-simulator/proj/Origami.xcodeproj','-scheme','Origami-mobile','-configuration','Debug','-sdk','iphonesimulator','-destination','generic/platform=iOS Simulator','-derivedDataPath','build/DerivedData','CODE_SIGNING_ALLOWED=NO','ARCHS=arm64','build']],
]) {
  const result=spawnSync(program,args,{stdio:'inherit'});
  if(result.status!==0)process.exit(result.status??1);
}
