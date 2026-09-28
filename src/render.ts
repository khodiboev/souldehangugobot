import type { ReadyUnit } from './content.js';
export const esc = (s:string) => s.replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;');
const b = (s:string)=>`<b>${esc(s)}</b>`;
const i = (s:string)=>`<i>${esc(s)}</i>`;
const spoiler = (s:string)=>`<tg-spoiler>${esc(s)}</tg-spoiler>`;
// Only balanced, non-nested <b> pairs are accepted from content.
export function explanation(s:string):string {
 return s.split(/(<b>[^<>]*<\/b>)/g).map(part=>/^<b>[^<>]*<\/b>$/.test(part)?b(part.slice(3,-4)):esc(part)).join('');
}
// Tokenize generated HTML. Close/reopen tags at page boundaries, never cut an
// entity or a Unicode code point. Conservative raw length also stays below 4096.
export function splitHtml(html:string, limit=3800):string[] {
 const tokens=html.match(/<\/?(?:b|i|tg-spoiler)>|&(?:amp|lt|gt);|[^<&]+|[<&]/gu)??[];
 const atoms=tokens.flatMap(t=>t.startsWith('<')||t.startsWith('&')?[t]:Array.from(t));
 const pages:string[]=[]; const stack:string[]=[]; let current=''; let visible=false;
 const closing=()=>stack.slice().reverse().map(t=>`</${t}>`).join('');
 const flush=()=>{if(visible)pages.push(current+closing());current=stack.map(t=>`<${t}>`).join('');visible=false;};
 for(const atom of atoms){
  if(atom.startsWith('<')) {
   if(atom.startsWith('</')) {stack.pop();current+=atom;}
   else {stack.push(atom.slice(1,-1));current+=atom;}
   continue;
  }
  if(current.length+atom.length+closing().length>limit) flush();
  current+=atom;visible=true;
  if(atom==='\n' && current.length>limit*0.8) flush();
 }
 flush(); return pages;
}
export const sectionNames={v:"📚 So'zlar",g:'✏️ Grammatika',d:'💬 Misollar',s:'📖 Hikoya'} as const;
export type Section = keyof typeof sectionNames;
export function labelsFor(num:number):Record<Section,string> {
 return num===0?{v:'🔤 Harflar',g:'✏️ O‘qish qoidalari',d:'🗣 O‘qish mashqlari',s:'📖 Mini-hikoya'}:sectionNames;
}
export function topic(u:ReadyUnit):string {
 return `🇰🇷 ${u.num===0?'한글':`${u.num}과`} · ${esc(u.title_kr)}\n${b(u.title_uz)}\n\n🎯 Bu darsda nimani o‘rganasiz:\n${u.goals.map(x=>'• '+esc(x)).join('\n')}\n\n📌 ${esc(u.grammar_summary.join(' · '))}\n\nBo‘limni tanlang:`;
}
export function render(u:ReadyUnit,section:Section):string[] {
 let blocks:string[]=[];
 if(section==='v') blocks=u.vocab_groups.map(g=>`📚 ${b(g.title)}\n\n`+g.items.map(w=>`${esc(w.emoji??'•')} ${b(w.kr)} ${i('['+w.rom+']')}${w.pos?' · '+esc(w.pos):''} — ${esc(w.uz)}${w.extra?' ⭐ (qo‘shimcha)':''}${w.example?'\n› '+esc(w.example.kr)+' — '+spoiler(w.example.uz):''}${w.note?'\n⚠️ '+esc(w.note):''}`).join('\n\n')+(g.tip?'\n\n💡 '+esc(g.tip):''));
 if(section==='g') blocks=u.grammar.map(g=>`✏️ ${b(g.pattern)}\n${esc(g.title_uz)}\n\n${g.explanation.map(explanation).join('\n\n')}\n\n💡 ${esc(g.analogy)}\n\n${g.rules.map(r=>`• ${esc(r.condition)} → ${b(r.form)} (${esc(r.example)})`).join('\n')}\n\n📝 Misollar:\n${g.examples.map(e=>`• ${esc(e.kr)} — ${spoiler(e.uz)}`).join('\n')}\n\n${g.mistakes.map(m=>`⚠️ ${esc(m.wrong)} ❌ → ${esc(m.right)} ✅ — ${esc(m.why)}`).join('\n')}`);
 if(section==='d') blocks=u.dialogues.map(d=>`💬 ${b(d.title)} (${i(d.style)})\n\n${d.lines.map(l=>`${b(l.speaker+':')} ${esc(l.kr)}`).join('\n')}\n\n${spoiler(d.translation)}${d.new_words.length?'\n\n🆕 '+d.new_words.map(w=>`${esc(w.kr)} [${esc(w.rom)}] — ${esc(w.uz)}`).join('\n'):''}`);
 if(section==='s'){const s=u.story;blocks=[`📖 ${b(s.title)}\n\n${i(s.intro)}\n\n${s.lines.map(l=>'narration'in l?i(l.narration):`${b(l.speaker+':')} ${esc(l.kr)}\n${spoiler(l.uz)}`).join('\n\n')}\n\n🤔 ${esc(s.question)}`];}
 return blocks.flatMap(x=>splitHtml(x.trim()));
}
