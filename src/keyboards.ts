import { InlineKeyboard } from 'grammy';
import type { Book, Unit } from './content.js';
import { labelsFor, type Section } from './render.js';
export function booksKeyboard(books:Book[]) {const k=new InlineKeyboard();books.forEach((b,i)=>{k.text(b.book.id.toUpperCase(),`b:${b.book.id}`);if(i%4===3)k.row();});return k;}
export function tocKeyboard(book:Book){const k=new InlineKeyboard();for(const u of book.units)k.text(`${u.available?'':'⏳ '}${u.num===0?'한글':u.num+'과'} · ${u.title_kr} — ${u.title_uz}`,`u:${book.book.id}:${u.id}`).row();return k.text('📚 Kitoblar','books');}
export function unitKeyboard(book:Book,u:Unit,section?:Section,page=0,total=1){
 const k=new InlineKeyboard(); const prefix=`p:${book.book.id}:${u.id}`;
 if(section && total>1){if(page>0)k.text('◀️',`${prefix}:${section}:${page-1}`);k.text(`${page+1}/${total}`,'noop');if(page+1<total)k.text('▶️',`${prefix}:${section}:${page+1}`);k.row();}
 Object.entries(labelsFor(u.num)).forEach(([key,label],index)=>{k.text(label,`${prefix}:${key}:0`);if(index%2===1)k.row();});
 if(section)k.text('🎯 Dars haqida',`u:${book.book.id}:${u.id}`).row();
 const index=book.units.findIndex(x=>x.id===u.id);const prev=book.units[index-1],next=book.units[index+1];
 if(prev)k.text(`⬅️ ${prev.num===0?'한글':prev.num+'과'}`,`u:${book.book.id}:${prev.id}`);
 k.text('📋 Mundarija',`b:${book.book.id}`);
 if(next)k.text(`${next.num===0?'한글':next.num+'과'} ➡️`,`u:${book.book.id}:${next.id}`);
 return k;
}
