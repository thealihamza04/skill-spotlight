import { expect, test } from 'claude-code/testing'

const SKILL = '/home/u/.claude/skills/writer/SKILL.md'

const PANE = {
  plugin: 'skill-spotlight',
  component: 'Pane',
  requestId: 'skill-spotlight',
  props: {
    title: 'Skill spotlight',
    isFocused: false,
    bodyColumns: 100,
    placement: 'dock',
    scroll: { offset: 0, bodyRows: 40 },
    view: {},
  },
} as const

test('spotlight a skill, see it, send feedback, see the edit', async ($, on) => {
  const files = new Map<string, string>([[SKILL, '# writer\n\n- Be short.\n']])
  const sent: string[] = []
  const sections: string[] = []

  on('command.register', () => ({ value: { command: 'spotlight' } }))
  on('ui.open', () => ({ value: { isPlaced: true } }))
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  on('session.cwd', () => ({ value: '/proj' }))
  on('env.get', () => ({ value: '/home/u' }))
  on('fs.exists', (_, e) => ({ value: files.has(String((e as { path: string }).path)) }))
  on('fs.read', (_, e) => ({ value: files.get(String((e as { path: string }).path)) ?? '' }))
  on('fs.write', () => ({ value: undefined }))
  on('store.get', () => ({ value: undefined }))
  on('store.set', () => ({ value: undefined }))
  on('prompt.submit', (_, e) => {
    sent.push(e.text)
    return { text: e.text }
  })
  on('prompt.compose', () => ({ sections: [] }))
  on('tool.call', () => ({ result: {} }))
  on('clock.every', () => ({ value: undefined }))

  await $.session.start({ cwd: '/proj', surface: 'desktop', isInteractive: true })
  const ran = await $.command.run({ command: 'spotlight', args: 'writer' } as never)
  expect(JSON.stringify(ran)).toContain(SKILL)

  const composed = await $.prompt.compose({ model: 'm', promptModel: 'm', surfaces: ['desktop'], tools: [], outputStyle: null, traits: [] })
  for (const one of composed.sections) sections.push(one.text)
  expect(sections.join('\n')).toContain(SKILL)

  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  expect((await ui.find({ type: 'Text', text: /^writer$/ }))?.text).toBe('writer')
  expect(await ui.find({ type: 'Markdown' })).toBeDefined()

  await ui.input({ key: 'feedback', text: '- too long\n- no headings' })
  expect(sent.length).toBe(1)
  expect(sent[0]).toContain('too long')
  expect(sent[0]).toContain(SKILL)
  expect(await ui.find({ type: 'Text', text: /#1/ })).toBeDefined()

  // The agent edits the skill: the pane shows the new text after the tool call.
  files.set(SKILL, '# writer\n\n- Be short.\n- Under 100 words.\n')
  await $.tool.call({ tool: 'Edit', file_path: SKILL, old_string: 'a', new_string: 'b' } as never)
  const md = await ui.find({ type: 'Markdown' })
  expect(JSON.stringify(md)).toContain('Under 100 words')
  await ui.unmount()
})

test('with nothing spotlighted the pane says how to start', async ($, on) => {
  on('store.get', () => ({ value: undefined }))
  const ui = await $.ui.mount({ ...PANE, surface: 'terminal' })
  expect((await ui.find({ type: 'Text', text: /No skill/ }))?.text).toBe('No skill spotlighted yet')
  await ui.unmount()
})
