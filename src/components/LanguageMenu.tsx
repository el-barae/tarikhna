'use client';

import {useEffect, useRef, useState} from 'react';
import {Check, ChevronDown, Globe2} from 'lucide-react';
import type {Locale} from '@history/core';

const options:{value:Locale;label:string;glyph:string}[]=[
  {value:'ar',label:'العربية',glyph:'ع'},
  {value:'fr',label:'Français',glyph:'Fr'},
  {value:'en',label:'English',glyph:'En'},
];

export default function LanguageMenu({locale,onChange,label}:{locale:Locale;onChange:(locale:Locale)=>void;label:string}){
  const [open,setOpen]=useState(false);
  const wrap=useRef<HTMLDivElement>(null);
  const button=useRef<HTMLButtonElement>(null);
  const current=options.find(option=>option.value===locale)??options[0];
  useEffect(()=>{
    if(!open)return;
    const onPointer=(event:MouseEvent)=>{if(!wrap.current?.contains(event.target as Node))setOpen(false);};
    const onKey=(event:KeyboardEvent)=>{if(event.key==='Escape'){setOpen(false);button.current?.focus();}};
    document.addEventListener('mousedown',onPointer);
    document.addEventListener('keydown',onKey);
    return()=>{document.removeEventListener('mousedown',onPointer);document.removeEventListener('keydown',onKey);};
  },[open]);
  const choose=(value:Locale)=>{onChange(value);setOpen(false);button.current?.focus();};
  const move=(step:number)=>{const index=options.findIndex(option=>option.value===locale);onChange(options[(index+step+options.length)%options.length].value);};
  return <div className="language-menu" ref={wrap}>
    <button ref={button} type="button" className="language-menu-button" aria-haspopup="listbox" aria-expanded={open} aria-label={label} onClick={()=>setOpen(value=>!value)}>
      <Globe2 size={16}/>
      <span className="language-menu-label">{current.label}</span>
      <ChevronDown size={13} className="language-menu-chevron"/>
    </button>
    {open&&<ul className="language-menu-list" role="listbox" aria-label={label} onKeyDown={event=>{if(event.key==='ArrowDown'){event.preventDefault();move(1);}else if(event.key==='ArrowUp'){event.preventDefault();move(-1);}}}>
      {options.map(option=><li key={option.value} role="option" aria-selected={option.value===locale}>
        <button type="button" className={option.value===locale?'active':''} onClick={()=>choose(option.value)}>
          <span className="language-menu-glyph" aria-hidden="true">{option.glyph}</span>
          <span className="language-menu-name">{option.label}</span>
          {option.value===locale&&<Check size={15} className="language-menu-check"/>}
        </button>
      </li>)}
    </ul>}
  </div>;
}
