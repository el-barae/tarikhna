'use client';

import {useCallback, useEffect, useRef, useState, type ReactNode, type RefObject} from 'react';
import {ArrowUp, BookOpen, Check, ExternalLink, LoaderCircle, LogIn, MessageCircle, RotateCcw, Sparkles, Square, X} from 'lucide-react';
import type {Locale} from '@history/core';
import type {Selection} from './HistoricalMap';
import {assistantCopy} from './assistant-copy';
import './assistant.css';

type Source = {id: string; title: string; url?: string; locator?: string};
type Context = {year: number; locale: Locale; selection: Selection | null};
type Message = {id: string; role: 'user' | 'assistant'; content: string; sources?: Source[]; warnings?: string[]; contextLabel?: string};
type Attempt = {question: string; context: Context; contextLabel: string};
type Availability = 'checking' | 'ready' | 'login' | 'unconfigured' | 'unavailable';
type Failure = 'connectionError' | 'rateLimit' | 'alreadyBusy' | 'sessionExpired' | 'failed' | 'cancelled';

function safeUrl(value: unknown): string | undefined {
  if (typeof value !== 'string') return;
  try {
    const url = new URL(value);
    if (url.protocol === 'https:' || url.protocol === 'http:') return url.href;
  } catch { /* Invalid source URLs are shown as plain text. */ }
}

function responseSources(value: unknown): Source[] {
  if (!Array.isArray(value)) return [];
  return value.filter((source): source is Source => Boolean(source) && typeof source === 'object' && typeof source.id === 'string' && typeof source.title === 'string')
    .slice(0, 30).map(source => ({id: source.id, title: source.title, url: safeUrl(source.url), locator: typeof source.locator === 'string' ? source.locator : undefined}));
}

// Only a small text-formatting subset is rendered. Source links are handled separately.
type InlineNode = ReactNode;
type Block =
  | {kind: 'paragraph'; nodes: InlineNode[]}
  | {kind: 'heading'; level: 4 | 5 | 6; nodes: InlineNode[]}
  | {kind: 'rule'}
  | {kind: 'list'; items: InlineNode[][]};

function inlineText(value: string, keyPrefix: string): InlineNode[] {
  const nodes: InlineNode[] = [];
  const pattern = /(\*\*[^*\n]+\*\*)|(\*[^*\n]+\*)|(\[S\d+\])/g;
  let lastIndex = 0;
  let index = 0;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(value))) {
    if (match.index > lastIndex) nodes.push(value.slice(lastIndex, match.index));
    const [text] = match;
    if (match[1]) nodes.push(<strong key={`${keyPrefix}-b${index++}`}>{text.slice(2, -2)}</strong>);
    else if (match[2]) nodes.push(<em key={`${keyPrefix}-i${index++}`}>{text.slice(1, -1)}</em>);
    else nodes.push(<span key={`${keyPrefix}-c${index++}`} className="assistant-citation">{text.slice(1, -1)}</span>);
    lastIndex = pattern.lastIndex;
  }
  if (lastIndex < value.length) nodes.push(value.slice(lastIndex));
  return nodes;
}

