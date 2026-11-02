const {test,expect}=require('@playwright/test');
const M=require('../../public/document-model');
const image=Buffer.from(require('../../scripts/sample-project').sampleImage().split(',')[1],'base64');
test.beforeEach(async({page})=>{
  await page.route('**/api/capabilities',route=>route.fulfill({json:{aiConfigured:true,compiler:{configured:true}}}));
  await page.route('**/api/requirements/parse',route=>route.fulfill({json:{ok:true,rules:M.defaults}}));
  await page.route('**/api/preview',route=>route.fulfill({status:503,json:{error:{message:'测试环境未连接排版服务'}}}));
  await page.goto('/');
});
async function enter(page){await page.locator('#requirementsInput').fill('A4纸，正文宋体小四，1.5倍行距；引用为上标。');await page.locator('#startWriting').click();await expect(page.locator('#workbench')).toBeVisible();}
async function caret(page,offset=2){await page.locator('[data-manuscript]').first().evaluate((el,offset)=>{el.focus();const walker=document.createTreeWalker(el,NodeFilter.SHOW_TEXT);const text=walker.nextNode();const range=document.createRange();range.setStart(text,Math.min(offset,text.length));range.collapse(true);const s=window.getSelection();s.removeAllRanges();s.addRange(range);},offset);await page.waitForTimeout(50);}
test('starts with requirements and enters the three-pane workspace without a rules confirmation screen',async({page})=>{
  await expect(page.locator('#requirementsScreen')).toBeVisible();await expect(page.locator('#workbench')).toBeHidden();await enter(page);
  await expect(page.locator('#outlineTree')).toBeVisible();await expect(page.locator('#addAttachment')).toBeVisible();await expect(page.locator('#previewError')).toContainText('未连接排版服务');
  await expect(page.locator('#legacyTemplateControls')).toBeHidden();
});
test('image upload preserves the caret and supports caption editing and undo',async({page})=>{
  await enter(page);const body=page.locator('[data-manuscript]').first();await body.fill('前文后文');await caret(page);
  await page.locator('#addAttachment').click();await page.locator('[data-insert-kind="figure"]').click();
  await page.locator('#attachmentFile').setInputFiles({name:'figure.png',mimeType:'image/png',buffer:image});await page.locator('#attachmentCaption').fill('图示标题');await page.locator('#attachmentSubmit').click();
  await expect(body.locator('figure')).toHaveCount(1);await expect(body.locator('p').first()).toHaveText('前文');await expect(body.locator('p').last()).toHaveText('后文');
  await expect(body.locator('figcaption')).toContainText('图 1-1 图示标题');
  await body.locator('[data-image-action="edit"]').click();await page.locator('#attachmentCaption').fill('更新图题');await page.locator('#attachmentSubmit').click();
  await expect(body.locator('figcaption')).toContainText('更新图题');await page.locator('#undoEdit').click();await expect(body.locator('figcaption')).toContainText('图示标题');
});
test('references insert as superscripts and repeated citations reuse their number',async({page})=>{
  await enter(page);const body=page.locator('[data-manuscript]').first();await body.fill('前文后文');await caret(page);
  await page.locator('#addAttachment').click();await page.locator('[data-insert-kind="reference"]').click();
  await page.locator('#reference-authors').fill('张三');await page.locator('#reference-title').fill('测试文献');await page.locator('#reference-source').fill('测试期刊');await page.locator('#reference-year').fill('2026');await page.locator('#referenceForm button[type="submit"]').click();
  await expect(body.locator('sup')).toHaveText('[1]');await caret(page,1);await page.locator('#addAttachment').click();await page.locator('[data-insert-kind="reference"]').click();await page.locator('[data-use-reference]').first().click();
  await expect(body.locator('sup')).toHaveCount(2);await expect(body.locator('sup').nth(1)).toHaveText('[1]');
  await page.locator('#editRequirements').click();await page.locator('#startWriting').click();await expect(body.locator('sup')).toHaveCount(2);
});
test('Word export produces an editable DOCX without authentication',async({page})=>{
  await enter(page);await page.locator('[data-manuscript]').first().fill('可继续编辑的正文。');
  const downloadPromise=page.waitForEvent('download');await page.locator('#exportWord').click();const download=await downloadPromise;expect(download.suggestedFilename()).toMatch(/\.docx$/);
});
test('missing AI configuration is explicit and never enters a simulated editor',async({page})=>{
  await page.unroute('**/api/requirements/parse');await page.locator('#requirementsInput').fill('A4纸，正文宋体小四。');await page.locator('#startWriting').click();await expect(page.locator('#requirementsError')).toContainText('尚未配置');await expect(page.locator('#workbench')).toBeHidden();
});
test('a manuscript with images survives a refresh through the IndexedDB draft store',async({page})=>{
  await enter(page);const body=page.locator('[data-manuscript]').first();await body.fill('保存前文保存后文');await caret(page,4);
  await page.locator('#addAttachment').click();await page.locator('[data-insert-kind="table"]').click();
  await page.locator('#attachmentFile').setInputFiles({name:'table.png',mimeType:'image/png',buffer:image});await page.locator('#attachmentCaption').fill('持久化表格');await page.locator('#attachmentSubmit').click();
  await expect(page.locator('#saveState')).toContainText('已保存到本机');await page.reload();await page.locator('#continueDraft').click();await expect(body.locator('figure')).toHaveCount(1);await expect(body.locator('figcaption')).toContainText('表 1-1 持久化表格');await expect(body).toContainText('保存后文');
});
test('moving an image to another chapter keeps the target caret and renumbers it',async({page})=>{
  await enter(page);const bodies=page.locator('[data-manuscript]');await bodies.first().fill('原章节正文');await caret(page,2);
  await page.locator('#addAttachment').click();await page.locator('[data-insert-kind="figure"]').click();await page.locator('#attachmentFile').setInputFiles({name:'move.png',mimeType:'image/png',buffer:image});await page.locator('#attachmentCaption').fill('可移动图片');await page.locator('#attachmentSubmit').click();await expect(bodies.first().locator('figure')).toHaveCount(1);
  const target=bodies.nth(3);await target.fill('目标前文目标后文');await target.evaluate(el=>{el.focus();const range=document.createRange();range.setStart(document.createTreeWalker(el,NodeFilter.SHOW_TEXT).nextNode(),4);range.collapse(true);const selection=window.getSelection();selection.removeAllRanges();selection.addRange(range);});
  await page.waitForTimeout(50);await bodies.first().locator('[data-image-action="move"]').click();
  await expect(bodies.first().locator('figure')).toHaveCount(0);await expect(target.locator('figure')).toHaveCount(1);await expect(target.locator('figcaption')).toContainText('图 2-1');await expect(target.locator('p').first()).toHaveText('目标前文');await expect(target.locator('p').last()).toHaveText('目标后文');
});
