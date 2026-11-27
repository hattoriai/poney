#!/usr/bin/env node
/**
 * A tiny ACP agent for tests. It answers each prompt with words, one tool
 * call and one permission request, and echoes the MCP servers it was given.
 * --no-resume: it cannot continue a session. --load-only: it can load one, not resume it.
 * --remember <file>: it keeps each prompt in the file, and a loaded session replays them as they were sent.
 * --dirs: it reads more folders (ACP additionalDirectories), and says which it was given.
 */
import { appendFileSync, existsSync, readFileSync } from 'node:fs'
import { Readable, Writable } from 'node:stream'
import { agent, methods, ndJsonStream, PROTOCOL_VERSION } from '@agentclientprotocol/sdk'

const remember = process.argv.includes('--remember') ? process.argv[process.argv.indexOf('--remember') + 1] : undefined
let mcpServers = []
let dirs
const withDirs = (caps) => (process.argv.includes('--dirs') ? { ...caps, sessionCapabilities: { ...caps.sessionCapabilities, additionalDirectories: {} } } : caps)
let sessions = 0
const settings = {
  model: { id: 'model', name: 'Model', category: 'model', type: 'select', currentValue: 'small', options: [{ value: 'small', name: 'Small' }, { value: 'large', name: 'Large' }] },
  effort: { id: 'effort', name: 'Effort', category: 'thought_level', type: 'select', currentValue: 'low', options: [{ value: 'low', name: 'Low' }, { value: 'high', name: 'High' }] },
}
const app = agent({ name: 'fake' })
  .onRequest(methods.agent.initialize, () => ({
    protocolVersion: PROTOCOL_VERSION,
    agentCapabilities: withDirs(process.argv.includes('--no-resume') ? {} : process.argv.includes('--load-only') ? { loadSession: true } : { loadSession: true, sessionCapabilities: { resume: {} } }),
  }))
  .onRequest(methods.agent.session.new, ({ params }) => {
    mcpServers = params.mcpServers
    dirs = params.additionalDirectories
    return { sessionId: `fake-session-${++sessions}`, configOptions: Object.values(settings) }
  })
  .onRequest(methods.agent.session.resume, ({ params }) => {
    if (params.sessionId === 'gone') throw new Error('No such session')
    mcpServers = params.mcpServers ?? []
    return { configOptions: Object.values(settings) }
  })
  .onRequest(methods.agent.session.load, async ({ params, client }) => {
    mcpServers = params.mcpServers
    const chunk = (sessionUpdate, text) => client.notify(methods.client.session.update, { sessionId: params.sessionId, update: { sessionUpdate, content: { type: 'text', text } } })
    const prompts = remember && existsSync(remember) ? readFileSync(remember, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l)) : ['Earlier question.']
    for (const p of prompts) {
      // In two chunks, as real agents send long text.
      await chunk('user_message_chunk', p.slice(0, 5))
      await chunk('user_message_chunk', p.slice(5))
      await chunk('agent_message_chunk', 'Earlier answer.')
    }
    return { configOptions: Object.values(settings) }
  })
  .onRequest(methods.agent.session.setConfigOption, ({ params }) => {
    settings[params.configId].currentValue = params.value
    return { configOptions: Object.values(settings) }
  })
  .onRequest(methods.agent.session.prompt, async ({ params, client }) => {
    const say = (text) => client.notify(methods.client.session.update, { sessionId: params.sessionId, update: { sessionUpdate: 'agent_message_chunk', content: { type: 'text', text } } })
    const asked = params.prompt.map((b) => b.text).join(' ')
    if (remember) appendFileSync(remember, `${JSON.stringify(params.prompt.map((b) => b.text).join(''))}\n`)
    await say('Reading ')
    await say('the code.')
    await client.notify(methods.client.session.update, { sessionId: params.sessionId, update: { sessionUpdate: 'tool_call', toolCallId: 't1', title: 'Read src/app.ts', status: 'in_progress', kind: 'read' } })
    const answer = await client.request(methods.client.session.requestPermission, {
      sessionId: params.sessionId,
      toolCall: { toolCallId: 't1', title: 'Read src/app.ts' },
      options: [
        { optionId: 'yes', name: 'Allow', kind: 'allow_once' },
        { optionId: 'no', name: 'Reject', kind: 'reject_once' },
      ],
    })
    await client.notify(methods.client.session.update, { sessionId: params.sessionId, update: { sessionUpdate: 'tool_call_update', toolCallId: 't1', status: 'completed' } })
    await say(`Done (${answer.outcome.outcome === 'selected' ? answer.outcome.optionId : 'cancelled'}). MCP: ${mcpServers.map((s) => s.name).join(',')}. Briefed: ${asked.includes('Poney Studio')}. Session: ${params.sessionId}.${dirs ? ` Dirs: ${dirs.join(',')}.` : ''}`)
    return { stopReason: 'end_turn' }
  })
app.connect(ndJsonStream(Writable.toWeb(process.stdout), Readable.toWeb(process.stdin)))
