// Connect the prototype UI to the local backend and provide an iterative teacher agent chat.
let conversationHistory = [];
let sendingStudentMessage = false;
let teacherHistory = [];
let teacherSending = false;
let teacherDraftId = "";
let teacherDraftTitle = "";
let teacherDraftKind = '备课对话';
let activeUserRole = null;
let practiceProgress = { completed: 0, nextAccessory: 5, nextOutfit: 20 };
const animalOptions = { abstract: '心伴芽', cat: '芽芽猫', rabbit: '芽芽兔', fox: '芽芽狐', bear: '芽芽熊' };
let profileKey = 'default';
let companionAnimal = localStorage.getItem(`xinban.companion.animal.${profileKey}`) || 'abstract';
let companionProfile = null;
try { localStorage.removeItem('xinban.companion.profile'); } catch {}
let dailyAppearance = null;
try { dailyAppearance = JSON.parse(localStorage.getItem(`xinban.companion.appearance.${profileKey}`) || 'null'); } catch {}
function getPersistentId(key) {
  try {
    let id = localStorage.getItem(key);
    if (!id) { id = crypto.randomUUID ? crypto.randomUUID() : `id_${Date.now()}_${Math.random().toString(36).slice(2)}`; localStorage.setItem(key, id); }
    return id;
  } catch { return `id_${Date.now()}_${Math.random().toString(36).slice(2)}`; }
}
let memoryStudentId = getPersistentId('xinban.student.id');
let privateConversationId = getPersistentId('xinban.private.conversation');
let privateMessages = [];

async function saveGamePreference(event, recommendation) {
  if (!recommendation?.offerId || !recommendation?.id) return false;
  try {
    const response = await fetch('/api/student/game-preference', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ offerId: recommendation.offerId, gameId: recommendation.id, event }) });
    return response.ok;
  } catch { return false; }
}

function addChatMessage(role, content, showActivity = false, containerId = 'messages') {
  const row = document.createElement('div');
  row.className = role === 'user' ? 'msg user' : 'msg';
  if (role !== 'user') {
    const icon = document.createElement('span'); icon.className = 'tiny'; icon.innerHTML = role === 'teacher' ? '✦' : companionAvatarSvg(companionAnimal, 'chat-avatar'); row.append(icon);
  }
  const bubble = document.createElement('div'); bubble.className = 'bubble'; bubble.innerHTML = role === 'user' ? escapeHtml(content) : renderMarkdown(content);
  if (showActivity && containerId === 'messages') {
    const recommendation = typeof showActivity === 'object' ? showActivity : null;
    if (recommendation?.id) {
      const card = document.createElement('div'); card.className = 'recommended-game-card';
      const title = document.createElement('b'); title.textContent = `🌱 一起试试：${recommendation.title}`;
      const reason = document.createElement('p'); reason.textContent = recommendation.reason || '这是一个可以自己决定是否参加的小练习。';
      const actions = document.createElement('div'); actions.className = 'recommended-game-actions';
      const start = document.createElement('button'); start.className = 'btn small primary'; start.textContent = '\u5f00\u59cb\u6e38\u620f'; start.onclick = () => startRecommendedGame(recommendation.id, recommendation.offerId);
      const skip = document.createElement('button'); skip.className = 'btn small'; skip.textContent = '\u5148\u8df3\u8fc7'; skip.onclick = async () => { await saveGamePreference('skipped', recommendation); const note = document.createElement('span'); note.textContent = '\u597d\u7684\uff0c\u5148\u4e0d\u73a9\u4e5f\u6ca1\u5173\u7cfb\u3002'; actions.replaceChildren(note); };
      actions.append(start, skip); card.append(title, reason, actions); bubble.append(document.createElement('br'), card);
    }
  }
  row.append(bubble);
  if (role === 'user') { const icon = document.createElement('span'); icon.className = 'tiny'; icon.textContent = '🙂'; row.append(icon); }
  const messages = document.getElementById(containerId); messages.append(row); messages.scrollTop = messages.scrollHeight;
}

