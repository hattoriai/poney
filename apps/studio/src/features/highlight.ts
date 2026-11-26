import { useEffect, useState } from 'react'
import type { CodeBlock } from '@poney/core'

/**
 * Syntax colours for code excerpts, by the file's language. Shiki and each
 * language load only when a scene shows code. Each token carries the light
 * and the dark colour; the stylesheet picks one for the theme.
 */

export interface Token {
  content: string
  style?: Record<string, string>
}

type Highlighter = Awaited<ReturnType<typeof import('shiki')['createHighlighter']>>
let highlighter: Promise<Highlighter> | undefined
const loaded = new Map<string, Promise<boolean>>()

const BY_EXTENSION: Record<string, string> = {
  ex: 'elixir', exs: 'elixir', heex: 'html', eex: 'html', leex: 'html',
  rb: 'ruby', rake: 'ruby', gemspec: 'ruby', ru: 'ruby', erb: 'erb',
  js: 'javascript', mjs: 'javascript', cjs: 'javascript', jsx: 'jsx', ts: 'typescript', mts: 'typescript', cts: 'typescript', tsx: 'tsx',
  py: 'python', go: 'go', rs: 'rust', java: 'java', kt: 'kotlin', swift: 'swift', php: 'php', cs: 'csharp',
  c: 'c', h: 'c', cc: 'cpp', cpp: 'cpp', hpp: 'cpp', scala: 'scala', clj: 'clojure', erl: 'erlang', hs: 'haskell',
  sql: 'sql', graphql: 'graphql', gql: 'graphql', proto: 'proto',
  json: 'json', jsonc: 'jsonc', yml: 'yaml', yaml: 'yaml', toml: 'toml', xml: 'xml', html: 'html', css: 'css', scss: 'scss',
  md: 'markdown', sh: 'shellscript', bash: 'shellscript', zsh: 'shellscript', vue: 'vue', svelte: 'svelte', tf: 'hcl',
}
const BY_NAME: Record<string, string> = { Gemfile: 'ruby', Rakefile: 'ruby', Dockerfile: 'docker', Makefile: 'make', 'mix.lock': 'elixir' }

/** The language of a file, from its name; undefined when unknown. */
export function languageOf(path: string): string | undefined {
  const name = path.split('/').pop() ?? path
  return BY_NAME[name] ?? BY_EXTENSION[name.includes('.') ? name.split('.').pop()!.toLowerCase() : '']
}

async function ready(lang: string): Promise<Highlighter | undefined> {
  highlighter ??= import('shiki').then((s) => s.createHighlighter({ themes: ['github-light', 'github-dark'], langs: [] }))
  const h = await highlighter
  if (!loaded.has(lang))
    loaded.set(
      lang,
      h.loadLanguage(lang as Parameters<Highlighter['loadLanguage']>[0]).then(
        () => true,
        () => false,
      ),
    )
  return (await loaded.get(lang)) ? h : undefined
}

function tokenize(h: Highlighter, lang: string, lines: string[]): Token[][] {
  return h
    .codeToTokens(lines.join('\n'), { lang: lang as never, themes: { light: 'github-light', dark: 'github-dark' }, defaultColor: false })
    .tokens.map((line) => line.map((t) => ({ content: t.content, style: t.htmlStyle as Record<string, string> | undefined })))
}

/**
 * Tokens for each line of a code block, keyed "<hunk>:<line>". The new side
 * (unchanged and added lines) and the old side (unchanged and removed lines)
 * are coloured apart, so each reads as the code it was.
 */
export function useTokens(block: CodeBlock): Map<string, Token[]> | undefined {
  const [tokens, setTokens] = useState<Map<string, Token[]>>()
  const lang = languageOf(block.path)
  useEffect(() => {
    setTokens(undefined)
    if (!lang) return
    let live = true
    void ready(lang).then((h) => {
      if (!h || !live) return
      const out = new Map<string, Token[]>()
      block.hunks.forEach((hunk, hi) => {
        for (const side of ['new', 'old'] as const) {
          const at = hunk.lines.map((l, li) => ({ l, li })).filter(({ l }) => (side === 'new' ? l.kind !== 'del' : l.kind !== 'add'))
          const lines = tokenize(h, lang, at.map(({ l }) => l.text))
          at.forEach(({ l, li }, i) => {
            if (side === 'new' || l.kind === 'del') out.set(`${hi}:${li}`, lines[i] ?? [])
          })
        }
      })
      setTokens(out)
    })
    return () => {
      live = false
    }
  }, [block, lang])
  return tokens
}
