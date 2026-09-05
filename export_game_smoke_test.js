// export_game_smoke_test.js — 分类菜单与完整 Windows 游戏包导出冒烟测试
const fs=require('fs');const assert=require('assert');const html=fs.readFileSync('index.html','utf8');const server=fs.readFileSync('server.js','utf8');
let pass=0;function ok(name,value){assert.ok(value,name);console.log('  ✓ '+name);pass++;}
ok('项目与设计功能使用显式可访问折叠按钮',html.includes('id="projectMenuButton"')&&html.includes('id="designMenuButton"')&&html.includes('aria-expanded="false"'));
ok('同类按钮位于隐藏面板',html.includes('feature-menu-panel')&&html.includes('bindFeatureMenus'));
ok('完整游戏导出按钮和函数已接入',html.includes('id="btnExportGame"')&&html.includes('function exportCompleteGame()')&&html.includes("'/api/export-game'"));
ok('服务端提供游戏包与状态接口',server.includes("'/api/export-game'")&&server.includes("'/api/export-game/status'"));
ok('游戏包包含 EXE/HTML/项目/清单/说明',server.includes("title+'.exe'")&&server.includes("{name:'game.html'}")&&server.includes("{name:'project.json'}")&&server.includes("{name:'manifest.json'}")&&server.includes("{name:'README.txt'}"));
ok('项目内嵌素材会提取到 assets',server.includes('collectDataAssets')&&server.includes("'assets/asset-'")&&server.includes('embeddedAssets'));
ok('外链素材会写入离线风险清单',server.includes('externalAssets')&&server.includes('walkExternal'));
ok('Windows 播放器 EXE 已真实构建',fs.existsSync('player-shell/dist/visual-novel-player.exe')&&fs.statSync('player-shell/dist/visual-novel-player.exe').size>50*1024*1024);
console.log('========== 完整游戏导出冒烟：'+pass+' 通过 / 0 失败 ==========');