function renderMarkdown(value) {
  const escaped = String(value || '').replace(/\\([*_`])/g, '$1').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  const inline = line => line
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/(?<!\*)\*([^*\n]+)\*(?!\*)/g, '<em>$1</em>')
    .replace(/\*/g, '');
  const lines = escaped.split(/\r?\n/), out = [];
  let list = '';
  const flush = () => { if (list) { out.push(`<ul>${list}</ul>`); list = ''; } };
  for (const raw of lines) {
    const line = raw.trim();
    if (!line) { flush(); continue; }
    const heading = line.match(/^(#{1,3})\s+(.+)$/);
    const bullet = line.match(/^[-+]\s+(.+)$/);
    const numbered = line.match(/^\d+[.)]\s+(.+)$/);
    if (bullet || numbered) { list += `<li>${inline((bullet || numbered)[1])}</li>`; continue; }
    flush();
    if (heading) out.push(`<h${heading[1].length}>${inline(heading[2])}</h${heading[1].length}>`);
    else if (/^---+$/.test(line)) out.push('<hr>');
    else out.push(`<p>${inline(line)}</p>`);
  }
  flush();
  return out.join('');
}

function setProgress(containerId, text) {
  const box = document.getElementById(containerId);
  box.innerHTML = `<div class="agent-progress"><div class="agent-progress-label"><span class="agent-spinner"></span><span>${text}</span></div><div class="agent-progress-track"><i></i></div></div>`;
}
function clearProgress(containerId) { document.getElementById(containerId)?.replaceChildren(); }

window.openPlan = function (resource = null) {
  teacherHistory = resource ? parseTeacherResource(resource.content) : []; teacherSending = false; teacherDraftId = resource?.id || (crypto.randomUUID ? crypto.randomUUID() : `draft_${Date.now()}_${Math.random().toString(36).slice(2)}`); teacherDraftTitle = resource?.title || ''; teacherDraftKind = resource?.kind || '备课对话';
  document.getElementById('modalTitle').textContent = '备课 Agent';
  const form = document.getElementById('planForm');
  form.style.display = 'block';
  document.getElementById('planResult').style.display = 'none';
  form.innerHTML = `<div class="agent-intro"><div class="agent-spark">✦</div><div><b>你好，我是你的备课 Agent</b><small>告诉我学段、班级、课时、主题和你想要的课堂体验。之后可以继续在这里修改。</small></div></div>
    <div id="teacherAgentMessages" class="agent-messages"></div><div id="teacherAgentProgress"></div>
    <div class="agent-compose"><textarea id="teacherChatInput" placeholder="例如：为七年级 2 班设计 8 课时的学业压力课程，侧重自我关怀；先给我学期大纲。" onkeydown="if(event.key==='Enter'&&!event.shiftKey){event.preventDefault();sendTeacherChat()}"></textarea>
    <div class="agent-compose-foot"><span>Enter 发送 · Shift + Enter 换行</span><button id="teacherSendButton" class="btn primary" onclick="sendTeacherChat()">发送 ↑</button></div></div>
    <div class="modal-actions"><button class="btn" onclick="closeModal()">关闭</button></div>`;
  document.querySelector('.modal').classList.add('agent-modal');
  document.getElementById('modalback').classList.add('show');
  if (teacherHistory.length) teacherHistory.forEach(item => addChatMessage(item.role === 'user' ? 'user' : 'teacher', item.content, false, 'teacherAgentMessages'));
  else addChatMessage('teacher', '把你的备课想法发给我。我可以先整理课程大纲，再继续生成单课教案、PPT 大纲和配套游戏。', false, 'teacherAgentMessages');
  setTimeout(() => document.getElementById('teacherChatInput')?.focus(), 50);
};

window.sendTeacherChat = async function () {
  if (teacherSending) return;
  const input = document.getElementById('teacherChatInput');
  const message = input?.value.trim();
  if (!message) { toast('先写下你的备课需求'); return; }
  teacherSending = true;
  addChatMessage('user', message, false, 'teacherAgentMessages'); input.value = '';
  const button = document.getElementById('teacherSendButton'); button.disabled = true;
  setProgress('teacherAgentProgress', 'Agent 正在理解需求并整理课程内容…');
  const progressTimer = setTimeout(() => setProgress('teacherAgentProgress', '正在组织课程方案，马上就好…'), 5000);
  try {
    const response = await fetch('/api/teacher/chat', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ message, history: teacherHistory })
    });
    const data = await response.json(); if (!response.ok) throw new Error(data.error || '生成失败');
    teacherHistory.push({ role: 'user', content: message }, { role: 'assistant', content: data.reply });
    teacherHistory = teacherHistory.slice(-12);
    await persistTeacherDraft(message, data.reply);
    clearProgress('teacherAgentProgress'); addChatMessage('teacher', data.reply, false, 'teacherAgentMessages');
  } catch (error) {
    clearProgress('teacherAgentProgress'); addChatMessage('teacher', error.message || '暂时无法连接，请稍后重试。', false, 'teacherAgentMessages');
  } finally { clearTimeout(progressTimer); teacherSending = false; button.disabled = false; input.focus(); }
};

window.generatePlan = async function () {
  const button = document.querySelector('#planForm .btn.primary');
  if (!button) return;
  const original = button.textContent; button.disabled = true; button.textContent = '正在生成…';
  try {
    const response = await fetch('/api/teacher/outline', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ stage: document.getElementById('stage').value, className: document.getElementById('className').value, weeks: document.getElementById('weeks').value, theme: document.getElementById('theme').value, prompt: document.getElementById('prompt').value })
    });
    const data = await response.json(); if (!response.ok) throw new Error(data.error || '生成失败');
    document.getElementById('planReply').textContent = `${data.draft}\n\n—— AI 生成草稿 · 请教师审核后使用`;
    document.getElementById('planForm').style.display = 'none'; document.getElementById('planResult').style.display = 'block';
  } catch (error) { toast(error.message || '操作失败，请稍后重试。'); }
  finally { button.disabled = false; button.textContent = original; }
};

window.sendText = async function (message) {
  if (sendingStudentMessage || !message.trim()) return;
  sendingStudentMessage = true; addChatMessage('user', message); privateMessages.push({ role: 'user', content: message, createdAt: new Date().toISOString() });
  const button = document.querySelector('.chat-input button'); button.disabled = true;
  const progress = document.createElement('div'); progress.id = 'studentProgress'; document.querySelector('.chat-suggestions').before(progress);
  setProgress('studentProgress', '棉棉正在认真听…');
  try {
    const response = await fetch('/api/student/chat', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ message, studentId: memoryStudentId, conversationId: privateConversationId, scope: 'private', ...companionRequestContext() }) });
    const data = await response.json(); if (!response.ok) throw new Error(data.error || '暂时无法连接');
    clearProgress('studentProgress'); addChatMessage('assistant', data.reply, data.safetyEscalation ? false : data.recommendation || false);
    privateMessages.push({ role: 'assistant', content: data.reply, createdAt: new Date().toISOString() });
    conversationHistory.push({ role: 'user', content: message }, { role: 'assistant', content: data.reply }); conversationHistory = conversationHistory.slice(-12);
    refreshDailyAppearance();
  } catch (error) {
    clearProgress('studentProgress'); addChatMessage('assistant', `${error.message || '暂时无法连接'}。请稍后再试；如果你需要马上找人帮忙，请联系信任的大人或学校心理老师。`);
  } finally { sendingStudentMessage = false; button.disabled = false; }
};
window.sendChat = function () { const input = document.getElementById('chatInput'); const message = input.value.trim(); if (!message || sendingStudentMessage) return; input.value = ''; window.sendText(message); };

const agentStyle = document.createElement('style');
agentStyle.textContent = `.agent-modal{width:min(760px,100%);height:min(85vh,820px);display:flex;flex-direction:column}.agent-modal #planForm{display:flex!important;flex-direction:column;min-height:0;flex:1}.agent-intro{display:flex;gap:13px;align-items:center;padding:12px 14px;background:#f1f6f1;border-radius:12px;margin-bottom:12px}.agent-spark{width:38px;height:38px;border-radius:12px;background:white;color:#326c5d;display:grid;place-items:center;font-size:22px}.agent-intro b{font-size:13px}.agent-intro small{display:block;color:#77857f;font-size:11px;line-height:1.6;margin-top:4px}.agent-messages{flex:1;min-height:150px;overflow:auto;padding:6px 2px}.agent-messages .msg{align-items:flex-start}.agent-messages .bubble{white-space:pre-wrap;max-width:90%}.agent-messages .msg:not(.user) .bubble{background:#f1f5f0}.agent-progress{padding:7px 4px 12px;color:#6f8177;font-size:11px}.agent-progress-label{display:flex;align-items:center;gap:8px;margin-bottom:8px}.agent-progress-track{height:5px;border-radius:99px;background:#edf1ec;overflow:hidden}.agent-progress-track i{height:100%;display:block;width:32%;border-radius:99px;background:#68a083;animation:agent-progress 1.25s ease-in-out infinite alternate}@keyframes agent-progress{from{transform:translateX(0)}to{transform:translateX(205%)}}.agent-spinner{width:13px;height:13px;border:2px solid #d9e7de;border-top-color:#468367;border-radius:50%;animation:agent-spin .75s linear infinite}@keyframes agent-spin{to{transform:rotate(360deg)}}.agent-compose{border:1px solid #e4eae4;border-radius:12px;padding:9px;background:#fff}.agent-compose textarea{width:100%;min-height:74px;max-height:150px;resize:vertical;border:0;outline:0;margin:0;padding:6px;font:inherit;font-size:13px}.agent-compose-foot{display:flex;align-items:center;justify-content:space-between;color:#9aa49e;font-size:10px}.agent-compose-foot .btn{padding:8px 14px}.agent-modal>.modal-actions{margin-top:8px}.agent-modal .agent-messages .msg .tiny{color:#547a66;background:#edf5ef;border-radius:50%;width:27px;height:27px;text-align:center;line-height:27px;font-size:14px;flex:none}`;
document.head.append(agentStyle);
const fullScreenAgentStyle = document.createElement('style');
fullScreenAgentStyle.textContent = `.agent-modal{width:min(96vw,1600px)!important;height:94vh!important;max-height:94vh}.agent-modal .agent-messages .bubble{white-space:normal}.agent-messages .bubble p,.game-agent-message p{margin:.45em 0}.agent-messages .bubble h1,.agent-messages .bubble h2,.agent-messages .bubble h3,.game-agent-message h1,.game-agent-message h2,.game-agent-message h3{margin:.5em 0;font-size:1.05em}.agent-messages .bubble ul,.game-agent-message ul{padding-left:1.35em;margin:.4em 0}.agent-messages .bubble li,.game-agent-message li{margin:.22em 0}.agent-messages .bubble code,.game-agent-message code{background:#e7eee8;padding:2px 5px;border-radius:4px}.game-editor-back{position:fixed;inset:0;z-index:120;background:#18312675;display:none;align-items:center;justify-content:center;padding:2vh 2vw}.game-editor-back.show{display:flex}.game-editor-modal{width:min(96vw,1600px);height:94vh;background:#fff;border-radius:20px;box-shadow:0 22px 80px #172d2450;display:flex;flex-direction:column;overflow:hidden}.game-editor-head{display:flex;align-items:center;justify-content:space-between;padding:15px 22px;border-bottom:1px solid #e8eee9}.game-editor-head h2{font-size:19px;margin:2px 0}.game-editor-head small{font-size:10px;color:#829187}.game-editor-grid{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);gap:16px;padding:16px;min-height:0;flex:1;background:#f8faf8}.game-preview-pane,.game-agent-pane{background:#fff;border:1px solid #e5ece6;border-radius:15px;min-height:0;display:flex;flex-direction:column;padding:17px}.game-preview-pane{overflow:auto}.game-preview-meta{font-size:11px;color:#728279;margin:4px 0 14px;line-height:1.6}.game-preview-card{background:#f1f6f1;border-radius:14px;padding:20px;min-height:240px}.game-preview-card h3{font-size:18px;margin:0 0 12px}.game-preview-card p{font-size:14px;line-height:1.8;white-space:pre-wrap}.game-preview-choices{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:9px;margin-top:16px}.game-preview-choices button{background:#fff;border:1px solid #dfe9e1;border-radius:10px;padding:11px;text-align:left}.game-preview-choices button.selected{background:#e1f0e4;border-color:#79a98d;color:#285e4c}.game-preview-input{width:100%;min-height:86px;border:1px solid #dfe8df;border-radius:10px;padding:11px;font:inherit;margin-top:12px;resize:vertical}.game-preview-controls{display:flex;justify-content:space-between;gap:8px;margin-top:14px}.game-preview-step{font-size:11px;color:#7d8d82}.game-agent-pane{gap:10px}.game-agent-intro{padding:11px 13px;background:#f1f6f1;border-radius:11px;font-size:12px;color:#52665a;line-height:1.6}.game-agent-messages{flex:1;min-height:120px;overflow:auto;border:1px solid #eef1ee;border-radius:11px;padding:11px}.game-agent-message{font-size:12px;line-height:1.65;margin:8px 0;padding:10px 12px;border-radius:11px;background:#f2f6f2;white-space:normal;overflow-wrap:anywhere}.game-agent-message.user{margin-left:12%;background:#326c5d;color:#fff}.game-agent-compose{display:flex;gap:9px;align-items:flex-end;border:1px solid #e1e9e2;border-radius:12px;padding:8px}.game-agent-compose textarea{flex:1;min-height:64px;max-height:140px;resize:vertical;border:0;outline:0;font:inherit;font-size:13px}.game-editor-footer{display:flex;justify-content:flex-end;gap:9px;padding:11px 16px;border-top:1px solid #e8eee9}.game-preview-timer{text-align:center;font-size:28px;margin:12px}.resource-empty{padding:22px;color:#77857f;font-size:13px}@media(max-width:800px){.game-editor-back{padding:0}.game-editor-modal{width:100vw;height:100dvh;border-radius:0}.game-editor-grid{grid-template-columns:1fr;overflow:auto}.game-preview-pane,.game-agent-pane{min-height:420px}.game-editor-footer{flex-wrap:wrap}.agent-modal{width:100vw!important;height:100dvh!important;max-height:100dvh;border-radius:0}}`;
document.head.append(fullScreenAgentStyle);

const gamePlaybooks = {
  '压力外化卡片': [
    { title: '给压力选一张天气卡', prompt: '如果现在的压力像一种天气，它更像什么？选择最接近的，不需要解释。', options: ['毛毛雨', '大风天', '闷热的雾', '雷阵雨', '晴天里的一小片云'] },
    { title: '给它一个形状', prompt: '如果愿意，给这份压力画面取个名字，或写下它最常出现的时刻。也可以跳过。', type: 'text', placeholder: '写一点点就好……' },
    { title: '找到一件小小能做的事', prompt: '接下来哪一种小行动可能帮你多一点空间？', options: ['先做一件最小的事', '找信任的人聊聊', '休息几分钟', '把担心写下来', '我还不确定'] }
  ],
  '三分钟呼吸空间': [
    { title: '找到舒服的位置', prompt: '坐稳一些，把脚轻轻放在地上。你可以睁着眼睛，也可以随时停下。准备好后开始短练习。', type: 'timer', seconds: 20 },
    { title: '注意此刻的感觉', prompt: '现在的身体感觉更接近哪一个？没有正确答案。', options: ['松了一点', '差不多', '还有些紧', '我不确定'] },
    { title: '带走一个小发现', prompt: '接下来你想怎么照顾自己一下？', options: ['喝点水', '伸展一下', '继续手头的小事', '找人说说话', '先不决定'] }
  ],
  '我的优势花园': [
    { title: '选一颗你想种下的种子', prompt: '哪一种力量最近可能帮得上你？', options: ['好奇心', '坚持', '善于倾听', '勇气', '幽默', '我想自己选'] },
    { title: '找一个真实的小例子', prompt: '想一件最近你用到这份力量的小事。不必是大成就。', type: 'text', placeholder: '可以只写几个词……' },
    { title: '把力量带到明天', prompt: '下次遇到难事时，你愿意试试什么？', options: ['先迈一小步', '向别人请教', '给自己一点时间', '记下做到了什么', '还没想好'] }
  ],
  '心情声音地图': [
    { title: '选一段想象中的声音', prompt: '如果今天的心情是一种声音，你会选哪一个？', options: ['轻轻的雨声', '海浪声', '鸟叫声', '安静的风', '有节奏的鼓点'] },
    { title: '给声音找个位置', prompt: '这段声音像在什么地方？你可以写下一个地点、颜色或画面。', type: 'text', placeholder: '例如：窗边、蓝色、很远的山……' },
    { title: '选一个让自己舒服的声音', prompt: '接下来你想听到或创造什么声音？', options: ['喜欢的歌', '自然的声音', '安静一会儿', '和朋友聊聊', '我想自己决定'] }
  ],
  '换个角度看一看': [
    { title: '选一个常见的小想法', prompt: '遇到困难时，哪句话有时会在脑海里出现？', options: ['我一定做不好', '别人会觉得我很差', '我现在还不会', '这件事有点难', '我想自己写'] },
    { title: '试试更宽一点的说法', prompt: '选一句既承认困难、也给自己留空间的话。', options: ['我可以先试一小步', '我还在学习，不必一次做好', '我可以找人帮忙', '现在的感觉不等于全部事实', '我暂时不想改写'] },
    { title: '挑一个小实验', prompt: '你愿意尝试哪件小事，看看会发生什么？', options: ['先做五分钟', '问一个具体问题', '请人陪我开始', '安排一次休息', '暂时观察一下'] }
  ],
  '亲子倾听小夜灯': [
    { title: '选一种开始方式', prompt: '和家长一起做时，可以先选一个轻松的开场。', options: ['今天有一件小事想分享', '我想先听你说说', '我们轮流说一分钟', '先一起安静坐一会儿'] },
    { title: '练习表达一个需要', prompt: '完成这句话：“当……的时候，我会……，我希望……”可以写给自己看，不必马上分享。', type: 'text', placeholder: '你可以只写想说的那一小部分……' },
    { title: '结束时互相确认', prompt: '最后选一句你希望对方记住的话。', options: ['谢谢你听我说', '我想再找时间聊聊', '我们可以慢慢来', '今天先到这里也可以'] }
  ]
};

function gameIdFor(game) { return `game-${games.findIndex(item => item.title === game.title)}`; }
function setGameCatalogStatus(message, error = false) {
  const filterBar = document.querySelector('#planner .filters'); if (!filterBar) return;
  let status = document.getElementById('gameCatalogStatus');
  if (!status) { status = document.createElement('p'); status.id = 'gameCatalogStatus'; status.style.cssText = 'margin:10px 0;color:#718078;font-size:12px'; filterBar.after(status); }
  status.textContent = message; status.style.color = error ? '#a64032' : '#718078';
}
function renderGameCatalog(filter = 'all') {
  const grid = document.getElementById('gameGrid'); if (!grid) return;
  const selected = filter || 'all';
  grid.innerHTML = games.map((g, i) => ({ g, i })).filter(({ g }) => selected === 'all' || g.category === selected || g.tags.includes(selected)).map(({ g, i }) =>
    `<article class="game" data-game-id="${g.id || `legacy-${i}`}"><div class="gicon">${g.icon}</div><h3>${g.title}</h3><p>${g.desc}</p><div class="game-foot"><span class="pill">${g.category || g.tags[0]}</span><span style="font-size:10px;color:#8c9991">${g.people}</span></div><div class="game-action-row"><button class="btn small" onclick="editGame(${i})">预览 / 修改</button><button class="btn small" onclick="exportGamePpt('${g.id || `legacy-${i}`}')">导出 PPT</button><button class="btn small primary" onclick="publishGame(${i})">下发课堂</button></div><small class="game-risk">${g.risk}</small></article>`).join('');
  const catalog = window.XINBAN_GAME_CATALOG;
  if (Array.isArray(catalog) && catalog.length) setGameCatalogStatus(`游戏库共 ${catalog.length} 个 · 当前显示 ${grid.children.length} 个`);
}
window.renderGames = renderGameCatalog;
const activeFilter = document.querySelector('.filters .filter.on[data-filter]')?.dataset.filter || 'all';
renderGameCatalog(activeFilter);

let fullGameCatalog = [];
function makeGameSteps(game) {
  if (Array.isArray(game.steps) && game.steps.length) return game.steps;
  const close = ['我想试试', '我先看看', '我想跳过这一步'];
  const wrap = { title: '收尾：带走一个小发现', prompt: '你愿意带走哪一个小发现或下一步？也可以选择先不回答。', type: 'choice', options: ['记住一个发现', '做一件小事', '找信任的人聊聊', '先到这里'] };
  const opening = { title: '先选一种参与方式', prompt: `这是「${game.title}」。${game.desc}你可以自己完成、和同伴一起，也可以旁观或跳过。`, type: 'choice', options: ['我想自己试试', '我想和同伴一起', '我先看看', '我想跳过'] };
  const debrief = { title: '回看过程', prompt: '有没有哪个部分让你想多看一眼？只分享自己愿意分享的内容。', type: 'text', placeholder: '可以写几个词，也可以留空。' };
  if (game.id === 'story-cards') return [opening, { title: '故事树：星岛的选择', prompt: '跟着虚构角色“小芽”走进故事。每次选择都会长出不同枝条；没有标准答案，也不需要讲自己的经历。', type: 'storyTree', start: 'start', nodes: { start: { text: '小芽要参加星岛社团展示，彩排时突然忘了下一句。', options: [{ label: '先停一下，看看周围', next: 'pause' }, { label: '向搭档发出求助信号', next: 'ask' }, { label: '换一种方式继续展示', next: 'adapt' }] }, pause: { text: '小芽注意到脚下的蓝色地毯，慢慢呼了一口气。接下来想……', options: [{ label: '请搭档提示第一句话', next: 'support' }, { label: '先讲最熟悉的部分', next: 'adaptEnd' }] }, ask: { text: '搭档点点头，轻声说“我在这里”。小芽可以……', options: [{ label: '一起把展示拆成两小段', next: 'teamEnd' }, { label: '请老师帮忙调整顺序', next: 'helpEnd' }] }, adapt: { text: '小芽决定把展示改成一张图卡和一句介绍。', options: [{ label: '邀请搭档补充一个细节', next: 'teamEnd' }, { label: '先展示图卡，再慢慢说', next: 'adaptEnd' }] }, support: { text: '小芽收到提示后接上了熟悉的内容。结局：停一停、找支持和调整计划，都是可以尝试的办法。', end: true }, adaptEnd: { text: '小芽用自己舒服的节奏完成了开头。结局：改变路线也算前进。', end: true }, teamEnd: { text: '小芽和搭档分工完成展示。结局：合作可以把任务变小。', end: true }, helpEnd: { text: '老师帮忙重新安排展示顺序。结局：向可信任的人求助是一种选择。', end: true } } }, { title: '给角色选一份资源', prompt: '如果愿意，为故事里的小芽挑一份接下来能用上的支持。', type: 'choice', options: ['有人陪着练习', '一张提示卡', '休息几分钟', '换一种展示方法', '暂时不选择'] }, wrap];
  if (game.id === 'story-chain-drawing') return [opening, { title: '合作画布接力', prompt: '小组轮流添加线条、图形或颜色，拼成一幅“我们一起创造的地方”。有橡皮、多种画笔颜色和 PNG 下载；不评价画得像不像。', type: 'collabCanvas' }, { title: '给画面接上故事', prompt: '每位同伴可以说一句虚构故事，也可以只给画面起个名字。', type: 'turns' }, wrap];
  if (game.id === 'emotion-auction') return [opening, { title: '领取十枚星点', prompt: '小组共同使用 10 枚虚拟星点。拍卖的是故事角色可以获得的支持资源，不是情绪、隐私或同学。可以自由分配，也可以留一些不花。', type: 'auctionAnimated', options: ['被认真倾听', '休息和空间', '一点勇气', '可靠的帮助', '表达自己的选择'] }, { title: '拍卖后聊一聊', prompt: '看看小组把星点放在哪里。不同选择都可以；愿意的话，分享你最想让角色先得到哪一种支持。', type: 'text', placeholder: '可以只写一个资源，也可以跳过。' }, wrap];
  if (game.type === 'drawing') return [opening, { title: `创作：${game.title}`, prompt: `用画布画出你的想法。可以用颜色、形状和线条，不需要画得像；你可以随时清空、下载图片或跳过。`, type: 'draw' }, { ...debrief, title: '给作品一个名字', prompt: '如果愿意，为作品取个名字，或者写下一句你想记住的话。' }, wrap];
  if (game.type === 'mindful') return [opening, { title: '短暂体验', prompt: `${game.desc}保持舒服的节奏，不适时可以停止。`, type: 'timer', seconds: 25 }, { title: '注意当下', prompt: '现在你注意到什么变化？没有变化也完全可以。', type: 'choice', options: ['感觉差不多', '稍微安静一点', '我注意到周围的事物', '我不确定', '想结束练习'] }, wrap];
  if (game.type === 'story') {
    if (game.id === 'story-chain-drawing') return [opening, { title: '接力创作：共同画故事', prompt: '把屏幕交给下一位，每位参与者轮流添一笔、一种颜色或一个角色，大家共同完成故事画。也可以由一人操作、其他人提出想法。', type: 'draw' }, { title: '给故事接龙', prompt: '轮流为画面补充一句故事，可以只说虚构角色，不讲自己的经历。', type: 'turns' }, wrap];
    return [opening, { title: '抽取故事素材卡', prompt: '为虚构故事选角色、地点和物品，小组成员可以轮流选一张卡。', type: 'choice', options: ['正在学习新事物的角色', '有点紧张的探险家', '愿意帮忙的伙伴', '一件神奇物品', '小组自己想'] }, { title: '轮流接龙创作', prompt: `${game.desc}每个人补充一句，让下一个人继续；可以使用虚构情节。`, type: 'turns' }, wrap];
  }
  if (game.type === 'auction') return [opening, { title: '领取虚拟筹码', prompt: '小组每人获得 10 枚虚拟筹码，只用于游戏。选择最希望角色拥有的资源，不评价谁的需要更重要。', type: 'choice', options: ['被认真倾听', '休息和空间', '一点勇气', '可靠的帮助', '表达自己的选择'] }, { title: '资源拍卖', prompt: '小组可以把 10 枚虚拟筹码分配给不同资源，轮流说出选择。拍卖的是虚构资源，不是个人情绪、隐私或同学。', type: 'auction', options: ['被认真倾听', '休息和空间', '一点勇气', '可靠的帮助', '表达自己的选择'] }, wrap];
  if (game.type === 'association') return [opening, { title: '抽取一件物品', prompt: '从身边选一件普通物品（或选下面的虚拟物品），轮流说出它还能变成什么、代表什么资源或进入什么故事。', type: 'choice', options: ['纸杯', '钥匙', '一片叶子', '橡皮', '一颗星星', '小组自选'] }, { title: '接住同伴的联想', prompt: '把屏幕交给下一位，接着前一位的想法，增加一个新用途或故事情节。联想没有标准答案，不分析彼此。', type: 'turns' }, wrap];
  if (game.type === 'group') return [opening, { title: '轮流参与', prompt: `${game.desc}可以在一台设备上轮流操作，也可以由一人记录小组共同答案。每个人都可以说“跳过”。`, type: 'choice', options: ['我愿意先来', '我愿意稍后参与', '我们小组共同完成', '我先旁观 / 跳过'] }, { title: '小组共创与倾听', prompt: '把设备传给下一位，轮流说、写或用图形表达；也可以只记录小组共同决定的答案。', type: 'turns' }, wrap];
  if (game.type === 'plan') return [opening, { title: '描述一个小情境', prompt: `${game.desc}用一个轻量、虚构或日常情境练习，不必填写隐私。`, type: 'text', placeholder: '可以只写一个目标或一个情境……' }, { title: '选出第一小步', prompt: '哪一步比较小、容易开始，而且是你愿意尝试的？', type: 'choice', options: ['花 2 分钟试一下', '把任务拆小', '请人陪我开始', '先安排休息', '暂时不决定'] }, wrap];
  if (game.type === 'text') return [opening, { title: '完成句子', prompt: `${game.desc}只写愿意记录的部分，也可以跳过。`, type: 'text', placeholder: '写一点点就好……' }, { title: '挑选一句带走的话', prompt: '哪句话更适合现在的你？', type: 'choice', options: ['我可以慢慢来', '我可以寻求帮助', '我不必马上回答', '我想自己想一想'] }, wrap];
  return [opening, { title: '挑选一个入口', prompt: `${game.desc}选择一个比较舒服的方式开始。`, type: 'choice', options: ['从颜色或图像开始', '从一个词开始', '和同伴讨论', ...close] }, debrief, wrap];
}
async function loadCompleteGameCatalog() {
  try {
    const response = await fetch('/data/game-catalog.json'); if (!response.ok) throw new Error(`HTTP ${response.status}`);
    fullGameCatalog = await response.json();
    if (!Array.isArray(fullGameCatalog) || !fullGameCatalog.length) throw new Error('目录为空或格式不正确');
    window.XINBAN_GAME_CATALOG = fullGameCatalog;
    for (const game of fullGameCatalog) { game.steps = makeGameSteps(game); games.push(game); gamePlaybooks[game.title] = game.steps; }
    const filterBar = document.querySelector('#planner .filters');
    if (filterBar) {
      filterBar.replaceChildren();
      const all = ['全部游戏', ...new Set(fullGameCatalog.map(game => game.category))];
      all.forEach((label, index) => { const button = document.createElement('button'); button.className = `filter ${index === 0 ? 'on' : ''}`; button.textContent = label; button.onclick = () => { filterBar.querySelectorAll('.filter').forEach(item => item.classList.remove('on')); button.classList.add('on'); renderGameCatalog(label === '全部游戏' ? 'all' : label); }; filterBar.append(button); });
      const search = document.createElement('input'); search.className = 'game-search'; search.placeholder = '搜索游戏名称、主题或关键词';
      search.oninput = () => { const q = search.value.trim().toLowerCase(); document.querySelectorAll('#gameGrid .game').forEach(card => { const game = games.find(item => item.id === card.dataset.gameId); card.hidden = Boolean(q) && (!game || !`${game.title} ${game.desc} ${game.category} ${(game.keywords || []).join(' ')}`.toLowerCase().includes(q)); }); };
      filterBar.append(search);
    }
    renderGameCatalog('all');
  } catch (error) { setGameCatalogStatus(`完整游戏库加载失败（${error.message || '网络错误'}）。当前只显示内置示例。请确认 Render 部署目录包含 data/game-catalog.json。`, true); }
}
loadCompleteGameCatalog();

let gameEditorState = null;
let gamePreviewTimer = null;
function createDrawingBoard(host, onChange = () => {}) {
  const wrap = document.createElement('div'); wrap.className = 'drawing-board';
  const canvas = document.createElement('canvas'); canvas.width = 900; canvas.height = 520; canvas.setAttribute('aria-label', '可自由绘画的画布');
  const tools = document.createElement('div'); tools.className = 'drawing-tools';
  const colors = ['#326c5d', '#e67c65', '#e5b94e', '#718ac7', '#9b78b5', '#283b34', '#55a6aa', '#f08aad', '#ff9f43']; let color = colors[0], drawing = false, previous = null, erasing = false;
  colors.forEach(value => { const chip = document.createElement('button'); chip.type = 'button'; chip.className = 'draw-color'; chip.style.background = value; chip.setAttribute('aria-label', `选择颜色 ${value}`); chip.onclick = () => { color = value; erasing = false; tools.querySelectorAll('.draw-color').forEach(item => item.classList.toggle('active', item === chip)); eraser.classList.remove('active'); }; tools.append(chip); });
  const eraser = document.createElement('button'); eraser.type = 'button'; eraser.className = 'btn small'; eraser.textContent = '橡皮擦'; eraser.onclick = () => { erasing = !erasing; eraser.classList.toggle('active', erasing); tools.querySelectorAll('.draw-color').forEach(item => item.classList.remove('active')); };
  const clear = document.createElement('button'); clear.className = 'btn small'; clear.textContent = '清空'; clear.onclick = () => { canvas.getContext('2d').clearRect(0, 0, canvas.width, canvas.height); onChange(canvas); };
  const download = document.createElement('button'); download.className = 'btn small'; download.textContent = '下载 PNG'; download.onclick = () => { const link = document.createElement('a'); link.download = '心伴芽-我的画作.png'; link.href = canvas.toDataURL('image/png'); link.click(); };
  tools.append(eraser, clear, download); wrap.append(canvas, tools); host.append(wrap);
  const point = event => { const rect = canvas.getBoundingClientRect(); return { x: (event.clientX - rect.left) * canvas.width / rect.width, y: (event.clientY - rect.top) * canvas.height / rect.height }; };
  canvas.onpointerdown = event => { drawing = true; previous = point(event); canvas.setPointerCapture(event.pointerId); };
  canvas.onpointermove = event => { if (!drawing) return; const next = point(event), ctx = canvas.getContext('2d'); ctx.globalCompositeOperation = erasing ? 'destination-out' : 'source-over'; ctx.strokeStyle = color; ctx.lineWidth = erasing ? 30 : 7; ctx.lineCap = 'round'; ctx.lineJoin = 'round'; ctx.beginPath(); ctx.moveTo(previous.x, previous.y); ctx.lineTo(next.x, next.y); ctx.stroke(); previous = next; };
  canvas.onpointerup = () => { drawing = false; previous = null; onChange(canvas); };
  canvas.onpointercancel = () => { drawing = false; previous = null; };
  return canvas;
}
function ensureGameEditor() {
  let back = document.getElementById('gameEditorBack'); if (back) return back;
  back = document.createElement('div'); back.id = 'gameEditorBack'; back.className = 'game-editor-back';
  back.innerHTML = `<section class="game-editor-modal"><header class="game-editor-head"><div><small>互动预览 · AI 协作改编</small><h2 id="gameEditorTitle"></h2></div><button class="btn" onclick="closeGameEditor()">关闭 ×</button></header><div class="game-editor-grid"><section class="game-preview-pane"><div><b>学生游戏预览</b><div id="gameEditorMeta" class="game-preview-meta"></div></div><div class="game-preview-card"><div id="gamePreviewStep"></div></div><div class="game-preview-controls"><button id="gamePreviewPrev" class="btn" onclick="moveGamePreview(-1)">上一步</button><span id="gamePreviewCount" class="game-preview-step"></span><button id="gamePreviewNext" class="btn primary" onclick="moveGamePreview(1)">下一步</button></div></section><section class="game-agent-pane"><div class="game-agent-intro"><b>游戏改编 Agent</b><br>描述你想调整的规则、提问、对象或活动风格。右侧对话和左侧预览分开显示。</div><div id="gameAgentMessages" class="game-agent-messages"></div><div class="game-agent-compose"><textarea id="gameEditInput" placeholder="例如：改成两人互相倾听的版本，把书写步骤换成可选卡片，不要求分享隐私。" onkeydown="if(event.key==='Enter'&&!event.shiftKey){event.preventDefault();sendGameEditChat()}"></textarea><button id="gameEditSend" class="btn primary" onclick="sendGameEditChat()">发送 ↑</button></div></section></div><footer class="game-editor-footer"><button class="btn" onclick="closeGameEditor()">关闭</button><button id="editorPptButton" class="btn" onclick="exportEditedGamePpt()">导出此游戏 PPT</button><button class="btn" onclick="publishEditedGame()">下发课堂</button><button class="btn primary" onclick="saveEditedGame()">保存到我的游戏</button></footer></section>`;
  const research = document.createElement('details'); research.className = 'game-research-box';
  research.innerHTML = '<summary>🔎 搜索游戏设计参考</summary><div class="game-research-controls"><input id="gameResearchQuery" placeholder="例如：情绪调节 小组合作游戏"><button class="btn small" type="button" id="gameResearchSearch">搜索</button><button class="btn small primary" type="button" id="gameResearchApply" disabled>把已选资料加入改编</button></div><p class="game-research-privacy">仅搜索游戏设计资料；请勿输入学生姓名、聊天内容或可识别个人的信息。</p><div id="gameResearchResults"></div>';
  back.querySelector('.game-agent-intro').after(research);
  research.querySelector('#gameResearchSearch').onclick = window.searchGameResearch;
  research.querySelector('#gameResearchApply').onclick = window.applyGameResearch;
  document.body.append(back); return back;
}
window.editGame = function (index, savedGame = null, resource = null, usageSummary = null) {
  const source = savedGame || games[index]; if (!source) return;
  document.getElementById('modalback')?.classList.remove('show');
  const book = savedGame?.steps || source.steps || gamePlaybooks[source.title] || Object.values(gamePlaybooks)[index] || [];
  const steps = book.length ? book.map((step, stepIndex) => ({ ...step, title: step.title || `第 ${stepIndex + 1} 步`, prompt: step.prompt || '选择一个适合自己的方式完成这一步。', type: ['choice','text','timer','draw','turns','auction','storyTree','collabCanvas','auctionAnimated','shred'].includes(step.type) ? step.type : 'choice', seconds: step.seconds || 20, options: step.options || [] })) : [
    { title: '选择参与方式', prompt: '你可以自己完成，也可以和同伴一起。愿意时再开始。', type: 'choice', options: ['我想试试', '我先看看', '和同伴一起'] },
    { title: '探索一个小问题', prompt: '想一想这项活动对你有什么帮助。可以写下来，也可以跳过。', type: 'text', options: [] },
    { title: '选一个小行动', prompt: '选一件轻松、可实现的小事，为活动收尾。', type: 'choice', options: ['先休息一下', '找人聊聊', '做一件小事'] }
  ];
  gameEditorState = { game: { ...source, title: source.title, goal: source.goal || source.desc || '', people: source.people || '学生个人或小组', risk: source.risk || '教师带领', steps }, history: [], revisions: Array.isArray(source.revisionHistory) ? source.revisionHistory : [], usageSummary, previewIndex: 0, answers: {}, researchResults: [], resourceId: resource?.id || null };
  const back = ensureGameEditor(); back.classList.add('show');
  document.getElementById('gameAgentMessages').replaceChildren();
  appendGameAgentMessage('assistant', '可以直接告诉我希望如何修改。修改后左侧会更新，你可以逐步点击选项和输入内容预览游戏。');
  if (usageSummary) appendGameAgentMessage('assistant', `已载入${usageSummary.scope === 'student' ? '该学生的' : '课堂'}汇总：${usageSummary.submissionCount} 份记录，完成率 ${usageSummary.completionRate}%，跳过 ${usageSummary.skippedCount} 步，绘画 ${usageSummary.drawingCount} 次。改编时只会参考这些统计和选项计数，不会把学生姓名、聊天原文或自由文本发送给 Agent。`);
  renderGamePreview(); document.getElementById('gameEditInput').focus();
};
window.closeGameEditor = function () { if (gamePreviewTimer) clearInterval(gamePreviewTimer); document.getElementById('gameEditorBack')?.classList.remove('show'); };
window.searchGameResearch = async function () {
  const input = document.getElementById('gameResearchQuery'), results = document.getElementById('gameResearchResults'), button = document.getElementById('gameResearchSearch');
  const query = input?.value.trim(); if (!query) return toast('先输入一个游戏主题或活动形式');
  button.disabled = true; button.textContent = '搜索中…'; results.textContent = '正在查找公开资料…';
  try {
    const response = await fetch('/api/teacher/game-research', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ query }) });
    const data = await response.json(); if (!response.ok) throw new Error(data.error || '搜索失败');
    gameEditorState.researchResults = data.results || []; results.replaceChildren();
    if (!data.results?.length) results.textContent = '暂未找到结果。可以换一个关键词。';
    data.results?.forEach((item, index) => {
      const label = document.createElement('label'); label.className = 'game-research-result';
      const checkbox = document.createElement('input'); checkbox.type = 'checkbox'; checkbox.value = String(index);
      const detail = document.createElement('span'); const title = document.createElement('b'); title.textContent = item.title; const snippet = document.createElement('small'); snippet.textContent = item.snippet; const link = document.createElement('a'); link.href = item.url; link.target = '_blank'; link.rel = 'noopener noreferrer'; link.textContent = '查看来源';
      detail.append(title, snippet, link); label.append(checkbox, detail); results.append(label);
    });
    document.getElementById('gameResearchApply').disabled = !data.results?.length;
  } catch (error) { results.textContent = error.message || '搜索失败'; }
  finally { button.disabled = false; button.textContent = '搜索'; }
};
window.applyGameResearch = function () {
  const selected = [...document.querySelectorAll('#gameResearchResults input:checked')].map(input => gameEditorState?.researchResults[Number(input.value)]).filter(Boolean).slice(0, 3);
  if (!selected.length) return toast('请选择至少一条参考资料');
  const sourceText = selected.map(item => `- ${item.title}: ${item.snippet.slice(0, 240)}（来源：${item.url}）`).join('\n');
  const input = document.getElementById('gameEditInput');
  input.value = `${input.value.trim()}\n\n请参考以下公开资料补充游戏机制，不要照抄内容，并在修改说明中保留来源链接：\n${sourceText}`.trim();
  gameEditorState.game.sources = [...(gameEditorState.game.sources || []), ...selected.map(({ title, url }) => ({ title, url }))].slice(-8);
  input.focus(); toast(`已加入 ${selected.length} 条资料；检查改编要求后发送给 Agent`);
};
window.exportEditedGamePpt = function () { if (gameEditorState?.game) window.exportGamePpt?.(gameEditorState.game); };
window.publishEditedGame = async function () {
  const game = gameEditorState?.game; if (!game) return;
  try {
    const response = await fetch('/api/teacher/tasks', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ title: game.title, gameId: game.id || `custom-${Date.now()}`, game, className: '我的课堂' }) });
    const data = await response.json(); if (!response.ok) throw new Error(data.error || '下发失败');
    closeGameEditor(); showTaskShare(data.task); loadClassroomTasks();
  } catch (error) { toast(error.message || '下发失败，请稍后重试'); }
};
function renderGamePreview() {
  if (!gameEditorState) return;
  if (gamePreviewTimer) clearInterval(gamePreviewTimer);
  const { game, previewIndex, answers } = gameEditorState, step = game.steps[previewIndex];
  document.getElementById('gameEditorTitle').textContent = game.title;
  document.getElementById('gameEditorMeta').textContent = `${game.goal} · ${game.people} · 风险提示：${game.risk}`;
  document.getElementById('gamePreviewCount').textContent = `${previewIndex + 1} / ${game.steps.length}`;
  document.getElementById('gamePreviewPrev').disabled = previewIndex === 0;
  document.getElementById('gamePreviewNext').textContent = previewIndex === game.steps.length - 1 ? '从头预览' : '下一步';
  const view = document.getElementById('gamePreviewStep'); view.replaceChildren();
  const heading = document.createElement('h3'); heading.textContent = step.title;
  const prompt = document.createElement('p'); prompt.textContent = step.prompt;
  view.append(heading, prompt);
  if (step.type === 'storyTree') {
    const tree = document.createElement('div'); tree.className = 'story-tree';
    const path = [], nodeBox = document.createElement('div'); nodeBox.className = 'story-tree-node'; tree.append(nodeBox); view.append(tree);
    const paintNode = nodeId => {
      const node = step.nodes?.[nodeId]; if (!node) return;
      nodeBox.replaceChildren();
      path.push(node.text); answers[previewIndex] = path.join(' → ');
      const story = document.createElement('p'); story.className = 'story-tree-text'; story.textContent = node.text; nodeBox.append(story);
      if (node.end) { const ending = document.createElement('span'); ending.className = 'story-tree-ending'; ending.textContent = '故事结局'; nodeBox.append(ending); return; }
      const choices = document.createElement('div'); choices.className = 'story-tree-choices';
      (node.options || []).forEach(option => { const button = document.createElement('button'); button.className = 'game-choice'; button.textContent = option.label; button.onclick = () => { answers[previewIndex] = [...(answers[previewIndex] ? [answers[previewIndex]] : []), option.label].join(' → '); const chip = document.createElement('span'); chip.className = 'story-tree-branch'; chip.textContent = `↳ ${option.label}`; tree.insertBefore(chip, nodeBox); paintNode(option.next); }; choices.append(button); });
      nodeBox.append(choices);
    };
    paintNode(step.start || 'start');
  } else if (step.type === 'collabCanvas') {
    const counter = document.createElement('div'); counter.className = 'canvas-turn'; let turn = 1;
    counter.innerHTML = `<b>第 <span>${turn}</span> 棒</b><span>每人添加一笔后，把设备传给下一位</span>`;
    const canvas = createDrawingBoard(view, currentCanvas => { gameEditorState.answers[previewIndex] = currentCanvas.toDataURL('image/jpeg', .65); });
    const nextTurn = document.createElement('button'); nextTurn.className = 'btn small'; nextTurn.textContent = '交给下一位 →'; nextTurn.onclick = () => { turn += 1; counter.querySelector('b span').textContent = turn; answers[previewIndex] = `完成了 ${turn} 棒接力`; nextTurn.classList.remove('turn-pop'); void nextTurn.offsetWidth; nextTurn.classList.add('turn-pop'); };
    counter.append(nextTurn); view.insertBefore(counter, canvas.parentElement);
  } else if (step.type === 'auctionAnimated') {
    const board = document.createElement('div'); board.className = 'auction-board auction-live';
    let remaining = 10; const allocation = new Map((step.options || []).map(item => [item, 0]));
    const wallet = document.createElement('div'); wallet.className = 'auction-wallet'; wallet.innerHTML = `<span>星点余额</span><b>10</b><div class="auction-coins">${Array.from({ length: 10 }, () => '<i>✦</i>').join('')}</div>`; board.append(wallet);
    const resources = document.createElement('div'); resources.className = 'auction-resources';
    const balance = wallet.querySelector('b'), coins = wallet.querySelector('.auction-coins');
    const cards = new Map();
    const renderAuction = () => { const used = [...allocation.values()].reduce((sum, value) => sum + value, 0); remaining = 10 - used; balance.textContent = String(remaining); [...coins.children].forEach((coin, index) => coin.classList.toggle('spent', index >= remaining)); answers[previewIndex] = [...allocation].filter(([, count]) => count).map(([name, count]) => `${name} ${count} 枚`).join('；'); };
    (step.options || []).forEach((name, index) => {
      const card = document.createElement('article'); card.className = 'auction-resource'; card.style.setProperty('--resource-hue', `${index * 55 + 110}deg`);
      const title = document.createElement('b'); title.textContent = name; const controls = document.createElement('div'); controls.className = 'auction-bid-controls';
      const value = document.createElement('span'); value.className = 'auction-bid-count'; value.textContent = '0';
      const minus = document.createElement('button'); minus.type = 'button'; minus.textContent = '−'; minus.setAttribute('aria-label', `减少${name}星点`);
      const plus = document.createElement('button'); plus.type = 'button'; plus.textContent = '＋'; plus.setAttribute('aria-label', `增加${name}星点`);
      minus.onclick = () => { const next = Math.max(0, allocation.get(name) - 1); allocation.set(name, next); value.textContent = next; card.classList.add('bid-pop'); setTimeout(() => card.classList.remove('bid-pop'), 350); renderAuction(); };
      plus.onclick = () => { if (!remaining) return; const next = allocation.get(name) + 1; allocation.set(name, next); value.textContent = next; card.classList.remove('bid-pop'); void card.offsetWidth; card.classList.add('bid-pop'); renderAuction(); };
      controls.append(minus, value, plus); card.append(title, controls); resources.append(card); cards.set(name, card);
    });
    board.append(resources);
    const closeHammer = document.createElement('button'); closeHammer.className = 'btn primary auction-hammer'; closeHammer.innerHTML = '🔨 敲槌结拍';
    const reveal = document.createElement('p'); reveal.className = 'auction-reveal'; reveal.hidden = true;
    closeHammer.onclick = () => { if (![...allocation.values()].some(Boolean)) { toast('先把至少一枚星点放到一项支持上'); return; } reveal.hidden = false; reveal.innerHTML = `本轮拍卖完成 ✨<br><b>${[...allocation].filter(([, count]) => count).map(([name, count]) => `${escapeHtml(name)} ${count}枚`).join(' · ')}</b>`; board.classList.add('auction-closed'); closeHammer.disabled = true; };
    board.append(closeHammer, reveal); view.append(board); renderAuction();
  } else if (step.type === 'shred') {
    renderPaperShred(view, () => { answers[previewIndex] = '已碎纸'; });
  } else if (step.type === 'text') {
    const field = document.createElement('textarea'); field.className = 'game-preview-input'; field.placeholder = '写下愿意记录的内容，也可以留空或跳过'; field.value = answers[previewIndex] || ''; field.oninput = () => { answers[previewIndex] = field.value; }; view.append(field);
  } else if (step.type === 'draw') {
    const canvas = createDrawingBoard(view, currentCanvas => { gameEditorState.answers[previewIndex] = currentCanvas.toDataURL('image/jpeg', .65); });
    const saved = answers[previewIndex]; if (saved?.startsWith('data:image/')) { const image = new Image(); image.onload = () => canvas.getContext('2d').drawImage(image, 0, 0, canvas.width, canvas.height); image.src = saved; }
  } else if (step.type === 'timer') {
    const timer = document.createElement('div'); timer.className = 'game-preview-timer'; timer.textContent = `${step.seconds || 20} 秒`;
    const start = document.createElement('button'); start.className = 'btn'; start.textContent = '开始短练习'; start.onclick = () => { if (gamePreviewTimer) clearInterval(gamePreviewTimer); let left = step.seconds || 20; start.disabled = true; gamePreviewTimer = setInterval(() => { left -= 1; timer.textContent = left > 0 ? `${left} 秒` : '完成了'; if (left <= 0) { clearInterval(gamePreviewTimer); start.disabled = false; start.textContent = '再来一次'; answers[previewIndex] = '完成短练习'; } }, 1000); };
    view.append(timer, start);
  } else {
    const choices = document.createElement('div'); choices.className = 'game-preview-choices';
    (step.options.length ? step.options : ['我想试试', '我想跳过']).forEach(option => { const button = document.createElement('button'); button.textContent = option; button.classList.toggle('selected', answers[previewIndex] === option); button.onclick = () => { answers[previewIndex] = option; choices.querySelectorAll('button').forEach(item => item.classList.toggle('selected', item === button)); }; choices.append(button); });
    view.append(choices);
  }
}
window.moveGamePreview = function (direction) {
  if (!gameEditorState) return;
  const last = gameEditorState.game.steps.length - 1;
  gameEditorState.previewIndex = direction > 0 && gameEditorState.previewIndex === last ? 0 : Math.max(0, Math.min(last, gameEditorState.previewIndex + direction));
  renderGamePreview();
};
function appendGameAgentMessage(role, content) {
  const row = document.createElement('div'); row.className = `game-agent-message ${role === 'user' ? 'user' : ''}`;
  row.innerHTML = role === 'user' ? escapeHtml(content) : renderMarkdown(content);
  document.getElementById('gameAgentMessages').append(row); row.scrollIntoView({ block: 'nearest' });
}
window.sendGameEditChat = async function () {
  const state = gameEditorState, input = document.getElementById('gameEditInput'), request = input?.value.trim();
  if (!state || !request) return;
  const button = document.getElementById('gameEditSend'); button.disabled = true; input.value = '';
  state.history.push({ role: 'user', content: request }); appendGameAgentMessage('user', request);
  const progress = document.createElement('div'); progress.className = 'game-agent-message'; progress.textContent = 'Agent 正在改编游戏…'; document.getElementById('gameAgentMessages').append(progress);
  try {
    const previousGame = JSON.parse(JSON.stringify(state.game));
    const response = await fetch('/api/teacher/game-edit', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ game: state.game, request, history: state.history.slice(-8), usageSummary: state.usageSummary || undefined }) });
    const data = await response.json(); if (!response.ok) throw new Error(data.error || '游戏修改失败');
    progress.remove(); state.revisions = [...state.revisions, { savedAt: new Date().toISOString(), note: request.slice(0, 240), game: previousGame }].slice(-3); state.game = data.game; state.previewIndex = 0; state.answers = {}; state.history.push({ role: 'assistant', content: data.reply });
    appendGameAgentMessage('assistant', data.reply); renderGamePreview();
    try { await window.saveEditedGame(true); appendGameAgentMessage('assistant', '本次改编已自动保存为个人游戏版本；你也可以继续对话修改，或下发课堂。'); }
    catch { appendGameAgentMessage('assistant', '本次修改已在页面预览，但自动保存未成功。请点击“保存到我的游戏”重试。'); }
  } catch (error) { progress.textContent = error.message || '暂时无法修改，请稍后重试。'; }
  finally { button.disabled = false; input.focus(); }
};
window.saveEditedGame = async function (quiet = false) {
  if (!gameEditorState) return;
  const state = gameEditorState, id = state.resourceId || `game-${crypto.randomUUID ? crypto.randomUUID() : Date.now()}`;
  try {
    const savedGame = { ...state.game, revisionHistory: state.revisions.slice(-3) };
    const response = await fetch('/api/teacher/resources', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ id, title: state.game.title, kind: '自定义游戏', content: JSON.stringify(savedGame, null, 2) }) });
    const data = await response.json(); if (!response.ok) throw new Error(data.error || '保存失败');
    state.resourceId = id; await loadTeacherResources(); if (!quiet) toast('游戏已保存到你的个人资源库');
  } catch (error) { if (!quiet) toast(error.message || '保存失败，请稍后重试'); throw error; }
};

