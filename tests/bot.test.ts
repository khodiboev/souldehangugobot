import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,writeFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {loadBooks,bookSchema} from '../src/content.js';
import {splitHtml,explanation,render,sectionNames,type Section} from '../src/render.js';
import {createBot} from '../src/bot.js';
import {unitKeyboard} from '../src/keyboards.js';
import {createStats} from '../src/stats.js';
import {createQuizProgress,loadQuizzes,progressKey,quizSchema} from '../src/quiz.js';
const books=loadBooks();
function plain(s:string){return s.replace(/<[^>]+>/g,'').replaceAll('&lt;','<').replaceAll('&gt;','>').replaceAll('&amp;','&');}
function balanced(s:string){const stack:string[]=[];for(const t of s.match(/<[^>]+>/g)??[]){if(t.startsWith('</'))assert.equal(stack.pop(),t.slice(2,-1));else stack.push(t.slice(1,-1));}assert.equal(stack.length,0);}
test('long Unicode spoilers retain all text and valid HTML across pages',()=>{
 const source='<b>Sarlavha</b>\n<tg-spoiler>'+('한글 😀 &amp; &lt;\n'.repeat(2000))+'</tg-spoiler>';
 const pages=splitHtml(source);assert.ok(pages.length>1);
 for(const page of pages){assert.ok(page.length<=4096);balanced(page);assert.ok(!/[\uD800-\uDBFF]$/.test(plain(page)));}
 assert.equal(pages.map(plain).join(''),plain(source));
});
test('content HTML is escaped except balanced bold',()=>{
 assert.equal(explanation('<b>A & B</b><script>x</script>'),'<b>A &amp; B</b>&lt;script&gt;x&lt;/script&gt;');
 assert.equal(explanation('<b>unfinished'),'&lt;b&gt;unfinished');
});
test('every supplied section fits and has balanced tags',()=>{for(const book of books)for(const u of book.units)if(u.available)for(const key of Object.keys(sectionNames)as Section[])for(const p of render(u,key)){assert.ok(p.length<=4096);balanced(p);}});
test('invalid ready units and duplicate book IDs fail early',()=>{
 assert.equal(bookSchema.safeParse({book:books[0].book,units:[{...books[0].units[0],available:true,goals:undefined}]}).success,false);
 const dir=mkdtempSync(join(tmpdir(),'korean-bot-'));
 try{for(const name of ['a','b'])writeFileSync(join(dir,name+'.json'),JSON.stringify(books[0]));assert.throws(()=>loadBooks(dir),/Duplicate book/);}finally{rmSync(dir,{recursive:true});}
});
test('commands, sections, pagination, stale callbacks and unavailable units through Telegram update handling',async()=>{
 const fixture=structuredClone(books);
 fixture[0].units.push({id:'pending',num:9,title_kr:'준비',title_uz:'Kutilmoqda',available:false,grammar_summary:[]});
 const bot=createBot('123:test-only',fixture);
 bot.botInfo={id:123,is_bot:true,first_name:'Test',username:'test_bot',can_join_groups:true,can_read_all_group_messages:false,supports_inline_queries:false,can_connect_to_business:false,has_main_web_app:false};
 const calls:{method:string,payload:any}[]=[];
 bot.api.config.use(async(_prev,method,payload)=>{calls.push({method,payload});return {ok:true,result:true} as any;});
 const user={id:1,is_bot:false,first_name:'User'};const chat={id:1,type:'private' as const};let update=0;
 await bot.handleUpdate({update_id:++update,message:{message_id:1,date:0,chat,from:user,text:'/start',entities:[{offset:0,length:6,type:'bot_command'}]}});
 assert.equal(calls.at(-1)?.method,'sendMessage');
 async function click(data:string){calls.length=0;await bot.handleUpdate({update_id:++update,callback_query:{id:String(update),from:user,chat_instance:'test',data,message:{message_id:2,date:0,chat,text:'Menu'}}});}
 await click('b:1a');assert.equal(calls.at(-1)?.method,'editMessageText');
 await click('u:1a:1');assert.equal(calls.at(-1)?.payload.reply_markup.inline_keyboard[0][0].text,"📚 So'zlar");
 await click('p:1a:1:v:1');assert.match(calls.at(-1)?.payload.text,/직업/);
 await click('p:1a:1:s:0');assert.match(calls.at(-1)?.payload.text,/<tg-spoiler>/);
 await click('u:1a:pending');assert.equal(calls.length,1);assert.match(calls[0].payload.text,/Tez orada/);
 for(const unit of books[0].units){
  assert.ok(unit.available);
  await click(`u:1a:${unit.id}`);assert.equal(calls.at(-1)?.method,'editMessageText');
  for(const key of Object.keys(sectionNames) as Section[]){
   const pages=render(unit,key);
   for(let page=0;page<pages.length;page++){
    await click(`p:1a:${unit.id}:${key}:${page}`);
    assert.equal(calls.at(-1)?.payload.text,pages[page]);
   }
  }
 }
 for(const invalid of ['p:1a:1:v:999','p:1a:1:__proto__:0','u:1a:missing','b:missing']){await click(invalid);assert.equal(calls.length,1);assert.equal(calls[0].method,'answerCallbackQuery');}
});
test('Hangul has distinct labels and navigation does not wrap beyond book boundaries',()=>{
 const book=books[0], first=book.units[0], last=book.units.at(-1)!;
 const start=unitKeyboard(book,first).inline_keyboard.flat();
 assert.equal(start[0].text,'🔤 Harflar');
 assert.ok(!start.some(b=>b.text.startsWith('⬅️')));
 const end=unitKeyboard(book,last).inline_keyboard.flat();
 assert.ok(!end.some(b=>b.text.endsWith('➡️')));
});
test('published core lessons contain the full alphabet, four patterns and bilingual learning content',()=>{
 const book=books[0];assert.equal(book.units.length,9);
 for(const unit of book.units){
  assert.ok(unit.available);
  assert.equal(unit.grammar.length,4);
  assert.ok(unit.dialogues.length>=2);
  for(const g of unit.grammar)assert.ok(g.examples.length>=3);
  for(const g of unit.vocab_groups)for(const word of g.items)assert.ok(word.pos && word.rom && word.uz);
  for(const line of unit.story.lines)if('kr' in line)assert.ok(line.uz);
 }
 const hangul=book.units[0];assert.ok(hangul.available);
 const chars=hangul.vocab_groups.flatMap(g=>g.items);
 assert.equal(chars.filter(w=>w.pos==='unli').length,21);
 assert.equal(chars.filter(w=>w.pos==='undosh').length,19);
 const book1b=books.find(b=>b.book.id==='1b');assert.ok(book1b);
 assert.deepEqual(book1b.units.map(u=>u.num),[9,10,11,12,13,14,15,16]);
 for(const unit of book1b.units){
  assert.ok(unit.available);assert.equal(unit.grammar.length,4);assert.ok(unit.dialogues.length>=2);
  for(const grammar of unit.grammar)assert.ok(grammar.examples.length>=3);
 }
 const book2a=books.find(b=>b.book.id==='2a');assert.ok(book2a);
 assert.deepEqual(book2a.units.map(u=>u.num),[1,2,3,4,5,6,7,8,9]);
 for(const unit of book2a.units){
  assert.ok(unit.available);assert.ok(unit.grammar.length>=4);assert.equal(unit.dialogues.length,2);
  for(const grammar of unit.grammar)assert.ok(grammar.examples.length>=3 && grammar.mistakes.length>=1);
 }
 const book2b=books.find(b=>b.book.id==='2b');assert.ok(book2b);
 assert.deepEqual(book2b.units.map(u=>u.num),[10,11,12,13,14,15,16,17,18]);
 for(const unit of book2b.units){
  assert.ok(unit.available);assert.equal(unit.grammar.length,4);assert.equal(unit.dialogues.length,2);
  for(const grammar of unit.grammar)assert.ok(grammar.examples.length>=3 && grammar.mistakes.length>=1);
 }
 const book3a=books.find(b=>b.book.id==='3a');assert.ok(book3a);
 assert.deepEqual(book3a.units.map(u=>u.num),[1,2,3,4,5,6,7,8,9]);
 assert.deepEqual(book3a.units.map(u=>u.available?u.grammar.length:0),[4,4,4,4,4,3,4,4,4]);
 for(const unit of book3a.units){
  assert.ok(unit.available);assert.equal(unit.dialogues.length,2);
  for(const grammar of unit.grammar)assert.ok(grammar.examples.length>=3 && grammar.mistakes.length>=1);
 }
 const book3b=books.find(b=>b.book.id==='3b');assert.ok(book3b);
 assert.deepEqual(book3b.units.map(u=>u.num),[10,11,12,13,14,15,16,17,18]);
 assert.deepEqual(book3b.units.map(u=>u.available?u.grammar.length:0),[4,3,4,4,4,4,5,4,2]);
 for(const unit of book3b.units){
  assert.ok(unit.available);assert.equal(unit.dialogues.length,2);
  for(const grammar of unit.grammar)assert.ok(grammar.examples.length>=3 && grammar.mistakes.length>=1);
 }
 const book4a=books.find(b=>b.book.id==='4a');assert.ok(book4a);
 assert.deepEqual(book4a.units.map(u=>u.num),[1,2,3,4,5,6,7,8,9]);
 assert.deepEqual(book4a.units.map(u=>u.available?u.grammar.length:0),[4,4,4,4,4,4,4,4,4]);
 for(const unit of book4a.units){
  assert.ok(unit.available);assert.equal(unit.dialogues.length,2);
  for(const grammar of unit.grammar)assert.ok(grammar.examples.length>=3 && grammar.mistakes.length>=1);
 }
 const book4b=books.find(b=>b.book.id==='4b');assert.ok(book4b);
 assert.deepEqual(book4b.units.map(u=>u.num),[10,11,12,13,14,15,16,17,18]);
 assert.deepEqual(book4b.units.map(u=>u.available?u.grammar.length:0),[4,4,4,4,4,4,4,4,2]);
 for(const unit of book4b.units){
  assert.ok(unit.available);assert.equal(unit.dialogues.length,2);
  for(const grammar of unit.grammar)assert.ok(grammar.examples.length>=3 && grammar.mistakes.length>=1);
 }
 const book5a=books.find(b=>b.book.id==='5a');assert.ok(book5a);
 assert.deepEqual(book5a.units.map(u=>u.num),Array.from({length:15},(_,i)=>i+1));
 assert.deepEqual(book5a.units.map(u=>u.available?u.grammar.length:0),[3,3,4,4,3,4,3,3,3,3,3,4,4,3,4]);
 for(const unit of book5a.units){
  assert.ok(unit.available);assert.equal(unit.dialogues.length,2);
  assert.equal(unit.vocab_groups.reduce((n,g)=>n+g.items.length,0),12);
  for(const grammar of unit.grammar)assert.ok(grammar.examples.length>=3 && grammar.mistakes.length>=1);
 }
 const book5b=books.find(b=>b.book.id==='5b');assert.ok(book5b);
 assert.deepEqual(book5b.units.map(u=>u.num),Array.from({length:17},(_,i)=>i+1));
 assert.deepEqual(book5b.units.map(u=>u.available?u.grammar.length:0),Array(17).fill(3));
 for(const unit of book5b.units){
  assert.ok(unit.available);assert.equal(unit.dialogues.length,2);
  assert.equal(unit.vocab_groups.reduce((n,g)=>n+g.items.length,0),12);
  for(const grammar of unit.grammar)assert.ok(grammar.examples.length>=3 && grammar.mistakes.length>=1);
 }
 assert.ok(book5b.units.at(-1)!.grammar.every(g=>g.pattern.includes('takrorlash')));
 const book6a=books.find(b=>b.book.id==='6a');assert.ok(book6a);
 assert.deepEqual(book6a.units.map(u=>u.num),Array.from({length:14},(_,i)=>i+1));
 for(const unit of book6a.units){
  assert.ok(unit.available);assert.equal(unit.grammar.length,2);assert.equal(unit.dialogues.length,2);
  assert.equal(unit.vocab_groups.reduce((n,g)=>n+g.items.length,0),12);
  for(const grammar of unit.grammar)assert.ok(grammar.examples.length>=3 && grammar.mistakes.length>=1);
 }
 const book6b=books.find(b=>b.book.id==='6b');assert.ok(book6b);
 assert.deepEqual(book6b.units.map(u=>u.num),Array.from({length:16},(_,i)=>i+1));
 for(const unit of book6b.units){
  assert.ok(unit.available);assert.equal(unit.grammar.length,2);assert.equal(unit.dialogues.length,2);
  assert.equal(unit.vocab_groups.reduce((n,g)=>n+g.items.length,0),12);
  for(const grammar of unit.grammar)assert.ok(grammar.examples.length>=3 && grammar.mistakes.length>=1);
 }
});
test('private users are counted once and remain after reopening the stats file',()=>{
 const dir=mkdtempSync(join(tmpdir(),'korean-stats-'));
 const file=join(dir,'users.json');
 try{
  const stats=createStats(file);
  const now=new Date('2026-09-29T12:00:00.000Z');
  stats.record(101,new Date('2026-09-01T12:00:00.000Z'));
  stats.record(101,now);
  stats.record(202,new Date('2026-09-20T12:00:00.000Z'));
  assert.deepEqual(createStats(file).snapshot(now),{total:2,last24Hours:1,last7Days:1,last30Days:2});
 }finally{rmSync(dir,{recursive:true});}
});
test('only the configured owner sees stats in a private chat',async()=>{
 const dir=mkdtempSync(join(tmpdir(),'korean-stats-bot-'));
 try{
  const stats=createStats(join(dir,'users.json'));
  const bot=createBot('123:test-only',books,{stats,adminUserId:'101'});
  bot.botInfo={id:123,is_bot:true,first_name:'Test',username:'test_bot',can_join_groups:true,can_read_all_group_messages:false,supports_inline_queries:false,can_connect_to_business:false,has_main_web_app:false};
  const calls:{method:string,payload:any}[]=[];
  bot.api.config.use(async(_prev,method,payload)=>{calls.push({method,payload});return {ok:true,result:true} as any;});
  async function command(id:number,name:string,type:'private'|'group'='private'){
   calls.length=0;
   await bot.handleUpdate({update_id:id,message:{message_id:id,date:0,chat:{id:type==='private'?id:-1,type},from:{id,is_bot:false,first_name:'User'},text:`/${name}`,entities:[{offset:0,length:name.length+1,type:'bot_command'}]}});
   return calls.at(-1)?.payload.text as string;
  }
  assert.match(await command(101,'myid'),/101/);
  assert.match(await command(202,'stats'),/faqat bot egasi/);
  assert.match(await command(101,'stats'),/Jami: 2/);
  assert.match(await command(303,'stats','group'),/faqat bot egasi/);
  assert.equal(stats.snapshot().total,2);
 }finally{rmSync(dir,{recursive:true});}
});
test('pilot quiz banks have ten valid original questions for Hangul and 1A lesson one',()=>{
 const quizzes=loadQuizzes(books);
 assert.deepEqual([...quizzes.keys()].sort(),['1a:1','1a:hangul']);
 for(const quiz of quizzes.values()){
  assert.equal(quiz.questions.length,10);
  assert.equal(quiz.questions.filter(q=>q.topic==='vocab').length,4);
  assert.equal(quiz.questions.filter(q=>q.topic==='grammar').length,4);
  assert.equal(quiz.questions.filter(q=>q.topic==='context').length,2);
  assert.ok(quiz.questions.every(q=>q.explanation && q.options[q.correctIndex]));
 }
 const broken=structuredClone(quizzes.get('1a:1')!);
 broken.questions[0].options[1]=broken.questions[0].options[0];
 assert.equal(quizSchema.safeParse(broken).success,false);
});
test('quiz progress survives restart and ignores duplicate or old answers',()=>{
 const dir=mkdtempSync(join(tmpdir(),'korean-quiz-'));
 try{
  const file=join(dir,'progress.json');
  const quiz=loadQuizzes(books).get('1a:1')!;
  let progress=createQuizProgress(file);
  const key=progressKey(quiz);
  const first=progress.begin(101,key);
  const wrong=(quiz.questions[0].correctIndex+1)%4;
  assert.equal(progress.answer(101,quiz,first.token,0,wrong).kind,'accepted');
  assert.equal(progress.answer(101,quiz,first.token,0,wrong).kind,'stale');
  progress=createQuizProgress(file);
  assert.equal(progress.get(101,key).active?.answers.length,1);
  for(let i=1;i<10;i++)assert.equal(progress.answer(101,quiz,first.token,i,quiz.questions[i].correctIndex).kind,'accepted');
  assert.deepEqual({completed:progress.get(101,key).completed,best:progress.get(101,key).best}, {completed:1,best:9});
  assert.equal(progress.get(101,key).lastAnswers?.[0],wrong);
  const second=progress.begin(101,key);
  assert.notEqual(second.token,first.token);
  assert.equal(progress.answer(101,quiz,first.token,0,wrong).kind,'stale');
  assert.equal(progress.get(202,key).completed,0);
 }finally{rmSync(dir,{recursive:true});}
});
test('quiz buttons show private questions, explanations and reject stale callbacks',async()=>{
 const dir=mkdtempSync(join(tmpdir(),'korean-quiz-bot-'));
 try{
  const progress=createQuizProgress(join(dir,'progress.json'));
  const quizzes=loadQuizzes(books);
  const bot=createBot('123:test-only',books,{quizzes,quizProgress:progress});
  bot.botInfo={id:123,is_bot:true,first_name:'Test',username:'test_bot',can_join_groups:true,can_read_all_group_messages:false,supports_inline_queries:false,can_connect_to_business:false,has_main_web_app:false};
  const calls:{method:string,payload:any}[]=[];
  bot.api.config.use(async(_prev,method,payload)=>{calls.push({method,payload});return {ok:true,result:true} as any;});
  let update=0;
  async function click(data:string,chatType:'private'|'group'='private'){
   calls.length=0;
   await bot.handleUpdate({update_id:++update,callback_query:{id:String(update),from:{id:101,is_bot:false,first_name:'User'},chat_instance:'quiz-test',data,message:{message_id:2,date:0,chat:{id:chatType==='private'?101:-1,type:chatType},text:'Menu'}}});
   return calls.at(-1);
  }
  assert.equal((await click('u:1a:1'))?.payload.reply_markup.inline_keyboard.flat().some((button:any)=>button.text==='🧠 10 savollik test'),true);
  assert.match((await click('q:1a:1'))?.payload.text,/10 savollik test/);
  assert.match((await click('qs:1a:1'))?.payload.text,/1\/10/);
  const token=progress.get(101,progressKey(quizzes.get('1a:1')!)).active!.token;
  assert.match((await click(`qa:1a:1:${token}:0:1`))?.payload.text,/To‘g‘ri/);
  assert.match((await click(`qn:1a:1:${token}`))?.payload.text,/2\/10/);
  assert.equal((await click(`qa:1a:1:${token}:0:1`))?.method,'answerCallbackQuery');
  assert.equal((await click('q:1a:1','group'))?.method,'answerCallbackQuery');
  const quiz=quizzes.get('1a:1')!;
  for(let i=1;i<10;i++){
   const choice=i===1?(quiz.questions[i].correctIndex+1)%4:quiz.questions[i].correctIndex;
   assert.match((await click(`qa:1a:1:${token}:${i}:${choice}`))?.payload.text,/💡/);
   if(i<9)assert.match((await click(`qn:1a:1:${token}`))?.payload.text,new RegExp(`${i+2}\\/10`));
  }
  assert.match((await click('qres:1a:1'))?.payload.text,/9\/10/);
  assert.match((await click('qr:1a:1:0'))?.payload.text,/To‘g‘ri javob/);
  assert.equal(progress.get(101,progressKey(quiz)).completed,1);
  assert.match((await click('qs:1a:1'))?.payload.text,/1\/10/);
  assert.equal((await click(`qa:1a:1:${token}:0:1`))?.method,'answerCallbackQuery');
 }finally{rmSync(dir,{recursive:true});}
});
