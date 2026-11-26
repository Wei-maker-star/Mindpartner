(() => {
  const encoder = new TextEncoder();
  const xml = value => String(value ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;');
  const bytes = value => encoder.encode(value);
  const u16 = value => [value & 255, value >>> 8 & 255];
  const u32 = value => [value & 255, value >>> 8 & 255, value >>> 16 & 255, value >>> 24 & 255];
  function crc32(data) { let crc = 0xffffffff; for (const byte of data) { crc ^= byte; for (let i = 0; i < 8; i += 1) crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0); } return (crc ^ 0xffffffff) >>> 0; }
  function zip(files) {
    const locals = [], centrals = []; let offset = 0;
    for (const [name, content] of Object.entries(files)) {
      const fileName = bytes(name), data = bytes(content), crc = crc32(data), local = new Uint8Array([0x50,0x4b,0x03,0x04,...u16(20),...u16(0x800),...u16(0),...u16(0),...u16(33),...u32(crc),...u32(data.length),...u32(data.length),...u16(fileName.length),...u16(0),...fileName,...data]);
      locals.push(local);
      centrals.push(new Uint8Array([0x50,0x4b,0x01,0x02,...u16(20),...u16(20),...u16(0x800),...u16(0),...u16(0),...u16(33),...u32(crc),...u32(data.length),...u32(data.length),...u16(fileName.length),...u16(0),...u16(0),...u16(0),...u16(0),...u32(0),...u32(offset),...fileName]));
      offset += local.length;
    }
    const centralSize = centrals.reduce((sum, item) => sum + item.length, 0), end = new Uint8Array([0x50,0x4b,0x05,0x06,...u16(0),...u16(0),...u16(centrals.length),...u16(centrals.length),...u32(centralSize),...u32(offset),...u16(0)]);
    return new Blob([...locals, ...centrals, end], { type: 'application/vnd.openxmlformats-officedocument.presentationml.presentation' });
  }
  function run(text, size = 2200, color = '263B33', bold = false) {
    return `<a:r><a:rPr lang="zh-CN" sz="${size}"${bold ? ' b="1"' : ''}><a:solidFill><a:srgbClr val="${color}"/></a:solidFill><a:latin typeface="Microsoft YaHei"/><a:ea typeface="Microsoft YaHei"/></a:rPr><a:t xml:space="preserve">${xml(text)}</a:t></a:r>`;
  }
  function shape(id, name, x, y, w, h, paragraphs, fill = 'FFFFFF', rounded = true, geometry = null) {
    const body = paragraphs.map(item => `<a:p><a:pPr algn="${item.align || 'l'}" marB="${item.gap || 900}"><a:buNone/></a:pPr>${run(item.text, item.size, item.color, item.bold)}<a:endParaRPr lang="zh-CN"/></a:p>`).join('');
    return `<p:sp><p:nvSpPr><p:cNvPr id="${id}" name="${xml(name)}"/><p:cNvSpPr/><p:nvPr/></p:nvSpPr><p:spPr><a:xfrm><a:off x="${x}" y="${y}"/><a:ext cx="${w}" cy="${h}"/></a:xfrm><a:prstGeom prst="${geometry || (rounded ? 'roundRect' : 'rect')}"><a:avLst/></a:prstGeom><a:solidFill><a:srgbClr val="${fill}"/></a:solidFill><a:ln><a:noFill/></a:ln></p:spPr><p:txBody><a:bodyPr wrap="square" lIns="220000" rIns="220000" tIns="180000" bIns="150000"/><a:lstStyle/>${body}</p:txBody></p:sp>`;
  }
  function interactiveVisual(visual) {
    if (!visual) return '';
    let shapes = [], id = 20;
    if (visual.type === 'storyTree') {
      shapes.push(shape(id++, 'story-root', 3700000, 2750000, 4700000, 620000, [{ text: '🌱 小芽：彩排时突然忘词', size: 1800, color: '326C5D', bold: true, align: 'ctr' }], 'E5F2E8'));
      const cards = [['停一下 · 看看周围', 850000, 'E8F0FB'], ['求助 · 找搭档', 4200000, 'FFF1D6'], ['调整 · 换种方式', 7550000, 'F5EAF7']];
      cards.forEach(([label, x, fill]) => shapes.push(shape(id++, 'story-branch', x, 4050000, 3100000, 800000, [{ text: `↓\n${label}`, size: 1600, color: '354A40', bold: true, align: 'ctr' }], fill)));
      shapes.push(shape(id++, 'story-endings', 1900000, 5200000, 8200000, 620000, [{ text: '每条枝条都通向不同的支持与小结局  ·  没有标准答案', size: 1550, color: '718078', align: 'ctr' }], 'F3F6F2'));
    } else if (visual.type === 'collabCanvas') {
      shapes.push(shape(id++, 'collaborative-canvas', 1300000, 2750000, 9400000, 2550000, [{ text: '共同画布：每人添一笔，让想象慢慢长出来', size: 1900, color: '96A59A', align: 'ctr' }], 'FFFFFF'));
      const colors = ['326C5D','E67C65','E5B94E','718AC7','9B78B5','55A6AA','F08AAD'];
      colors.forEach((color, i) => shapes.push(shape(id++, `paint-color-${i}`, 1900000 + i * 760000, 5500000, 360000, 360000, [{ text: '', size: 100 }], color, false, 'ellipse')));
      shapes.push(shape(id++, 'eraser', 8300000, 5450000, 1900000, 480000, [{ text: '橡皮擦   ·   下载 PNG', size: 1300, color: '53645A', align: 'ctr' }], 'EAF0EA'));
    } else if (visual.type === 'auctionAnimated') {
      for (let i = 0; i < 10; i += 1) shapes.push(shape(id++, `star-token-${i}`, 1600000 + i * 850000, 2720000, 520000, 520000, [{ text: '✦', size: 2000, color: '936D16', bold: true, align: 'ctr' }], 'F6D978', false, 'ellipse'));
      const resources = (visual.options || []).slice(0, 5), palette = ['E6F1E8','E7EFF9','FFF0D5','F5EAF6','FCEAE5'];
      resources.forEach((label, i) => shapes.push(shape(id++, `resource-card-${i}`, 700000 + i * 2180000, 3900000, 1950000, 1050000, [{ text: `${label}\n＋ / − 星点`, size: 1450, color: '354A40', bold: true, align: 'ctr' }], palette[i % palette.length])));
      shapes.push(shape(id++, 'gavel', 4000000, 5350000, 4100000, 580000, [{ text: '🔨   敲槌结拍   ✨', size: 1900, color: '326C5D', bold: true, align: 'ctr' }], 'FFF5D8'));
    }
    return shapes.join('');
  }
  function slideXml(title, subtitle, bodyLines, page, visual) {
    const illustrated = Boolean(visual), bodyHeight = illustrated ? 1120000 : 4100000;
    const items = [`<p:spTree><p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr><p:grpSpPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="0" cy="0"/><a:chOff x="0" y="0"/><a:chExt cx="0" cy="0"/></a:xfrm></p:grpSpPr>`,
      shape(2, 'background', 0, 0, 12192000, 6858000, [{ text: '', size: 100 }], 'F5F8F4', false),
      shape(3, 'title', 680000, 440000, 10800000, 750000, [{ text: title, size: 3000, color: '326C5D', bold: true, gap: 0 }], 'F5F8F4', false),
      shape(4, 'subtitle', 700000, 1130000, 10600000, 520000, [{ text: subtitle, size: 1500, color: '77857F', gap: 0 }], 'F5F8F4', false),
      shape(5, 'activity', 650000, 1830000, 10900000, bodyHeight, bodyLines.map(text => ({ text, size: illustrated ? 1450 : 1950, color: '354A40', gap: illustrated ? 300 : 1450 })), 'FFFFFF', true),
      interactiveVisual(visual),
      shape(6, 'footer', 10500000, 6280000, 1000000, 300000, [{ text: String(page).padStart(2, '0'), size: 1200, color: '91A198', align: 'r', gap: 0 }], 'F5F8F4', false), '</p:spTree>'].join('');
    return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><p:sld xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"><p:cSld><p:bg><p:bgPr><a:solidFill><a:srgbClr val="F5F8F4"/></a:solidFill><a:effectLst/></p:bgPr></p:bg>${items}</p:cSld><p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr></p:sld>`;
  }
  function buildPresentation(game) {
    const steps = Array.isArray(game.steps) ? game.steps : (typeof gamePlaybooks !== 'undefined' ? gamePlaybooks[game.title] || [] : []);
    const slides = [{ title: `${game.icon || '🌱'} ${game.title}`, subtitle: `${game.category || '心理课堂活动'} · 课堂活动步骤`, lines: [`活动目标：${game.desc || game.goal || '提供一个轻松、可选择的表达与探索机会。'}`, `适用对象：${game.people || '个人或小组'}`, `风险与带领：${game.risk || '教师审核后使用'}`, '参与原则：可选择、可跳过、不要求分享隐私。'] }];
    steps.forEach((step, index) => slides.push({ title: `第 ${index + 1} 步｜${step.title || '活动步骤'}`, subtitle: '教师可投屏逐步引导；学生可自主选择参与方式。', visual: ['storyTree','collabCanvas','auctionAnimated'].includes(step.type) ? step : null, lines: [step.prompt || '', ...(step.options?.length ? [`可选回应：${step.options.join(' / ')}`] : []), ...(step.type === 'draw' || step.type === 'collabCanvas' ? ['创作提示：学生可使用多色画笔、橡皮擦并下载 PNG。'] : []), ...(step.type === 'auctionAnimated' ? ['互动方式：十枚虚拟星点可分配给不同支持资源，敲槌后一起回看。'] : []), ...(step.type === 'storyTree' ? ['分支流程：暂停观察 / 向同伴求助 / 调整计划 → 继续探索不同结局。'] : []), ...(step.type === 'timer' ? [`建议时长：${step.seconds || 20} 秒；全程保持舒适，不适时立即停止。`] : []), '引导提示：给学生思考和跳过的空间，不评价答案对错。'].filter(Boolean) }));
    slides.push({ title: '结束与回看', subtitle: '分享完全自愿；不对作品、选择或表达作诊断。', lines: ['可以邀请学生说说想带走的一个小发现，也可以安静结束。', '如果学生表达严重困扰或安全风险，暂停活动，依学校流程联系心理老师或专业支持。', 'AI 生成内容为教育活动草稿，教师应结合学情审核后使用。'] });
    if (Array.isArray(game.sources) && game.sources.length) slides.push({ title: '设计参考与来源', subtitle: '公开研究用于启发互动形式；不代表该游戏经过临床验证。', lines: game.sources.slice(0, 5).map(source => `${source.title}\n${source.url}`) });
    return packageSlides(slides);
  }
  window.downloadLessonSlides = function (slides) {
    const url = URL.createObjectURL(packageSlides(slides));
    const link = document.createElement('a');
    link.href = url;
    link.download = slides[0].title.replace(/[\\/:*?"<>|]/g, '_') + '.pptx';
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 10000);
  };
  function packageSlides(slides) {
    const rels = slides.map((_, i) => `<Relationship Id="rId${i + 2}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slide" Target="slides/slide${i + 1}.xml"/>`).join('');
    const slideIds = slides.map((_, i) => `<p:sldId id="${256 + i}" r:id="rId${i + 2}"/>`).join('');
    const files = {
      '[Content_Types].xml': `<?xml version="1.0" encoding="UTF-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/ppt/presentation.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.presentation.main+xml"/><Override PartName="/ppt/slideMasters/slideMaster1.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slideMaster+xml"/><Override PartName="/ppt/slideLayouts/slideLayout1.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slideLayout+xml"/><Override PartName="/ppt/theme/theme1.xml" ContentType="application/vnd.openxmlformats-officedocument.theme+xml"/>${slides.map((_, i) => `<Override PartName="/ppt/slides/slide${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slide+xml"/>`).join('')}</Types>`,
      '_rels/.rels': '<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="ppt/presentation.xml"/></Relationships>',
      'ppt/presentation.xml': `<?xml version="1.0" encoding="UTF-8"?><p:presentation xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"><p:sldMasterIdLst><p:sldMasterId id="2147483648" r:id="rId1"/></p:sldMasterIdLst><p:sldIdLst>${slideIds}</p:sldIdLst><p:sldSz cx="12192000" cy="6858000" type="wide"/><p:notesSz cx="6858000" cy="9144000"/></p:presentation>`,
      'ppt/_rels/presentation.xml.rels': `<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideMaster" Target="slideMasters/slideMaster1.xml"/>${rels}</Relationships>`,
      'ppt/slideMasters/slideMaster1.xml': '<?xml version="1.0" encoding="UTF-8"?><p:sldMaster xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"><p:cSld><p:spTree><p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr><p:grpSpPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="0" cy="0"/><a:chOff x="0" y="0"/><a:chExt cx="0" cy="0"/></a:xfrm></p:grpSpPr></p:spTree></p:cSld><p:clrMap bg1="lt1" tx1="dk1" bg2="lt2" tx2="dk2" accent1="accent1" accent2="accent2" accent3="accent3" accent4="accent4" accent5="accent5" accent6="accent6" hlink="hlink" folHlink="folHlink"/><p:sldLayoutIdLst><p:sldLayoutId id="1" r:id="rId1"/></p:sldLayoutIdLst><p:txStyles><p:titleStyle><a:lvl1pPr><a:defRPr sz="3000"/></a:lvl1pPr></p:titleStyle><p:bodyStyle><a:lvl1pPr><a:defRPr sz="1800"/></a:lvl1pPr></p:bodyStyle><p:otherStyle><a:lvl1pPr><a:defRPr sz="1600"/></a:lvl1pPr></p:otherStyle></p:txStyles></p:sldMaster>',
      'ppt/slideMasters/_rels/slideMaster1.xml.rels': '<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideLayout" Target="../slideLayouts/slideLayout1.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/theme" Target="../theme/theme1.xml"/></Relationships>',
      'ppt/slideLayouts/slideLayout1.xml': '<?xml version="1.0" encoding="UTF-8"?><p:sldLayout xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main" type="blank" preserve="1"><p:cSld name="Blank"><p:spTree><p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr><p:grpSpPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="0" cy="0"/><a:chOff x="0" y="0"/><a:chExt cx="0" cy="0"/></a:xfrm></p:grpSpPr></p:spTree></p:cSld><p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr></p:sldLayout>',
      'ppt/slideLayouts/_rels/slideLayout1.xml.rels': '<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideMaster" Target="../slideMasters/slideMaster1.xml"/></Relationships>',
      'ppt/theme/theme1.xml': '<?xml version="1.0" encoding="UTF-8"?><a:theme xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" name="Xinban"><a:themeElements><a:clrScheme name="Xinban"><a:dk1><a:srgbClr val="263B33"/></a:dk1><a:lt1><a:srgbClr val="FFFFFF"/></a:lt1><a:dk2><a:srgbClr val="326C5D"/></a:dk2><a:lt2><a:srgbClr val="F5F8F4"/></a:lt2><a:accent1><a:srgbClr val="326C5D"/></a:accent1><a:accent2><a:srgbClr val="E5B94E"/></a:accent2><a:accent3><a:srgbClr val="E67C65"/></a:accent3><a:accent4><a:srgbClr val="718AC7"/></a:accent4><a:accent5><a:srgbClr val="9B78B5"/></a:accent5><a:accent6><a:srgbClr val="89B59E"/></a:accent6><a:hlink><a:srgbClr val="326C5D"/></a:hlink><a:folHlink><a:srgbClr val="718AC7"/></a:folHlink></a:clrScheme><a:fontScheme name="Xinban"><a:majorFont><a:latin typeface="Microsoft YaHei"/><a:ea typeface="Microsoft YaHei"/></a:majorFont><a:minorFont><a:latin typeface="Microsoft YaHei"/><a:ea typeface="Microsoft YaHei"/></a:minorFont></a:fontScheme><a:fmtScheme name="Xinban"><a:fillStyleLst><a:solidFill><a:schemeClr val="phClr"/></a:solidFill><a:solidFill><a:schemeClr val="phClr"/></a:solidFill><a:solidFill><a:schemeClr val="phClr"/></a:solidFill></a:fillStyleLst><a:lnStyleLst><a:ln w="9525" cap="flat" cmpd="sng" algn="ctr"><a:solidFill><a:schemeClr val="phClr"/></a:solidFill><a:prstDash val="solid"/><a:miter lim="800000"/></a:ln><a:ln w="25400" cap="flat" cmpd="sng" algn="ctr"><a:solidFill><a:schemeClr val="phClr"/></a:solidFill><a:prstDash val="solid"/><a:miter lim="800000"/></a:ln><a:ln w="38100" cap="flat" cmpd="sng" algn="ctr"><a:solidFill><a:schemeClr val="phClr"/></a:solidFill><a:prstDash val="solid"/><a:miter lim="800000"/></a:ln></a:lnStyleLst><a:effectStyleLst><a:effectStyle><a:effectLst/></a:effectStyle><a:effectStyle><a:effectLst/></a:effectStyle><a:effectStyle><a:effectLst/></a:effectStyle></a:effectStyleLst><a:bgFillStyleLst><a:solidFill><a:schemeClr val="phClr"/></a:solidFill><a:solidFill><a:schemeClr val="phClr"/></a:solidFill><a:solidFill><a:schemeClr val="phClr"/></a:solidFill></a:bgFillStyleLst></a:fmtScheme></a:themeElements></a:theme>'
    };
    slides.forEach((slide, index) => {
      files[`ppt/slides/slide${index + 1}.xml`] = slideXml(slide.title, slide.subtitle, slide.lines, index + 1, slide.visual);
      files[`ppt/slides/_rels/slide${index + 1}.xml.rels`] = '<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideLayout" Target="../slideLayouts/slideLayout1.xml"/></Relationships>';
    });
    return zip(files);
  }
  window.exportGamePpt = function (gameOrId) {
    const game = typeof gameOrId === 'string' ? (window.XINBAN_GAME_CATALOG || []).find(item => item.id === gameOrId) || (gameOrId.startsWith('legacy-') ? games[Number(gameOrId.slice(7))] : null) : gameOrId;
    if (!game) { window.toast?.('找不到游戏内容，请重新打开游戏库。'); return; }
    const blob = buildPresentation(game), url = URL.createObjectURL(blob), link = document.createElement('a');
    link.href = url; link.download = `${String(game.title || '心理课堂游戏').replace(/[\\/:*?"<>|]/g, '_')}.pptx`; link.click(); setTimeout(() => URL.revokeObjectURL(url), 2000);
    window.toast?.('已导出课堂步骤 PPTX');
  };
})();
