export type Theme = 'light' | 'dark';
export type ThemePreference = Theme | 'system';
export const THEME_STORAGE_KEY = 'athar-theme';

// Runs before the page is painted, including when browser storage is unavailable.
export const themeInitScript = `(function(){var p='system';try{var s=localStorage.getItem('${THEME_STORAGE_KEY}');if(s==='light'||s==='dark')p=s;}catch(e){}var t=p==='system'?(matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light'):p;document.documentElement.dataset.theme=t;document.documentElement.style.colorScheme=t;})();`;

export const mapPalettes = {
  light: {water:'#dfe8e5',land:'#f2eee2',coast:'#b9c9bf',borders:'#d5d2c6',point:'#39634e',stroke:'#fffef6',cluster:'#2b5a49',route:'#986c39',event:'#b77945',person:'#77669c'},
  dark: {water:'#101d24',land:'#22332f',coast:'#405b53',borders:'#3e514a',point:'#a0c9a7',stroke:'#172823',cluster:'#3e725c',route:'#d5b37c',event:'#e0aa78',person:'#b6a4d9'},
} satisfies Record<Theme, Record<string,string>>;