function ensureStudentJoinPanel() {
  const chatbox = document.querySelector('#studentApp .chatbox'); if (!chatbox || document.getElementById('studentClassTask')) return;
  const panel = document.createElement('div'); panel.id = 'studentClassTask'; panel.className = 'class-join-panel';
  panel.innerHTML = `<div class="class-join-icon">✦</div><div class="class-join-content"><b>参加老师的课堂游戏</b><small>输入老师分享的课堂码，完成活动后提交课堂记录。</small><div class="class-join-controls"><input id="taskCodeInput" maxlength="8" placeholder="输入课堂码"><button class="btn small primary" onclick="joinClassTask()">加入</button></div><div id="joinedTaskInfo"></div></div>`;
  chatbox.insertBefore(panel, chatbox.firstChild);
}
ensureStudentJoinPanel();
function companionRequestContext() {
  return { animal: animalOptions[companionAnimal] || animalOptions.abstract, companionName: '心伴', companionPersona: '' };
}
function companionFace(animal = companionAnimal) {
  return ({ abstract: '🐾', cat: '🐱', rabbit: '🐰', fox: '🦊', bear: '🐻', dog: '🐶' })[animal] || '🐾';
}
function companionAvatarSvg(animal = companionAnimal, className = '') {
  const asset = ({ abstract: 'sprout', cat: 'cat', rabbit: 'rabbit', fox: 'fox', bear: 'bear' })[animal] || 'sprout';
  const label = animalOptions[animal] || animalOptions.abstract;
  return `<img class="${className}" src="/assets/companion-${asset}.png" alt="${label}" loading="eager">`;
}
function renderCompanion() {
  const pet = document.getElementById('pet'); if (!pet) return;
  pet.innerHTML = companionAvatarSvg(companionAnimal, 'heart-sprout');
  const name = '心伴芽';
  document.getElementById('petName').textContent = name;
  const mini = document.querySelector('.chat-head .petmini'); if (mini) mini.innerHTML = companionAvatarSvg(companionAnimal, 'chat-avatar');
  const title = document.querySelector('.chat-head b'); if (title) title.textContent = `和${name}聊聊`;
  document.querySelectorAll('#messages .tiny').forEach(node => { node.innerHTML = companionAvatarSvg(companionAnimal, 'chat-avatar'); });
  const desc = document.getElementById('companionDescription'); if (desc) desc.textContent = '每完成 5 次心理练习，可以选择一件新装扮；完成 20 次可解锁成长服装。外观不会根据心情好坏变化。';
  renderCompanionProgress();
}
function ensureCompanionSetup() {
  const tabs = document.querySelector('.pet-card .pet-tabs'); if (!tabs || document.getElementById('companionSetup')) return;
  const panel = document.createElement('div'); panel.id = 'companionSetup'; panel.className = 'companion-setup';
  panel.innerHTML = `<label for="companionAnimal">选择心伴芽的形象</label><select id="companionAnimal"><option value="abstract">心伴芽（默认）</option><option value="cat">芽芽猫</option><option value="rabbit">芽芽兔</option><option value="fox">芽芽狐</option><option value="bear">芽芽熊</option></select><div id="companionDescription"></div>`;
  tabs.before(panel);
  const picker = document.getElementById('companionAnimal'); picker.value = companionAnimal;
  picker.onchange = () => { companionAnimal = picker.value; localStorage.setItem(`xinban.companion.animal.${profileKey}`, companionAnimal); dailyAppearance = null; renderCompanion(); refreshDailyAppearance(); };
  const tabsButtons = tabs.querySelectorAll('button');
  if (tabsButtons[0]) tabsButtons[0].textContent = '装扮';
  if (tabsButtons[1]) tabsButtons[1].textContent = '成长记录';
  const itemIcons = document.querySelectorAll('.pet-items span');
  ['✨', '🌿', '🎀'].forEach((icon, index) => { if (itemIcons[index]) itemIcons[index].textContent = icon; });
  const intro = document.querySelector('#studentApp .pet-card > p');
  if (intro) intro.innerHTML = '我会陪你慢慢探索。<br>每一次尝试都值得被记住。';
  renderCompanion();
}
const accessoryCollection = [
  { name: '小叶发夹', icon: '🍃', color: '#b9d9a8' }, { name: '星星徽章', icon: '⭐', color: '#f1d38c' },
  { name: '软软围巾', icon: '🧣', color: '#e8b7aa' }, { name: '云朵发卡', icon: '☁️', color: '#bfd5ea' },
  { name: '小花胸针', icon: '🌼', color: '#e8c4dc' }
];
const outfitCollection = [
  { name: '春日园丁服', icon: '🌱', color: '#c8dfb7' }, { name: '星光探险服', icon: '✨', color: '#c8c1e7' },
  { name: '海风散步服', icon: '🐚', color: '#b9dce1' }, { name: '暖阳针织服', icon: '☀️', color: '#f1d4a1' },
  { name: '晚霞旅行服', icon: '🌸', color: '#edc0b8' }
];
function renderCompanionProgress() {
  const count = practiceProgress.completed || 0, remainder = count % 5;
  const progress = document.getElementById('companionProgress'); if (!progress) return;
  progress.innerHTML = `<div class="growth-count">🌱 已完成 <b>${count}</b> 次练习</div><div class="growth-track"><i style="width:${Math.min(100, remainder * 20)}%"></i></div><small>${count >= 20 ? '已解锁成长服装！' : `再完成 ${20 - count} 次，解锁成长服装`}</small>`;
}
function openCompanionCollection(kind) {
  const isOutfit = kind === 'outfits';
  const items = isOutfit ? outfitCollection : accessoryCollection;
  const count = practiceProgress.completed || 0;
  const modal = document.getElementById('companionModal');
  document.getElementById('companionModalTitle').textContent = isOutfit ? '成长记录 · 五套成长服装' : '装扮小屋 · 五件心意饰品';
  document.getElementById('companionModalIntro').textContent = isOutfit ? `完成 20 次心理练习解锁第 1 套服装；之后每 20 次解锁一套。当前 ${count} 次。` : `每完成 5 次心理练习，解锁一件饰品，可选择佩戴。当前 ${count} 次。`;
  modal.querySelector('.close').textContent = '×';
  document.getElementById('companionCollection').innerHTML = items.map((item, index) => {
    const need = isOutfit ? (index + 1) * 20 : (index + 1) * 5;
    const unlocked = count >= need;
    const selected = (isOutfit ? localStorage.getItem(`xinban.outfit.${profileKey}`) : localStorage.getItem(`xinban.accessory.${profileKey}`)) === String(index);
    return `<button class="collection-item ${unlocked ? 'unlocked' : 'locked'} ${selected ? 'selected' : ''}" ${unlocked ? `onclick="selectCompanionItem('${kind}',${index})"` : 'disabled'}><span class="collection-art" style="--item-color:${item.color}">${item.icon}</span><b>${item.name}</b><small>${unlocked ? (selected ? '正在使用' : '已解锁 · 点击穿戴') : `进度 ${Math.min(count, need)} / ${need}`}</small><span class="collection-status">${unlocked ? '✓ 已获得' : '🔒 未解锁'}</span></button>`;
  }).join('');
  const history = document.getElementById('practiceHistory');
  history.replaceChildren();
  if (isOutfit) {
    const heading = document.createElement('h3'); heading.textContent = '我的练习足迹'; history.append(heading);
    const records = (practiceProgress.recentPractices || []).slice().reverse().slice(0, 10);
    if (!records.length) { const empty = document.createElement('p'); empty.textContent = '完成课堂心理游戏后，这里会留下你的成长足迹。'; history.append(empty); }
    records.forEach(record => {
      const row = document.createElement('div'); row.className = 'practice-history-row';
      const title = document.createElement('b'); title.textContent = record.title || '心理练习';
      const date = document.createElement('small'); date.textContent = record.completedAt ? new Date(record.completedAt).toLocaleDateString('zh-CN') : '';
      row.append(title, date); history.append(row);
    });
  }
  modal.classList.add('show');
}
window.openCompanionCollection = openCompanionCollection;
window.closeCompanionCollection = () => document.getElementById('companionModal')?.classList.remove('show');
window.selectCompanionItem = function (kind, index) {
  localStorage.setItem(`xinban.${kind === 'outfits' ? 'outfit' : 'accessory'}.${profileKey}`, String(index));
  renderCompanion(); openCompanionCollection(kind); toast('已为心伴芽换上新装扮');
};
async function loadPracticeProgress() {
  try { const response = await fetch('/api/student/progress'); if (!response.ok) return; practiceProgress = await response.json(); renderCompanionProgress(); renderCompanion(); } catch {}
}
ensureCompanionSetup();
async function refreshDailyAppearance() {
  const day = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Shanghai' }).format(new Date());
  try {
    const response = await fetch('/api/student/companion/daily', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ studentId: memoryStudentId, conversationId: privateConversationId, animal: animalOptions[companionAnimal] || animalOptions.abstract, day }) });
    const data = await response.json(); if (!response.ok || !data.appearance) return;
    dailyAppearance = data.appearance; localStorage.setItem(`xinban.companion.appearance.${profileKey}`, JSON.stringify(dailyAppearance)); renderCompanion();
  } catch { /* Keep the companion's current appearance if the service is offline. */ }
}
function ensureMemoryDisclosure() {
  const head = document.querySelector('#studentApp .chat-head'); if (!head || document.getElementById('memoryDisclosure')) return;
  const note = document.createElement('div'); note.id = 'memoryDisclosure'; note.className = 'memory-disclosure';
  note.innerHTML = '<span>自主聊天默认不展示给老师，请勿输入真实姓名或联系方式。可点击分享聊天记录分享给老师一起交流。</span><button class="btn small primary" onclick="openChatShare()">分享聊天记录</button>';
  head.after(note);
}
ensureMemoryDisclosure();

