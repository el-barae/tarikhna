'use client';

import {createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode} from 'react';
import {THEME_STORAGE_KEY, type Theme, type ThemePreference} from '@/lib/theme';

type ThemeContextValue = {theme:Theme; preference:ThemePreference; setPreference:(value:ThemePreference)=>void};
const ThemeContext = createContext<ThemeContextValue|null>(null);

export default function ThemeProvider({children}:{children:ReactNode}) {
  const [theme,setTheme] = useState<Theme>('light');
  const [preference,setPreferenceState] = useState<ThemePreference>('system');
  const current = useRef<ThemePreference>('system');
  const apply = useCallback((value:ThemePreference,persist=false)=>{
    current.current=value;
    const resolved=value==='system'?(window.matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light'):value;
    document.documentElement.dataset.theme=resolved;
    document.documentElement.style.colorScheme=resolved;
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content',resolved==='dark'?'#15231f':'#173f35');
    setPreferenceState(value);
    setTheme(resolved);
    if(persist)try{localStorage.setItem(THEME_STORAGE_KEY,value);}catch{/* The theme still works for this session. */}
  },[]);

  useEffect(()=>{
    let saved:ThemePreference='system';
    try{const value=localStorage.getItem(THEME_STORAGE_KEY);if(value==='light'||value==='dark')saved=value;}catch{/* Follow the system preference. */}
    apply(saved);
    const media=window.matchMedia('(prefers-color-scheme: dark)');
    const onSystemChange=()=>{if(current.current==='system')apply('system');};
    const onStorage=(event:StorageEvent)=>{
      if(event.key===THEME_STORAGE_KEY||event.key===null)apply(event.newValue==='light'||event.newValue==='dark'?event.newValue:'system');
    };
    media.addEventListener('change',onSystemChange);
    window.addEventListener('storage',onStorage);
    return()=>{media.removeEventListener('change',onSystemChange);window.removeEventListener('storage',onStorage);};
  },[apply]);

  return <ThemeContext.Provider value={{theme,preference,setPreference:value=>apply(value,true)}}>{children}</ThemeContext.Provider>;
}

export function useTheme(){
  const value=useContext(ThemeContext);
  if(!value)throw new Error('useTheme must be used within ThemeProvider');
  return value;
}
