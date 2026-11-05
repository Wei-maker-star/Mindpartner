// Connect the prototype UI to the local backend and provide an iterative teacher agent chat.
let conversationHistory = [];
let sendingStudentMessage = false;
let teacherHistory = [];
let teacherSending = false;
const animalOptions = { abstract: '抽象小动物', cat: '小猫', rabbit: '小兔', fox: '小狐狸', bear: '小熊', dog: '小狗' };
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

function addChatMessage(role, content, showActivity = false, containerId = 'messages') {
  const row = document.createElement('div');
  row.className = role === 'user' ? 'msg user' : 'msg';
  if (role !== 'user') {
    const icon = document.createElement('span'); icon.className = 'tiny'; icon.textContent = role === 'teacher' ? '✦' : companionFace(); row.append(icon);
  }
  const bubble = document.createElement('div'); bubble.className = 'bubble'; bubble.textContent = content;
  if (showActivity) {
    const button = document.createElement('button'); button.className = 'suggestion'; button.style.marginTop = '9px';
    button.textContent = '想试试一个小练习'; button.onclick = () => toast('练习已开始：当前为演示，不会保存或同步记录');
    bubble.append(document.createElement('br'), button);
  }
  row.append(bubble);
  if (role === 'user') { const icon = document.createElement('span'); icon.className = 'tiny'; icon.textContent = '🙂'; row.append(icon); }
  const messages = document.getElementById(containerId); messages.append(row); messages.scrollTop = messages.scrollHeight;
}

function setProgress(containerId, text) {
  const box = document.getElementById(containerId);
  box.innerHTML = `<div class="agent-progress"><div class="agent-progress-label"><span class="agent-spinner"></span><span>${text}</span></div><div class="agent-progress-track"><i></i></div></div>`;
}
function clearProgress(containerId) { document.getElementById(containerId)?.replaceChildren(); }

window.openPlan = function () {
  teacherHistory = []; teacherSending = false;
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
  addChatMessage('teacher', '把你的备课想法发给我。我可以先整理课程大纲，再继续生成单课教案、PPT 大纲和配套游戏。', false, 'teacherAgentMessages');
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
    clearProgress('teacherAgentProgress'); addChatMessage('teacher', data.reply, false, 'teacherAgentMessages');
  } catch (error) {
    clearProgress('teacherAgentProgress'); addChatMessage('teacher', `${error.message || '暂时无法连接'}。请检查后端和 TokenDance 配置后重试。`, false, 'teacherAgentMessages');
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
  } catch (error) { toast(error.message || '暂时无法连接后端'); }
  finally { button.disabled = false; button.textContent = original; }
};