function formatChatDay(value) {
  const date = new Date(value || Date.now());
  return Number.isNaN(date.getTime()) ? '日期未知' : new Intl.DateTimeFormat('zh-CN', { timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit' }).format(date);
}
window.openChatShare = async function () {
  try {
    const query = new URLSearchParams({ studentId: memoryStudentId, conversationId: privateConversationId });
    const response = await fetch(`/api/student/memory?${query}`); const data = await response.json();
    if (response.ok && Array.isArray(data.messages)) privateMessages = data.messages;
  } catch {}
  if (!privateMessages.length) return toast('这段自主聊天里还没有可分享的消息。');
  let modal = document.getElementById('chatShareModal');
  if (!modal) {
    modal = document.createElement('div'); modal.id = 'chatShareModal'; modal.className = 'modalback';
    modal.innerHTML = '<section class="modal chat-share-modal"><div class="modalhead"><div><h2>选择要分享的聊天</h2><p class="collection-intro">只会分享你勾选的内容；未选择的聊天仍对老师隐藏。</p></div><button class="close" onclick="closeChatShare()">×</button></div><div class="chat-share-controls"><label>按日期筛选<select id="shareDateFilter"></select></label><button class="btn small" onclick="toggleShareVisible(true)">全选当前列表</button><button class="btn small" onclick="toggleShareVisible(false)">取消全选</button></div><div id="shareMessageList" class="share-message-list"></div><div class="modal-actions"><button class="btn" onclick="closeChatShare()">取消</button><button class="btn primary" onclick="shareSelectedChat()">分享已选内容</button></div></section>';
    document.body.append(modal);
    modal.querySelector('#shareDateFilter').onchange = renderShareMessages;
  }
  const dates = [...new Set(privateMessages.map(item => formatChatDay(item.createdAt)))];
  const select = modal.querySelector('#shareDateFilter');
  select.innerHTML = '<option value="all">全部日期</option>' + dates.map(day => `<option value="${escapeHtml(day)}">${escapeHtml(day)}</option>`).join('');
  renderShareMessages(); modal.classList.add('show');
};
function renderShareMessages() {
  const modal = document.getElementById('chatShareModal'); if (!modal) return;
  const date = modal.querySelector('#shareDateFilter').value || 'all', list = modal.querySelector('#shareMessageList'); list.replaceChildren();
  privateMessages.forEach((item, index) => {
    if (date !== 'all' && formatChatDay(item.createdAt) !== date) return;
    const label = document.createElement('label'); label.className = 'share-message-row';
    const checkbox = document.createElement('input'); checkbox.type = 'checkbox'; checkbox.dataset.messageIndex = String(index);
    const body = document.createElement('span'), who = document.createElement('b'), textNode = document.createElement('span'), time = document.createElement('small');
    who.textContent = item.role === 'user' ? '我' : '心伴'; textNode.textContent = item.content || ''; time.textContent = `${formatChatDay(item.createdAt)} ${new Date(item.createdAt || Date.now()).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })}`;
    body.append(who, textNode, time); label.append(checkbox, body); list.append(label);
  });
}
window.toggleShareVisible = function (checked) { document.querySelectorAll('#shareMessageList input[type="checkbox"]').forEach(input => { input.checked = checked; }); };
window.closeChatShare = function () { document.getElementById('chatShareModal')?.classList.remove('show'); };
window.shareSelectedChat = async function () {
  const indexes = [...document.querySelectorAll('#shareMessageList input:checked')].map(input => Number(input.dataset.messageIndex));
  if (!indexes.length) return toast('请先选择一条或多条聊天记录。');
  const selected = indexes.map(index => privateMessages[index]).filter(Boolean);
  const text = `心伴自主聊天记录（由学生选择分享）\n\n${selected.map(item => `[${formatChatDay(item.createdAt)} ${new Date(item.createdAt || Date.now()).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })}] ${item.role === 'user' ? '我' : '心伴'}：${item.content}`).join('\n\n')}`;
  try {
    if (navigator.share) await navigator.share({ title: '分享给老师的聊天记录', text });
    else if (navigator.clipboard?.writeText) { await navigator.clipboard.writeText(text); toast('已复制所选记录，请粘贴发送给老师。'); }
    else { window.prompt('复制下面内容并发送给老师：', text); }
    closeChatShare();
  } catch (error) { if (error.name !== 'AbortError') toast('分享未完成，请重试或复制后发送。'); }
};

