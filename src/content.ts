import { readdirSync, readFileSync } from 'node:fs';
import { z } from 'zod';
const text = z.string().min(1);
const id = z.string().regex(/^[a-z0-9_-]{1,12}$/);
const pair = z.object({ kr: text, uz: text });
const word = pair.extend({ rom: text, pos: text.optional(), emoji: text.optional(), example: pair.optional(), note: text.optional(), extra: z.boolean().optional() });
const base = z.object({ id, num: z.number().int().nonnegative(), title_kr: text, title_uz: text, grammar_summary: z.array(text) });
const ready = base.extend({
 available: z.literal(true), goals: z.array(text).min(1),
 vocab_groups: z.array(z.object({ title: text, tip: text.optional(), items: z.array(word).min(1) })).min(1),
 grammar: z.array(z.object({ pattern: text, title_uz: text, explanation: z.array(text), analogy: text,
 rules: z.array(z.object({condition:text,form:text,example:text})), examples:z.array(pair), mistakes:z.array(z.object({wrong:text,right:text,why:text})) })).min(1),
 dialogues:z.array(z.object({title:text,style:text,lines:z.array(z.object({speaker:text,kr:text})),translation:text,new_words:z.array(word)})).min(1),
 story:z.object({title:text,intro:text,lines:z.array(z.union([pair.extend({speaker:text}),z.object({narration:text})])),question:text})
});
export const bookSchema = z.object({book:z.object({id,title:text,level_uz:text}),units:z.array(z.discriminatedUnion('available',[ready,base.extend({available:z.literal(false)})])).min(1)});
export type Book = z.infer<typeof bookSchema>;
export type Unit = Book['units'][number];
export type ReadyUnit = z.infer<typeof ready>;
export function loadBooks(directory = 'data'): Book[] {
 const books = readdirSync(directory).filter(f=>f.endsWith('.json')).map(file=>{
  const result = bookSchema.safeParse(JSON.parse(readFileSync(`${directory}/${file}`,'utf8')));
  if(!result.success) throw new Error(`Invalid content: ${file}: ${result.error.issues.map(i=>i.path.join('.')).join(', ')}`);
  const book = result.data;
  if (new Set(book.units.map(u=>u.id)).size !== book.units.length || new Set(book.units.map(u=>u.num)).size !== book.units.length) throw new Error(`Duplicate units: ${file}`);
  book.units.sort((a,b)=>a.num-b.num); return book;
 });
 if(!books.length) throw new Error('No data/*.json books found');
 if(new Set(books.map(b=>b.book.id)).size !== books.length) throw new Error('Duplicate book IDs');
 return books.sort((a,b)=>a.book.id.localeCompare(b.book.id,'en',{numeric:true}));
}