window.sendText = async function (message) {
  if (sendingStudentMessage || !message.trim()) return;
  sendingStudentMessage = true; addChatMessage('user', message);
  const button = document.querySelector('.chat-input button'); button.disabled = true;
  const progress = document.createElement('div'); progress.id = 'studentProgress'; document.querySelector('.chat-suggestions').before(progress);
  setProgress('studentProgress', '棉棉正在认真听…');
  try {
    const response = await fetch('/api/student/chat', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ message, studentId: memoryStudentId, conversationId: privateConversationId, scope: 'private', ...companionRequestContext() }) });
    const data = await response.json(); if (!response.ok) throw new Error(data.error || '暂时无法连接');
    clearProgress('studentProgress'); addChatMessage('assistant', data.reply, !data.safetyEscalation);
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
function renderGameCatalog(filter = 'all') {
  const grid = document.getElementById('gameGrid'); if (!grid) return;
  const selected = filter || 'all';
  grid.innerHTML = games.map((g, i) => ({ g, i })).filter(({ g }) => selected === 'all' || g.tags.includes(selected)).map(({ g, i }) =>
    `<article class="game"><div class="gicon">${g.icon}</div><h3>${g.title}</h3><p>${g.desc}</p><div class="game-foot"><span class="pill">${g.tags[0]}</span><span style="font-size:10px;color:#8c9991">${g.people}</span></div><div class="game-action-row"><span>${g.risk}</span><button class="btn small" onclick="editGame(${i})">活动详情</button><button class="btn small primary" onclick="publishGame(${i})">下发课堂</button></div></article>`).join('');
}
window.renderGames = renderGameCatalog;
const activeFilter = document.querySelector('.filters .filter.on[data-filter]')?.dataset.filter || 'all';
renderGameCatalog(activeFilter);

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
function renderCompanion() {
  const pet = document.getElementById('pet'); if (!pet) return;
  if (companionAnimal === 'abstract') {
    const palette = dailyAppearance?.palette || '#cfe7d9', accent = dailyAppearance?.accent || '#efcf8a';
    pet.innerHTML = `<svg class="abstract-pet" viewBox="0 0 100 100" role="img" aria-label="抽象小动物心伴"><path d="M27 37C18 13 34 12 43 31c8-14 25-18 28-4l-2 13c14 8 19 25 10 38-13 18-49 18-61-1-10-15-5-31 9-40z" fill="${palette}" stroke="#6d9a80" stroke-width="3"/><ellipse cx="40" cy="53" rx="3" ry="4" fill="#365b4b"/><ellipse cx="62" cy="53" rx="3" ry="4" fill="#365b4b"/><path d="M47 64q4 4 8 0" fill="none" stroke="#6d806f" stroke-width="2" stroke-linecap="round"/><circle cx="29" cy="67" r="4" fill="${accent}"/><circle cx="72" cy="67" r="4" fill="${accent}"/><path d="M50 10l2 6 6 2-6 2-2 6-2-6-6-2 6-2z" fill="${accent}"/></svg>`;
  } else { pet.innerHTML = `<span class="animal-orb" style="background:${dailyAppearance?.palette || '#e9f2e9'}">${companionFace()}<i>${dailyAppearance?.accessory || '🌿'}</i></span>`; }
  const name = '心伴';
  document.getElementById('petName').textContent = name;
  const mini = document.querySelector('.chat-head .petmini'); if (mini) mini.textContent = companionFace();
  const title = document.querySelector('.chat-head b'); if (title) title.textContent = `和${name}聊聊`;
  document.querySelectorAll('#messages .tiny').forEach(node => { node.textContent = companionFace(); });
  const desc = document.getElementById('companionDescription'); if (desc) desc.textContent = '心伴会根据你聊过的兴趣和做过的小练习，每天悄悄换一点装饰。心情好坏不会改变它的样子。';
}
function ensureCompanionSetup() {
  const tabs = document.querySelector('.pet-card .pet-tabs'); if (!tabs || document.getElementById('companionSetup')) return;
  const panel = document.createElement('div'); panel.id = 'companionSetup'; panel.className = 'companion-setup';
  panel.innerHTML = `<label for="companionAnimal">选择心伴形象</label><select id="companionAnimal"><option value="abstract">抽象小动物（默认）</option><option value="cat">小猫</option><option value="rabbit">小兔</option><option value="fox">小狐狸</option><option value="bear">小熊</option><option value="dog">小狗</option></select><div id="companionDescription"></div>`;
  tabs.before(panel);
  const picker = document.getElementById('companionAnimal'); picker.value = companionAnimal;
  picker.onchange = () => { companionAnimal = picker.value; localStorage.setItem(`xinban.companion.animal.${profileKey}`, companionAnimal); dailyAppearance = null; renderCompanion(); refreshDailyAppearance(); };
  renderCompanion();
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
  note.innerHTML = '<span>自主聊天默认不展示给老师。聊天内容会保存在本机演示数据库，并发送给 TokenDance 服务用于回复和后续对话；心伴外观每天只参考你聊到的兴趣与练习，不判断你的心情。请勿输入真实姓名或联系方式。</span><button class="btn small" onclick="clearPrivateMemory()">清除记忆</button>';
  head.after(note);
}
ensureMemoryDisclosure();

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
  } catch (error) { toast(error.message || '找不到这个课堂码'); }
};