window.joinClassTask = async function () {
  const code = document.getElementById('taskCodeInput').value.trim().toUpperCase();
  if (!code) return toast('请输入老师分享的课堂码');
  try {
    const response = await fetch(`/api/student/tasks?code=${encodeURIComponent(code)}`); const data = await response.json();
    if (!response.ok) throw new Error(data.error || '加入失败');
    const task = data.task;
    window.currentClassTask = task;
    document.getElementById('joinedTaskInfo').innerHTML = `<div class="joined-task"><div><b>${escapeHtml(task.title)}</b><small>${escapeHtml(task.className || '课堂任务')} · 完成后提交记录给老师</small><input id="studentAliasInput" class="alias-input" maxlength="80" placeholder="课堂昵称或学号"></div><button class="btn small primary" onclick="startClassGame()">开始游戏</button></div>`;
    toast('已加入课堂任务');
  } catch (error) { toast(error.message || '操作失败，请稍后重试。'); }
};

function makePlayer() {
  if (document.getElementById('gamePlayerBack')) return;
  const back = document.createElement('div'); back.id = 'gamePlayerBack'; back.className = 'game-player-back';
  back.innerHTML = `<section class="game-player"><header class="game-player-head"><div><span class="eyebrow">CLASSROOM ACTIVITY</span><h2 id="playerTitle"></h2></div><button class="close" onclick="closeGamePlayer()">×</button></header>
    <div id="playerConsent" class="player-consent"><div class="student-share-note">🔒 课堂说明：如果继续参加，本活动中的选择、文字、画作和你与心伴的活动对话会提交给授课老师，用于课堂记录。你可以跳过任何问题；请不要填写不想分享的个人信息。</div><label class="consent-check"><input id="shareConsent" type="checkbox"> 我知道本次课堂活动记录会提交给授课老师。</label><button class="btn primary" onclick="beginClassGame()">同意并开始</button></div>
    <div id="gamePlayContent" style="display:none"><div class="student-share-note">🔒 本次活动记录会提交给授课老师。你可以跳过任何问题。</div>
    <div class="game-progress-head"><span id="gameStepLabel"></span><span id="gameStepCount"></span></div><div class="game-progress"><i id="gameProgressFill"></i></div>
    <div id="gameStepView" class="game-step-view"></div><div id="gameChatArea" class="game-chat-area"><button class="btn small" onclick="toggleGameChat()">和心伴聊聊</button></div>
    <footer class="game-player-foot"><button class="btn" onclick="skipGameStep()">跳过这步</button><button class="btn primary" id="nextGameStep" onclick="nextGameStep()">下一步 →</button></footer></div>
  </section>`;
  document.body.append(back);
}
makePlayer();

window.startRecommendedGame = async function (id, offerId = '') {
  const game = fullGameCatalog.find(item => item.id === id); if (!game) return toast('这个游戏暂时不可用，请从游戏库重新选择。');
  window.gameSession = { task: { title: game.title, gameId: game.id, game }, recommendationOfferId: offerId, privateMode: true, alias: '', steps: game.steps || makeGameSteps(game), index: 0, actions: [], chat: [], current: null, startedAt: Date.now(), stepStarted: Date.now(), completionId: crypto.randomUUID ? crypto.randomUUID() : `practice-${Date.now()}-${Math.random().toString(36).slice(2)}` };
  if (offerId) await saveGamePreference('started', { id, offerId });
  document.getElementById('playerTitle').textContent = game.title;
  document.getElementById('playerConsent').style.display = 'none'; document.getElementById('gamePlayContent').style.display = 'block';
  document.querySelector('#gamePlayContent .student-share-note').textContent = '这是你主动开始的私密练习。你可以跳过任何步骤；完成记录默认只保存在你的个人记录中。';
  document.querySelector('.game-player-foot').innerHTML = '<button class="btn" onclick="skipGameStep()">跳过这步</button><button class="btn primary" id="nextGameStep" onclick="nextGameStep()">下一步 →</button>';
  document.getElementById('gameChatArea').innerHTML = '<button class="btn small" onclick="toggleGameChat()">和心伴聊聊</button>';
  document.getElementById('gamePlayerBack').classList.add('show'); renderGameStep();
};
window.startClassGame = function () {
  const task = window.currentClassTask; if (!task) return;
  const game = task.game || games.find(item => item.id === task.gameId) || { title: task.title, steps: gamePlaybooks[task.title] || gamePlaybooks['压力外化卡片'] };
  const steps = game.steps || gamePlaybooks[task.title] || gamePlaybooks['压力外化卡片'];
  window.gameSession = { task: { ...task, game }, privateMode: false, alias: '', steps, index: 0, actions: [], chat: [], current: null, startedAt: Date.now(), stepStarted: Date.now(), completionId: crypto.randomUUID ? crypto.randomUUID() : `practice-${Date.now()}-${Math.random().toString(36).slice(2)}` };
  document.getElementById('playerTitle').textContent = task.title;
  document.querySelector('#gamePlayContent .student-share-note').textContent = '课堂任务记录（含选择、文字、画作和活动对话）会在你确认参与后提交给授课老师。你可以跳过任何问题，请勿填写不想分享的个人信息。';
  document.querySelector('.game-player-foot').innerHTML = '<button class="btn" onclick="skipGameStep()">跳过这步</button><button class="btn primary" id="nextGameStep" onclick="nextGameStep()">下一步 →</button>';
  document.getElementById('playerConsent').style.display = 'block'; document.getElementById('gamePlayContent').style.display = 'none';
  document.getElementById('gamePlayerBack').classList.add('show');
};
window.beginClassGame = function () {
  const alias = document.getElementById('studentAliasInput')?.value.trim();
  if (!alias) return toast('请先输入课堂昵称或学号');
  if (!document.getElementById('shareConsent').checked) return toast('请先确认你了解课堂记录分享规则');
  window.gameSession.alias = alias.slice(0, 80); document.getElementById('playerConsent').style.display = 'none'; document.getElementById('gamePlayContent').style.display = 'block'; renderGameStep();
};
window.closeGamePlayer = function () { document.getElementById('gamePlayerBack').classList.remove('show'); };
function renderGameStep() {
  const session = window.gameSession; if (!session) return;
  const step = session.steps[session.index]; session.current = { step: step.title, choice: '', reflection: '', skipped: false };
  session.stepStarted = Date.now();
  document.getElementById('gameStepLabel').textContent = step.title;
  document.getElementById('gameStepCount').textContent = `${session.index + 1} / ${session.steps.length}`;
  document.getElementById('gameProgressFill').style.width = `${Math.round((session.index / session.steps.length) * 100)}%`;
  const view = document.getElementById('gameStepView');
  view.replaceChildren();
  const prompt = document.createElement('p'); prompt.className = 'game-step-prompt'; prompt.textContent = step.prompt; view.append(prompt);
  if (step.type === 'storyTree') {
    const tree = document.createElement('div'); tree.className = 'story-tree'; const card = document.createElement('div'); card.className = 'story-tree-node'; const path = []; tree.append(card); view.append(tree);
    const paint = id => { const node = step.nodes?.[id]; if (!node) return; card.replaceChildren(); path.push(node.text); session.current.reflection = path.join(' → '); const story = document.createElement('p'); story.className = 'story-tree-text'; story.textContent = node.text; card.append(story); if (node.end) { const ending = document.createElement('span'); ending.className = 'story-tree-ending'; ending.textContent = '故事结局'; card.append(ending); return; } const choices = document.createElement('div'); choices.className = 'story-tree-choices'; (node.options || []).forEach(option => { const button = document.createElement('button'); button.className = 'game-choice'; button.textContent = option.label; button.onclick = () => { session.current.choice = [...(session.current.choice ? [session.current.choice] : []), option.label].join(' → '); const branch = document.createElement('span'); branch.className = 'story-tree-branch'; branch.textContent = `↳ ${option.label}`; tree.insertBefore(branch, card); paint(option.next); }; choices.append(button); }); card.append(choices); };
    paint(step.start || 'start');
  } else if (step.type === 'collabCanvas') {
    const counter = document.createElement('div'); counter.className = 'canvas-turn'; let turn = 1;
    counter.innerHTML = `<b>第 <span>${turn}</span> 棒</b><span>每人添加一笔后，把设备传给下一位</span>`;
    const canvas = createDrawingBoard(view, currentCanvas => { session.current.drawingData = currentCanvas.toDataURL('image/jpeg', .62); session.current.choice = '小组合作完成画布'; });
    const nextTurn = document.createElement('button'); nextTurn.className = 'btn small'; nextTurn.textContent = '交给下一位 →'; nextTurn.onclick = () => { turn += 1; counter.querySelector('b span').textContent = turn; session.current.reflection = `完成了 ${turn} 棒接力`; nextTurn.classList.remove('turn-pop'); void nextTurn.offsetWidth; nextTurn.classList.add('turn-pop'); };
    counter.append(nextTurn); view.insertBefore(counter, canvas.parentElement);
  } else if (step.type === 'auctionAnimated') {
    const board = document.createElement('div'); board.className = 'auction-board auction-live'; let remaining = 10;
    const allocation = new Map((step.options || []).map(item => [item, 0]));
    const wallet = document.createElement('div'); wallet.className = 'auction-wallet'; wallet.innerHTML = `<span>星点余额</span><b>10</b><div class="auction-coins">${Array.from({ length: 10 }, () => '<i>✦</i>').join('')}</div>`;
    const balance = wallet.querySelector('b'), coins = wallet.querySelector('.auction-coins'); board.append(wallet);
    const resources = document.createElement('div'); resources.className = 'auction-resources';
    const updateAuction = () => { const spent = [...allocation.values()].reduce((sum, value) => sum + value, 0); remaining = 10 - spent; balance.textContent = String(remaining); [...coins.children].forEach((coin, index) => coin.classList.toggle('spent', index >= remaining)); session.current.choice = [...allocation].filter(([, count]) => count).map(([name, count]) => `${name} ${count} 枚`).join('；'); };
    (step.options || []).forEach((name, index) => {
      const card = document.createElement('article'); card.className = 'auction-resource'; card.style.setProperty('--resource-hue', `${index * 55 + 110}deg`);
      const title = document.createElement('b'); title.textContent = name; const controls = document.createElement('div'); controls.className = 'auction-bid-controls';
      const count = document.createElement('span'); count.className = 'auction-bid-count'; count.textContent = '0';
      const minus = document.createElement('button'); minus.type = 'button'; minus.textContent = '−'; minus.setAttribute('aria-label', `减少${name}星点`);
      const plus = document.createElement('button'); plus.type = 'button'; plus.textContent = '＋'; plus.setAttribute('aria-label', `增加${name}星点`);
      minus.onclick = () => { const value = Math.max(0, allocation.get(name) - 1); allocation.set(name, value); count.textContent = value; card.classList.add('bid-pop'); setTimeout(() => card.classList.remove('bid-pop'), 350); updateAuction(); };
      plus.onclick = () => { if (!remaining) return; const value = allocation.get(name) + 1; allocation.set(name, value); count.textContent = value; card.classList.remove('bid-pop'); void card.offsetWidth; card.classList.add('bid-pop'); updateAuction(); };
      controls.append(minus, count, plus); card.append(title, controls); resources.append(card);
    });
    board.append(resources);
    const hammer = document.createElement('button'); hammer.className = 'btn primary auction-hammer'; hammer.textContent = '🔨 敲槌结拍';
    const reveal = document.createElement('p'); reveal.className = 'auction-reveal'; reveal.hidden = true;
    hammer.onclick = () => { const chosen = [...allocation].filter(([, count]) => count); if (!chosen.length) return toast('先把至少一枚星点放到一项支持上'); reveal.hidden = false; reveal.innerHTML = `本轮拍卖完成 ✨<br><b>${chosen.map(([name, count]) => `${escapeHtml(name)} ${count}枚`).join(' · ')}</b>`; board.classList.add('auction-closed'); hammer.disabled = true; session.current.reflection = '小组敲槌完成资源分配'; };
    board.append(hammer, reveal); view.append(board); updateAuction();
  } else if (step.type === 'shred') {
    renderPaperShred(view, () => { session.current.choice = '已碎纸'; });
  } else if (step.type === 'text') {
    const field = document.createElement('textarea'); field.className = 'game-reflection'; field.placeholder = step.placeholder || '写一点点就好……';
    field.setAttribute('aria-label', step.placeholder || '写下你的想法'); field.oninput = () => { session.current.reflection = field.value; }; view.append(field);
  } else if (step.type === 'draw') {
    const canvas = createDrawingBoard(view, currentCanvas => { session.current.drawingData = currentCanvas.toDataURL('image/jpeg', .62); session.current.choice = '完成画布创作'; });
    const saved = session.current.drawingData; if (saved) { const image = new Image(); image.onload = () => canvas.getContext('2d').drawImage(image, 0, 0, canvas.width, canvas.height); image.src = saved; }
  } else if (step.type === 'turns') {
    const turns = document.createElement('div'); turns.className = 'group-turns'; let count = 0;
    const addTurn = () => {
      if (count >= 8) return;
      count += 1; const label = document.createElement('label'); label.textContent = `第 ${count} 位（可跳过）`;
      const field = document.createElement('textarea'); field.className = 'game-reflection'; field.placeholder = '写一句故事 / 一个联想 / 小组共同答案';
      field.oninput = () => { session.current.reflection = [...turns.querySelectorAll('textarea')].map(item => item.value.trim()).filter(Boolean).join(' / '); };
      turns.append(label, field); if (count < 8) { const add = document.createElement('button'); add.className = 'btn small'; add.textContent = '＋下一位'; add.onclick = () => { add.remove(); addTurn(); }; turns.append(add); }
    };
    addTurn(); view.append(turns);
  } else if (step.type === 'auction') {
    const board = document.createElement('div'); board.className = 'auction-board'; const bids = new Map();
    const total = document.createElement('b'); total.className = 'auction-total';
    const update = () => { let spent = 0; board.querySelectorAll('.auction-option').forEach(row => { const input = row.querySelector('input'), option = row.querySelector('span').textContent; const allowed = Math.max(0, 10 - spent), amount = Math.min(allowed, Math.max(0, Number(input.value) || 0)); input.max = String(allowed); input.value = String(amount); bids.set(option, amount); spent += amount; }); total.textContent = `已分配 ${spent} / 10 枚`; session.current.choice = [...bids.entries()].filter(([, amount]) => amount > 0).map(([item, amount]) => `${item}：${amount}枚`).join('；'); };
    (step.options || []).forEach(option => { const row = document.createElement('label'); row.className = 'auction-option'; const name = document.createElement('span'); name.textContent = option; const amount = document.createElement('input'); amount.type = 'number'; amount.min = '0'; amount.max = '10'; amount.value = '0'; amount.oninput = update; row.append(name, amount); board.append(row); });
    board.append(total); view.append(board); update();
  } else if (step.type === 'timer') {
    const timerBox = document.createElement('div'); timerBox.className = 'breath-timer'; timerBox.innerHTML = `<div class="breath-circle">🌬️</div><p>准备好后，按下按钮开始</p><button class="btn soft">开始短练习</button>`;
    const button = timerBox.querySelector('button');
    button.onclick = () => {
      button.disabled = true; let remaining = step.seconds; const p = timerBox.querySelector('p'); p.textContent = `慢慢呼吸，剩余 ${remaining} 秒`;
      const interval = setInterval(() => { remaining -= 1; p.textContent = remaining > 0 ? `慢慢呼吸，剩余 ${remaining} 秒` : '完成了，做得很好。'; if (remaining <= 0) { clearInterval(interval); button.textContent = '完成'; session.current.choice = '完成短呼吸练习'; } }, 1000);
    };
    view.append(timerBox);
  } else {
    const choices = document.createElement('div'); choices.className = 'game-choice-grid';
    step.options.forEach(option => { const button = document.createElement('button'); button.className = 'game-choice'; button.textContent = option; button.onclick = () => { choices.querySelectorAll('.game-choice').forEach(x => x.classList.remove('selected')); button.classList.add('selected'); session.current.choice = option; }; choices.append(button); });
    view.append(choices);
  }
  if (!view.querySelector('textarea')) {
    const optionalNote = document.createElement('label'); optionalNote.className = 'game-optional-note'; optionalNote.textContent = '也可以写一句话，或给作品起个名字（选填）';
    const field = document.createElement('textarea'); field.className = 'game-reflection game-optional-reflection'; field.placeholder = '写一句、起个名字，或补充你想记下的内容……'; field.setAttribute('aria-label', optionalNote.textContent);
    field.oninput = () => { session.current.note = field.value; };
    view.append(optionalNote, field);
  }
  document.getElementById('nextGameStep').textContent = session.index === session.steps.length - 1 ? '完成游戏 ✓' : '下一步 →';
}
function finalizeGameAction(session) {
  const note = String(session.current?.note || '').trim();
  if (note) session.current.reflection = [session.current.reflection, `补充：${note}`].filter(Boolean).join('\n');
  if (session.current) delete session.current.note;
}
window.skipGameStep = async function () { if (window.gameSession) { const session = window.gameSession; finalizeGameAction(session); session.current.skipped = true; session.current.seconds = Math.round((Date.now() - session.stepStarted) / 1000); session.actions.push(session.current); if (!session.privateMode && session.index < session.steps.length - 1) await saveClassGameProgress(); if (session.index < session.steps.length - 1) advanceGame(); else submitClassGame(); } };
window.nextGameStep = async function () {
  const session = window.gameSession; if (!session) return;
  finalizeGameAction(session);
  session.current.seconds = Math.round((Date.now() - session.stepStarted) / 1000);
  session.actions.push(session.current);
  if (!session.privateMode && session.index < session.steps.length - 1) await saveClassGameProgress();
  if (session.index < session.steps.length - 1) advanceGame(); else submitClassGame();
};
function advanceGame() { window.gameSession.index += 1; renderGameStep(); }
async function saveClassGameProgress() {
  const session = window.gameSession; if (!session || session.privateMode || !session.alias) return;
  try {
    const response = await fetch('/api/student/tasks/progress', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ code: session.task.code, completionId: session.completionId, gameId: session.task.gameId, studentAlias: session.alias, actions: session.actions, chat: session.chat, safetyEscalation: Boolean(session.safetyEscalation) }) });
    const data = await response.json(); if (!response.ok) throw new Error(data.error || '保存课堂进度失败');
  } catch (error) { toast(error.message || '课堂进度暂时未保存，请保持页面打开后重试'); }
}
async function submitClassGame(safetyEscalation = false) {
  const session = window.gameSession; const button = document.getElementById('nextGameStep'); button.disabled = true; button.textContent = '正在提交…';
  try {
    const endpoint = session.privateMode ? '/api/student/practices/complete' : '/api/student/tasks/submit';
    const payload = session.privateMode ? { title: session.task.title, completionId: session.completionId, actions: session.actions, chat: session.chat, recommendationOfferId: session.recommendationOfferId } : { code: session.task.code, completionId: session.completionId, gameId: session.task.gameId, studentAlias: session.alias, actions: session.actions, chat: session.chat, safetyEscalation };
    const response = await fetch(endpoint, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(payload) });
    const data = await response.json(); if (!response.ok) throw new Error(data.error || '提交失败');
    if (!session.privateMode && !safetyEscalation && !session.practiceCounted) {
      const progressResponse = await fetch('/api/student/progress/complete', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ completionId: session.completionId, submissionId: data.submissionId, taskCode: session.task.code, title: session.task.title }) });
      const progressData = await progressResponse.json();
      if (progressResponse.ok) { practiceProgress = progressData; session.practiceCounted = true; renderCompanion(); }
      else if (progressData.error) toast(progressData.error);
    }
    if (session.privateMode && !session.practiceCounted) { const progressResponse = await fetch('/api/student/progress'); if (progressResponse.ok) { practiceProgress = await progressResponse.json(); session.practiceCounted = true; renderCompanion(); } }
    document.getElementById('gameStepView').innerHTML = safetyEscalation ? '<div class="game-complete"><div>🤝</div><h3>活动已暂停</h3><p>课堂老师会看到需要及时查看的提示。请现在找一位信任的大人或学校心理老师陪着你；如果你或他人正处于立即危险中，请联系当地紧急服务。</p></div>' : `<div class="game-complete"><div>🌱</div><h3>活动完成，谢谢你的参与</h3><p>${session.privateMode ? '练习记录已保存在你的个人空间。' : '课堂活动记录已提交给老师。'}你可以选择把本次练习的选择和感受发给心伴，获得一条个性化的后续建议。跟进对话只保存在你的私密心伴记录里，老师看不到。</p></div>`;
    document.getElementById('gameProgressFill').style.width = '100%'; document.getElementById('gameStepLabel').textContent = '已完成'; document.getElementById('gameStepCount').textContent = '✓';
    document.getElementById('gameChatArea').replaceChildren(); document.querySelector('.game-player-foot').innerHTML = safetyEscalation ? '<button class="btn primary" onclick="closeGamePlayer()">我会去找大人</button>' : '<button class="btn" onclick="closeGamePlayer()">稍后再说</button><button class="btn primary" onclick="sendGameFollowup()">完成并发送给心伴</button>';
    if (!session.privateMode) loadClassroomTasks();
  } catch (error) { toast(error.message || '提交失败，请重试'); button.disabled = false; button.textContent = '重试提交'; }
}
window.sendGameFollowup = async function () {
  const session = window.gameSession; if (!session || session.followupSent) return;
  const footer = document.querySelector('.game-player-foot'), buttons = [...footer.querySelectorAll('button')]; buttons.forEach(button => button.disabled = true);
  const status = document.createElement('span'); status.className = 'followup-status'; status.textContent = '心伴正在根据本次活动整理回应…'; footer.prepend(status);
  const message = `我刚完成了小游戏「${session.task.title}」，想和你聊聊这次体验。`;
  const activityFeedback = { title: session.task.title, actions: session.actions.map(action => ({ step: action.step, choice: action.choice, reflection: action.reflection, skipped: Boolean(action.skipped), drawingCreated: Boolean(action.drawingData), drawingData: action.drawingData || '' })) };
  try {
    const response = await fetch('/api/student/chat', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ message, studentId: memoryStudentId, conversationId: privateConversationId, scope: 'private', activityContext: { title: session.task.title, completed: true }, activityFeedback, ...companionRequestContext() }) });
    const data = await response.json(); if (!response.ok) throw new Error(data.error || '暂时无法生成跟进');
    session.followupSent = true; status.remove();
    const area = document.getElementById('gameChatArea'); area.replaceChildren();
    const label = document.createElement('p'); label.className = 'game-chat-reply'; label.textContent = `${companionProfile?.name || '心伴芽'}：${data.reply}`; area.append(label);
    if (data.recommendation?.id) { const nextGame = document.createElement('button'); nextGame.className = 'btn small'; nextGame.textContent = `试试下一项练习：${data.recommendation.title}`; nextGame.onclick = () => { closeGamePlayer(); window.startRecommendedGame(data.recommendation.id, data.recommendation.offerId); }; area.append(nextGame); }
    const foot = document.createElement('p'); foot.className = 'followup-private-note'; foot.textContent = '这段跟进已保存在你的私密心伴记录中，老师看不到。'; area.append(foot);
    footer.replaceChildren(); const close = document.createElement('button'); close.className = 'btn primary'; close.textContent = '完成'; close.onclick = closeGamePlayer; footer.append(close);
  } catch (error) { status.textContent = error.message || '发送失败'; buttons.forEach(button => button.disabled = false); const retry = document.createElement('button'); retry.className = 'btn primary'; retry.textContent = '重试发送'; retry.onclick = window.sendGameFollowup; footer.append(retry); }
};
window.toggleGameChat = function () {
  const area = document.getElementById('gameChatArea');
  if (area.querySelector('.game-chat-form')) { area.querySelector('.game-chat-form').remove(); return; }
  const form = document.createElement('div'); form.className = 'game-chat-form';
  form.innerHTML = '<input id="gameChatInput" placeholder="想和心伴说些什么？这段活动对话会一并交给老师"><button class="btn small primary" onclick="sendGameChat()">发送</button>';
  area.append(form);
};
window.sendGameChat = async function () {
  const input = document.getElementById('gameChatInput'); const message = input.value.trim(); if (!message) return;
  const session = window.gameSession; input.disabled = true; session.chat.push({ role: 'student', content: message });
  const submit = async () => {
    const gameConversationId = `class-${session.task.code}-${memoryStudentId}`;
    const response = await fetch('/api/student/chat', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ message, studentId: memoryStudentId, conversationId: session.privateMode ? privateConversationId : gameConversationId, scope: session.privateMode ? 'private' : 'classroom', taskCode: session.privateMode ? undefined : session.task.code, activityContext: { title: session.task.title, currentStep: session.steps[session.index]?.title }, ...companionRequestContext() }) });
    const data = await response.json(); if (!response.ok) throw new Error(data.error || '暂时无法回复');
    session.chat.push({ role: 'assistant', content: data.reply });
    const line = document.createElement('p'); line.className = 'game-chat-reply'; line.textContent = `${companionProfile?.name || '心伴'}：${data.reply}`; document.getElementById('gameChatArea').append(line);
    if (!session.privateMode) await saveClassGameProgress();
    if (data.safetyEscalation) { session.safetyEscalation = true; document.querySelector('.game-player-foot').innerHTML = '<button class="btn primary" onclick="closeGamePlayer()">我会去找大人</button>'; if (session.privateMode) { document.getElementById('gameStepView').innerHTML = '<div class="game-complete"><div>🤝</div><h3>我们先暂停练习</h3><p>请现在联系一位信任的大人或学校心理老师陪着你。如果你或他人正处于立即危险中，请联系当地紧急服务。</p></div>'; document.getElementById('gameChatArea').replaceChildren(); } else await submitClassGame(true); }
  };
  try { await submit(); } catch (error) { session.chat.pop(); toast(error.message || '暂时无法连接'); } finally { input.disabled = false; input.value = ''; }
};

