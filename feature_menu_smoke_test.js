// feature_menu_smoke_test.js — 分类菜单兼容性回归
const fs=require('fs');const html=fs.readFileSync('index.html','utf8');
const checks=[
 ['项目菜单触发器是普通按钮',html.includes('id="projectMenuButton"')&&!html.includes('<details class="feature-menu" id="projectMenu"')],
 ['设计菜单触发器是普通按钮',html.includes('id="designMenuButton"')&&!html.includes('<details class="feature-menu" id="designMenu"')],
 ['面板默认 hidden',html.includes('id="projectMenuPanel" class="feature-menu-panel hidden"')&&html.includes('id="designMenuPanel" class="feature-menu-panel right hidden"')],
 ['脚本显式切换 aria-expanded',html.includes("setAttribute('aria-expanded'") && html.includes("classList.toggle('hidden'")],
 ['支持点击外部关闭',html.includes("if(!e.target.closest('.feature-menu'))closeFeatureMenus()")]
];
let fail=0;checks.forEach(([n,v])=>{console.log((v?'  ✓ ':'  ✗ FAIL: ')+n);if(!v)fail++;});console.log('========== 分类菜单兼容回归：'+(checks.length-fail)+' 通过 / '+fail+' 失败 ==========');process.exit(fail?1:0);