function makePlayer() {
  if (document.getElementById('gamePlayerBack')) return;
  const back = document.createElement('div'); back.id = 'gamePlayerBack'; back.className = 'game-player-back';
  back.innerHTML = `<section class="game-player"><header class="game-player-head"><div><span class="eyebrow">CLASSROOM ACTIVITY</span><h2 id="playerTitle"></h2></div><button class="close" onclick="closeGamePlayer()">×</button></header>
    <div id="playerConsent" class="player-consent"><div class="student-share-note">🔒 课堂说明：如果继续参加，本活动中的选择、文字和你与心伴的活动对话会提交给授课老师，用于课堂记录。你可以跳过任何问题；请不要填写不想分享的个人信息。</div><label class="consent-check"><input id="shareConsent" type="checkbox"> 我知道本次课堂活动记录会提交给授课老师。</label><button class="btn primary" onclick="beginClassGame()">同意并开始</button></div>
    <div id="gamePlayContent" style="display:none"><div class="student-share-note">🔒 本次活动记录会提交给授课老师。你可以跳过任何问题。</div>
    <div class="game-progress-head"><span id="gameStepLabel"></span><span id="gameStepCount"></span></div><div class="game-progress"><i id="gameProgressFill"></i></div>
    <div id="gameStepView" class="game-step-view"></div><div id="gameChatArea" class="game-chat-area"><button class="btn small" onclick="toggleGameChat()">和心伴聊聊</button></div>
    <footer class="game-player-foot"><button class="btn" onclick="skipGameStep()">跳过这步</button><button class="btn primary" id="nextGameStep" onclick="nextGameStep()">下一步 →</button></footer></div>
  </section>`;
  document.body.append(back);
}
makePlayer();

window.startClassGame = function () {
  const task = window.currentClassTask; if (!task) return;
  const steps = gamePlaybooks[task.title] || gamePlaybooks['压力外化卡片'];
  window.gameSession = { task, alias: '', steps, index: 0, actions: [], chat: [], current: null, startedAt: Date.now(), stepStarted: Date.now() };
  document.getElementById('playerTitle').textContent = task.title;
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
  if (step.type === 'text') {
    const field = document.createElement('textarea'); field.className = 'game-reflection'; field.placeholder = step.placeholder || '写一点点就好……';
    field.oninput = () => { session.current.reflection = field.value; }; view.append(field);
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
  document.getElementById('nextGameStep').textContent = session.index === session.steps.length - 1 ? '完成并提交 ✓' : '下一步 →';
}
window.skipGameStep = function () { if (window.gameSession) { window.gameSession.current.skipped = true; window.gameSession.current.seconds = Math.round((Date.now() - window.gameSession.stepStarted) / 1000); window.gameSession.actions.push(window.gameSession.current); advanceGame(); } };
window.nextGameStep = function () {
  const session = window.gameSession; if (!session) return;
  session.current.seconds = Math.round((Date.now() - session.stepStarted) / 1000);
  session.actions.push(session.current);
  if (session.index < session.steps.length - 1) advanceGame(); else submitClassGame();
};
function advanceGame() { window.gameSession.index += 1; renderGameStep(); }
async function submitClassGame(safetyEscalation = false) {
  const session = window.gameSession; const button = document.getElementById('nextGameStep'); button.disabled = true; button.textContent = '正在提交…';
  try {
    const response = await fetch('/api/student/tasks/submit', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ code: session.task.code, gameId: session.task.gameId, studentAlias: session.alias, actions: session.actions, chat: session.chat, safetyEscalation }) });
    const data = await response.json(); if (!response.ok) throw new Error(data.error || '提交失败');
    document.getElementById('gameStepView').innerHTML = safetyEscalation ? '<div class="game-complete"><div>🤝</div><h3>活动已暂停</h3><p>课堂老师会看到需要及时查看的提示。请现在找一位信任的大人或学校心理老师陪着你；如果你或他人正处于立即危险中，请联系当地紧急服务。</p></div>' : '<div class="game-complete"><div>🌱</div><h3>活动完成，谢谢你的参与</h3><p>你的课堂活动记录已提交给老师。你可以关闭这个窗口，或回到心伴继续聊聊。</p></div>';
    document.getElementById('gameProgressFill').style.width = '100%'; document.getElementById('gameStepLabel').textContent = '已完成'; document.getElementById('gameStepCount').textContent = '✓';
    document.getElementById('gameChatArea').replaceChildren(); document.querySelector('.game-player-foot').innerHTML = '<button class="btn primary" onclick="closeGamePlayer()">完成</button>';
    loadClassroomTasks();
  } catch (error) { toast(error.message || '提交失败，请重试'); button.disabled = false; button.textContent = '重试提交'; }
}
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
    const response = await fetch('/api/student/chat', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ message, studentId: memoryStudentId, conversationId: gameConversationId, scope: 'classroom', taskCode: session.task.code, ...companionRequestContext() }) });
    const data = await response.json(); if (!response.ok) throw new Error(data.error || '暂时无法回复');
    session.chat.push({ role: 'assistant', content: data.reply });
    const line = document.createElement('p'); line.className = 'game-chat-reply'; line.textContent = `${companionProfile?.name || '心伴'}：${data.reply}`; document.getElementById('gameChatArea').append(line);
    if (data.safetyEscalation) { session.safetyEscalation = true; document.querySelector('.game-player-foot').innerHTML = '<button class="btn primary" onclick="closeGamePlayer()">我会去找大人</button>'; await submitClassGame(true); }
  };
  try { await submit(); } catch (error) { session.chat.pop(); toast(error.message || '暂时无法连接'); } finally { input.disabled = false; input.value = ''; }
};