window.publishGame = async function (index) {
  const game = games[index];
  try {
    const response = await fetch('/api/teacher/tasks', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ title: game.title, gameId: game.id || `game-${index}`, game, className: '七年级 2 班' }) });
    const data = await response.json(); if (!response.ok) throw new Error(data.error || '创建课堂任务失败');
    showTaskShare(data.task); loadClassroomTasks();
  } catch (error) { toast(error.message || '操作失败，请稍后重试。'); }
};
function showTaskShare(task) {
  document.getElementById('modalTitle').textContent = '课堂任务已创建';
  document.getElementById('planForm').style.display = 'block'; document.getElementById('planResult').style.display = 'none';
  document.getElementById('planForm').innerHTML = `<div class="task-share"><div class="share-spark">✦</div><h3>${escapeHtml(task.title)}</h3><p>学生在学生端输入下面的课堂码，即可开始游戏。经学生确认后，活动选择、文字、画作和活动中的心伴对话会提交到课堂记录。</p><div class="share-code">${escapeHtml(task.code)}</div><small>${escapeHtml(task.className || '')}</small><div class="modal-actions"><button class="btn" onclick="navigator.clipboard?.writeText('${task.code}').then(()=>toast('课堂码已复制')).catch(()=>toast('请手动复制课堂码'))">复制课堂码</button><button class="btn primary" onclick="closeModal()">完成</button></div></div>`;
  document.querySelector('.modal').classList.add('agent-modal'); document.getElementById('modalback').classList.add('show');
}

function ensureTaskManager() {
  const records = document.getElementById('records'); if (!records || document.getElementById('taskManager')) return;
  const card = document.createElement('div'); card.id = 'taskManager'; card.className = 'card task-manager';
  card.innerHTML = '<div class="cardhead"><h2>已下发课堂游戏</h2><button class="btn small" onclick="loadClassroomTasks()">刷新</button></div><div id="taskManagerRows">正在读取…</div>';
  records.querySelector('.heading').after(card);
}
window.loadClassroomTasks = async function () {
  ensureTaskManager(); const list = document.getElementById('taskManagerRows'); if (!list) return;
  try {
    const response = await fetch('/api/teacher/tasks'); const data = await response.json(); if (!response.ok) throw new Error(data.error || '读取失败');
    if (!data.tasks.length) { list.textContent = '还没有下发课堂游戏。从「备课与游戏」选择一个活动并点击“下发课堂”。'; return; }
    list.replaceChildren();
    data.tasks.forEach(task => {
      const row = document.createElement('div'); row.className = 'course task-manager-row';
      const icon = document.createElement('div'); icon.className = 'course-icon'; icon.textContent = '🎮';
      const meta = document.createElement('div'); meta.className = 'course-meta'; const title = document.createElement('b'); title.textContent = task.title; const small = document.createElement('small'); small.textContent = `${task.className} · 课堂码 ${task.code} · ${task.submissionCount} 份记录`; meta.append(title, small);
      const code = document.createElement('span'); code.className = 'pill'; code.textContent = task.code;
      const view = document.createElement('button'); view.className = 'btn small'; view.textContent = '查看记录'; view.onclick = () => viewTaskRecords(task.code);
      const tune = document.createElement('button'); tune.className = 'btn small'; tune.textContent = '按反馈改游戏'; tune.disabled = !task.submissionCount || !task.game; tune.title = tune.disabled ? '需要有学生提交记录，且任务包含游戏步骤' : '使用匿名汇总数据微调游戏'; tune.onclick = () => tuneTaskFromUsage(task.code);
      row.append(icon, meta, code, view, tune); list.append(row);
    });
  } catch (error) { list.textContent = error.message || '读取课堂任务失败'; }
};
window.tuneTaskFromUsage = async function (code, studentId = null) {
  try {
    const query = studentId ? `?studentId=${encodeURIComponent(studentId)}` : '';
    const response = await fetch(`/api/teacher/tasks/${encodeURIComponent(code)}/insights${query}`), data = await response.json(); if (!response.ok) throw new Error(data.error || '读取课堂汇总失败');
    if (!data.task.game?.steps?.length) throw new Error('这份课堂任务没有可编辑的游戏步骤。');
    window.editGame(null, data.task.game, null, data.summary);
  } catch (error) { toast(error.message || '暂时无法载入课堂反馈'); }
};
window.viewTaskRecords = async function (code) {
  try {
    const response = await fetch(`/api/teacher/tasks/${encodeURIComponent(code)}/submissions`); const data = await response.json(); if (!response.ok) throw new Error(data.error || '读取失败');
    document.getElementById('modalTitle').textContent = `${data.task.title} · 学生记录`;
    const form = document.getElementById('planForm'); form.style.display = 'block'; document.getElementById('planResult').style.display = 'none'; form.replaceChildren();
    if (!data.submissions.length) { const p = document.createElement('p'); p.textContent = '还没有学生提交记录。'; form.append(p); }
    data.submissions.forEach(submission => {
      const article = document.createElement('article'); article.className = 'submission-card';
      const title = document.createElement('b'); title.textContent = `${submission.studentAlias} · ${new Date(submission.submittedAt).toLocaleString()}`; article.append(title);
      const tune = document.createElement('button'); tune.className = 'btn small'; tune.textContent = '按该生参与情况改编'; tune.style.marginLeft = '10px'; tune.onclick = () => { closeModal(); tuneTaskFromUsage(code, submission.studentId); }; article.append(tune);
      if (submission.safetyEscalation) { const flag = document.createElement('span'); flag.className = 'pill red'; flag.textContent = '需要及时查看'; article.append(flag); }
      submission.actions.forEach(action => { const p = document.createElement('p'); p.textContent = `${action.step}${action.skipped ? '（跳过）' : ''}${action.choice ? ` · 选择：${action.choice}` : ''}${action.reflection ? ` · 分享：${action.reflection}` : ''}`; article.append(p); if (action.drawingData) { const image = document.createElement('img'); image.src = action.drawingData; image.alt = `${action.step}学生作品`; image.className = 'submitted-game-drawing'; article.append(image); } });
      if (submission.chat.length) { const label = document.createElement('small'); label.textContent = '活动中的心伴对话'; article.append(label); submission.chat.forEach(item => { const p = document.createElement('p'); p.textContent = `${item.role === 'assistant' ? '棉棉' : submission.studentAlias}：${item.content}`; article.append(p); }); }
      form.append(article);
    });
    const actions = document.querySelector('#planResult .modal-actions'); actions.innerHTML = '<button class="btn primary" onclick="closeModal()">关闭</button>';
    document.querySelector('.modal').classList.add('agent-modal'); document.getElementById('modalback').classList.add('show');
  } catch (error) { toast(error.message || '操作失败，请稍后重试。'); }
};
ensureTaskManager();
const baseSetView = window.setView;
window.setView = function (id) { baseSetView(id); if (id === 'records') loadClassroomTasks(); };

