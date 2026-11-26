#!/usr/bin/env node
/**
 * A tiny ACP agent for tests. It answers each prompt with words, one tool
 * call and one permission request, and echoes the MCP servers it was given.
 */
import { Readable, Writable } from 'node:stream'
import { agent, methods, ndJsonStream, PROTOCOL_VERSION } from '@agentclientprotocol/sdk'

let mcpServers = []
const settings = {
  model: { id: 'model', name: 'Model', category: 'model', type: 'select', currentValue: 'small', options: [{ value: 'small', name: 'Small' }, { value: 'large', name: 'Large' }] },
  effort: { id: 'effort', name: 'Effort', category: 'thought_level', type: 'select', currentValue: 'low', options: [{ value: 'low', name: 'Low' }, { value: 'high', name: 'High' }] },
}
const app = agent({ name: 'fake' })
  .onRequest(methods.agent.initialize, () => ({ protocolVersion: PROTOCOL_VERSION, agentCapabilities: {} }))
  .onRequest(methods.agent.session.new, ({ params }) => {
    mcpServers = params.mcpServers
    return { sessionId: 'fake-session', configOptions: Object.values(settings) }
  })
  .onRequest(methods.agent.session.setConfigOption, ({ params }) => {
    settings[params.configId].currentValue = params.value
    return { configOptions: Object.values(settings) }
  })
  .onRequest(methods.agent.session.prompt, async ({ params, client }) => {
    const say = (text) => client.notify(methods.client.session.update, { sessionId: params.sessionId, update: { sessionUpdate: 'agent_message_chunk', content: { type: 'text', text } } })
    const asked = params.prompt.map((b) => b.text).join(' ')
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
    await say(`Done (${answer.outcome.outcome === 'selected' ? answer.outcome.optionId : 'cancelled'}). MCP: ${mcpServers.map((s) => s.name).join(',')}. Briefed: ${asked.includes('Poney Studio')}`)
    return { stopReason: 'end_turn' }
  })
app.connect(ndJsonStream(Writable.toWeb(process.stdout), Readable.toWeb(process.stdin)))