window.publishGame = async function (index) {
  const game = games[index];
  try {
    const response = await fetch('/api/teacher/tasks', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ title: game.title, gameId: `game-${index}`, className: '七年级 2 班' }) });
    const data = await response.json(); if (!response.ok) throw new Error(data.error || '创建课堂任务失败');
    showTaskShare(data.task); loadClassroomTasks();
  } catch (error) { toast(error.message || '下发失败'); }
};
function showTaskShare(task) {
  document.getElementById('modalTitle').textContent = '课堂任务已创建';
  document.getElementById('planForm').style.display = 'block'; document.getElementById('planResult').style.display = 'none';
  document.getElementById('planForm').innerHTML = `<div class="task-share"><div class="share-spark">✦</div><h3>${escapeHtml(task.title)}</h3><p>学生在学生端输入下面的课堂码，即可开始游戏。完成后，活动选择、文字和活动中的心伴对话会提交到学生记录。</p><div class="share-code">${escapeHtml(task.code)}</div><small>${escapeHtml(task.className || '')}</small><div class="modal-actions"><button class="btn" onclick="navigator.clipboard?.writeText('${task.code}').then(()=>toast('课堂码已复制')).catch(()=>toast('请手动复制课堂码'))">复制课堂码</button><button class="btn primary" onclick="closeModal()">完成</button></div></div>`;
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
      row.append(icon, meta, code, view); list.append(row);
    });
  } catch (error) { list.textContent = error.message || '读取课堂任务失败'; }
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
      if (submission.safetyEscalation) { const flag = document.createElement('span'); flag.className = 'pill red'; flag.textContent = '需要及时查看'; article.append(flag); }
      submission.actions.forEach(action => { const p = document.createElement('p'); p.textContent = `${action.step}${action.skipped ? '（跳过）' : ''}${action.choice ? ` · 选择：${action.choice}` : ''}${action.reflection ? ` · 分享：${action.reflection}` : ''}`; article.append(p); });
      if (submission.chat.length) { const label = document.createElement('small'); label.textContent = '活动中的心伴对话'; article.append(label); submission.chat.forEach(item => { const p = document.createElement('p'); p.textContent = `${item.role === 'assistant' ? '棉棉' : submission.studentAlias}：${item.content}`; article.append(p); }); }
      form.append(article);
    });
    const actions = document.querySelector('#planResult .modal-actions'); actions.innerHTML = '<button class="btn primary" onclick="closeModal()">关闭</button>';
    document.querySelector('.modal').classList.add('agent-modal'); document.getElementById('modalback').classList.add('show');
  } catch (error) { toast(error.message || '读取学生记录失败'); }
};
ensureTaskManager();
const baseSetView = window.setView;
window.setView = function (id) { baseSetView(id); if (id === 'records') loadClassroomTasks(); };

