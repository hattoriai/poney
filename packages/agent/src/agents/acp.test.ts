import { tmpdir } from 'node:os'
import { fileURLToPath } from 'node:url'
import { afterEach, describe, expect, it } from 'vitest'
import type { SessionNotification } from '@agentclientprotocol/sdk'
import { startAgent, type RunningAgent } from './acp'

const fake = fileURLToPath(new URL('../../test/fake-acp-agent.mjs', import.meta.url))
const spec = (args: string[] = []) => ({ id: 'fake', name: 'Fake agent', command: process.execPath, args: [fake, ...args], install: '', available: true, signIn: '' })

describe('startAgent: resume and load', () => {
  const running: RunningAgent[] = []
  afterEach(() => {
    for (const a of running.splice(0)) a.stop()
  })
  const start = async (...args: Parameters<typeof startAgent>) => {
    const agent = await startAgent(...args)
    running.push(agent)
    return agent
  }

  it('resumes a session it is given', async () => {
    const agent = await start(spec(), tmpdir(), { resume: { sessionId: 'old-1', how: 'resume' } })
    expect(agent.sessionId).toBe('old-1')
    expect(agent.how).toBe('resume')
    expect(agent.can).toEqual({ load: true, resume: true })
  })

  it('loads a session and replays its history', async () => {
    let text = ''
    const onUpdate = (n: SessionNotification) => {
      if (n.update.sessionUpdate === 'agent_message_chunk' && n.update.content.type === 'text') text += n.update.content.text
    }
    const agent = await start(spec(), tmpdir(), { resume: { sessionId: 'old-2', how: 'load' }, onUpdate })
    expect(agent.sessionId).toBe('old-2')
    expect(agent.how).toBe('load')
    expect(text).toContain('Earlier answer.')
  })

  it('starts a new session when the agent cannot resume', async () => {
    const agent = await start(spec(['--no-resume']), tmpdir(), { resume: { sessionId: 'old-3', how: 'resume' } })
    expect(agent.how).toBe('new')
    expect(agent.sessionId).toMatch(/^fake-session-/)
    expect(agent.can).toEqual({ load: false, resume: false })
  })

  it('starts a new session when the resume fails', async () => {
    const agent = await start(spec(), tmpdir(), { resume: { sessionId: 'gone', how: 'resume' } })
    expect(agent.how).toBe('new')
    expect(agent.sessionId).toMatch(/^fake-session-/)
  })
})

describe('startAgent: more folders', () => {
  const running: RunningAgent[] = []
  afterEach(() => {
    for (const a of running.splice(0)) a.stop()
  })
  const answer = async (args: string[]) => {
    let text = ''
    const onUpdate = (n: SessionNotification) => {
      if (n.update.sessionUpdate === 'agent_message_chunk' && n.update.content.type === 'text') text += n.update.content.text
    }
    const agent = await startAgent(spec(args), tmpdir(), { additionalDirectories: ['/code/api', '/code/web'], onUpdate, onPermission: async () => ({ outcome: { outcome: 'cancelled' } }) })
    running.push(agent)
    await agent.connection.agent.request('session/prompt' as never, { sessionId: agent.sessionId, prompt: [{ type: 'text', text: 'Hi' }] } as never)
    return text
  }

  it('gives them to an agent that reads more folders', async () => {
    expect(await answer(['--no-resume', '--dirs'])).toContain('Dirs: /code/api,/code/web.')
  })

  it('does not give them to an agent that does not say it can', async () => {
    expect(await answer(['--no-resume'])).not.toContain('Dirs:')
  })
})
