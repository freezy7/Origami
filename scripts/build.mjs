import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
const creator=process.env.COCOS_CREATOR ?? '/Applications/CocosCreator-3.8.8.app/Contents/MacOS/CocosCreator';
if(!existsSync(creator)){console.error('Set COCOS_CREATOR to the executable inside CocosCreator.app.');process.exit(1);}
const platform=process.argv[2]??'ios';
const build=platform==='ios'?'configPath=build-ios.json':`platform=${platform};debug=true;outputName=${platform}`;
const child=spawn(creator,['--project',process.cwd(),'--build',build],{stdio:'inherit'});
child.on('exit',code=>process.exit(code===36||code===0?0:code??1));
