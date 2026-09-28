import { loadBooks } from './content.js';
import { render,topic,sectionNames,type Section } from './render.js';
import { booksKeyboard,tocKeyboard,unitKeyboard } from './keyboards.js';
const books=loadBooks();
function checkButtons(keyboard:ReturnType<typeof booksKeyboard>){for(const row of keyboard.inline_keyboard)for(const button of row)if('callback_data'in button && Buffer.byteLength(button.callback_data)>64)throw new Error('Callback too long');}
checkButtons(booksKeyboard(books));
for(const book of books){checkButtons(tocKeyboard(book));for(const unit of book.units){if(!unit.available)continue;
 if(topic(unit).length>4096)throw new Error('Topic too long');
 for(const key of Object.keys(sectionNames) as Section[]){const pages=render(unit,key);for(const [i,page]of pages.entries()){if(!page||page.length>4096)throw new Error('Invalid page size');checkButtons(unitKeyboard(book,unit,key,i,pages.length));}console.log(`${book.book.id}/${unit.id}/${key}: ${pages.length} sahifa`);}
}}
console.log('Mazmun va tugmalar tekshirildi.');