const gameStyle = document.createElement('style');
gameStyle.textContent = `.game-action-row{display:flex;gap:6px;align-items:center;flex-wrap:wrap;margin-top:13px}.game-action-row>span{font-size:10px;color:#9aa49e;margin-right:auto}.class-join-panel{display:flex;align-items:center;gap:11px;padding:12px 15px;background:#f3f7f2;border-bottom:1px solid var(--line);flex:none}.class-join-icon{width:34px;height:34px;border-radius:10px;background:#fff;color:#39715e;display:grid;place-items:center;font-size:19px}.class-join-content{flex:1;min-width:0}.class-join-content>b{font-size:12px}.class-join-content>small{display:block;color:#87938c;font-size:10px;margin-top:3px}.class-join-controls{display:flex;gap:6px;margin-top:7px}.class-join-controls input{width:135px;border:1px solid #e1e9e1;border-radius:7px;padding:7px 9px;text-transform:uppercase;font-size:11px}.joined-task{display:flex;align-items:center;justify-content:space-between;gap:8px;padding-top:8px}.joined-task b{font-size:11px}.joined-task small{display:block;font-size:10px;color:#85918a;margin-top:3px}.game-player-back{display:none;position:fixed;inset:0;z-index:50;background:#20342e75;align-items:center;justify-content:center;padding:16px}.game-player-back.show{display:flex}.game-player{width:min(720px,100%);height:min(88vh,760px);background:white;border-radius:18px;box-shadow:0 18px 70px #142c2040;padding:24px;display:flex;flex-direction:column;overflow:auto}.game-player-head{display:flex;justify-content:space-between;align-items:center}.game-player-head h2{margin:5px 0 14px;font-size:21px}.student-share-note{background:#f8f4e9;color:#8d7443;border-radius:9px;padding:10px 12px;font-size:10px;line-height:1.7}.game-progress-head{display:flex;justify-content:space-between;color:#789087;font-size:11px;margin-top:20px}.game-progress{height:6px;background:#edf1ed;border-radius:9px;margin:8px 0 20px;overflow:hidden}.game-progress i{display:block;height:100%;background:#77ae8e;border-radius:9px;transition:width .25s}.game-step-view{flex:1;min-height:190px}.game-step-prompt{font-size:15px;line-height:1.75;color:#394a42;margin:0 0 18px;white-space:pre-wrap}.game-choice-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:9px}.game-choice{background:#fbfcfa;border:1px solid #e5ebe5;border-radius:10px;padding:12px;text-align:left;font-size:12px}.game-choice:hover,.game-choice.selected{background:#edf6f0;border-color:#82b399;color:#326c5d}.game-reflection{width:100%;min-height:105px;border:1px solid #e3eae3;border-radius:10px;padding:12px;resize:vertical}.breath-timer{text-align:center;padding:5px}.breath-circle{width:86px;height:86px;border-radius:50%;display:grid;place-items:center;margin:0 auto 10px;background:#eef6ef;font-size:30px;animation:breathe 5s ease-in-out infinite alternate}.breath-timer p{color:#708278;font-size:12px}@keyframes breathe{to{transform:scale(1.17);background:#deeee2}}.game-player-foot{display:flex;justify-content:space-between;gap:8px;border-top:1px solid #eef1ee;padding-top:13px}.game-chat-area{margin:8px 0}.game-chat-form{display:flex;gap:7px;margin-top:7px}.game-chat-form input{flex:1;min-width:0;border:1px solid #e3e9e3;border-radius:8px;padding:8px;font-size:11px}.game-chat-reply{font-size:11px;background:#f2f6f1;padding:9px;border-radius:9px;line-height:1.6;white-space:pre-wrap}.game-complete{text-align:center;padding:24px}.game-complete>div{font-size:46px}.game-complete h3{font-size:17px}.game-complete p{font-size:12px;color:#7d8982;line-height:1.7}.task-manager-row{margin-top:9px}.submission-card{border:1px solid var(--line);padding:13px;border-radius:10px;margin:10px 0;font-size:11px;line-height:1.6}.submission-card b{font-size:12px}.submission-card p{margin:6px 0;color:#65736b;white-space:pre-wrap}.submission-card small{color:#718c7c;font-weight:600}@media(max-width:600px){.game-player{padding:17px}.game-choice-grid{grid-template-columns:1fr}.game-action-row>span{width:100%}.game-action-row .btn{flex:1}}`;
document.head.append(gameStyle);
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
    if (!response.ok || !data.messages?.length) return;
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
  } catch (error) { toast(error.message || '清除失败'); }
};
const memoryStyle = document.createElement('style');
memoryStyle.textContent = `.memory-disclosure{display:flex;align-items:center;gap:10px;padding:9px 14px;background:#fff9eb;border-bottom:1px solid #f0e6ce;color:#8a754c;font-size:10px;line-height:1.5}.memory-disclosure span{flex:1}.memory-disclosure .btn{flex:none;white-space:nowrap}`;
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
loginStyle.textContent = `.chat-input{align-items:flex-end}.chat-input textarea{flex:1;min-width:0;min-height:82px;max-height:150px;resize:vertical;border:1px solid var(--line);border-radius:12px;padding:13px;outline:none;font:inherit;font-size:14px;line-height:1.6}.chat-input textarea:focus{border-color:#9cbeab;box-shadow:0 0 0 3px #326c5d12}.chat-input button{height:46px;flex:none}.animal-orb{width:104px;height:104px;margin:12px auto;border-radius:38% 45% 42% 47%;display:grid;place-items:center;position:relative;font-size:62px;box-shadow:inset 0 -7px 14px #496d5010}.animal-orb i{position:absolute;right:5px;bottom:4px;font-size:25px;font-style:normal}.login-overlay{position:fixed;inset:0;z-index:100;background:linear-gradient(145deg,#eaf3eeed,#f6f7f1f2);display:grid;place-items:center;padding:18px}.login-card{width:min(480px,100%);background:#fff;border:1px solid #e6ede7;border-radius:22px;padding:32px;box-shadow:0 22px 90px #25433320}.login-brand{display:flex;align-items:center;gap:12px;margin-bottom:26px}.login-brand .brandmark{width:44px;height:44px}.login-card h1{font-size:24px;margin:0 0 8px}.login-card p{font-size:12px;color:#77857f;line-height:1.8;margin:0 0 20px}.login-roles{display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:14px}.login-role{border:1px solid #e6ece6;border-radius:12px;padding:16px;background:#fff;text-align:left}.login-role.selected{border-color:#79a98d;background:#f1f7f2;color:#326c5d}.login-role b{display:block;font-size:14px;margin-bottom:5px}.login-role small{color:#86928b;font-size:10px}.login-mode{display:flex;gap:6px;padding:4px;background:#f4f7f3;border-radius:9px;margin:0 0 16px}.login-mode button{flex:1;padding:9px;background:transparent;border-radius:7px;color:#75837a;font-size:11px}.login-mode button.selected{background:white;color:#326c5d;font-weight:600;box-shadow:0 1px 4px #1b382414}.login-card label{display:block;color:#64746b;font-size:11px}.login-card input{width:100%;padding:12px;border:1px solid #e3eae3;border-radius:9px;margin:7px 0 14px}.login-card .login-enter{width:100%;padding:12px}.login-demo{margin-top:14px;padding:10px 12px;border-radius:9px;background:#faf6ec;color:#8a754c;font-size:10px;line-height:1.7}.login-safety{margin-top:14px;font-size:10px!important;text-align:center}.topright .logout{font-size:10px;padding:7px 9px}@media(max-width:520px){.login-card{padding:24px 20px}.chat-input{padding:10px}.chat-input textarea{min-height:72px}}`;
document.head.append(loginStyle);
function accountHash(value) { let hash = 2166136261; for (const char of value) { hash ^= char.charCodeAt(0); hash = Math.imul(hash, 16777619); } return (hash >>> 0).toString(36); }
function applyAuthenticatedUser(user) {
  const role = user.role, displayName = user.displayName || (role === 'teacher' ? '老师' : '同学');
  profileKey = `${role}-${accountHash(user.id)}`;
  const roleButton = document.querySelector(`[data-role="${role}"]`); if (roleButton) roleButton.click();
  document.querySelector('.user span').textContent = displayName;
  document.querySelector('.user .avatar').textContent = displayName.slice(0, 1) || (role === 'teacher' ? '师' : '同');
  memoryStudentId = user.id;
  privateConversationId = getPersistentId(`xinban.private.conversation.${profileKey}`);
  companionAnimal = localStorage.getItem(`xinban.companion.animal.${profileKey}`) || 'abstract';
  try { dailyAppearance = JSON.parse(localStorage.getItem(`xinban.companion.appearance.${profileKey}`) || 'null'); } catch { dailyAppearance = null; }
  const picker = document.getElementById('companionAnimal'); if (picker) picker.value = companionAnimal;
  renderCompanion();
  if (role === 'student') { restorePrivateConversation().then(refreshDailyAppearance); }
  document.getElementById('loginOverlay')?.remove();
}
function showLogin() {
  if (document.getElementById('loginOverlay')) return;
  const overlay = document.createElement('div'); overlay.id = 'loginOverlay'; overlay.className = 'login-overlay';
  overlay.innerHTML = `<section class="login-card"><div class="login-brand"><div class="brandmark">✿</div><div><b>心伴</b><small style="display:block;color:#9aa59f;font-size:9px;letter-spacing:1px;margin-top:3px">MINDFUL LEARNING SPACE</small></div></div><h1>欢迎来到心伴</h1><p>教师与学生使用各自独立的账号。请选择身份，再登录或注册。</p><div class="login-roles"><button class="login-role selected" data-login-role="teacher"><b>教师</b><small>备课工作台与课堂管理</small></button><button class="login-role" data-login-role="student"><b>学生</b><small>聊天、练习与心伴小动物</small></button></div><div class="login-mode"><button class="selected" data-mode="login">登录</button><button data-mode="register">注册新账号</button></div><div id="registerNameWrap" style="display:none"><label for="loginName">显示名称</label><input id="loginName" maxlength="24" placeholder="例如：林老师 / 小树同学"></div><div id="teacherInviteWrap" style="display:none"><label for="teacherInvite">教师邀请码</label><input id="teacherInvite" maxlength="100" autocomplete="off" placeholder="向平台管理员获取"></div><label for="loginAccount">账号</label><input id="loginAccount" maxlength="48" autocomplete="username" placeholder="3–48 位字母、数字或 . _ @ -"><label for="loginPassword">密码</label><input id="loginPassword" type="password" minlength="8" maxlength="128" autocomplete="current-password" placeholder="至少 8 位"><button id="loginEnter" class="btn primary login-enter">登录并进入教师端</button><div class="login-demo">密码通过 scrypt 哈希保存；登录状态由 HttpOnly Cookie 维持。教师注册需管理员邀请码；请勿复用个人常用密码。</div><p class="login-safety">本平台为心理教育练习工具，不替代专业心理诊疗。如有严重心理困扰，请联系学校心理老师或专业医疗机构。</p></section>`;
  document.body.append(overlay);
  let selectedRole = 'teacher';
  let mode = 'login';
  const updateSubmitLabel = () => { document.getElementById('loginEnter').textContent = mode === 'register' ? '注册并进入' : `登录并进入${selectedRole === 'teacher' ? '教师端' : '学生端'}`; document.getElementById('teacherInviteWrap').style.display = mode === 'register' && selectedRole === 'teacher' ? 'block' : 'none'; };
  overlay.querySelectorAll('[data-login-role]').forEach(button => button.onclick = () => { selectedRole = button.dataset.loginRole; overlay.querySelectorAll('[data-login-role]').forEach(item => item.classList.toggle('selected', item === button)); document.getElementById('loginName').placeholder = selectedRole === 'teacher' ? '例如：林老师' : '例如：小树同学'; updateSubmitLabel(); });
  overlay.querySelectorAll('[data-mode]').forEach(button => button.onclick = () => { mode = button.dataset.mode; overlay.querySelectorAll('[data-mode]').forEach(item => item.classList.toggle('selected', item === button)); document.getElementById('registerNameWrap').style.display = mode === 'register' ? 'block' : 'none'; document.getElementById('loginPassword').autocomplete = mode === 'register' ? 'new-password' : 'current-password'; updateSubmitLabel(); });
  document.getElementById('loginEnter').onclick = async () => {
    const username = document.getElementById('loginAccount').value.trim(), password = document.getElementById('loginPassword').value;
    const displayName = document.getElementById('loginName')?.value.trim() || '';
    const button = document.getElementById('loginEnter'); button.disabled = true;
    try {
      const inviteCode = document.getElementById('teacherInvite')?.value || '';
      const response = await fetch(`/api/auth/${mode === 'register' ? 'register' : 'login'}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ role: selectedRole, username, password, displayName, inviteCode }) });
      const data = await response.json(); if (!response.ok) throw new Error(data.error || '登录失败');
      applyAuthenticatedUser(data.user); toast(mode === 'register' ? '账号已创建' : '登录成功');
    } catch (error) { toast(error.message || '暂时无法登录'); }
    finally { if (document.getElementById('loginEnter')) document.getElementById('loginEnter').disabled = false; }
  };
  document.getElementById('loginPassword').onkeydown = event => { if (event.key === 'Enter') document.getElementById('loginEnter').click(); };
}
const logout = document.createElement('button'); logout.className = 'btn logout'; logout.textContent = '退出登录'; logout.onclick = async () => { await fetch('/api/auth/logout', { method: 'POST' }); showLogin(); }; document.querySelector('.user').append(logout);
fetch('/api/auth/me').then(async response => { if (!response.ok) throw new Error('signed out'); const data = await response.json(); applyAuthenticatedUser(data.user); }).catch(showLogin);
