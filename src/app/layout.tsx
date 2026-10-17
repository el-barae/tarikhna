import type {Metadata,Viewport} from 'next';
import './globals.css';
import 'maplibre-gl/dist/maplibre-gl.css';
import './theme.css';
import ThemeProvider from '@/components/ThemeProvider';
import {themeInitScript} from '@/lib/theme';
export const metadata:Metadata={title:'Atharahom — Atlas de l’histoire islamique',description:'Explorez l’histoire islamique à travers une carte interactive, une chronologie et des sources historiques. Un atlas ouvert, multilingue et évolutif.',applicationName:'Atharahom',manifest:'/manifest.webmanifest',icons:{icon:'/icon.svg',apple:'/icon.svg'}};
export const viewport:Viewport={width:'device-width',initialScale:1,themeColor:'#173f35'};
export default function RootLayout({children}:{children:React.ReactNode}){return <html lang="ar" dir="rtl" suppressHydrationWarning><head><script id="athar-theme-init" dangerouslySetInnerHTML={{__html:themeInitScript}} /></head><body><ThemeProvider>{children}</ThemeProvider></body></html>;}