const gameStyle = document.createElement('style');
gameStyle.textContent = `.game-action-row{display:flex;gap:6px;align-items:center;flex-wrap:wrap;margin-top:13px}.game-action-row>span{font-size:10px;color:#9aa49e;margin-right:auto}.class-join-panel{display:flex;align-items:center;gap:11px;padding:12px 15px;background:#f3f7f2;border-bottom:1px solid var(--line);flex:none}.class-join-icon{width:34px;height:34px;border-radius:10px;background:#fff;color:#39715e;display:grid;place-items:center;font-size:19px}.class-join-content{flex:1;min-width:0}.class-join-content>b{font-size:12px}.class-join-content>small{display:block;color:#87938c;font-size:10px;margin-top:3px}.class-join-controls{display:flex;gap:6px;margin-top:7px}.class-join-controls input{width:135px;border:1px solid #e1e9e1;border-radius:7px;padding:7px 9px;text-transform:uppercase;font-size:11px}.joined-task{display:flex;align-items:center;justify-content:space-between;gap:8px;padding-top:8px}.joined-task b{font-size:11px}.joined-task small{display:block;font-size:10px;color:#85918a;margin-top:3px}.game-player-back{display:none;position:fixed;inset:0;z-index:50;background:#20342e75;align-items:center;justify-content:center;padding:16px}.game-player-back.show{display:flex}.game-player{width:min(720px,100%);height:min(88vh,760px);background:white;border-radius:18px;box-shadow:0 18px 70px #142c2040;padding:24px;display:flex;flex-direction:column;overflow:auto}.game-player-head{display:flex;justify-content:space-between;align-items:center}.game-player-head h2{margin:5px 0 14px;font-size:21px}.student-share-note{background:#f8f4e9;color:#8d7443;border-radius:9px;padding:10px 12px;font-size:10px;line-height:1.7}.game-progress-head{display:flex;justify-content:space-between;color:#789087;font-size:11px;margin-top:20px}.game-progress{height:6px;background:#edf1ed;border-radius:9px;margin:8px 0 20px;overflow:hidden}.game-progress i{display:block;height:100%;background:#77ae8e;border-radius:9px;transition:width .25s}.game-step-view{flex:1;min-height:190px}.game-step-prompt{font-size:15px;line-height:1.75;color:#394a42;margin:0 0 18px;white-space:pre-wrap}.game-choice-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:9px}.game-choice{background:#fbfcfa;border:1px solid #e5ebe5;border-radius:10px;padding:12px;text-align:left;font-size:12px}.game-choice:hover,.game-choice.selected{background:#edf6f0;border-color:#82b399;color:#326c5d}.game-reflection{width:100%;min-height:105px;border:1px solid #e3eae3;border-radius:10px;padding:12px;resize:vertical}.breath-timer{text-align:center;padding:5px}.breath-circle{width:86px;height:86px;border-radius:50%;display:grid;place-items:center;margin:0 auto 10px;background:#eef6ef;font-size:30px;animation:breathe 5s ease-in-out infinite alternate}.breath-timer p{color:#708278;font-size:12px}@keyframes breathe{to{transform:scale(1.17);background:#deeee2}}.game-player-foot{display:flex;justify-content:space-between;gap:8px;border-top:1px solid #eef1ee;padding-top:13px}.game-chat-area{margin:8px 0}.game-chat-form{display:flex;gap:7px;margin-top:7px}.game-chat-form input{flex:1;min-width:0;border:1px solid #e3e9e3;border-radius:8px;padding:8px;font-size:11px}.game-chat-reply{font-size:11px;background:#f2f6f1;padding:9px;border-radius:9px;line-height:1.6;white-space:pre-wrap}.game-complete{text-align:center;padding:24px}.game-complete>div{font-size:46px}.game-complete h3{font-size:17px}.game-complete p{font-size:12px;color:#7d8982;line-height:1.7}.task-manager-row{margin-top:9px}.submission-card{border:1px solid var(--line);padding:13px;border-radius:10px;margin:10px 0;font-size:11px;line-height:1.6}.submission-card b{font-size:12px}.submission-card p{margin:6px 0;color:#65736b;white-space:pre-wrap}.submission-card small{color:#718c7c;font-weight:600}@media(max-width:600px){.game-player{padding:17px}.game-choice-grid{grid-template-columns:1fr}.game-action-row>span{width:100%}.game-action-row .btn{flex:1}}`;
document.head.append(gameStyle);
const expandedGameStyle = document.createElement('style');
expandedGameStyle.textContent = `.recommended-game-card{margin-top:12px;padding:12px;background:#fff;border:1px solid #dfe9e1;border-radius:12px}.recommended-game-card b{font-size:12px}.recommended-game-actions{display:flex;align-items:center;gap:8px;flex-wrap:wrap}.recommended-game-card p{font-size:11px;line-height:1.6;color:#718078;margin:6px 0 10px}.game-search{min-width:240px;flex:1;border:1px solid var(--line);border-radius:9px;padding:9px 12px}.game[hidden]{display:none}.game-risk{display:block;margin-top:8px;color:#8b968f;font-size:10px}.game-action-row{justify-content:flex-start}.drawing-board{width:100%;margin:12px 0}.drawing-board canvas{display:block;width:100%;height:clamp(210px,35vh,360px);background:#fff;border:1px solid #dfe8df;border-radius:12px;touch-action:none;cursor:crosshair}.drawing-tools{display:flex;align-items:center;gap:7px;flex-wrap:wrap;margin-top:8px}.draw-color{width:24px;height:24px;border:2px solid white;box-shadow:0 0 0 1px #dce5dd;border-radius:50%}.draw-color.active{box-shadow:0 0 0 2px #326c5d}.drawing-tools .btn{margin-left:auto}.drawing-tools .btn+.btn{margin-left:0}.auction-board{display:grid;gap:8px}.auction-option{display:flex;align-items:center;justify-content:space-between;padding:10px 12px;background:#f8faf8;border-radius:9px;font-size:12px}.auction-option input{width:76px;padding:7px;border:1px solid #dfe8df;border-radius:7px}.auction-total{display:block;text-align:right;color:#326c5d;font-size:12px;padding-top:5px}.group-turns label{display:block;margin:8px 0 5px;color:#607269;font-size:11px}.group-turns .btn{margin:8px 0}.submitted-game-drawing{display:block;max-width:min(100%,500px);max-height:350px;object-fit:contain;border:1px solid #e3eae3;border-radius:10px;margin:6px 0 12px;background:#fff}@media(max-width:600px){.game-search{min-width:100%}.recommended-game-card{padding:10px}.drawing-board canvas{height:250px}}`;
expandedGameStyle.textContent += `.game-research-box{padding:10px 12px;background:#fff;border:1px solid #e3ebe3;border-radius:12px}.game-research-box summary{cursor:pointer;font-size:12px;font-weight:700;color:#326c5d}.game-research-controls{display:flex;gap:7px;flex-wrap:wrap;margin-top:10px}.game-research-controls input{flex:1;min-width:160px;padding:9px;border:1px solid #dfe8df;border-radius:8px}.game-research-privacy{font-size:10px;color:#829087}.game-research-result{display:flex;gap:8px;padding:9px 0;border-top:1px solid #eef1ee;font-size:11px}.game-research-result span{display:grid;gap:4px}.game-research-result small{color:#708078}.game-research-result a{font-size:10px;color:#326c5d}.story-tree-node{padding:14px;background:#f2f7f2;border:1px solid #dbe8db;border-radius:15px;box-shadow:0 4px 12px #253d2d10}.story-tree-text{margin:0 0 12px;line-height:1.7}.story-tree-choices{display:grid;grid-template-columns:repeat(auto-fit,minmax(145px,1fr));gap:8px}.story-tree-branch{display:block;width:max-content;max-width:100%;margin:6px auto;padding:5px 9px;border-radius:99px;background:#fff4dc;color:#806b34;font-size:11px}.story-tree-ending{display:inline-block;padding:6px 10px;background:#e6f2e8;border-radius:99px;color:#326c5d}.canvas-turn{display:flex;align-items:center;gap:12px;padding:10px 12px;background:#f1f6f1;border-radius:10px;color:#326c5d;font-size:12px}.canvas-turn>span{flex:1;color:#718078}.turn-pop{animation:turn-pop .35s ease}@keyframes turn-pop{50%{transform:scale(1.08)}}.auction-live{padding:12px;background:linear-gradient(145deg,#fffaf0,#f5f8f4);border:1px solid #f0e4c8;border-radius:16px}.auction-wallet{display:grid;grid-template-columns:auto auto 1fr;align-items:center;gap:9px;padding:10px;background:#fff;border-radius:12px;color:#7f6c3a;font-size:12px}.auction-wallet b{font-size:21px;color:#326c5d}.auction-coins{display:flex;gap:5px;flex-wrap:wrap}.auction-coins i{display:grid;place-items:center;width:23px;height:23px;border-radius:50%;background:#f5d97a;color:#966c13;font-size:12px;font-style:normal;box-shadow:0 2px 0 #d9b44e}.auction-coins i.spent{opacity:.18;transform:scale(.85)}.auction-resources{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:8px}.auction-resource{display:flex;align-items:center;justify-content:space-between;gap:8px;padding:11px;background:hsl(var(--resource-hue,130deg) 45% 96%);border:1px solid hsl(var(--resource-hue,130deg) 35% 87%);border-radius:12px;transition:transform .25s,box-shadow .25s}.auction-resource b{font-size:11px}.auction-bid-controls{display:flex;align-items:center;gap:7px}.auction-bid-controls button{width:30px;height:30px;border:0;border-radius:50%;background:#fff;color:#326c5d;font-size:17px;cursor:pointer;box-shadow:0 2px 7px #334b3518}.auction-bid-count{min-width:18px;text-align:center;font-weight:700;color:#326c5d}.bid-pop{animation:bid-pop .32s ease}@keyframes bid-pop{50%{transform:translateY(-4px) scale(1.04);box-shadow:0 7px 16px #d6b95b55}}.auction-hammer{justify-self:center;animation:hammer-wiggle 1.6s ease-in-out infinite}@keyframes hammer-wiggle{0%,84%,100%{transform:rotate(0)}88%{transform:rotate(-8deg)}94%{transform:rotate(7deg)}}.auction-closed .auction-resource{opacity:.68}.auction-reveal{padding:12px;text-align:center;background:#fff4d6;border-radius:12px;line-height:1.7;animation:bid-pop .35s}.auction-preview{display:grid;grid-template-columns:repeat(2,1fr);gap:8px;margin-top:12px}.followup-status,.followup-private-note{font-size:11px;color:#738078}.followup-private-note{margin:7px 0}@media(max-width:560px){.auction-wallet{grid-template-columns:auto auto}.auction-coins{grid-column:1/-1}.story-tree-choices{grid-template-columns:1fr}}`;
document.head.append(expandedGameStyle);
const consentStyle = document.createElement('style');
consentStyle.textContent = `.joined-task .alias-input{display:block;width:140px;margin-top:5px;border:1px solid #e1e9e1;border-radius:7px;padding:6px 8px;font-size:10px}.player-consent{display:flex;flex-direction:column;gap:15px;max-width:520px;margin:25px auto}.consent-check{display:flex;gap:9px;align-items:flex-start;font-size:12px;line-height:1.6;color:#596b61}.consent-check input{margin:2px 0 0}`;
document.head.append(consentStyle);
const companionStyle = document.createElement('style');
companionStyle.textContent = `.abstract-pet{width:92px;height:92px;overflow:visible}.companion-setup{background:#fbfcf9;border:1px solid #e7ece7;border-radius:11px;padding:11px;margin:15px 0;text-align:left}.companion-setup label{display:block;font-size:10px;color:#819087;margin-bottom:6px}.companion-setup select{width:100%;border:1px solid #e2e9e2;border-radius:7px;padding:7px;background:white;font-size:11px;color:#40554a}.companion-setup #companionDescription{font-size:10px;color:#77857f;line-height:1.6;margin:8px 0}.companion-setup button{width:100%}`;
document.head.append(companionStyle);

async function restorePrivateConversation() {
  try {
    const query = new URLSearchParams({ studentId: memoryStudentId, conversationId: privateConversationId });
    const response = await fetch(`/api/student/memory?${query}`); const data = await response.json();
    if (!response.ok || !data.messages?.length) { privateMessages = []; return; }
    privateMessages = data.messages;
    const messages = document.getElementById('messages'); messages.replaceChildren();
    data.messages.forEach(item => addChatMessage(item.role === 'user' ? 'user' : 'assistant', item.content));
  } catch { /* Keep the welcome messages if local memory cannot be loaded. */ }
}
window.clearPrivateMemory = async function () {
  if (!window.confirm('确定清除这段自主对话及其记忆吗？清除后 Agent 将不再记得之前的聊天。')) return;
  try {
    const query = new URLSearchParams({ studentId: memoryStudentId, conversationId: privateConversationId });
    const response = await fetch(`/api/student/memory?${query}`, { method: 'DELETE' });
    const data = await response.json(); if (!response.ok) throw new Error(data.error || '清除失败');
    privateConversationId = crypto.randomUUID ? crypto.randomUUID() : `id_${Date.now()}_${Math.random().toString(36).slice(2)}`;
    try { localStorage.setItem(`xinban.private.conversation.${profileKey}`, privateConversationId); } catch {}
    conversationHistory = [];
    const messages = document.getElementById('messages'); messages.replaceChildren();
    addChatMessage('assistant', '你好，我在这里陪你。之前的自主聊天记忆已清除；你可以从现在开始新的对话。');
    toast('自主对话记忆已清除');
  } catch (error) { toast(error.message || '操作失败，请稍后重试。'); }
};
const memoryStyle = document.createElement('style');
memoryStyle.textContent = `.memory-disclosure{display:flex;align-items:center;gap:10px;padding:9px 14px;background:#f7f8f3;border-bottom:1px solid #edf0e9;color:#718078;font-size:10px;line-height:1.55}.memory-disclosure span{flex:1}.memory-disclosure .btn{flex:none;white-space:nowrap}.chat-share-modal{width:min(760px,100%)}.chat-share-controls{display:flex;align-items:end;gap:8px;flex-wrap:wrap;margin:8px 0 12px}.chat-share-controls label{font-size:11px;color:#718078;display:grid;gap:5px}.chat-share-controls select{min-width:160px;padding:8px 10px;border:1px solid #e1e9e2;border-radius:8px;background:white}.share-message-list{max-height:52vh;overflow:auto;border:1px solid #e9eee9;border-radius:12px;padding:4px 12px}.share-message-row{display:flex;align-items:flex-start;gap:10px;padding:12px 3px;border-bottom:1px solid #f0f2ef;cursor:pointer}.share-message-row:last-child{border-bottom:0}.share-message-row>input{margin:4px 0 0;accent-color:#326c5d}.share-message-row>span{display:grid;gap:4px;min-width:0}.share-message-row b{font-size:11px;color:#326c5d}.share-message-row span span{font-size:12px;line-height:1.6;white-space:pre-wrap;overflow-wrap:anywhere}.share-message-row small{font-size:10px;color:#94a098}.chat-avatar{width:32px;height:35px;display:block;flex:none;object-fit:contain;background:#f7f8f3;border-radius:10px}.chat-head .chat-avatar{width:45px;height:48px}.student-layout .heart-sprout{width:150px;height:164px;object-fit:contain;background:#f7f8f3;border-radius:18px}.msg .tiny{display:flex;align-items:center;justify-content:center;width:36px;height:38px;flex:none}.msg .tiny .chat-avatar{width:35px;height:38px}`;
document.head.append(memoryStyle);
// The role-specific entry page initializes a student's scoped memory after sign-in.