function ReplyText({content}: {content: string}) {
  const blocks: Block[] = [];
  const lines = content.split('\n');
  let paragraph: string[] = [];
  let bullets: string[] = [];
  let key = 0;
  const flushParagraph = () => { if (paragraph.length) { blocks.push({kind: 'paragraph', nodes: inlineText(paragraph.join('\n'), `p${key++}`)}); paragraph = []; } };
  const flushBullets = () => { if (bullets.length) { blocks.push({kind: 'list', items: bullets.map((item, bullet) => inlineText(item, `l${key}-${bullet++}`))}); key++; bullets = []; } };
  for (const line of lines) {
    const heading = /^(#{1,4})\s+(.*)$/.exec(line);
    const bullet = /^\s*[-*•]\s+(.*)$/.exec(line);
    if (heading) {
      flushParagraph(); flushBullets();
      // Chat models use ### for main sections: rank # / ## strongest.
      const level = (heading[1].length <= 2 ? 4 : heading[1].length === 3 ? 5 : 6) as 4 | 5 | 6;
      blocks.push({kind: 'heading', level, nodes: inlineText(heading[2], `h${key++}`)});
    } else if (bullet) {
      flushParagraph();
      bullets.push(bullet[1]);
    } else if (/^\s*(-{3,}|\*{3,}|_{3,})\s*$/.test(line)) {
      flushParagraph(); flushBullets();
      blocks.push({kind: 'rule'});
    } else if (!line.trim()) {
      flushParagraph(); flushBullets();
    } else {
      paragraph.push(line);
    }
  }
  flushParagraph(); flushBullets();
  return <div className="assistant-reply-text">{blocks.map((block, index) => {
    const key = `k${index}`;
    if (block.kind === 'paragraph') return <p key={key}>{block.nodes}</p>;
    if (block.kind === 'heading') return block.level === 4
      ? <h4 key={key} className="assistant-reply-heading">{block.nodes}</h4>
      : block.level === 5 ? <h5 key={key} className="assistant-reply-heading">{block.nodes}</h5>
      : <h6 key={key} className="assistant-reply-heading">{block.nodes}</h6>;
    if (block.kind === 'rule') return <hr key={key} className="assistant-reply-rule"/>;
    return <ul key={key} className="assistant-reply-list">{block.items.map((item, itemIndex) => <li key={itemIndex}>{item}</li>)}</ul>;
  })}</div>;
}

export default function AssistantPanel({open, locale, year, selection, selectionLabel, signedIn, returnFocusRef, onClose, onLogin}: {
  open: boolean;
  locale: Locale;
  year: number;
  selection: Selection | null;
  selectionLabel: string | null;
  signedIn: boolean;
  returnFocusRef: RefObject<HTMLElement | null>;
  onClose: () => void;
  onLogin: () => void;
}) {
  const text = assistantCopy[locale];
  const warningLabels: Record<string, string> = {SOURCES_UNAVAILABLE: text.sourcesUnavailable, TOOL_FAILED: text.toolFailed, RESEARCH_LIMIT: text.researchLimit, ANSWER_TRUNCATED: text.answerTruncated};
  const [messages, setMessages] = useState<Message[]>([]);
  const [draft, setDraft] = useState('');
  const [availability, setAvailability] = useState<Availability>('checking');
  const [availabilityVersion, setAvailabilityVersion] = useState(0);
  const [attempt, setAttempt] = useState<Attempt | null>(null);
  const [failure, setFailure] = useState<Failure | null>(null);
  const [busy, setBusy] = useState(false);
  const request = useRef<AbortController | null>(null);
  const panel = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLTextAreaElement>(null);
  const scroll = useRef<HTMLDivElement>(null);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;

  const cancel = useCallback(() => {
    if (!request.current) return;
    request.current.abort();
    request.current = null;
    setBusy(false);
    setFailure('cancelled');
  }, []);

  useEffect(() => () => { request.current?.abort(); }, []);

  useEffect(() => {
    if (!open) { cancel(); return; }
    const controller = new AbortController();
    setAvailability('checking');
    void fetch('/api/assistant', {cache: 'no-store', signal: controller.signal})
      .then(async response => {
        const body = await response.json();
        if (controller.signal.aborted) return;
        if (!response.ok) { setAvailability(response.status === 401 ? 'login' : 'unavailable'); return; }
        setAvailability(!body.configured ? 'unconfigured' : !signedIn || !body.authenticated ? 'login' : 'ready');
      })
      .catch(() => { if (!controller.signal.aborted) setAvailability('unavailable'); });
    return () => controller.abort();
  }, [open, signedIn, availabilityVersion, cancel]);

  useEffect(() => {
    if (!open) return;
    const previous = returnFocusRef.current || document.activeElement as HTMLElement | null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    panel.current?.focus();
    const keydown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        event.stopPropagation();
        cancel();
        closeRef.current();
        return;
      }
      if (event.key !== 'Tab' || !panel.current) return;
      const focusable = Array.from(panel.current.querySelectorAll<HTMLElement>('button:not([disabled]), a[href], textarea:not([disabled]), [tabindex="0"]'))
        .filter(element => element.getClientRects().length > 0);
      const first = focusable[0], last = focusable[focusable.length - 1];
      if (!first) { event.preventDefault(); return; }
      if (event.shiftKey && (document.activeElement === first || document.activeElement === panel.current)) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && (document.activeElement === last || document.activeElement === panel.current)) { event.preventDefault(); first.focus(); }
    };
    document.addEventListener('keydown', keydown, true);
    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener('keydown', keydown, true);
      requestAnimationFrame(() => { if (previous?.isConnected && !document.querySelector('[role="dialog"][aria-modal="true"]')) previous.focus(); });
    };
  }, [open, cancel, returnFocusRef]);

  useEffect(() => {
    if (open && scroll.current) scroll.current.scrollTop = scroll.current.scrollHeight;
  }, [messages, busy, failure, open]);

  async function send(nextAttempt: Attempt) {
    const question = nextAttempt.question.trim();
    if (!question || question.length > 4000 || request.current || availability !== 'ready') return;
    const controller = new AbortController();
    request.current = controller;
    setBusy(true);
    setFailure(null);
    setAttempt({...nextAttempt, question});
    setDraft('');
    try {
      // Complete pairs keep the request alternating and starting/ending with a user turn.
      const history = messages.slice(-18).map(message => ({role: message.role, content: message.content}));
      while (history.length && history.reduce((length, message) => length + message.content.length, question.length) > 24000) history.splice(0, 2);
      const response = await fetch('/api/assistant', {
        method: 'POST', headers: {'Content-Type': 'application/json'}, signal: controller.signal,
        body: JSON.stringify({messages: [...history, {role: 'user', content: question}], context: nextAttempt.context}),
      });
      const body = await response.json();
      if (controller.signal.aborted || request.current !== controller) return;
      if (!response.ok) {
        if (response.status === 401) setFailure('sessionExpired');
        else if (response.status === 429) setFailure(body.code === 'ASSISTANT_BUSY' ? 'alreadyBusy' : 'rateLimit');
        else if (response.status === 503 && body.code === 'ASSISTANT_NOT_CONFIGURED') setAvailability('unconfigured');
        else setFailure('failed');
        return;
      }
      if (typeof body.message !== 'string' || !body.message.trim()) { setFailure('failed'); return; }
      setMessages(previous => [...previous,
        {id: crypto.randomUUID(), role: 'user', content: question, contextLabel: nextAttempt.contextLabel},
        {id: crypto.randomUUID(), role: 'assistant', content: body.message, sources: responseSources(body.sources), warnings: Array.isArray(body.warnings) ? body.warnings.filter((warning: unknown): warning is string => typeof warning === 'string') : []},
      ]);
      setAttempt(null);
      input.current?.focus();
    } catch {
      if (!controller.signal.aborted && request.current === controller) setFailure('connectionError');
    } finally {
      if (request.current === controller) { request.current = null; setBusy(false); }
    }
  }

  const contextLabel = `${text.year} ${year} · ${selectionLabel || text.entireAtlas}`;
  const ask = (question: string) => void send({question, context: {year, locale, selection}, contextLabel});
  const suggestions = [
    (selectionLabel ? text.suggestSelection.replace('{name}', selectionLabel) : text.suggestOverview).replace('{year}', String(year)),
    text.suggestSources,
    text.suggestCities,
  ];
  const close = () => { cancel(); onClose(); };
  const reset = () => { cancel(); setMessages([]); setAttempt(null); setFailure(null); setDraft(''); input.current?.focus(); };

  if (!open) return null;

  return <div className="assistant-backdrop" onMouseDown={event => { if (event.target === event.currentTarget) close(); }}>
    <section ref={panel} tabIndex={-1} className="assistant-panel" role="dialog" aria-modal="true" aria-labelledby="assistant-title" dir={locale === 'ar' ? 'rtl' : 'ltr'}>
      <header className="assistant-header">
        <span className="assistant-mark" aria-hidden="true"><Sparkles size={23} strokeWidth={1.5}/></span>
        <div><span className="assistant-eyebrow">{text.subtitle}</span><h2 id="assistant-title">{text.title}</h2></div>
        <div className="assistant-header-actions">
          <button type="button" className="assistant-icon-button" onClick={reset} disabled={!messages.length && !attempt} title={text.reset} aria-label={text.reset}><RotateCcw size={18}/></button>
          <button type="button" className="assistant-icon-button" onClick={close} title={text.close} aria-label={text.close}><X size={22}/></button>
        </div>
      </header>
      <div className="assistant-context" aria-label={text.context}><span><Check size={13}/>{text.year} <b>{year}</b></span><span title={selectionLabel || text.entireAtlas}>{selectionLabel || text.entireAtlas}</span></div>
      {availability !== 'ready' ? <div className="assistant-status" role="status">
        <span className="assistant-welcome-icon" aria-hidden="true">{availability === 'checking' ? <LoaderCircle className="assistant-spinner" size={29}/> : <BookOpen size={29} strokeWidth={1.4}/>}</span>
        {availability === 'checking' ? <p>{text.checking}</p> : <>
          <h3>{availability === 'unconfigured' ? text.configuringTitle : availability === 'login' ? text.loginTitle : text.unavailable}</h3>
          {availability !== 'unavailable' && <p>{availability === 'unconfigured' ? text.configuringBody : text.loginBody}</p>}
          {availability === 'login' ? <button className="assistant-primary" type="button" onClick={onLogin}><LogIn size={17}/>{text.login}</button> : <button className="assistant-secondary" type="button" onClick={() => setAvailabilityVersion(version => version + 1)}><RotateCcw size={16}/>{text.retry}</button>}
        </>}
      </div> : <>
        <div ref={scroll} className="assistant-scroll">
          {!messages.length && !attempt && <div className="assistant-welcome">
            <span className="assistant-welcome-icon" aria-hidden="true"><MessageCircle size={29} strokeWidth={1.4}/></span>
            <h3>{text.greeting}</h3><p>{text.intro}</p>
            <div className="assistant-suggestions" aria-label={text.suggestions}>{suggestions.map(question => <button type="button" key={question} onClick={() => ask(question)}><BookOpen size={16}/><span>{question}</span><span aria-hidden="true">↗</span></button>)}</div>
          </div>}
          <div className="assistant-messages" role="log" aria-label={text.history} aria-live="polite" aria-relevant="additions">
            {messages.map(message => <article key={message.id} className={`assistant-message assistant-message-${message.role}`}>
              <div className="assistant-message-label">{message.role === 'user' ? text.user : <><Sparkles size={13}/>{text.assistant}</>}</div>
              {message.role === 'user' ? <><p className="assistant-question">{message.content}</p><small className="assistant-message-context">{message.contextLabel}</small></> : <>
                <ReplyText content={message.content}/>
                {!!message.sources?.length && <div className="assistant-sources"><h4><BookOpen size={14}/>{text.sources}</h4><ol>{message.sources.map((source, index) => <li key={`${source.id}-${index}`}>
                  {source.url ? <a href={source.url} target="_blank" rel="noopener noreferrer"><span><b>{source.id}</b> {source.title}{source.locator && <small>{source.locator}</small>}</span><ExternalLink size={14}/></a> : <span className="assistant-source-text"><b>{source.id}</b> {source.title}{source.locator && <small>{source.locator}</small>}</span>}
                </li>)}</ol></div>}
                {!!message.warnings?.length && <div className="assistant-warnings" aria-label={text.warnings}>{message.warnings.map((warning, index) => <p key={index}>{warningLabels[warning] || warning}</p>)}</div>}
              </>}
            </article>)}
            {attempt && <article className="assistant-message assistant-message-user"><div className="assistant-message-label">{text.user}</div><p className="assistant-question">{attempt.question}</p><small className="assistant-message-context">{attempt.contextLabel}</small></article>}
          </div>
          {busy && <div className="assistant-pending" role="status"><LoaderCircle size={17} className="assistant-spinner"/><span>{text.pending}</span></div>}
          {failure && <div className="assistant-error" role={failure === 'cancelled' ? 'status' : 'alert'}><p>{text[failure]}</p><div>
            {failure === 'sessionExpired' ? <button type="button" onClick={onLogin}><LogIn size={15}/>{text.login}</button> : attempt && <button type="button" onClick={() => void send(attempt)}><RotateCcw size={15}/>{text.retry}</button>}
            {attempt && <button type="button" onClick={() => {setDraft(attempt.question); setAttempt(null); setFailure(null); input.current?.focus();}}>{text.edit}</button>}
          </div></div>}
        </div>
        <form className="assistant-composer" onSubmit={event => {event.preventDefault(); ask(draft);}}>
          <label htmlFor="assistant-question" className="assistant-sr-only">{text.question}</label>
          <div className="assistant-input-wrap"><textarea ref={input} id="assistant-question" value={draft} onChange={event => setDraft(event.target.value)} maxLength={4000} rows={2} placeholder={text.placeholder} disabled={busy} aria-describedby="assistant-input-hint" onKeyDown={event => {if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) {event.preventDefault(); if (!busy) ask(draft);}}}/>
            {busy ? <button className="assistant-send" type="button" onClick={cancel} aria-label={text.stop} title={text.stop}><Square size={15} fill="currentColor"/></button> : <button className="assistant-send" type="submit" disabled={!draft.trim()} aria-label={text.send} title={text.send}><ArrowUp size={21}/></button>}
          </div>
          <div className="assistant-input-meta"><span id="assistant-input-hint">{draft.length >= 3500 ? text.maxLength : text.footer}</span>{draft.length >= 3500 && <span>{draft.length.toLocaleString(locale)} / 4 000</span>}</div>
        </form>
      </>}
    </section>
  </div>;
}