function installStudentTextarea() {
  const old = document.getElementById('chatInput'); if (!old || old.tagName === 'TEXTAREA') return;
  const area = document.createElement('textarea'); area.id = old.id; area.placeholder = old.placeholder; area.setAttribute('aria-label', '输入想和心伴说的话'); area.rows = 3;
  area.onkeydown = event => { if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); window.sendChat(); } };
  old.replaceWith(area);
}
installStudentTextarea();
const loginStyle = document.createElement('style');
loginStyle.textContent = `.chat-input{align-items:flex-end}.chat-input textarea{flex:1;min-width:0;min-height:82px;max-height:150px;resize:vertical;border:1px solid var(--line);border-radius:12px;padding:13px;outline:none;font:inherit;font-size:14px;line-height:1.6}.chat-input textarea:focus{border-color:#9cbeab;box-shadow:0 0 0 3px #326c5d12}.chat-input button{height:46px;flex:none}.animal-orb{width:104px;height:104px;margin:12px auto;border-radius:38% 45% 42% 47%;display:grid;place-items:center;position:relative;font-size:62px;box-shadow:inset 0 -7px 14px #496d5010}.animal-orb i{position:absolute;right:5px;bottom:4px;font-size:25px;font-style:normal}.login-overlay{position:fixed;inset:0;z-index:100;background:linear-gradient(145deg,#eaf3eeed,#f6f7f1f2);display:grid;place-items:center;padding:18px}.login-card{width:min(480px,100%);background:#fff;border:1px solid #e6ede7;border-radius:22px;padding:32px;box-shadow:0 22px 90px #25433320}.login-brand{display:flex;align-items:center;gap:12px;margin-bottom:26px}.login-brand .brandmark{width:44px;height:44px}.login-card h1{font-size:24px;margin:0 0 8px}.login-card p{font-size:12px;color:#77857f;line-height:1.8;margin:0 0 20px}.login-roles{display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:14px}.login-role{border:1px solid #e6ece6;border-radius:12px;padding:16px;background:#fff;text-align:left}.login-role.selected{border-color:#79a98d;background:#f1f7f2;color:#326c5d}.login-role b{display:block;font-size:14px;margin-bottom:5px}.login-role small{color:#86928b;font-size:10px}.login-mode{display:flex;gap:6px;padding:4px;background:#f4f7f3;border-radius:9px;margin:0 0 16px}.login-mode button{flex:1;padding:9px;background:transparent;border-radius:7px;color:#75837a;font-size:11px}.login-mode button.selected{background:white;color:#326c5d;font-weight:600;box-shadow:0 1px 4px #1b382414}.login-card label{display:block;color:#64746b;font-size:11px}.login-card input{width:100%;padding:12px;border:1px solid #e3eae3;border-radius:9px;margin:7px 0 14px}.login-card .login-enter{width:100%;padding:12px}.login-error{margin-top:10px;padding:10px 12px;border-radius:9px;background:#fff0ed;color:#a64032;font-size:12px;line-height:1.6}.login-safety{margin-top:14px;font-size:10px!important;text-align:center}.topright .logout{font-size:10px;padding:7px 9px}@media(max-width:520px){.login-card{padding:24px 20px}.chat-input{padding:10px}.chat-input textarea{min-height:72px}}`;
document.head.append(loginStyle);
const studentExperienceStyle = document.createElement('style');
studentExperienceStyle.textContent = `.student-layout{width:min(1480px,100%);grid-template-columns:250px minmax(0,1fr);gap:28px;padding-top:22px}.student-layout .chatbox{height:calc(100vh - 145px);min-height:540px;max-height:1000px}.student-layout .messages .bubble{max-width:82%;font-size:14px}.student-layout .chat-input textarea{min-height:110px;font-size:15px}.heart-sprout{display:block;width:138px;height:145px;margin:6px auto 10px;overflow:visible;filter:drop-shadow(0 5px 3px #486d5010)}.companion-progress{margin:10px 0 15px;text-align:left}.growth-count{font-size:11px;color:#607269}.growth-count b{font-size:15px;color:#326c5d}.growth-track{height:6px;margin:7px 0 5px;background:#fff;border-radius:99px;overflow:hidden}.growth-track i{display:block;height:100%;border-radius:99px;background:linear-gradient(90deg,#88b997,#eac985);transition:width .3s}.companion-progress small{font-size:9px;color:#88968d}.companion-modal{width:min(760px,100%)}.collection-intro{font-size:11px;color:#77857f;margin:6px 0 0}.companion-collection{display:grid;grid-template-columns:repeat(5,minmax(0,1fr));gap:11px}.collection-item{display:flex;flex-direction:column;align-items:center;gap:7px;min-width:0;padding:13px 8px;border:1px solid #e7ece7;border-radius:13px;background:#fff;text-align:center}.collection-item.unlocked{cursor:pointer}.collection-item.selected{border-color:#78a98b;background:#f2f7f1}.collection-item.locked{opacity:.58}.collection-art{display:grid;place-items:center;width:58px;height:58px;border-radius:18px;background:var(--item-color);font-size:29px}.collection-item b{font-size:11px}.collection-item small{font-size:9px;color:#77857f;line-height:1.4}.collection-status{font-size:9px;color:#658a70}.collection-item.locked .collection-status{color:#a18b61}.practice-history{margin-top:20px;border-top:1px solid #e9eee9;padding-top:12px}.practice-history h3{font-size:12px;margin:0 0 8px}.practice-history>p{font-size:10px;color:#87938c}.practice-history-row{display:flex;justify-content:space-between;gap:12px;padding:8px 0;border-bottom:1px solid #f0f2ef;font-size:10px}.practice-history-row small{color:#87938c;white-space:nowrap}@media(max-width:850px){.student-layout{width:100%;grid-template-columns:1fr;padding:16px;gap:14px}.student-layout .pet-card{display:block;padding:12px}.student-layout .heart-sprout{width:92px;height:96px;margin:0 auto}.student-layout .pet-items{margin:7px}.student-layout .pet-card p{margin:4px}.student-layout .companion-setup{max-width:420px;margin:7px auto}.student-layout .pet-tabs{margin:7px 0}.student-layout .chatbox{height:calc(100vh - 315px);min-height:460px}.companion-collection{grid-template-columns:repeat(2,minmax(0,1fr))}}@media(max-width:520px){.student-layout{padding:10px}.student-layout .pet-card .eyebrow,.student-layout .pet-card p,.student-layout .pet-items{display:none}.student-layout .pet-card{display:grid;grid-template-columns:74px 1fr;align-items:center;text-align:left;column-gap:10px}.student-layout .heart-sprout{grid-row:span 3;width:72px;height:75px}.student-layout .pet-card h3{margin:0}.student-layout .companion-setup{grid-column:2;margin:3px 0;padding:6px}.student-layout .companion-setup label,.student-layout .companion-setup #companionDescription{display:none}.student-layout .companion-setup select{margin:0;padding:5px}.student-layout .pet-tabs{grid-column:2;justify-content:flex-start;margin:3px 0}.student-layout .companion-progress{grid-column:1/-1;width:100%;margin:0}.student-layout .chatbox{height:calc(100vh - 260px);min-height:380px}.student-layout .messages{padding:12px}.student-layout .messages .bubble{max-width:88%;font-size:13px}.student-layout .chat-input textarea{min-height:76px}.companion-modal{padding:16px}.collection-item{padding:10px 5px}}`;
document.head.append(studentExperienceStyle);
const expandedStudentChatStyle = document.createElement('style');
expandedStudentChatStyle.textContent = `.student-layout{width:min(1680px,100%);grid-template-columns:220px minmax(0,1fr);gap:20px;padding:18px 24px 36px}.student-layout .chatbox{height:calc(100dvh - 105px);min-height:650px;max-height:none}.student-layout .messages{padding:24px}.game-player{width:min(920px,100%);height:min(94dvh,980px);max-height:94dvh}.game-step-view{min-height:240px}.game-optional-note{display:block;margin:14px 0 6px;color:#77857f;font-size:11px}.game-optional-reflection{min-height:78px}.game-reflection:focus{outline:2px solid #a3c5ad;outline-offset:1px}@media(max-width:850px){.student-layout{width:100%;grid-template-columns:1fr;padding:14px 16px 28px;gap:12px}.student-layout .chatbox{height:calc(100dvh - 250px);min-height:540px}.student-layout .messages{padding:18px}}@media(max-width:520px){.student-layout .chatbox{height:calc(100dvh - 220px);min-height:440px}.student-layout .messages{padding:12px}.game-player{height:96dvh;max-height:96dvh;padding:15px}.game-step-view{min-height:200px}.game-optional-reflection{min-height:70px}}`;
document.head.append(expandedStudentChatStyle);
function accountHash(value) { let hash = 2166136261; for (const char of value) { hash ^= char.charCodeAt(0); hash = Math.imul(hash, 16777619); } return (hash >>> 0).toString(36); }
let teacherGreetingTimer;
function updateTeacherGreeting(displayName) {
  const now = new Date(), hour = now.getHours();
  const greeting = hour < 11 ? '早上好' : hour < 18 ? '下午好' : '晚上好';
  const weekday = new Intl.DateTimeFormat('en-US', { weekday: 'long' }).format(now).toUpperCase();
  const date = new Intl.DateTimeFormat('zh-CN', { month: 'numeric', day: 'numeric' }).format(now);
  const dateNode = document.querySelector('#home .eyebrow'), titleNode = document.querySelector('#home .heading h1');
  if (dateNode) dateNode.textContent = `${weekday} · ${date}`;
  if (titleNode) titleNode.textContent = `${greeting}，${displayName} 🌿`;
  if (teacherGreetingTimer) clearInterval(teacherGreetingTimer);
  teacherGreetingTimer = setInterval(() => updateTeacherGreeting(displayName), 60_000);
}
function applyAuthenticatedUser(user) {
  const role = user.role, displayName = user.displayName || (role === 'teacher' ? '老师' : '同学');
  activeUserRole = role;
  if (role === 'teacher') updateTeacherGreeting(displayName);
  profileKey = `${role}-${accountHash(user.id)}`;
  const roleButton = document.querySelector(`[data-role="${role}"]`); if (roleButton) roleButton.click();
  document.querySelector('.user span').textContent = displayName;
  document.querySelector('.user .avatar').textContent = displayName.slice(0, 1) || (role === 'teacher' ? '师' : '同');
  memoryStudentId = user.id;
  privateConversationId = getPersistentId(`xinban.private.conversation.${profileKey}`);
  companionAnimal = localStorage.getItem(`xinban.companion.animal.${profileKey}`) || 'abstract';
  if (!animalOptions[companionAnimal]) companionAnimal = 'abstract';
  try { dailyAppearance = JSON.parse(localStorage.getItem(`xinban.companion.appearance.${profileKey}`) || 'null'); } catch { dailyAppearance = null; }
  const picker = document.getElementById('companionAnimal'); if (picker) picker.value = companionAnimal;
  renderCompanion();
  if (role === 'student') { restorePrivateConversation().then(refreshDailyAppearance); loadPracticeProgress(); }
  if (role === "teacher") loadTeacherResources();
  document.getElementById('loginOverlay')?.remove();
}
function showLogin(initialRole = activeUserRole || 'teacher') {
  const existingOverlay = document.getElementById('loginOverlay');
  if (existingOverlay) {
    const target = existingOverlay.querySelector(`[data-login-role="${initialRole}"]`);
    if (target) target.click();
    return;
  }
  const overlay = document.createElement('div'); overlay.id = 'loginOverlay'; overlay.className = 'login-overlay';
  overlay.innerHTML = `<section class="login-card"><div class="login-brand"><div class="brandmark">✿</div><div><b>心伴</b><small style="display:block;color:#9aa59f;font-size:9px;letter-spacing:1px;margin-top:3px">MINDFUL LEARNING SPACE</small></div></div><h1>欢迎来到心伴</h1><p>教师与学生使用各自独立的账号。请选择身份，再登录或注册。</p><div class="login-roles"><button class="login-role selected" data-login-role="teacher"><b>教师</b><small>备课工作台与课堂管理</small></button><button class="login-role" data-login-role="student"><b>学生</b><small>聊天、练习与心伴小动物</small></button></div><div class="login-mode"><button class="selected" data-mode="login">登录</button><button data-mode="register">注册新账号</button></div><div id="registerNameWrap" style="display:none"><label for="loginName">显示名称</label><input id="loginName" maxlength="24" placeholder="例如：林老师 / 小树同学"></div><div id="teacherInviteWrap" style="display:none"><label for="teacherInvite">教师邀请码</label><input id="teacherInvite" maxlength="100" autocomplete="off" placeholder="向平台管理员获取"></div><label for="loginAccount">账号</label><input id="loginAccount" maxlength="48" autocomplete="username" placeholder="3–48 位字母、数字或 . _ @ -"><label for="loginPassword">密码</label><input id="loginPassword" type="password" minlength="8" maxlength="128" autocomplete="current-password" placeholder="至少 8 位"><button id="loginEnter" class="btn primary login-enter">登录并进入教师端</button><p class="login-safety">本平台为心理教育练习工具，不替代专业心理诊疗。如有严重心理困扰，请联系学校心理老师或专业医疗机构。</p></section>`;
  document.body.append(overlay);
  const errorBox = document.createElement("div"); errorBox.id = "loginError"; errorBox.className = "login-error"; errorBox.style.display = "none";
  overlay.querySelector("#loginEnter")?.after(errorBox);
  let selectedRole = initialRole;
  let mode = 'login';
  const updateSubmitLabel = () => { document.getElementById('loginEnter').textContent = mode === 'register' ? '注册并进入' : `登录并进入${selectedRole === 'teacher' ? '教师端' : '学生端'}`; document.getElementById('teacherInviteWrap').style.display = mode === 'register' && selectedRole === 'teacher' ? 'block' : 'none'; };
  const selectRole = role => { selectedRole = role; overlay.querySelectorAll('[data-login-role]').forEach(item => item.classList.toggle('selected', item.dataset.loginRole === role)); document.getElementById('loginName').placeholder = selectedRole === 'teacher' ? '例如：林老师' : '例如：小树同学'; updateSubmitLabel(); };
  overlay.querySelectorAll('[data-login-role]').forEach(button => button.onclick = () => selectRole(button.dataset.loginRole));
  overlay.querySelectorAll('[data-mode]').forEach(button => button.onclick = () => { mode = button.dataset.mode; overlay.querySelectorAll('[data-mode]').forEach(item => item.classList.toggle('selected', item === button)); document.getElementById('registerNameWrap').style.display = mode === 'register' ? 'block' : 'none'; document.getElementById('loginPassword').autocomplete = mode === 'register' ? 'new-password' : 'current-password'; updateSubmitLabel(); });
  document.getElementById('loginEnter').onclick = async () => {
    const errorBox = document.getElementById('loginError'); if (errorBox) { errorBox.textContent = ''; errorBox.style.display = 'none'; }
    const username = document.getElementById('loginAccount').value.trim(), password = document.getElementById('loginPassword').value;
    const displayName = document.getElementById('loginName')?.value.trim() || '';
    const button = document.getElementById('loginEnter'); button.disabled = true;
    try {
      const inviteCode = document.getElementById('teacherInvite')?.value || '';
      const response = await fetch(`/api/auth/${mode === 'register' ? 'register' : 'login'}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ role: selectedRole, username, password, displayName, inviteCode }) });
      const data = await response.json(); if (!response.ok) throw new Error(data.error || '登录失败');
      applyAuthenticatedUser(data.user); toast(mode === 'register' ? '账号已创建' : '登录成功');
    } catch (error) { if (errorBox) { errorBox.textContent = error.message || '账号或密码不正确，请检查所选身份。'; errorBox.style.display = 'block'; } else toast(error.message || '登录失败，请稍后重试。'); }
    finally { if (document.getElementById('loginEnter')) document.getElementById('loginEnter').disabled = false; }
  };
  selectRole(initialRole);
  document.getElementById('loginPassword').onkeydown = event => { if (event.key === 'Enter') document.getElementById('loginEnter').click(); };
}
const logout = document.createElement('button'); logout.className = 'btn logout'; logout.textContent = '退出登录'; logout.onclick = async () => { await fetch('/api/auth/logout', { method: 'POST' }); showLogin(); }; document.querySelector('.user').append(logout);
fetch('/api/auth/me').then(async response => { if (!response.ok) throw new Error('signed out'); const data = await response.json(); applyAuthenticatedUser(data.user); }).catch(showLogin);
document.querySelectorAll('.role-switch button').forEach(button => {
  button.onclick = () => {
    const requestedRole = button.dataset.role;
    if (requestedRole !== activeUserRole) { showLogin(requestedRole); return; }
    document.querySelectorAll('.role-switch button').forEach(item => item.classList.toggle('active', item === button));
    document.getElementById('teacherApp').style.display = requestedRole === 'teacher' ? 'flex' : 'none';
    document.getElementById('studentApp').style.display = requestedRole === 'student' ? 'block' : 'none';
  };
});

function parseTeacherResource(content) {
  const entries = String(content || '').split(/\n\n(?=(?:教师|Agent)：)/).map(part => {
    const match = part.match(/^(教师|Agent)：([\s\S]*)$/);
    return match ? { role: match[1] === '教师' ? 'user' : 'assistant', content: match[2].trim() } : null;
  }).filter(item => item?.content);
  return entries.length ? entries : [{ role: 'assistant', content: String(content || '') }];
}
function editSavedResource(resource) {
  if (resource.kind === '自定义游戏') {
    try { window.editGame(null, JSON.parse(resource.content), resource); } catch { showTeacherResource(resource); }
    return;
  }
  if (/备课|课程/.test(resource.kind)) { window.openPlan(resource); return; }
  showTeacherResource(resource);
}

async function persistTeacherDraft() {
  if (!teacherDraftId || !teacherHistory.length) return;
  const firstPrompt = teacherHistory.find(item => item.role === 'user')?.content || '备课对话';
  const content = teacherHistory.map(item => `${item.role === 'user' ? '教师' : 'Agent'}：${item.content}`).join('\n\n');
  try {
    const response = await fetch('/api/teacher/resources', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ id: teacherDraftId, title: teacherDraftTitle || firstPrompt.slice(0, 60), kind: teacherDraftKind, content }) });
    const data = await response.json(); if (!response.ok) throw new Error(data.error || '保存失败');
    loadTeacherResources();
  } catch (error) { toast(error.message || '备课内容暂未保存'); }
}

async function loadTeacherResources() {
  const container = document.querySelector('#library .card'); if (!container) return;
  try {
    const response = await fetch('/api/teacher/resources'); const data = await response.json(); if (!response.ok) throw new Error(data.error || '读取失败');
    container.replaceChildren();
    if (!data.resources.length) { const empty = document.createElement('p'); empty.className = 'resource-empty'; empty.textContent = '这里会保存当前账号创建的备课对话和课程内容。'; container.append(empty); return; }
    for (const resource of data.resources) {
      const row = document.createElement('div'); row.className = 'course';
      const icon = document.createElement('div'); icon.className = 'course-icon'; icon.textContent = resource.kind === '课程方案' ? '📚' : '✦';
      const meta = document.createElement('div'); meta.className = 'course-meta';
      const title = document.createElement('b'); title.textContent = resource.title;
      const updated = document.createElement('small'); updated.textContent = `${resource.kind} · ${new Date(resource.updatedAt).toLocaleString()}`;
      meta.append(title, updated);
      const badge = document.createElement('span'); badge.className = 'pill'; badge.textContent = resource.kind;
      const open = document.createElement('button'); open.className = 'btn small'; open.textContent = resource.kind === '自定义游戏' || /备课|课程/.test(resource.kind) ? '编辑' : '查看'; open.onclick = () => editSavedResource(resource);
      const remove = document.createElement('button'); remove.className = 'btn small'; remove.textContent = '删除'; remove.onclick = async () => { if (!confirm('删除这份个人资源？')) return; const result = await fetch(`/api/teacher/resources/${encodeURIComponent(resource.id)}`, { method: 'DELETE' }); if (result.ok) loadTeacherResources(); else toast('删除失败，请稍后重试'); };
      row.append(icon, meta, badge, open, remove); container.append(row);
    }
  } catch (error) { container.replaceChildren(); const message = document.createElement('p'); message.className = 'resource-empty'; message.textContent = error.message || '个人资源暂时无法读取'; container.append(message); }
}

function showTeacherResource(resource) {
  const modal = document.getElementById('detailModal'); if (!modal) return;
  document.getElementById('detailTitle').textContent = resource.title;
  const body = document.getElementById('detailBody'); body.replaceChildren();
  const type = document.createElement('p'); type.textContent = `${resource.kind} · ${new Date(resource.updatedAt).toLocaleString()}`;
  const content = document.createElement('div'); content.innerHTML = renderMarkdown(resource.content); content.style.lineHeight = '1.7';
  body.append(type, content); modal.classList.add('show');
}



window.savePlanResource = async function () {
  const content = document.getElementById('planReply')?.textContent?.trim() || teacherHistory.map(item => `${item.role}: ${item.content}`).join('\n\n');
  if (!content) return toast('没有可保存的课程内容');
  if (!teacherDraftId) teacherDraftId = crypto.randomUUID ? crypto.randomUUID() : `draft_${Date.now()}_${Math.random().toString(36).slice(2)}`;
  const title = document.getElementById('theme')?.value || teacherHistory.find(item => item.role === 'user')?.content?.slice(0, 60) || '课程方案';
  teacherDraftTitle = title; teacherDraftKind = '课程方案';
  try {
    const response = await fetch('/api/teacher/resources', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ id: teacherDraftId, title, kind: '课程方案', content }) });
    const data = await response.json(); if (!response.ok) throw new Error(data.error || '保存失败');
    await loadTeacherResources(); toast('已保存到当前教师账号的资源库'); closeModal();
  } catch (error) { toast(error.message || '保存失败，请稍后重试'); }
};
const savePlanButton = document.querySelector('#planResult .modal-actions .btn:nth-child(2)'); if (savePlanButton) savePlanButton.onclick = window.savePlanResource;

function renderPaperShred(view, onFinish) {
  const paper = document.createElement('textarea');
  paper.placeholder = '写一个词，或直接投入空白纸条';
  paper.setAttribute('aria-label','临时纸条');
  paper.className = 'game-reflection';
  const action = document.createElement('button');
  action.className = 'btn primary';
  action.textContent = '投入碎纸机';
  action.onclick = () => {
    paper.value = '';
    paper.remove();
    action.disabled = true;
    action.textContent = '纸条已变成碎片';
    const confetti = document.createElement('div');
    confetti.className = 'paper-confetti';
    confetti.setAttribute('aria-hidden','true');
    confetti.textContent = '▧　▥　▨　▥　▧';
    view.append(confetti);
    onFinish();
  };
  view.append(paper, action);
}
const libraryTheme = document.createElement('style');
libraryTheme.textContent = `#gameGrid .game{background:linear-gradient(155deg,#f3f0fc 0%,white 48%);border:1px solid #e2dfee;border-radius:20px;display:flex;flex-direction:column;gap:4px}
#gameGrid .game:nth-child(even){background:linear-gradient(155deg,#e4f5ee,white 48%)}#gameGrid .game[hidden]{display:none}#gameGrid .game-foot{margin-top:auto;padding-top:12px}#gameGrid .gicon{align-self:flex-start;border-radius:16px;background:#fff;box-shadow:0 3px 12px #38483812}.paper-confetti{color:#806ab0;font-size:2rem;letter-spacing:5px}@media(prefers-reduced-motion:no-preference){.paper-confetti{animation:paperFall .65s ease-out}@keyframes paperFall{from{opacity:0;transform:translateY(-20px)}to{opacity:1;transform:translateY(0)}}}`;
document.head.append(libraryTheme);
